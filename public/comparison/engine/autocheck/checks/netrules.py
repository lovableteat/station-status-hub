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
from ..values import parse_cap, parse_res_loose
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


SOLVE_PY_MAX = 60     # networks up to this many nets keep the pure-Python elimination (outputs bit-identical to before)


def _solve(comp: list[str], adj, src) -> dict[str, float]:
    """G v = i by Gaussian elimination with partial pivoting. Rails of unknown voltage (src None) are left open.
    Speed fix 2026-10-21 (HANDOVER 0p15): above SOLVE_PY_MAX nets the same system goes to numpy.linalg.solve (LAPACK
    gesv, LU with partial pivoting; numpy already comes with pandas); the pure-Python Gauss-Jordan is O(m^3)."""
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
    if m > SOLVE_PY_MAX:
        return _solve_np(comp, idx, adj, src, a)
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


def _solve_np(comp: list[str], idx: dict[str, int], adj, src, a: list[list[float]]) -> dict[str, float]:
    """numpy path of _solve. Same "no solution" rule as the Python pivot test, decided structurally instead of by a
    float threshold: if any net of the network cannot reach a known-voltage rail through the network (it hangs only on
    rails of unknown voltage), G is singular and the whole network gets no level ({})."""
    import numpy as np
    known_edge = [any(y not in idx and src.get(y) is not None for y, _ in adj[x]) for x in comp]
    seen = [i for i, k in enumerate(known_edge) if k]
    reach = set(seen)
    while seen:
        x = comp[seen.pop()]
        for y, _ in adj[x]:
            j = idx.get(y)
            if j is not None and j not in reach:
                reach.add(j)
                seen.append(j)
    if len(reach) != len(comp):
        return {}
    arr = np.array(a, dtype=float)
    try:
        v = np.linalg.solve(arr[:, :-1], arr[:, -1])
    except np.linalg.LinAlgError:
        return {}
    if not np.all(np.isfinite(v)):
        return {}
    return {n: float(v[idx[n]]) for n in comp}


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


# ------------------------------------------------------------------ C1 decoupling (checklist #14)
def rule_decouple(g: NetGraph) -> list[Finding]:
    """Every supply NET (not node: a bead-isolated AVDD needs its own cap) that feeds a built IC must carry at
    least one built capacitor. WARN when none; INFO when caps exist but none in the 0.1 uF class
    (config netrules.decouple_min_f / decouple_max_f). Placement is not in the netlist, so a cap anywhere on
    the net counts: this rule catches a forgotten / DNP'd cap, not a far-away one."""
    d, cfg = g.d, g.cfg
    nr = cfg.get("netrules", {}) or {}
    lo, hi = float(nr.get("decouple_min_f", 10e-9)), float(nr.get("decouple_max_f", 1e-6))
    cap_px = set(nr.get("capacitor_prefixes", ["C"]))
    nc = re.compile(cfg["drc"]["intentional_nc_net_regex"], re.I)
    out = []
    by_net: dict[str, list] = defaultdict(list)
    for k in _decouple_pins(g):
        n = d.pin_net.get(k)
        if n and not g.gnd_re.fullmatch(n) and not nc.search(n) and not _AUTO.match(n):
            by_net[n].append(k)
    for net in sorted(by_net, key=natkey):
        ics = sorted(by_net[net], key=lambda k: (natkey(k[0]), natkey(k[1])))
        caps = sorted({k[0] for k in d.nets.get(net, []) if _prefix(k[0]) in cap_px}, key=natkey)
        built = [c for c in caps if present(d, c, cfg)]
        dnp = [c for c in caps if c not in built]
        ic_txt = ", ".join(g.pin_txt(k) for k in ics)
        refs = sorted({k[0] for k in ics}, key=natkey)
        pins = [f"{k[0]}.{k[1]}" for k in ics]
        if not built:
            out.append(_f(d, rule="DECOUPLE_MISSING", severity="WARN",
                          title=f"supply net {net}: no built capacitor",
                          detail=f"IC supply pins on this net: {ic_txt}." +
                                 (f"\nDNP capacitor(s): {', '.join(dnp)}" if dnp else "\nNo capacitor symbol at all.") +
                                 "\nChecklist #14: every power pin needs a 0.1 uF class decoupling cap.",
                          refdes=refs + dnp, nets=[net], pins=pins, key=f"DECOUPLE_MISSING|{net}"))
            continue
        vals = []
        for c in built:
            f, _ = parse_cap(d.value(c))
            vals.append((c, f))
        if not any(f is not None and lo <= f <= hi for _, f in vals):
            if any(f is None for _, f in vals):
                continue                      # a value we cannot read may be the 0.1 uF ("104"): no verdict (QA #6)
            out.append(_f(d, rule="DECOUPLE_NO_SMALL", severity="INFO",
                          title=f"supply net {net}: caps present but none in {_fmt_f(lo)}..{_fmt_f(hi)}",
                          detail=f"IC supply pins: {ic_txt}.\nbuilt caps: " +
                                 ", ".join(f"{c} {d.value(c) or '?'}" for c, _ in vals) +
                                 "\nBulk only; add a 0.1 uF class cap next to the pin unless the IC says otherwise.",
                          refdes=refs + built, nets=[net], pins=pins, key=f"DECOUPLE_NO_SMALL|{net}"))
    return out


def _decouple_pins(g: NetGraph) -> list:
    """Built-IC pins C1 treats as power pins: any role in config netrules.decouple_roles (default supply only),
    never a pin that is also 'analog' (VIN_K Kelvin sense, VINMON divider)."""
    d, cfg = g.d, g.cfg
    roles = set((cfg.get("netrules", {}) or {}).get("decouple_roles", ["supply"]))
    return [k for k, rl in g.pin_roles.items()
            if rl & roles and "analog" not in rl and _prefix(k[0]) in g.ic_px and present(d, k[0], cfg)]


def decouple_coverage(g: NetGraph) -> dict:
    """What C1 actually looked at (QA 2026-10-20): power nets checked, IC power pins seen, power pins on an
    unnamed (auto-named) net that C1 skips, built ICs with no pin matching decouple_roles (NOT covered;
    widen pin_roles or add by_part)."""
    d, cfg = g.d, g.cfg
    nc = re.compile(cfg["drc"]["intentional_nc_net_regex"], re.I)
    nets, pins, unnamed = set(), 0, []
    seen = {k[0] for k, rl in g.pin_roles.items() if _prefix(k[0]) in g.ic_px and present(d, k[0], cfg)}
    for k in _decouple_pins(g):
        pins += 1
        n = d.pin_net.get(k)
        if n and _AUTO.match(n):
            unnamed.append(f"{k[0]}.{k[1]}")
        elif n and not g.gnd_re.fullmatch(n) and not nc.search(n):
            nets.add(n)
    none = sorted(seen - {k[0] for k in _decouple_pins(g)}, key=natkey)
    return {"supply_nets": len(nets), "supply_pins": pins, "ics_built": len(seen),
            "supply_pins_unnamed_net": len(unnamed), "supply_pins_unnamed_list": sorted(unnamed, key=natkey),
            "ics_no_supply_pin": len(none),
            "ics_no_supply_pin_list": [f"{r} {d.value(r) or ''}".strip() for r in none]}


def _fmt_f(f: float) -> str:
    if f >= 1e-6:
        return f"{f * 1e6:g}uF"
    return f"{f * 1e9:g}nF"


# ------------------------------------------------------------------ C2 double pull-up (checklist #8 / #12)
def rule_pullup_double(g: NetGraph, domains: dict[str, dict] | None = None) -> list[Finding]:
    """A node with two or more built pull-up resistors to rails. I2C SDA / SCL nodes are left to
    I2C_PU_DUPLICATE (config i2c.sda_pin / scl_pin). Severity (QA 2026-10-20, HANDOVER 0p11):
    two rails in different power domains (rail_domain csv, both confirmed = Y) = ERROR (the longer-on rail
    back-feeds the other through the two resistors, even at equal voltage: P3V3 vs P3V3_STBY);
    same domain and same voltage = WARN (combined drive unknown, checklist #8 / #12);
    voltage or domain unknown / guessed = WARN marked 未驗證. Never ERROR on a guess."""
    d, cfg = g.d, g.cfg
    domains = domains or {}
    ic = cfg.get("i2c", {}) or {}
    i2c_rx = [re.compile(ic[k], re.I) for k in ("sda_pin", "scl_pin") if ic.get(k)]
    out = []
    smax = float((cfg.get("netrules", {}) or {}).get("series_max_ohm", 100))
    for node in g.nodes:
        # a resistor <= series_max_ohm to a rail is a feed / shunt (parallel 1 mOhm sense, 10R bias), not a pull-up (QA #3)
        pu = [p for p in g.pull_ups(node) if p.ohm is None or p.ohm > smax]
        if len(pu) < 2:
            continue
        if any(rx.fullmatch(d.pin_name.get(k, "")) for k in node.pins for rx in i2c_rx
               if _prefix(k[0]) in g.ic_px):
            continue
        if not g.ic_pins(node) and not g.offboard(node):
            continue                          # resistor-only node (divider mid-point etc.)
        kn = _key_net(g, node, node.pins[0] if node.pins else None)
        rails = sorted({p.net for p in pu}, key=natkey)
        volts = sorted({p.v for p in pu if p.v is not None})
        v_unknown = any(p.v is None for p in pu)
        doms = {r: domain_of(r, domains, cfg) for r in rails}          # rail -> (domain, confirmed)
        dom_names = sorted({dm for dm, _ in doms.values() if dm})
        dom_known = all(dm for dm, _ in doms.values())
        dom_confirmed = all(c for _, c in doms.values())
        unverified = ""
        if len(rails) == 1:
            sev = "WARN"
            why = "to the same rail: combined pull-up drive unknown; keep one (checklist #8 / #12)"
        elif dom_known and len(dom_names) > 1:
            # different power domains: the rail that stays on feeds the other through R1 + R2
            sev = "ERROR" if dom_confirmed else "WARN"
            why = (f"to rails in different power domains ({', '.join(f'{r} = {doms[r][0]}' for r in rails)}): "
                   "the rail that stays on back-feeds the other one through the two resistors")
            if not dom_confirmed:
                unverified = " [未驗證: domain guessed from rail names, set confirmed = Y in rail_domain csv]"
        elif dom_known and not v_unknown and len(volts) == 1:
            sev = "WARN"
            why = (f"to two rails of the same domain ({dom_names[0]}) and voltage ({volts[0]:g} V): "
                   "combined pull-up drive unknown; keep one (checklist #8 / #12)")
            if not dom_confirmed:
                unverified = " [未驗證: domain guessed from rail names, set confirmed = Y in rail_domain csv]"
        elif dom_known and dom_confirmed and not v_unknown and len(volts) > 1:
            sev = "WARN"
            why = (f"to two rails of the same domain ({dom_names[0]}) at different voltages "
                   f"({', '.join(f'{v:g}' for v in volts)} V): rail-to-rail bias through the two resistors, "
                   "node level undefined; keep one")
        else:
            sev = "WARN"
            miss = []
            if v_unknown or len(volts) > 1:
                miss.append("voltage " + ("unknown (rail_map)" if v_unknown else f"differs ({', '.join(f'{v:g}' for v in volts)} V)"))
            if not dom_known:
                miss.append("power domain unknown (rail_domain csv)")
            elif not dom_confirmed:
                miss.append("power domain guessed from rail names (set confirmed = Y in rail_domain csv)")
            why = "to different rails; back-power cannot be judged: " + "; ".join(miss)
            unverified = " [未驗證]"
        members = ", ".join(g.pin_txt(k) for k in node.pins)
        nets_txt = f"\nnets in node: {', '.join(node.nets)}" + (f" (via {', '.join(node.links)})" if node.links else "")
        out.append(_f(d, rule="PULLUP_DOUBLE", severity=sev,
                      title=f"{kn}: {len(pu)} built pull-ups ({', '.join(rails)}){unverified}",
                      detail=f"pull-ups: {'; '.join(p.text(d) for p in pu)}. Pulled {why}.{nets_txt}\nmembers: {members}",
                      refdes=[p.r for p in pu] + sorted({k[0] for k in node.pins}, key=natkey),
                      nets=_nets(node, kn), pins=_pins_of(g, node, [], pu), key=f"PULLUP_DOUBLE|{kn}"))
    return out



# ------------------------------------------------------------------ C3 FET_GATE_LEVEL (checklist #17, 2026-10-21)
def fet_groups(d: Design, pin_roles: dict, q: str) -> list[dict]:
    """Split a FET symbol into transistors: {gate: key, sources: [keys], drains: [keys]}. One gate pin = one FET
    (multi-source packages SOURCE_1..3 stay together). Several gates: paired by the digit suffix (GATE1 / SOURCE1 /
    DRAIN1) only; a dual with bare G / S / D pins is NOT paired by pin order (SOT-363 duals put G of one transistor
    next to D of the other, QA 2026-10-21) -> [] and the part is counted as skipped in fet_coverage."""
    gates = [k for k in d.pins_of(q) if "fet_gate" in pin_roles.get(k, ())]
    srcs = [k for k in d.pins_of(q) if "fet_source" in pin_roles.get(k, ())]
    drns = [k for k in d.pins_of(q) if "fet_drain" in pin_roles.get(k, ())]
    if not gates or not srcs:
        return []
    if len(gates) == 1:
        return [{"gate": gates[0], "sources": srcs, "drains": drns}]
    sfx = lambda k: re.sub(r"\D", "", d.pin_name.get(k, ""))  # noqa: E731
    if not all(sfx(k) for k in gates):
        return []
    out = []
    for gk in gates:
        ss = [k for k in srcs if sfx(k) == sfx(gk)]
        if ss:
            out.append({"gate": gk, "sources": ss, "drains": [k for k in drns if sfx(k) == sfx(gk)]})
    return out


def _fet_groups(g: NetGraph, q: str) -> list[dict]:
    return fet_groups(g.d, g.pin_roles, q)


def fet_coverage(g: NetGraph) -> dict:
    """What FET_GATE_LEVEL looked at: built FET-prefix parts, how many transistors were listed, and the built
    parts it could not split into gate / source groups (BJTs, bare-pin duals, odd pin names)."""
    d, cfg = g.d, g.cfg
    fet_px = set((cfg.get("netrules", {}) or {}).get("fet_prefixes", ["Q", "PQ"]))
    built = sorted((r for r in d.parts if _prefix(r) in fet_px and present(d, r, cfg)), key=natkey)
    skipped, n = [], 0
    for q in built:
        grps = _fet_groups(g, q)
        if grps:
            n += len(grps)
        else:
            names = ",".join(d.pin_name.get(k, "") for k in d.pins_of(q))
            skipped.append(f"{q} {d.value(q) or ''} [{names}]".strip())
    return {"fets_built": len(built), "transistors_listed": n, "fets_skipped": len(skipped), "fets_skipped_list": skipped}


def _net_level(g: NetGraph, net: str) -> tuple[float | None, str]:
    """(DC level, how): a rail -> its voltage ('rail'); else the nodal-analysis level ('solved' / 'unknown_source'
    = known rails only, unknown rails open / 'floating' = no rail reached)."""
    if g.is_rail(net):
        v = g.voltage(net)
        return v, "rail" if v is not None else "rail?"
    i = g.dc().get(net)
    if i is None:
        return None, "floating"
    return i.level, i.status


def _level_txt(v: float | None, how: str) -> str:
    if v is None:
        return "?V" + {"floating": " (無 rail，浮接或 IC 推挽)", "rail?": " (rail 電壓未知)",
                       "unknown_source": " (rail 電壓未知)"}.get(how, "")
    s = f"{v:.3g}V"
    if how == "unknown_source":
        s += " (另有未知 rail，未計)"
    return s


def _gate_members(g: NetGraph, node: Node, self_q: str) -> list[str]:
    """Built parts on the gate node that the resistor-only DC model ignores (QA 2026-10-21 C2 / L4): IC pins with
    their role (open-drain = the computed pull level holds; push-pull = the IC decides), other FET pins (a drain
    can pull the gate low), diodes / zeners (clamp). Caps, resistors, test pads are not listed."""
    d = g.d
    out = []
    for k in node.pins:
        r = k[0]
        if r == self_q or not present(d, r, cfg=g.cfg):
            continue
        px = _prefix(r)
        rl = g.pin_roles.get(k, ())
        if px in g.ic_px:
            how = ("open-drain，算出的 level 成立" if "open_drain" in rl else
                   "open-drain?，可能推挽" if "open_drain_maybe" in rl else "推挽?，DC level 由它決定")
            out.append(f"{g.pin_txt(k)} ({how})")
        elif "fet_drain" in rl or "fet_source" in rl:
            out.append(f"{g.pin_txt(k)} (FET {'drain' if 'fet_drain' in rl else 'source'}，導通時可拉低，未計)")
        elif px == "D" or (px.startswith("D") and px not in ("DS",)):
            out.append(f"{g.pin_txt(k)} {d.value(r) or ''} (diode / zener clamp，未計)".replace("  ", " "))
    return out


def rule_fet_gate_level(g: NetGraph) -> list[Finding]:
    """Checklist #17: list Vg / Vs / Vgs of every built discrete FET (config netrules.fet_prefixes) from the DC level
    of the gate / source nets, so the RD can check Vgs against the datasheet Vth / Vgs(max). INFO only: Vth is not
    in the tool. Pins by config pin_roles fet_gate / fet_source / fet_drain. The gate's IC drivers, other FET pins
    and clamps are listed (they are outside the resistor model); a gate with no DC path to a rail is '?V'. Vgs is
    only given when both levels are known and the source pins sit on ONE net. Key = RULE|RefDes, or RULE|RefDes.<gate pin>
    for every transistor of a dual (tracking keeps that key as written)."""
    d, cfg = g.d, g.cfg
    nr = cfg.get("netrules", {}) or {}
    fet_px = set(nr.get("fet_prefixes", ["Q", "PQ"]))
    out = []
    for q in sorted((r for r in d.parts if _prefix(r) in fet_px), key=natkey):
        if not present(d, q, cfg):
            continue
        groups = _fet_groups(g, q)
        for n, grp in enumerate(groups, 1):
            gk = grp["gate"]
            gnet = d.pin_net[gk]
            snets = sorted({d.pin_net[k] for k in grp["sources"]})
            dnets = sorted({d.pin_net[k] for k in grp["drains"]})
            vg, hg = _net_level(g, gnet)
            vs, hs = (_net_level(g, snets[0]) if len(snets) == 1 else (None, "multi"))
            lines = [f"G {g.pin_txt(gk)} net {gnet}: Vg = {_level_txt(vg, hg)}"]
            node = g.node_of.get(gnet)
            clamp = False
            if node is not None:
                pu = [p.text(d) for p in g.pull_ups(node)]
                pd_ = [p.text(d) for p in g.pull_downs(node)]
                dnp = [p.text(d) for p in node.pulls if not p.built]
                if pu:
                    lines.append("  pull-up: " + ", ".join(pu))
                if pd_:
                    lines.append("  pull-down: " + ", ".join(pd_))
                if dnp:
                    lines.append("  DNP pull: " + ", ".join(dnp))
                mem = _gate_members(g, node, q)
                clamp = any("clamp" in m for m in mem)
                if mem:
                    lines.append("  gate 節點上其他零件 (不在電阻模型內): " + ", ".join(mem))
                if len(node.nets) > 1:
                    lines.append("  同節點 net: " + ", ".join(node.nets[:8]))
            s_txt = ", ".join(g.pin_txt(k) for k in grp["sources"])
            if len(snets) == 1:
                lines.append(f"S {s_txt} net {snets[0]}: Vs = {_level_txt(vs, hs)}")
            else:
                lines.append(f"S {s_txt} on {len(snets)} nets ({', '.join(snets)}): Vs 不定")
            if dnets:
                dl = ", ".join(f"{x} {_level_txt(*_net_level(g, x))}" for x in dnets)
                lines.append(f"D {', '.join(g.pin_txt(k) for k in grp['drains'])}: {dl}")
            if vg is not None and vs is not None:
                vgs = f"{vg - vs:.3g}V"
                lines.append(f"Vgs = Vg - Vs = {vgs}  (請對 datasheet Vgs(th) / Vgs(max)；N/P 型與 body diode 方向工具不判)")
            else:
                vgs = "?"
                lines.append("Vgs 未定 (Vg 或 Vs 未知)")
            tag = f" #{n}" if len(groups) > 1 else ""
            mpn = f" {d.value(q)}" if d.value(q) else ""
            pins = [f"{k[0]}.{k[1]}" for k in [gk] + grp["sources"] + grp["drains"]]
            out.append(_f(d, rule="FET_GATE_LEVEL", severity="INFO",
                          title=f"{q}{tag}{mpn}: Vg {_level_txt(vg, hg).split(' ')[0]} / "
                                f"Vs {_level_txt(vs, hs).split(' ')[0]} / Vgs {vgs}" + (" (gate 有 clamp，未計)" if clamp else ""),
                          detail="\n".join(lines) + "\nDC level 只算電阻網路 (FET / IC 推挽輸出 / 二極體不在模型內)：上游 FET 導通或 IC 驅動時"
                                 " level 會不同，Vs 取自 rail 名稱時 rail 未開也不成立，請照線路圖各狀態核對。"
                                 "\nChecklist #17: FET gate drive level vs Vth. 表列用，不判對錯。",
                          refdes=[q], nets=[gnet] + snets, pins=pins,
                          key=f"FET_GATE_LEVEL|{q}" + (f".{gk[1]}" if tag else "")))
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
    if "DECOUPLE" in en:
        out += rule_decouple(g)
    if "PULLUP_DOUBLE" in en:
        out += rule_pullup_double(g, domains or {})
    if "FET_GATE_LEVEL" in en:
        out += rule_fet_gate_level(g)
    return out
