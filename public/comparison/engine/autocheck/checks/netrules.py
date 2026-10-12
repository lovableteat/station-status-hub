"""Netlist rules driven by pstchip pin names (HANDOVER 0u, 2026-10-09; QA pass the same day).

  A1 STRAP_PU_PD_BOTH     strap / address pin has a stuffed pull-up AND a stuffed pull-down
  A2 OD_NO_PULLUP         open-drain node that nothing pulls high (DC level of the resistor network)
     OD_PULLUP_OFFBOARD   no pull-up here, the node leaves through a connector -> INFO
     OD_PULLUP_UNKNOWN    a resistor leads to a net / rail whose voltage is unknown -> INFO
     OD_PULLUP_STRONG     parallel pull-up below Rp(min) = (V - VOL) / IOL
  A3 PULLUP_OVERVOLT      node high level above a receiver IC's supply
     PULLUP_BACKPOWER     pull-up rail stays on longer than a receiver IC's supply (rail_domain order)

Electrical node = nets joined by built 0R / net-tie / bead / fuse and by stuffed resistors up to
netrules.series_max_ohm, never across a rail or ground net. A rail is a ground net, a net on a built IC's
supply pin, or a net whose voltage comes from its name / rail_map, unless the net carries a signal pin
(open-drain / strap / EN / PG): SMB_DAT_3V3 is a signal, not a 3.3 V rail.
Pin meaning comes only from config pin_roles; open_drain_maybe (RESET# / INT#...) may also be a push-pull
input, so a node with only those pins is reported as INFO.
"""
from __future__ import annotations

import csv
import re
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

from ..findings import Finding
from ..model import Design, natkey
from ..values import parse_res_loose
from .capv import resolve_voltages
from .drc import _prefix, is_tie, present

_AUTO = re.compile(r"^N\d+$")
SIGNAL_ROLES = {"open_drain", "open_drain_maybe", "strap", "reg_en", "reg_pg"}


# ------------------------------------------------------------------ pin roles
class Roles:
    def __init__(self, cfg: dict):
        pr = cfg.get("pin_roles", {}) or {}
        self.rx = {k: re.compile(v, re.I) for k, v in pr.items() if isinstance(v, str)}
        self.by_part = [(re.compile(x["mpn"], re.I), re.compile(x["pin"], re.I), x["role"])
                        for x in pr.get("by_part", []) or []]

    def of(self, d: Design, key) -> set[str]:
        name = d.pin_name.get(key, "")
        out = {k for k, rx in self.rx.items() if rx.fullmatch(name)}
        if self.by_part:
            mpn = d.value(key[0])
            for m, p, role in self.by_part:
                if m.fullmatch(mpn) and p.fullmatch(name):
                    out.add(role)
        return out


# ------------------------------------------------------------------ graph
@dataclass
class Pull:
    r: str            # resistor RefDes
    ohm: float | None
    net: str          # far-side net
    v: float | None   # far-side voltage (0 for ground, None = rail of unknown voltage)
    built: bool

    def text(self, d: Design) -> str:
        return f"{self.r} {d.value(self.r)} -> {self.net}" + ("" if self.built else " [DNP]")


@dataclass
class Node:
    nets: list[str]
    pins: list = field(default_factory=list)           # (refdes, pin) of non-pull members
    pulls: list[Pull] = field(default_factory=list)
    links: list[str] = field(default_factory=list)     # series parts walked through

    @property
    def rep(self) -> str:
        named = sorted(n for n in self.nets if not _AUTO.match(n))
        return named[0] if named else sorted(self.nets)[0]


class NetGraph:
    def __init__(self, d: Design, cfg: dict, rail_map: dict | None = None):
        self.d, self.cfg = d, cfg
        self.roles = Roles(cfg)
        nr = cfg.get("netrules", {}) or {}
        self.series_max = float(nr.get("series_max_ohm", 100))
        self.res_px = set(nr.get("resistor_prefixes", ["R", "RS"]))
        self.ic_px = set(nr.get("ic_prefixes", ["U"]))
        self.off_px = set(nr.get("offboard_prefixes", ["J", "CN"]))
        self.gnd_re = re.compile(cfg["ground"]["regex"])
        self.volts, _ = resolve_voltages(d, cfg, rail_map or {})
        self.pin_roles = {k: self.roles.of(d, k) for k in d.pin_net}
        # rails powering a built IC (a DNP IC's VCC pin does not make its net a rail)
        self.supply_nets = {d.pin_net[k] for k, rl in self.pin_roles.items()
                            if "supply" in rl and present(d, k[0], cfg)}
        # a net with a signal pin (open-drain / strap / EN / PG) is a signal, not a rail, even with a voltage in
        # its name; unless it also carries a power pin (EN tied to VIN on an LDO is still the input rail)
        power = {d.pin_net[k] for k, rl in self.pin_roles.items() if rl & {"supply", "reg_in", "reg_out", "reg_sw"}}
        sig = {d.pin_net[k] for k, rl in self.pin_roles.items() if rl & SIGNAL_ROLES and _prefix(k[0]) in self.ic_px}
        # ... and a net that open-drain / strap nets are pulled to through a real resistor is a rail even when a
        # strap pin is tied straight to it (EEPROM A0 on P3V3_SB, rail fed from a connector)
        od_nets = {d.pin_net[k] for k, rl in self.pin_roles.items()
                   if rl & {"open_drain", "open_drain_maybe", "strap"} and _prefix(k[0]) in self.ic_px}
        pulled_to = set()
        for r in sorted(d.parts, key=natkey):
            nn = self._two_nets(r)
            ohm = self.res_ohm(r) if nn else None
            if not nn or ohm is None or ohm <= self.series_max or not present(d, r, cfg):
                continue
            for a, b in (nn, nn[::-1]):
                v = self.volts.get(b)
                if a in od_nets and v and not v[1].startswith("via"):
                    pulled_to.add(b)
        self.signal_nets = sig - power - self.supply_nets - pulled_to
        self._build()

    # a rail / ground is a barrier: nodes never merge across it
    def is_rail(self, net: str) -> bool:
        if self.gnd_re.fullmatch(net):
            return True
        if net in self.signal_nets:
            return False
        v = self.volts.get(net)
        if v and not v[1].startswith("via"):
            return True
        return net in self.supply_nets

    def voltage(self, net: str) -> float | None:
        if self.gnd_re.fullmatch(net):
            return 0.0
        if net in self.signal_nets:
            return None
        v = self.volts.get(net)
        return v[0] if v else None

    def res_ohm(self, r: str) -> float | None:
        if _prefix(r) not in self.res_px:
            return None
        return parse_res_loose(self.d.value(r))

    def _two_nets(self, r: str):
        ks = self.d.pins_of(r)
        pr = self.d.prim(r)
        if pr is None or len(pr.all_pin_numbers()) != 2 or len(ks) != 2:
            return None
        n1, n2 = self.d.pin_net[ks[0]], self.d.pin_net[ks[1]]
        return None if n1 == n2 else (n1, n2)

    def _build(self) -> None:
        d, cfg = self.d, self.cfg
        parent = {n: n for n in d.nets}

        def find(x):
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x

        self.link_parts: dict[str, tuple[str, str]] = {}
        self.res_edges: list[tuple[str, str, str, float]] = []      # built resistive parts: (r, n1, n2, ohm)
        for r in sorted(d.parts, key=natkey):
            nn = self._two_nets(r)
            if not nn or not present(d, r, cfg):
                continue
            ohm = 1e-3 if is_tie(d, r, cfg) else self.res_ohm(r)
            if ohm is not None:
                self.res_edges.append((r, nn[0], nn[1], max(ohm, 1e-3)))
            n1, n2 = nn
            if self.is_rail(n1) or self.is_rail(n2):
                continue
            if is_tie(d, r, cfg) or (ohm is not None and ohm <= self.series_max):
                self.link_parts[r] = nn
                parent[find(n1)] = find(n2)
        groups = defaultdict(list)
        for n in d.nets:
            if not self.is_rail(n):
                groups[find(n)].append(n)
        self.nodes: list[Node] = []
        self.node_of: dict[str, Node] = {}
        for _, nets in sorted(groups.items(), key=lambda t: sorted(t[1])[0]):
            node = Node(nets=sorted(nets))
            self.nodes.append(node)
            for n in nets:
                self.node_of[n] = node
        for r in sorted(d.parts, key=natkey):
            nn = self._two_nets(r)
            if r in self.link_parts:
                self.node_of[nn[0]].links.append(r)
                continue
            if nn and _prefix(r) in self.res_px:
                for a, b in (nn, nn[::-1]):
                    node = self.node_of.get(a)
                    if node is None or (b in node.nets) or not self.is_rail(b):
                        continue
                    node.pulls.append(Pull(r, self.res_ohm(r), b, self.voltage(b), present(d, r, cfg)))
        pulled = {(p.r, n) for node in self.nodes for p in node.pulls for n in node.nets}
        for (r, p), n in d.pin_net.items():
            node = self.node_of.get(n)
            if node is not None and (r, n) not in pulled and r not in node.links:
                node.pins.append((r, p))
        for node in self.nodes:
            node.pins.sort(key=lambda k: (natkey(k[0]), natkey(k[1])))

    # ---- helpers used by the rules
    def pull_ups(self, node: Node, built=True) -> list[Pull]:
        return [p for p in node.pulls if p.built == built and (p.v is None or p.v > 0)]

    def pull_downs(self, node: Node, built=True) -> list[Pull]:
        return [p for p in node.pulls if p.built == built and p.v == 0]

    def ic_pins(self, node: Node, role: str | None = None) -> list:
        return [k for k in node.pins if _prefix(k[0]) in self.ic_px and present(self.d, k[0], self.cfg)
                and (role is None or role in self.pin_roles.get(k, ()))]

    def offboard(self, node: Node) -> list:
        # a connector symbol means the net leaves the board, built or not (gold fingers are never in the BOM)
        return [k for k in node.pins if _prefix(k[0]) in self.off_px]

    def supplies_of(self, refdes: str) -> list[str]:
        return sorted({self.d.pin_net[k] for k in self.d.pins_of(refdes) if "supply" in self.pin_roles.get(k, ())})

    def hop_nets(self, node: Node) -> list[str]:
        """Non-rail nets one built resistor away from the node (PG -1K- PG_R)."""
        out = set()
        for _, a, b, _ in self.res_edges:
            for x, y in ((a, b), (b, a)):
                if x in node.nets and y not in node.nets and not self.is_rail(y):
                    out.add(y)
        return sorted(out)

    def listeners(self, node: Node, drivers: list) -> list:
        """Pins that read the node, on it or one resistor away: built non-passive parts other than the drivers
        (IC inputs, FET gates, connectors). Caps, resistors, test pads and diodes / LEDs (a load the open-drain
        output sinks, config netrules.non_listener_prefixes) do not listen."""
        drv = set(drivers)
        passive = set(self.cfg["parts"].get("symmetric_prefixes", [])) | set(
            self.cfg["parts"].get("always_built_prefixes", [])) | set(
            (self.cfg.get("netrules", {}) or {}).get("non_listener_prefixes", ["D", "DS", "LED"]))
        nets = set(node.nets) | set(self.hop_nets(node))
        pins = [k for n in sorted(nets) for k in self.d.nets.get(n, [])]
        return [k for k in pins if k not in drv and _prefix(k[0]) not in passive
                and (present(self.d, k[0], self.cfg) or _prefix(k[0]) in self.off_px)]

    # ---- DC level: open-drain drivers released, IC inputs high-Z, caps open
    def dc(self) -> dict[str, "DC"]:
        """Nodal analysis of the built resistor network, per non-rail net:
          solved          level from rails of known voltage
          unknown_source  the network also reaches rails of unknown voltage; level = known rails only (those
                          unknown rails treated as open), so a known pull-up is still judged
          floating        no rail reached (comp = nets of the network, e.g. a pull-up to an unnamed net)
        rails = every rail the network reaches (the pull-up sources, direct or through series R)."""
        if hasattr(self, "_dc"):
            return self._dc
        src = {n: self.voltage(n) for n in self.d.nets if self.is_rail(n)}
        adj = defaultdict(list)
        for _, a, b, ohm in self.res_edges:
            adj[a].append((b, ohm))
            adj[b].append((a, ohm))
        out: dict[str, DC] = {}
        seen: set[str] = set()
        for start in sorted(self.d.nets):
            if start in src or start in seen:
                continue
            comp, stack, bounds = [], [start], set()
            seen.add(start)
            while stack:
                x = stack.pop()
                comp.append(x)
                for y, _ in adj[x]:
                    if y in src:
                        bounds.add(y)
                    elif y not in seen:
                        seen.add(y)
                        stack.append(y)
            comp.sort()
            unknown = sorted(b for b in bounds if src[b] is None)
            known = sorted(b for b in bounds if src[b] is not None)
            sol = _solve(comp, adj, src) if known else {}
            status = "floating" if not bounds else ("unknown_source" if unknown else "solved")
            for n in comp:
                out[n] = DC(sol.get(n), status, known, unknown, comp)
        self._dc = out
        return out

    def node_dc(self, node: Node) -> "DC":
        infos = [self.dc()[n] for n in node.nets if n in self.dc()]
        if not infos:
            return DC(None, "floating", [], [], list(node.nets))
        lv = [i.level for i in infos if i.level is not None]
        i0 = infos[0]
        return DC(max(lv) if lv else None, i0.status, i0.rails, i0.unknown, i0.comp)

    def dc_levels(self) -> dict[str, float]:
        return {n: i.level for n, i in self.dc().items() if i.status == "solved" and i.level is not None}

    def high_level(self, node: Node) -> float | None:
        """Level from known rails (also when unknown rails are in the network)."""
        return self.node_dc(node).level

    def pin_txt(self, k) -> str:
        return f"{k[0]}.{k[1]} {self.d.pin_name.get(k, '')}".strip()


@dataclass
class DC:
    level: float | None
    status: str                 # solved / unknown_source / floating
    rails: list[str]            # rails of known voltage the network reaches
    unknown: list[str]          # rails of unknown voltage the network reaches
    comp: list[str]             # nets of the resistor network


def _solve(comp: list[str], adj, src) -> dict[str, float]:
    """G v = i by Gaussian elimination with partial pivoting (components are small; no numpy needed).
    Rails of unknown voltage (src None) are left open."""
    idx = {n: i for i, n in enumerate(comp)}
    m = len(comp)
    a = [[0.0] * (m + 1) for _ in range(m)]
    for x in comp:
        i = idx[x]
        for y, ohm in adj[x]:
            if y not in idx and src.get(y) is None:
                continue
            a[i][i] += 1 / ohm
            if y in idx:
                a[i][idx[y]] -= 1 / ohm
            else:
                a[i][m] += src[y] / ohm
    for c in range(m):
        p = max(range(c, m), key=lambda r: abs(a[r][c]))
        if abs(a[p][c]) < 1e-15:
            return {}
        a[c], a[p] = a[p], a[c]
        for r in range(m):
            if r != c and a[r][c]:
                f = a[r][c] / a[c][c]
                for k in range(c, m + 1):
                    a[r][k] -= f * a[c][k]
    return {n: a[idx[n]][m] / a[idx[n]][idx[n]] for n in comp}


# ------------------------------------------------------------------ rail domains
DOMAIN_FIELDS = ["net", "voltage", "domain", "confirmed", "guess_from", "note"]


def load_rail_domain(path) -> dict[str, dict]:
    """utf-8 (as written by the tool) or Big5 (zh-TW Excel 'Save as CSV')."""
    out: dict[str, dict] = {}
    if not path or not Path(path).exists():
        return out
    raw = Path(path).read_bytes()
    for enc in ("utf-8-sig", "cp950"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        raise ValueError(f"{Path(path).name}: not UTF-8 or Big5; save it as 'CSV UTF-8'")
    for row in csv.DictReader(text.splitlines()):
        net = (row.get("net") or "").strip()
        if net:
            out[net] = {k: (row.get(k) or "").strip() for k in DOMAIN_FIELDS}
    return out


def guess_domain(net: str, cfg: dict) -> str:
    for g in (cfg.get("rail_domain", {}) or {}).get("guess", []) or []:
        if re.search(g["regex"], net, re.I):
            return g["domain"]
    return ""


def domain_of(net: str, domains: dict[str, dict], cfg: dict) -> tuple[str, bool]:
    """(domain, confirmed). A row in the owner's table wins as written, even blank (= unknown)."""
    row = domains.get(net)
    if row is not None:
        return (row.get("domain") or "").upper(), (row.get("confirmed") or "").upper() in ("Y", "YES", "1", "TRUE")
    return guess_domain(net, cfg).upper(), False


def domain_rows(g: NetGraph, user: dict[str, dict]) -> list[dict]:
    """Every rail that powers a built IC or feeds a pull-up: user rows kept, the rest guessed."""
    rails = set(g.supply_nets)
    for node in g.nodes:
        rails |= {p.net for p in node.pulls if p.v != 0}
    nc = re.compile(g.cfg["drc"]["intentional_nc_net_regex"], re.I)
    rows = []
    for n in sorted(r for r in rails if not g.gnd_re.fullmatch(r) and not nc.search(r)):
        v = g.voltage(n)
        if n in user:
            rows.append({**user[n], "net": n})
            continue
        dom = guess_domain(n, g.cfg)
        rows.append({"net": n, "voltage": "" if v is None else f"{v:g}", "domain": dom, "confirmed": "",
                     "guess_from": "net name" if dom else "", "note": ""})
    for n, row in sorted(user.items()):          # user rows for rails not seen this time stay in the file
        if n not in rails:
            rows.append(row)
    return rows


# ------------------------------------------------------------------ rules
def _f(d: Design, **kw) -> Finding:
    refs = kw.get("refdes", [])
    if refs and "page" not in kw:
        kw["page"] = d.page_of(refs[0])
    kw["page_title"] = d.page_title(kw.get("page"))
    return Finding(category="NETRULE", **kw).finalize()


def _pins_of(g: NetGraph, node: Node, keys: list, pulls: list[Pull]) -> list[str]:
    """IC pins + the node-side pin of every pull resistor (what gets boxed on the schematic)."""
    out = [f"{r}.{p}" for r, p in keys]
    for pl in pulls:
        out += [f"{k[0]}.{k[1]}" for k in g.d.pins_of(pl.r) if g.d.pin_net[k] in node.nets]
    return list(dict.fromkeys(out))


def _key_net(g: NetGraph, node: Node, pin=None) -> str:
    """Tracking key net: the node's hub, i.e. the named net with the most IC / connector / resistor pins
    (SMBUS_ALERT_L, where eight 0R branches meet), ties broken by name. Caps and test pads are not counted, so
    decoupling or TPs added on a branch do not move the key; moving an IC or resistor between branches can
    (then the waiver row is re-keyed, like any renamed net)."""
    named = [n for n in node.nets if not _AUTO.match(n)]
    if not named:
        return node.rep
    skip = {"C"} | set(g.cfg["parts"].get("always_built_prefixes", []))
    return sorted(named, key=lambda n: (-sum(1 for k in g.d.nets.get(n, []) if _prefix(k[0]) not in skip), n))[0]


def _nets(node: Node, first: str) -> list[str]:
    return [first] + [n for n in node.nets if n != first]


def _ohm(x: float | None) -> str:
    if x is None:
        return "?"
    if x >= 1e3:
        return f"{x / 1e3:g}K"
    return f"{x:g}R"


def rule_strap(g: NetGraph) -> list[Finding]:
    d, cfg = g.d, g.cfg
    allowed = [(re.compile(x["mpn"], re.I), re.compile(x["pin"], re.I))
               for x in (cfg.get("netrules", {}) or {}).get("strap_divider_allowed", []) or []]
    out = []
    for node in g.nodes:
        straps = [k for k in g.ic_pins(node, "strap")
                  if not any(m.fullmatch(d.value(k[0])) and p.fullmatch(d.pin_name.get(k, "")) for m, p in allowed)]
        if not straps:
            continue
        pu, pdn = g.pull_ups(node), g.pull_downs(node)
        if not (pu and pdn):
            continue
        lvl = g.high_level(node)
        vtop = max((p.v for p in pu if p.v is not None), default=None)
        if any(p.ohm == 0 for p in pu) and any(p.ohm == 0 for p in pdn):
            why = "0R on both sides: the rail is shorted to ground through the strap"
        elif lvl is not None and vtop and lvl <= 0.1 * vtop:
            why = f"pin forced low ({lvl:.2f} V); the pull-up only burns current and hides which level was meant"
        elif lvl is not None and vtop and lvl >= 0.9 * vtop:
            why = f"pin forced high ({lvl:.2f} V); the pull-down only burns current and hides which level was meant"
        elif lvl is not None:
            why = f"divider level {lvl:.2f} V: the pin sees a mid-level, not a clean 0 / 1"
        else:
            why = "pin level undefined (pull-up rail voltage unknown)"
        kn = _key_net(g, node, straps[0])
        out.append(_f(d, rule="STRAP_PU_PD_BOTH", severity="ERROR",
                      title=f"strap {', '.join(g.pin_txt(k) for k in straps)}: pull-up and pull-down both stuffed "
                            f"on {kn}",
                      detail=f"pull-up: {'; '.join(p.text(d) for p in pu)}\npull-down: {'; '.join(p.text(d) for p in pdn)}"
                             f"\n{why}. Keep one side DNP unless the datasheet defines a divider level for this pin "
                             f"(then list it in netrules.strap_divider_allowed).",
                      refdes=[straps[0][0]] + sorted({p.r for p in pu + pdn}, key=natkey),
                      nets=_nets(node, kn), pins=_pins_of(g, node, straps, pu + pdn),
                      key=f"STRAP_PU_PD_BOTH|{kn}"))
    return out


def rule_open_drain(g: NetGraph) -> list[Finding]:
    d, cfg = g.d, g.cfg
    nr = cfg.get("netrules", {}) or {}
    nc = re.compile(cfg["drc"]["intentional_nc_net_regex"], re.I)
    vol, iol = float(nr.get("od_vol_v", 0.4)), float(nr.get("od_iol_ma", 3.0)) / 1e3
    vhigh = float(nr.get("od_high_min_v", 0.7))
    out = []
    for node in g.nodes:
        sure = g.ic_pins(node, "open_drain")
        maybe = [k for k in g.ic_pins(node, "open_drain_maybe") if k not in sure]
        od = sure + maybe
        if not od or all(nc.search(n) for n in node.nets):
            continue
        if len(od) == 1 and not g.listeners(node, od):
            continue          # lone open-drain output nobody reads (e.g. unused FLT#): floating is fine
        sev_od = "WARN" if sure else "INFO"
        maybe_txt = ("" if sure else "\nOnly pin names like RESET# / INT# mark this node as open-drain; those are "
                     "often inputs of a push-pull signal. If the driver is push-pull, no pull-up is needed.")
        kn = _key_net(g, node, od[0])
        nets = _nets(node, kn)
        pu = g.pull_ups(node)
        members = ", ".join(g.pin_txt(k) for k in node.pins)
        dnp = g.pull_ups(node, built=False)
        dnp_txt = f"\nDNP pull-up(s): {'; '.join(p.text(d) for p in dnp)}" if dnp else ""
        nets_txt = f"\nnets in node: {', '.join(node.nets)}" + (f" (via {', '.join(node.links)})" if node.links else "")
        od_txt = f"open-drain pins: {', '.join(g.pin_txt(k) for k in od)}."
        refs = sorted({k[0] for k in od}, key=lambda r: (r != od[0][0], natkey(r)))
        info = g.node_dc(node)
        lvl = info.level
        far = sorted(set(info.comp) - set(node.nets)) if info.status == "floating" else []
        off = g.offboard(node)
        far_off = sorted({k[0] for n in far for k in d.nets.get(n, []) if _prefix(k[0]) in g.off_px}, key=natkey)
        common = dict(nets=nets, refdes=refs + [p.r for p in dnp])
        if lvl is not None and lvl >= vhigh:
            pass             # pulled high by known rails (possibly through series R, possibly next to unknown rails)
        elif info.unknown:
            out.append(_f(d, rule="OD_PULLUP_UNKNOWN", severity="INFO",
                          title=f"open-drain {kn}: pull-up rail voltage unknown ({', '.join(info.unknown[:3])})",
                          detail=f"{od_txt} The resistor network reaches {', '.join(info.unknown)} whose voltage "
                                 f"is not in the net name or rail_map. Add it to rail_map.csv to get a verdict."
                                 f"{dnp_txt}{nets_txt}\nmembers: {members}",
                          pins=_pins_of(g, node, od, dnp), key=f"OD_PULLUP_UNKNOWN|{kn}", **common))
            continue
        elif [p for p in pu if p.ohm is None]:
            unk = [p for p in pu if p.ohm is None]
            out.append(_f(d, rule="OD_PULLUP_UNKNOWN", severity="INFO",
                          title=f"open-drain {kn}: pull-up value not understood ({'; '.join(p.text(d) for p in unk[:2])})",
                          detail=f"{od_txt} A resistor to a rail is stuffed but its value string could not be read "
                                 f"(EIA code such as 472, or an unusual format), so the level cannot be computed."
                                 f"{dnp_txt}{nets_txt}\nmembers: {members}",
                          pins=_pins_of(g, node, od, unk), key=f"OD_PULLUP_UNKNOWN|{kn}", **common))
            continue
        elif lvl is None and far_off:
            out.append(_f(d, rule="OD_PULLUP_UNKNOWN", severity="INFO",
                          title=f"open-drain {kn}: pulled through a resistor to {', '.join(far[:3])}, which leaves "
                                f"via {', '.join(far_off)}",
                          detail=f"{od_txt} The far net has no known voltage on this board; the pull-up source is on "
                                 f"the other side of {far_off[0]}. Confirm it.{dnp_txt}{nets_txt}\nmembers: {members}",
                          pins=_pins_of(g, node, od, dnp), key=f"OD_PULLUP_UNKNOWN|{kn}", **common))
            continue
        elif off:
            out.append(_f(d, rule="OD_PULLUP_OFFBOARD", severity="INFO",
                          title=f"open-drain {kn}: no pull-up on this board, leaves via "
                                f"{', '.join(g.pin_txt(k) for k in off)}",
                          detail=f"{od_txt} Confirm the pull-up exists on the board behind {off[0][0]}."
                                 f"{maybe_txt}{dnp_txt}{nets_txt}\nmembers: {members}",
                          pins=_pins_of(g, node, od + off, dnp), key=f"OD_PULLUP_OFFBOARD|{kn}", **common))
            continue
        else:
            how = ("nothing pulls it high in this build" if lvl is None else
                   f"the resistor network holds it at {lvl:.2f} V (below {vhigh:g} V): a pull-down wins")
            out.append(_f(d, rule="OD_NO_PULLUP", severity=sev_od,
                          title=f"open-drain {kn}: no effective pull-up",
                          detail=f"{od_txt} The node only goes low; {how}.{maybe_txt}{dnp_txt}{nets_txt}"
                                 f"\nmembers: {members}",
                          pins=_pins_of(g, node, od, dnp), key=f"OD_NO_PULLUP|{kn}", **common))
            continue
        # known pull-ups only: an extra pull-up of unknown voltage can only lower Req further, so a verdict from
        # the known ones stands
        known = [p for p in pu if p.ohm is not None and p.v is not None]
        if not known:
            continue
        other = [p for p in pu if p not in known]
        other_txt = f" Not counted (voltage / value unknown): {'; '.join(p.text(d) for p in other)}." if other else ""
        req = 0.0 if any(p.ohm == 0 for p in known) else 1 / sum(1 / p.ohm for p in known)
        vmax = max(p.v for p in known)
        rmin = max(vmax - vol, 0) / iol
        if req < rmin:
            out.append(_f(d, rule="OD_PULLUP_STRONG", severity=sev_od,
                          title=f"open-drain {kn}: pull-up {_ohm(req)} below Rp(min) {_ohm(rmin)} at {vmax:g} V",
                          detail=f"pull-ups (parallel): {'; '.join(p.text(d) for p in known)}. "
                                 f"Rp(min) = (V - VOL) / IOL = ({vmax:g} - {vol:g}) / {iol * 1e3:g} mA. "
                                 f"The driver cannot pull the node below VOL.{other_txt}{maybe_txt}{nets_txt}",
                          refdes=refs + [p.r for p in known], nets=nets,
                          pins=_pins_of(g, node, od, known), key=f"OD_PULLUP_STRONG|{kn}",
                          evidence={"req_ohm": round(req, 3), "rmin_ohm": round(rmin, 3), "v": vmax}))
    return out


def rule_pullup_domain(g: NetGraph, domains: dict[str, dict]) -> list[Finding]:
    d, cfg = g.d, g.cfg
    nr = cfg.get("netrules", {}) or {}
    margin = float(nr.get("overvolt_margin_v", 0.3))
    order = [x.upper() for x in (cfg.get("rail_domain", {}) or {}).get("order", [])]
    skip = {"supply", "ground", "reg_in", "reg_sw", "reg_out", "reg_gate", "analog"}
    out = []
    for node in g.nodes:
        pu = [p for p in g.pull_ups(node) if p.v is not None]
        info = g.node_dc(node)
        # pull-up sources: direct pull resistors, plus rails reached through series R / the resistor network
        srcs = [(p.net, p.text(d)) for p in pu]
        srcs += [(r, f"{r} through the resistor network") for r in info.rails
                 if (g.voltage(r) or 0) > 0 and r not in {p.net for p in pu}]
        if not srcs:
            continue
        recv = [(k, g.supplies_of(k[0])) for k in g.ic_pins(node)
                if not (g.pin_roles.get(k, set()) & skip) and g.supplies_of(k[0])]
        if not recv:
            continue
        # over-voltage only when every rail of the network is known (an unknown rail could pull either way).
        # EN pins are rated to VIN on most controllers.
        lvl = info.level if info.status == "solved" else None
        over = []
        for k, sup in recv:
            if "reg_en" in g.pin_roles.get(k, set()):
                continue
            vs = [g.voltage(s) for s in sup if g.voltage(s) is not None]
            if lvl is not None and vs and lvl > max(vs) + margin:
                over.append((k, sup, max(vs)))
        if over:
            kn = _key_net(g, node, over[0][0])
            out.append(_f(d, rule="PULLUP_OVERVOLT", severity="WARN",
                          title=f"{kn} pulled to {lvl:.2f} V, above the supply of "
                                f"{', '.join(f'{k[0]} ({v:g} V)' for k, _, v in over)}",
                          detail=f"pull-ups: {'; '.join(t for _, t in srcs)}\n"
                                 + "\n".join(f"{g.pin_txt(k)}: supply {', '.join(s)} = {v:g} V" for k, s, v in over)
                                 + "\nInput above its own supply: confirm the pin is over-voltage tolerant "
                                   "(datasheet abs max) or pull up to the receiver's rail. ICs with several supplies "
                                   "(level translators) are compared with the highest one.",
                          refdes=[over[0][0][0]] + sorted({k[0] for k, _, _ in over[1:]} | {p.r for p in pu}, key=natkey),
                          nets=_nets(node, kn), pins=_pins_of(g, node, [k for k, _, _ in over], pu),
                          key=f"PULLUP_OVERVOLT|{kn}", evidence={"level_v": round(lvl, 3)}))
        if not order:
            continue
        hits = []
        for rail, txt in srcs:
            dp, cp = domain_of(rail, domains, cfg)
            if dp not in order:
                continue
            for k, sup in recv:
                for s_ in sup:
                    ds, cs = domain_of(s_, domains, cfg)
                    if ds in order and order.index(dp) < order.index(ds):
                        hits.append((rail, txt, k, s_, dp, ds, cp and cs))
        if hits:
            confirmed = all(h[6] for h in hits)
            kn = _key_net(g, node, hits[0][2])
            out.append(_f(d, rule="PULLUP_BACKPOWER", severity="WARN" if confirmed else "INFO",
                          title=f"{kn} pulled up to {hits[0][0]} ({hits[0][4]}) but "
                                f"{hits[0][2][0]} runs on {hits[0][3]} ({hits[0][5]})"
                                + ("" if confirmed else " [domains guessed]"),
                          detail="\n".join(f"{h[1]} ({h[4]}) -> {g.pin_txt(h[2])}, supply {h[3]} ({h[5]})"
                                           for h in hits)
                                 + "\nWhen the receiver rail is off, current flows from the pull-up into the "
                                   "unpowered pin (ESD diode) and back-powers the IC. Pull up to the receiver's rail "
                                   "or confirm the pin is power-off tolerant (Ioff)."
                                 + ("" if confirmed else "\nDomains are guesses from rail names: review "
                                    "rail_domain csv, set confirmed = Y, re-run."),
                          refdes=[hits[0][2][0]] + sorted({h[2][0] for h in hits[1:]} | {p.r for p in pu
                                                          if p.net in {h[0] for h in hits}}, key=natkey),
                          nets=_nets(node, kn),
                          pins=_pins_of(g, node, sorted({h[2] for h in hits}), [p for p in pu if p.net in {h[0] for h in hits}]),
                          key=f"PULLUP_BACKPOWER|{kn}"))
    return out


def netrules(d: Design, cfg: dict, rail_map: dict | None = None, domains: dict | None = None,
             graph: NetGraph | None = None) -> list[Finding]:
    g = graph or NetGraph(d, cfg, rail_map)
    en = set((cfg.get("netrules", {}) or {}).get("enabled", []))
    out: list[Finding] = []
    if "STRAP" in en:
        out += rule_strap(g)
    if "OPEN_DRAIN" in en:
        out += rule_open_drain(g)
    if "PULLUP_DOMAIN" in en:
        out += rule_pullup_domain(g, domains or {})
    return out
