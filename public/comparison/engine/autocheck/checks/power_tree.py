"""B1: power tree derived from the netlist (HANDOVER 0u, 2026-10-09). Not a check: a table for RDs to hold
against the power-tree picture in the schematic.

A converter is an IC with a reg_in pin plus at least one of reg_out (LDO / eFuse / load switch),
reg_sw (switcher: SW -> inductor -> output) or reg_gate (hot-swap / ideal diode: GATE -> series R ->
FET gate -> the FET's other pins). Pin meanings come from config pin_roles only.

Rails are grouped through tie parts (0R, fuse, bead, net-tie, mOhm shunt), so PS_48V_INPUT -F- ... is one
rail; the group is named after its best member (voltage in the name first).

2026-10-13 (OTA01 DC-SCM, owner request): everything below is local to the power tree, so netrules / capv / I2C
findings cannot move.
- power_tree.prefix_aliases: power-section RefDes (PU / PL / PQ / PR / PFB / PD) count as U / L / Q / R / FB / D.
- power_tree.strip_duplicate_pin_suffix: OrCAD's duplicate-pin suffix NAME#<own pin number> (VIN#4, VDDQ#M6) is cut
  before the pin_roles match.
- power_tree.connector_refdes_regex: board-to-board connectors whose RefDes prefix is not J / CN (DC-SCI_GF1).
- A rail group is named after the net on the regulator pin / inductor when names tie on voltage.
- Rail voltage for the tree also reads a leading supply word (VCC_BMC_0V8 -> 0.8 V, VCC_12V -> 12 V);
  capv keeps its own stricter rule.
- Discrete FET switch: a built FET whose gate pin has fet_gate and whose other pins sit on exactly two rails, one
  with a known voltage / connector, the other loaded and fed by nothing -> edge "FET switch (discrete)".
- Diode feed: a built 2-pin diode (anode / cathode from power_tree.diode_*_pin) from a powered rail into a loaded
  rail that nothing feeds -> edge "diode" (diode-OR / isolation), drawn dashed.
- Orphan rails whose only load is one converter (bias / VCC / sense nets) carry internal = True: the diagram
  hides them unless they feed something.
"""
from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass, field

from ..model import Design, natkey
from ..values import SUPPLY_WORDS, net_voltage_from_name, parse_res_loose
from .drc import _prefix, is_tie, present
from .netrules import SIGNAL_ROLES, NetGraph, Roles

_AUTO = re.compile(r"^N\d+$")


class TreeCtx:
    """Power-tree-only views of the design: aliased RefDes prefixes, pin roles with the OrCAD duplicate-pin suffix
    cut, and a net-name voltage that accepts a leading supply word. NetGraph itself is left untouched."""

    def __init__(self, d: Design, cfg: dict, g: NetGraph):
        pt = cfg.get("power_tree", {}) or {}
        self.d, self.cfg, self.g = d, cfg, g
        self.alias = {str(k).upper(): str(v).upper() for k, v in (pt.get("prefix_aliases", {}) or {}).items()}
        self.strip_dup = bool(pt.get("strip_duplicate_pin_suffix", True))
        conn_rx = pt.get("connector_refdes_regex", "")
        self.conn_re = re.compile(conn_rx) if conn_rx else None
        self.prefix_words = {str(x).upper() for x in (pt.get("name_prefix_words", sorted(SUPPLY_WORDS)) or [])}
        self.bl = {x.upper() for x in cfg["net_voltage"]["blacklist"]}
        self.anode = re.compile(pt.get("diode_anode_pin", "A|ANODE"), re.I)
        self.cathode = re.compile(pt.get("diode_cathode_pin", "K|C|CATHODE"), re.I)
        self.res_px = set((cfg.get("netrules", {}) or {}).get("resistor_prefixes", ["R", "RS"]))
        roles: Roles = g.roles
        self.pin_roles = {}
        for k in d.pin_net:
            rl = roles.of(d, k)
            name = d.pin_name.get(k, "")
            cut = self.base_name(k)
            if cut != name and cut:
                rl = rl | {n for n, rx in roles.rx.items() if rx.fullmatch(cut)}
                mpn = d.value(k[0])
                rl |= {role for m, pp, role in roles.by_part if m.fullmatch(mpn) and pp.fullmatch(cut)}
            self.pin_roles[k] = rl
        ic_px = set((cfg.get("netrules", {}) or {}).get("ic_prefixes", ["U"]))
        # signal nets of ICs NetGraph does not see as ICs (PU*): never merged into a rail
        power = {d.pin_net[k] for k, rl in self.pin_roles.items() if rl & {"supply", "reg_in", "reg_out", "reg_sw"}}
        self.extra_signal = {d.pin_net[k] for k, rl in self.pin_roles.items()
                             if rl & SIGNAL_ROLES and self.px(k[0]) in ic_px and _prefix(k[0]) not in ic_px} - power
        self.signal = set(g.signal_nets) | self.extra_signal
        # nets that name a rail best: on a regulator output pin, or on the output side of a switcher's inductor
        # (output side only: VCC_PMIC_3V3 at the inductor beats VCC_BMC_3V3 / PFR_SPI_3V3 further down the rail)
        ind_px = set(pt.get("inductor_prefixes", ["L"]))
        sw_nets = {d.pin_net[k] for k, rl in self.pin_roles.items() if "reg_sw" in rl}
        self.anchor_out = {d.pin_net[k] for k, rl in self.pin_roles.items() if "reg_out" in rl}
        self.anchor_pwr = {d.pin_net[k] for k, rl in self.pin_roles.items() if rl & {"supply", "reg_in"}} | {
            n for n, ks in d.nets.items() if any(self.offboard(k[0]) for k in ks)}
        for r in d.parts:
            if self.px(r) in ind_px and any(d.pin_net[k] in sw_nets for k in d.pins_of(r)):
                self.anchor_out |= {d.pin_net[k] for k in d.pins_of(r)} - sw_nets
        self.supply_nets = {d.pin_net[k] for k, rl in self.pin_roles.items()
                            if "supply" in rl and present(d, k[0], cfg)}

    def base_name(self, k) -> str:
        """Pin name without OrCAD's duplicate-name suffix NAME#<own pin number> (VIN#4, VCC_DDR_VDDQ#M6).
        Only the pin's own number is cut, so RESET# / OE# and any other '#' stay as they are."""
        name = self.d.pin_name.get(k, "")
        suf = f"#{k[1]}"
        if self.strip_dup and len(name) > len(suf) and name.upper().endswith(suf.upper()):
            return name[: -len(suf)]
        return name

    def px(self, r: str) -> str:
        p = _prefix(r)
        return self.alias.get(p, p)

    def offboard(self, r: str) -> bool:
        """Connector to another board: netrules offboard prefixes, or the tree-only RefDes regex (DC-SCI_GF1)."""
        return _prefix(r) in self.g.off_px or bool(self.conn_re and self.conn_re.fullmatch(r))

    def ohm(self, r: str) -> float | None:
        if self.px(r) not in self.res_px:
            return None
        return parse_res_loose(self.d.value(r))

    def tie(self, r: str) -> bool:
        if is_tie(self.d, r, self.cfg):
            return True
        if _prefix(r) == self.px(r) or not self.d.stuffed(r):
            return False                         # no alias: is_tie already answered
        pr = self.d.prim(r)
        if pr is None or len(pr.all_pin_numbers()) != 2:
            return False
        if self.px(r) in set(self.cfg["ground"]["tie_prefixes"]):
            return True
        o = self.ohm(r)
        return o is not None and o <= float(self.cfg["ground"]["tie_max_ohm"])

    def name_volt(self, net: str) -> float | None:
        v = net_voltage_from_name(net, self.bl)
        if v is not None:
            return v
        toks = [t for t in re.split(r"[_\-\s]+", net.upper()) if t]
        if len(toks) > 1 and toks[0] in self.prefix_words:     # VCC_BMC_0V8: the supply word names the rail
            return net_voltage_from_name("_".join(toks[1:]), self.bl)
        return None

    def volt(self, net: str) -> float | None:
        if net in self.signal:
            return None
        v = self.g.voltage(net)
        return v if v is not None else self.name_volt(net)


@dataclass
class Edge:
    conv: str                 # converter RefDes
    mpn: str
    kind: str                 # buck / HSC / LDO-eFuse / switch
    built: bool
    rail_in: str
    rail_out: str
    via: list[str] = field(default_factory=list)   # inductor / FET RefDes walked through
    en: list[str] = field(default_factory=list)
    pg: list[str] = field(default_factory=list)
    page: int | None = None


class RailGroups:
    """Union of nets joined by built tie parts."""

    def __init__(self, d: Design, cfg: dict, g: NetGraph, ctx: "TreeCtx | None" = None):
        ctx = ctx or TreeCtx(d, cfg, g)
        parent = {n: n for n in d.nets}

        def find(x):
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x

        tie_max = float(cfg["ground"]["tie_max_ohm"])
        vset = {n: ({g.voltage(n)} if g.voltage(n) is not None else set()) for n in d.nets}   # per root
        for r in sorted(d.parts, key=natkey):
            ns = sorted({d.pin_net[k] for k in d.pins_of(r)})
            if len(ns) < 2 or not present(d, r, cfg):
                continue
            ohm = ctx.ohm(r)
            if len(ns) == 2 and (ctx.tie(r) or (ohm is not None and ohm <= g.series_max)):
                pass                     # 0R / fuse / bead / net-tie / series or filter R (VIN filter, OUT sense)
            elif ctx.px(r) == "RS" and ohm is not None and ohm <= tie_max:
                pass                     # 4-terminal Kelvin shunt: force and sense pins are one rail
            else:
                continue
            # never into ground (bleeder / pre-load R), never into a signal net (strap 0R to VDD),
            # never between two different known voltages
            if any(g.gnd_re.fullmatch(n) or n in ctx.signal for n in ns):
                continue
            for n in ns[1:]:
                a, b = find(ns[0]), find(n)
                if a == b:
                    continue
                if vset[a] and vset[b] and max(abs(x - y) for x in vset[a] for y in vset[b]) > 0.05:
                    continue
                parent[b] = a
                vset[a] |= vset[b]
        members = defaultdict(list)
        for n in d.nets:
            members[find(n)].append(n)
        self.name, self.members, self.volt, self.vnote, self.vsrc = {}, {}, {}, {}, {}
        for _, ns in members.items():
            def score(n):
                v = g.volts.get(n)
                named_v = (v is not None and not v[1].startswith("via")) or (
                    n not in ctx.signal and ctx.name_volt(n) is not None)
                # the net on the regulator output / input pin names the rail (VCC_PMIC_3V3 over PFR_SPI_3V3)
                # then a net on an IC supply pin / board connector (VCC_RTC_HPM over the ADC tap BMC_ADC15)
                tier = 0 if n in ctx.anchor_out else (1 if n in ctx.anchor_pwr else 2)
                return (0 if named_v else 1, tier, 1 if _AUTO.match(n) else 0, len(n), n)
            best = sorted(ns, key=score)[0]
            for n in ns:
                self.name[n] = best
            self.members[best] = sorted(ns)
            v = g.voltage(best)
            if v is None:                # tree-only: one voltage named by the members (VCC_BMC_0V8, VCC_12V)
                vs = {ctx.volt(n) for n in ns} - {None}
                if len(vs) == 1:
                    v = vs.pop()
                elif len(vs) > 1:
                    self.vnote[best] = "同組 net 名稱電壓不一致: " + ", ".join(
                        f"{n} {ctx.volt(n):g} V" for n in sorted(ns) if ctx.volt(n) is not None)
            self.volt[best] = v

    def of(self, net: str) -> str:
        return self.name.get(net, net)


def power_tree(d: Design, cfg: dict, g: NetGraph | None = None) -> dict:
    g = g or NetGraph(d, cfg)
    pt = cfg.get("power_tree", {}) or {}
    ind_px = set(pt.get("inductor_prefixes", ["L"]))
    fet_px = set(pt.get("fet_prefixes", ["Q"]))
    ic_px = set((cfg.get("netrules", {}) or {}).get("ic_prefixes", ["U"]))
    ctx = TreeCtx(d, cfg, g)
    rg = RailGroups(d, cfg, g, ctx)
    px = ctx.px

    pin_roles = ctx.pin_roles
    # rails that power something: an IC supply pin or a converter input
    loaded = {rg.of(d.pin_net[k]) for k, rl in pin_roles.items() if rl & {"supply", "reg_in"}}
    edges: list[Edge] = []
    gnd = g.gnd_re

    def chan(k) -> str:
        """Channel token of a multi-output regulator pin: trailing digits of the pin name (VIN2 / LX2 / VOUT2)."""
        m = re.search(r"(\d+)$", ctx.base_name(k))
        return m.group(1) if m else ""

    for u in sorted((r for r in d.parts if px(r) in ic_px), key=natkey):
        ks = d.pins_of(u)
        by = defaultdict(list)
        for k in ks:
            for rl in pin_roles.get(k, ()):
                by[rl].append(k)
        if not by["reg_in"] or not (by["reg_out"] or by["reg_sw"] or by["reg_gate"]):
            continue
        ins = sorted({rg.of(d.pin_net[k]) for k in by["reg_in"]})
        in_ch: dict[str, set] = defaultdict(set)     # channel -> input rails (PMIC VIN1..VIN5)
        for k in by["reg_in"]:
            in_ch[chan(k)].add(rg.of(d.pin_net[k]))
        outs: dict[str, set] = defaultdict(set)      # rail -> via parts
        out_ch: dict[str, set] = defaultdict(set)    # rail -> channels it came out of
        kind = "LDO / eFuse / switch"
        for k in by["reg_out"]:
            outs[rg.of(d.pin_net[k])]
            out_ch[rg.of(d.pin_net[k])].add(chan(k))
        for k in by["reg_sw"]:
            kind = "buck / switcher"
            sw = d.pin_net[k]
            for (r, p), n in sorted(d.pin_net.items()):
                if n == sw and px(r) in ind_px and present(d, r, cfg):
                    for k2 in d.pins_of(r):
                        if d.pin_net[k2] != sw:
                            outs[rg.of(d.pin_net[k2])].add(r)
                            out_ch[rg.of(d.pin_net[k2])].add(chan(k))
        for k in by["reg_gate"]:
            kind = "hot-swap / FET switch"
            node = g.node_of.get(d.pin_net[k])
            gate_nets = set(node.nets) if node else {d.pin_net[k]}
            for (q, p), n in sorted(d.pin_net.items()):
                if n in gate_nets and px(q) in fet_px and "fet_gate" in pin_roles.get((q, p), ()):
                    for k2 in d.pins_of(q):
                        if k2 == (q, p):
                            continue
                        rail = rg.of(d.pin_net[k2])
                        if rail not in ins:
                            outs[rail].add(q)
        # an OUT pin that is only a sense of the same input rail is not an output
        for rail in [x for x in outs if x in ins]:
            outs.pop(rail)
        useful = lambda r: rg.volt.get(r) is not None or r in loaded  # noqa: E731
        outs = {r: v for r, v in outs.items() if useful(r)}
        if any(rg.volt.get(r) is not None for r in ins):
            ins = [r for r in ins if rg.volt.get(r) is not None]
        en = sorted({d.pin_net[k] for k in by["reg_en"]})
        pg = sorted({d.pin_net[k] for k in by["reg_pg"]})
        multi_in = len(set(ins)) > 1
        all_out_ch = {c for cs in out_ch.values() for c in cs if c}
        # input rails that only belong to a channel some output claims (VIN3 when LX3 exists)
        chan_only = {r for c, rs in in_ch.items() if c and c in all_out_ch for r in rs} - in_ch.get("", set())
        for ri in ins:
            if gnd.fullmatch(ri):
                continue
            for ro, via in sorted(outs.items()):
                if gnd.fullmatch(ro):
                    continue
                if multi_in:             # several input rails: pair by channel number when the pins say so
                    paired = set().union(*(in_ch.get(c, set()) for c in out_ch.get(ro, ()) if c)) & set(ins)
                    if paired and ri not in paired:
                        continue
                    if not paired and ri in chan_only:
                        continue         # no own VIN for this channel: still never another channel's VIN
                edges.append(Edge(conv=u, mpn=d.value(u), kind=kind, built=present(d, u, cfg), rail_in=ri,
                                  rail_out=ro, via=sorted(via, key=natkey), en=en, pg=pg, page=d.page_of(u)))

    # discrete parts (2026-10-13, QA 2026-10-13): only into a rail with a BUILT load that no built converter feeds,
    # only from a powered rail, never closing a loop. Several diodes may feed one rail (diode-OR: every leg is an
    # edge, the diagram draws the extra legs as "也由 ... 供電").
    def conns_of(rail):
        return {k[0] for n in rg.members.get(rail, [rail]) for k in d.nets.get(n, []) if ctx.offboard(k[0])}

    loaded_built = {rg.of(d.pin_net[k]) for k, rl in pin_roles.items()
                    if rl & {"supply", "reg_in"} and present(d, k[0], cfg)}
    conv_fed = {e.rail_out for e in edges if e.built}
    fed_now = set(conv_fed)

    def powered(rail):
        return rail in fed_now or rg.volt.get(rail) is not None or bool(conns_of(rail))

    def sink_ok(rail):
        return rail in loaded_built and rail not in conv_fed and not gnd.fullmatch(rail) and rail not in ctx.signal

    def reaches(src, dst):
        """dst reachable from src over the edges found so far (a new edge dst -> src would close a loop)."""
        nxt = defaultdict(set)
        for e in edges:
            nxt[e.rail_in].add(e.rail_out)
        seen, todo = {src}, [src]
        while todo:
            for y in nxt[todo.pop()]:
                if y == dst:
                    return True
                if y not in seen:
                    seen.add(y)
                    todo.append(y)
        return False

    used_q = {v for e in edges for v in e.via}
    for q in sorted((r for r in d.parts if px(r) in fet_px and r not in used_q), key=natkey):
        if not present(d, q, cfg):
            continue
        gates = [k for k in d.pins_of(q) if "fet_gate" in pin_roles.get(k, ())]
        if len(gates) != 1:
            continue
        sides = sorted({rg.of(d.pin_net[k]) for k in d.pins_of(q) if k != gates[0]})
        if len(sides) != 2 or any(gnd.fullmatch(x) or x in ctx.signal for x in sides):
            continue
        # a FET conducts both ways: the sink must have no source of its own (no converter, no connector, not
        # already fed), else the direction is a guess
        cand = [(a, b) for a, b in (sides, sides[::-1])
                if sink_ok(b) and b not in fed_now and not conns_of(b) and powered(a) and not reaches(b, a)]
        if len(cand) != 1:
            continue                     # both or neither side qualifies: do not guess the direction
        a, b = cand[0]
        edges.append(Edge(conv=q, mpn=d.value(q), kind="FET switch (discrete)", built=True, rail_in=a, rail_out=b,
                          via=[], en=[d.pin_net[gates[0]]], pg=[], page=d.page_of(q)))
        fed_now.add(b)
    oriented = []
    for r in sorted((x for x in d.parts if px(x) == "D"), key=natkey):
        if not present(d, r, cfg):
            continue
        ks = d.pins_of(r)
        if len(ks) != 2:
            continue
        an = [k for k in ks if ctx.anode.fullmatch(k[1]) or ctx.anode.fullmatch(d.pin_name.get(k, ""))]
        ca = [k for k in ks if ctx.cathode.fullmatch(k[1]) or ctx.cathode.fullmatch(d.pin_name.get(k, ""))]
        if len(an) != 1 or len(ca) != 1 or an[0] == ca[0]:
            continue                     # orientation unknown: no edge (the orphan box still lists it)
        oriented.append((r, rg.of(d.pin_net[an[0]]), rg.of(d.pin_net[ca[0]])))
    pairs = {(a, b) for _, a, b in oriented}
    for r, a, b in oriented:
        if (b, a) in pairs:
            continue                     # anti-parallel diodes between two rails: no direction to draw (QA)
        # the diode fixes the direction, so a sink with a connector is fine (VCC_SCM_HPM_FRU_3V3: HPM or D2);
        # a reverse-protection diode across a regulator (OUT -> IN) closes a loop and is dropped
        if a == b or gnd.fullmatch(a) or a in ctx.signal or not powered(a) or not sink_ok(b) or reaches(b, a):
            continue
        edges.append(Edge(conv=r, mpn=d.value(r), kind="diode", built=True, rail_in=a, rail_out=b, via=[],
                          en=[], pg=[], page=d.page_of(r)))
        fed_now.add(b)

    # rail voltages from every source we have (2026-10-13, owner choice B); rg.volt / rg.vsrc updated in place
    try:
        vinfo = resolve_volts(d, cfg, g, ctx, rg, edges)
        vwarn = list(load_power_parts(cfg).get("warnings", []))
    except Exception as e:  # noqa: BLE001  (net-name voltages stay; the tree itself must never be lost)
        vinfo, vwarn = {}, [f"power tree voltage sources skipped ({type(e).__name__}: {e})"]

    # tree order: roots = rails that feed something and are fed by nothing built
    fed = {e.rail_out for e in edges if e.built}
    kids = defaultdict(list)
    for e in edges:
        kids[e.rail_in].append(e)
    built_in = {e.rail_in for e in edges if e.built}
    roots = sorted({e.rail_in for e in edges} - fed,
                   key=lambda r: (r not in built_in, -(rg.volt.get(r) or 0), r))
    rows: list[dict] = []
    seen_edges: set[int] = set()

    def walk(rail, depth, path):
        for e in sorted(kids.get(rail, []), key=lambda x: (not x.built, natkey(x.conv), x.rail_out)):
            if id(e) in seen_edges:
                continue
            seen_edges.add(id(e))
            rows.append(_row(e, depth, rg))
            if e.rail_out not in path:
                walk(e.rail_out, depth + 1, path | {e.rail_out})

    for r in roots:
        conns = sorted({k[0] for n in rg.members.get(r, [r]) for k in d.nets.get(n, [])
                        if ctx.offboard(k[0])}, key=natkey)
        rows.append({"level": 0, "tree": r, "rail_in": "", "v_in": "", "conv": "", "mpn": "",
                     "kind": "input" + (f" ({', '.join(conns)})" if conns else ""),
                     "built": "", "rail_out": r,
                     "v_out": "" if rg.volt.get(r) is None else f"{rg.volt[r]:g}",
                     "v_src": rg.vsrc.get(r, ""), "en": "", "pg": "", "via": "",
                     "page": None, "out_members": ", ".join(rg.members.get(r, [r])[:8])})
        walk(r, 1, {r})
    for e in edges:                       # loops / DNP-only branches not reached from a root
        if id(e) not in seen_edges:
            seen_edges.add(id(e))
            rows.append(_row(e, 0, rg))

    # rails that power an IC but come out of no converter: shunt regulators, discrete circuits, connectors
    outs_all = {e.rail_out for e in edges if e.built}
    nc = re.compile(cfg["drc"]["intentional_nc_net_regex"], re.I)
    orphan = []
    parent_ic: dict[str, str] = {}       # orphan rail -> IC it is the internal LDO / bias output of
    for n in sorted({rg.of(x) for x in ctx.supply_nets}):
        if n in outs_all or g.gnd_re.fullmatch(n) or nc.search(n):
            continue
        loads = sorted({k[0] for k in d.pin_net if rg.of(d.pin_net[k]) == n and "supply" in pin_roles.get(k, ())
                        and present(d, k[0], cfg)}, key=natkey)
        if not loads:
            continue
        conns = sorted({k[0] for k in d.pin_net if rg.of(d.pin_net[k]) == n and ctx.offboard(k[0])},
                       key=natkey)
        conv_ics = {e.conv for e in edges if e.kind not in ("diode", "FET switch (discrete)")}
        if conns:
            src = f"connector {', '.join(conns)}"
        elif n in built_in:
            src = "root input"
        elif len(loads) == 1 and (loads[0] in conv_ics or any("reg_in" in pin_roles.get(k, ())
                                                              for k in d.pins_of(loads[0]))):
            src = f"likely an internal net (LDO / bias / sense) of {loads[0]} (decoupling only): confirm"
            parent_ic[n] = loads[0]
        else:
            src = "not identified (shunt regulator / discrete circuit / pin names not in pin_roles)"
        orphan.append({"rail": n, "voltage": rg.volt.get(n), "v_src": rg.vsrc.get(n, ""),
                       "loads": ", ".join(loads), "source": src,
                       "members": ", ".join(rg.members.get(n, [n])[:8])})
    feeds = {e.rail_in for e in edges}

    # ---- structured data for the box diagram (report/power_tree_diagram.py). Additive: the keys above and the
    # Excel table built from them are unchanged.
    rail_names = {e.rail_in for e in edges} | {e.rail_out for e in edges} | {o["rail"] for o in orphan}
    by_rail: dict[str, set] = defaultdict(set)
    off_by_rail: dict[str, set] = defaultdict(set)
    for k, n in d.pin_net.items():
        rn = rg.of(n)
        if rn not in rail_names:
            continue
        if "supply" in pin_roles.get(k, ()) and present(d, k[0], cfg):
            by_rail[rn].add(k[0])
        if ctx.offboard(k[0]):
            off_by_rail[rn].add(k[0])
    rails = {r: {"v": rg.volt.get(r), "vsrc": rg.vsrc.get(r, ""), "vcands": vinfo.get(r, {}).get("cands", []),
                 "vconflict": vinfo.get(r, {}).get("conflict", ""), "vapprox": bool(vinfo.get(r, {}).get("approx")),
                 "members": list(rg.members.get(r, [r])),
                 "loads": sorted(by_rail.get(r, ()), key=natkey), "conns": sorted(off_by_rail.get(r, ()), key=natkey),
                 "vnote": rg.vnote.get(r, "")}
             for r in sorted(rail_names)}
    for o in orphan:
        o["parent_ic"] = parent_ic.get(o["rail"], "")
        o["adjacent"] = _adjacent(d, cfg, g, rg, o["rail"], rail_names, ctx)
    pointed = {a["rail"] for o in orphan for a in o["adjacent"]}
    for o in orphan:
        # converter-internal net (bias VCC / sense / internal LDO) that feeds nothing and that no other orphan box
        # points at: the diagram hides it by default
        o["internal"] = bool(o["parent_ic"]) and o["rail"] not in feeds and o["rail"] not in pointed
    edge_rows = [{"conv": e.conv, "mpn": e.mpn, "kind": e.kind, "built": e.built, "rail_in": e.rail_in,
                  "rail_out": e.rail_out, "via": list(e.via), "en": list(e.en), "pg": list(e.pg), "page": e.page}
                 for e in edges]
    return {"rows": rows, "orphans": orphan, "edges": edge_rows, "rails": rails, "warnings": vwarn}


# ------------------------------------------------------------------------------------------------ rail voltages
# Source order (owner choice B, 2026-10-13). The first source with a value names the voltage; every other exact
# source is kept as a cross-check and a disagreement is reported on the box (no finding).
V_ORDER = ["rail_map", "FB", "名稱", "繼承", "腳名", "規格", "接頭", "diode"]
V_LABEL = {"名稱": "net 名稱", "腳名": "IC 腳名", "規格": "負載規格", "接頭": "接頭腳名", "繼承": "繼承"}
_LIB_CACHE: dict[tuple, dict] = {}
PASS_KINDS = ("hot-swap / FET switch", "FET switch (discrete)")   # output = input by construction


def power_parts_path(cfg: dict):
    from pathlib import Path

    from ..config import DEFAULT
    name = (cfg.get("power_tree", {}) or {}).get("library", "power_parts.yaml")
    if not name:
        return None
    return Path(name) if Path(name).is_absolute() else DEFAULT.parent / name


def load_power_parts(cfg: dict) -> dict:
    """Validated library; a bad entry is skipped into 'warnings', never stops the tree. Cached per file mtime
    (the Streamlit app runs for days while RDs sign entries)."""
    import yaml
    path = power_parts_path(cfg)
    if path is None or not path.exists():
        return {"converters": [], "loads": [], "warnings": [] if path is None else [f"power library {path} not found"]}
    key = (str(path), path.stat().st_mtime_ns)
    if key in _LIB_CACHE:
        return _LIB_CACHE[key]
    out = {"converters": [], "loads": [], "warnings": []}
    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except Exception as e:  # noqa: BLE001
        out["warnings"].append(f"power library {path.name} not read ({type(e).__name__}: {e})")
        raw = {}
    for sec in ("converters", "loads"):
        for i, x in enumerate(raw.get(sec, []) or []):
            try:
                x = dict(x)
                # the MPN must start a word: XRT2859A / SMT60B12 are other parts
                x["_rx"] = re.compile(r"(?<![A-Za-z0-9])(?:" + str(x["mpn"]) + ")", re.I)
                x.setdefault("name", str(x["mpn"]))
                if sec == "converters":
                    x["vref"] = None if x.get("vref") in (None, "") else float(x["vref"])
                    if x.get("fb_pin"):
                        re.compile(x["fb_pin"])
                else:
                    x["pins"] = [{"pin": str(pp["pin"]), "v": float(pp["v"]), "_rx": re.compile(str(pp["pin"]), re.I)}
                                 for pp in (x.get("pins") or [])]
                out[sec].append(x)
            except Exception as e:  # noqa: BLE001
                out["warnings"].append(f"power library {path.name} {sec}[{i}] skipped ({type(e).__name__}: {e})")
    _LIB_CACHE.clear()
    _LIB_CACHE[key] = out
    return out


def _part_text(d: Design, r: str) -> str:
    t = [d.value(r)]
    if d.bom and r in d.bom:
        t += [d.bom[r].desc or "", d.bom[r].spec or ""]
    return " | ".join(t)


def _lib_entry(entries: list, d: Design, r: str) -> dict | None:
    txt = _part_text(d, r)
    return next((x for x in entries if x["_rx"].search(txt)), None)


def _parallel(ohms: list[float]) -> float | None:
    if not ohms or any(o <= 0 for o in ohms):
        return None
    return 1.0 / sum(1.0 / o for o in ohms)


def _fold_conflict(cands: list[dict]) -> str:
    """'FB 1.53 V vs net 名稱 / IC 腳名 1.2 V (U1.VCC_IO_1V2 …)' : one item per distinct value."""
    by_v: dict[float, list] = {}
    for c in cands:
        if c["src"] != "diode":
            by_v.setdefault(c["v"], []).append(c)
    items = []
    for v in sorted(by_v, key=lambda x: min(V_ORDER.index(c["src"]) for c in by_v[x])):
        cs = by_v[v]
        srcs = []
        for c in cs:
            lab = V_LABEL.get(c["src"], c["src"])
            if lab not in srcs:
                srcs.append(lab)
        items.append(f"{' / '.join(srcs)} {v:g} V ({cs[0]['detail']}{' …' if len(cs) > 1 else ''})")
    return "電壓來源不一致: " + " vs ".join(items)


def resolve_volts(d: Design, cfg: dict, g: NetGraph, ctx: TreeCtx, rg: RailGroups, edges: list) -> dict:
    """Candidates per rail group: {src, v, detail}. Chooses by V_ORDER, flags exact sources that disagree."""
    pt = cfg.get("power_tree", {}) or {}
    lib = load_power_parts(cfg)
    tol_abs = float(pt.get("voltage_conflict_abs", 0.05))
    tol_rel = float(pt.get("voltage_conflict_pct", 3.0)) / 100.0
    sw_rx = re.compile(pt.get("load_switch_desc_regex", r"\b(LOAD|POWER|PWR)\s*SW(ITCH)?\b(?!ING)|\bE-?FUSE\b"), re.I)
    not_sw = re.compile(pt.get("load_switch_desc_exclude", r"\bLDO\b|REGULAT|\bREG\b|LINEAR|BUCK|BOOST|CONVERTER"),
                        re.I)
    gnd = g.gnd_re
    cands: dict[str, list] = defaultdict(list)
    rails = {e.rail_in for e in edges} | {e.rail_out for e in edges} | {rg.of(n) for n in ctx.supply_nets}

    def add(r, src, v, detail):
        if v is None or r not in rails:
            return
        c = {"src": src, "v": round(float(v), 4), "detail": detail}
        if c not in cands[r]:
            cands[r].append(c)

    # rail_map (owner) and the net names
    for r in sorted(rails):
        mem = rg.members.get(r, [r])
        rm = [(n, g.volts[n][0]) for n in mem if n in g.volts and g.volts[n][1] == "rail_map"]
        for n, v in rm:
            add(r, "rail_map", v, f"rail_map.csv {n}")
        if not rm and rg.volt.get(r) is not None:
            add(r, "名稱", rg.volt[r], "net 名稱")

    # ground-like nets for the FB lower resistor: ground, or tied to ground by a built 0R (remote-sense RGND)
    gnd_like = {n for n in d.nets if gnd.fullmatch(n)}
    for x in sorted(d.parts, key=natkey):
        ns = {d.pin_net[k] for k in d.pins_of(x)}
        if len(ns) == 2 and ns & gnd_like and ctx.tie(x):
            gnd_like |= ns

    # FB divider
    for e in edges:
        if not e.built:
            continue
        ent = _lib_entry(lib["converters"], d, e.conv)
        if not ent or ent.get("vref") is None or not ent.get("fb_pin"):
            continue
        fbrx = re.compile(ent["fb_pin"], re.I)
        for k in d.pins_of(e.conv):
            if not fbrx.fullmatch(ctx.base_name(k)):
                continue
            fb = d.pin_net[k]
            top, bot, other = [], [], []
            for (x, _p) in sorted(d.nets.get(fb, []), key=lambda kk: (natkey(kk[0]), kk[1])):
                if ctx.px(x) not in ctx.res_px or not present(d, x, cfg):
                    continue
                far = [d.pin_net[k2] for k2 in d.pins_of(x) if d.pin_net[k2] != fb]
                ohm = ctx.ohm(x)
                if len(far) != 1 or ohm is None:
                    other.append(x)
                elif far[0] in gnd_like:
                    bot.append((x, ohm))
                elif rg.of(far[0]) == e.rail_out:
                    top.append((x, ohm))
                else:
                    other.append(x)
            if other:
                continue                              # margining / unknown R on FB: never guess
            if not bot:
                if rg.of(fb) == e.rail_out:           # FB on the output (direct or <= 100 R, no current): Vref
                    add(e.rail_out, "FB", ent["vref"], f"{e.conv} FB 接輸出 (無下拉)，Vref {ent['vref']:g} V ({ent['name']})")
                continue
            rt, rb = _parallel([o for _, o in top]), _parallel([o for _, o in bot])
            if rt is None or rb is None:
                continue
            v = ent["vref"] * (1 + rt / rb)
            add(e.rail_out, "FB", v, f"{e.conv} Vref {ent['vref']:g} V x (1 + "
                f"{'//'.join(d.value(x) for x, _ in top)} / {'//'.join(d.value(x) for x, _ in bot)}) "
                f"= {v:.3f} V ({ent['name']})")

    # supply pin names of the loads ("VCC_PECIVDD_1V0") and the load spec library (DDR5 VDD = 1.1 V)
    for k, rl in sorted(ctx.pin_roles.items()):
        if not present(d, k[0], cfg):
            continue
        r = rg.of(d.pin_net[k])
        if r not in rails:
            continue
        pn = ctx.base_name(k)
        if "supply" in rl:
            v = ctx.name_volt(pn)
            if v is not None:
                add(r, "腳名", v, f"{k[0]}.{pn}")
        ent = _lib_entry(lib["loads"], d, k[0])     # spec pins by name, whatever pin_roles says (VPP)
        if ent:
            for pp in ent["pins"]:
                if pp["_rx"].fullmatch(pn):
                    add(r, "規格", pp["v"], f"{k[0]} {pn} = {pp['v']:g} V ({ent['name']})")
    # board connector pin names ("P3V0_HPM_SCM_BAT"): last exact source, custom pinouts allowed. Connectors are
    # never in the BOM, so no built check here.
    for r in sorted(rails):
        for n in rg.members.get(r, [r]):
            for k in sorted(d.nets.get(n, [])):
                if ctx.offboard(k[0]):
                    v = ctx.name_volt(ctx.base_name(k))
                    if v is not None:
                        add(r, "接頭", v, f"{k[0]} 腳 {ctx.base_name(k)}")

    def passes(e) -> str:
        """'繼承' (output = input), 'diode' (input, no Vf) or '' (regulates / unknown)."""
        if not e.built:
            return ""
        if e.kind == "diode":
            return "diode"
        if e.kind in PASS_KINDS:
            return "繼承"
        if e.kind != "LDO / eFuse / switch":
            return ""                                 # a switcher never passes its input voltage
        ent = _lib_entry(lib["converters"], d, e.conv)
        if ent:
            return "繼承" if ent.get("type") in ("load_switch", "efuse") else ""
        txt = _part_text(d, e.conv)
        return "繼承" if sw_rx.search(txt) and not not_sw.search(txt) else ""

    # inheritance graph: never inside a loop (QA 2026-10-13: values would chase each other round the loop)
    inh = [(e, passes(e)) for e in edges]
    inh = [(e, how) for e, how in inh if how]
    nxt = defaultdict(set)
    for e, _ in inh:
        nxt[e.rail_in].add(e.rail_out)

    def reach(a, b):
        seen, todo = {a}, [a]
        while todo:
            for y in nxt[todo.pop()]:
                if y == b:
                    return True
                if y not in seen:
                    seen.add(y)
                    todo.append(y)
        return False

    inh = [(e, how) for e, how in inh if not reach(e.rail_out, e.rail_in)]
    feeds_in: dict[str, list] = defaultdict(list)
    for e, how in inh:
        feeds_in[e.rail_out].append((e, how))
    chosen: dict[str, dict] = {}

    def choose(r: str) -> dict | None:              # acyclic now: plain memoised recursion
        if r in chosen:
            return chosen[r]
        cs = list(cands.get(r, []))
        for e, how in sorted(feeds_in.get(r, []), key=lambda t: natkey(t[0].conv)):
            up = choose(e.rail_in)
            if not up or up["approx"]:
                continue
            if how == "diode":
                cs.append({"src": "diode", "v": up["v"], "detail": f"{e.conv} 從 {e.rail_in} {up['v']:g} V，未扣 Vf"})
            else:
                cs.append({"src": "繼承", "v": up["v"], "detail": f"{e.conv} 輸出 = 輸入 {e.rail_in}"})
        info = None
        if cs:
            best = min(cs, key=lambda c: (V_ORDER.index(c["src"]), -c["v"] if c["src"] == "diode" else 0))
            info = {"v": best["v"], "src": best["src"], "approx": best["src"] == "diode",
                    "cands": sorted(cs, key=lambda c: (V_ORDER.index(c["src"]), c["v"], natkey(c["detail"]))),
                    "conflict": ""}
            exact = [c for c in cs if c["src"] != "diode"]
            if exact:
                ref = min(exact, key=lambda c: V_ORDER.index(c["src"]))["v"]
                if any(abs(c["v"] - ref) > max(tol_abs, tol_rel * abs(ref)) for c in exact):
                    info["conflict"] = _fold_conflict(info["cands"])
        chosen[r] = info
        return info

    for r in sorted(rails):
        choose(r)
    chosen = {r: i for r, i in chosen.items() if i}
    for r, info in chosen.items():
        rg.volt[r] = round(info["v"], 3)
        rg.vsrc[r] = ("≈" if info["approx"] else "") + info["src"]
    return chosen


def _adjacent(d: Design, cfg: dict, g: NetGraph, rg: RailGroups, rail: str, rail_names: set,
              ctx: TreeCtx | None = None) -> list[dict]:
    """Built 2-pin D / R parts from an orphan rail to another power rail: plain netlist facts shown next to the
    orphan box (e.g. 3V3_AON <- D106 <- 3V3_STBY diode-OR), not a guess at the source."""
    ctx = ctx or TreeCtx(d, cfg, g)
    out = []
    mem = set(rg.members.get(rail, [rail]))
    for n in sorted(mem):
        for r, _p in sorted(d.nets.get(n, []), key=lambda k: (natkey(k[0]), k[1])):
            if ctx.px(r) not in ("D", "R") or not present(d, r, cfg):
                continue
            others = sorted({rg.of(d.pin_net[k]) for k in d.pins_of(r)} - {rail})
            if len(others) != 1:
                continue
            o = others[0]
            if g.gnd_re.fullmatch(o) or o in ctx.signal:
                continue
            if o not in rail_names and rg.volt.get(o) is None:
                continue
            item = {"refdes": r, "value": d.value(r), "rail": o}
            if item not in out:
                out.append(item)
    return out


def _row(e: Edge, depth: int, rg: RailGroups) -> dict:
    fmt = lambda v: "" if v is None else f"{v:g}"  # noqa: E731
    return {"level": depth, "tree": "  " * depth + ("└ " if depth else "") + e.rail_out,
            "rail_in": e.rail_in, "v_in": fmt(rg.volt.get(e.rail_in)), "conv": e.conv, "mpn": e.mpn,
            "kind": e.kind, "built": "Y" if e.built else "DNP", "rail_out": e.rail_out,
            "v_out": fmt(rg.volt.get(e.rail_out)), "v_src": rg.vsrc.get(e.rail_out, ""),
            "en": ", ".join(e.en), "pg": ", ".join(e.pg),
            "via": ", ".join(e.via), "page": e.page,
            "out_members": ", ".join(rg.members.get(e.rail_out, [e.rail_out])[:8])}
