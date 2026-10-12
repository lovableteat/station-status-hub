"""B1: power tree derived from the netlist (HANDOVER 0u, 2026-10-09). Not a check: a table for RDs to hold
against the power-tree picture in the schematic.

A converter is an IC with a reg_in pin plus at least one of reg_out (LDO / eFuse / load switch),
reg_sw (switcher: SW -> inductor -> output) or reg_gate (hot-swap / ideal diode: GATE -> series R ->
FET gate -> the FET's other pins). Pin meanings come from config pin_roles only.

Rails are grouped through tie parts (0R, fuse, bead, net-tie, mOhm shunt), so PS_48V_INPUT -F- ... is one
rail; the group is named after its best member (voltage in the name first).
"""
from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass, field

from ..model import Design, natkey
from .drc import _prefix, is_tie, present
from .netrules import NetGraph, Roles

_AUTO = re.compile(r"^N\d+$")


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

    def __init__(self, d: Design, cfg: dict, g: NetGraph):
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
            ohm = g.res_ohm(r)
            if len(ns) == 2 and (is_tie(d, r, cfg) or (ohm is not None and ohm <= g.series_max)):
                pass                     # 0R / fuse / bead / net-tie / series or filter R (VIN filter, OUT sense)
            elif _prefix(r) == "RS" and ohm is not None and ohm <= tie_max:
                pass                     # 4-terminal Kelvin shunt: force and sense pins are one rail
            else:
                continue
            # never into ground (bleeder / pre-load R), never into a signal net (strap 0R to VDD),
            # never between two different known voltages
            if any(g.gnd_re.fullmatch(n) or n in g.signal_nets for n in ns):
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
        self.name, self.members, self.volt = {}, {}, {}
        for _, ns in members.items():
            def score(n):
                v = g.volts.get(n)
                named_v = v is not None and not v[1].startswith("via")
                return (0 if named_v else 1, 1 if _AUTO.match(n) else 0, len(n), n)
            best = sorted(ns, key=score)[0]
            for n in ns:
                self.name[n] = best
            self.members[best] = sorted(ns)
            v = g.voltage(best)
            self.volt[best] = v

    def of(self, net: str) -> str:
        return self.name.get(net, net)


def power_tree(d: Design, cfg: dict, g: NetGraph | None = None) -> dict:
    g = g or NetGraph(d, cfg)
    roles: Roles = g.roles
    pt = cfg.get("power_tree", {}) or {}
    ind_px = set(pt.get("inductor_prefixes", ["L"]))
    fet_px = set(pt.get("fet_prefixes", ["Q"]))
    ic_px = set((cfg.get("netrules", {}) or {}).get("ic_prefixes", ["U"]))
    rg = RailGroups(d, cfg, g)

    pin_roles = {k: roles.of(d, k) for k in d.pin_net}
    # rails that power something: an IC supply pin or a converter input
    loaded = {rg.of(d.pin_net[k]) for k, rl in pin_roles.items() if rl & {"supply", "reg_in"}}
    edges: list[Edge] = []
    for u in sorted((r for r in d.parts if _prefix(r) in ic_px), key=natkey):
        ks = d.pins_of(u)
        by = defaultdict(list)
        for k in ks:
            for rl in pin_roles.get(k, ()):
                by[rl].append(k)
        if not by["reg_in"] or not (by["reg_out"] or by["reg_sw"] or by["reg_gate"]):
            continue
        ins = sorted({rg.of(d.pin_net[k]) for k in by["reg_in"]})
        outs: dict[str, set] = defaultdict(set)      # rail -> via parts
        kind = "LDO / eFuse / switch"
        for k in by["reg_out"]:
            outs[rg.of(d.pin_net[k])]
        for k in by["reg_sw"]:
            kind = "buck / switcher"
            sw = d.pin_net[k]
            for (r, p), n in sorted(d.pin_net.items()):
                if n == sw and _prefix(r) in ind_px and present(d, r, cfg):
                    for k2 in d.pins_of(r):
                        if d.pin_net[k2] != sw:
                            outs[rg.of(d.pin_net[k2])].add(r)
        for k in by["reg_gate"]:
            kind = "hot-swap / FET switch"
            node = g.node_of.get(d.pin_net[k])
            gate_nets = set(node.nets) if node else {d.pin_net[k]}
            for (q, p), n in sorted(d.pin_net.items()):
                if n in gate_nets and _prefix(q) in fet_px and "fet_gate" in pin_roles.get((q, p), ()):
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
        gnd = g.gnd_re
        for ri in ins:
            if gnd.fullmatch(ri):
                continue
            for ro, via in sorted(outs.items()):
                if gnd.fullmatch(ro):
                    continue
                edges.append(Edge(conv=u, mpn=d.value(u), kind=kind, built=present(d, u, cfg), rail_in=ri,
                                  rail_out=ro, via=sorted(via, key=natkey), en=en, pg=pg, page=d.page_of(u)))

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
                        if _prefix(k[0]) in g.off_px}, key=natkey)
        rows.append({"level": 0, "tree": r, "rail_in": "", "v_in": "", "conv": "", "mpn": "",
                     "kind": "input" + (f" ({', '.join(conns)})" if conns else ""),
                     "built": "", "rail_out": r,
                     "v_out": "" if rg.volt.get(r) is None else f"{rg.volt[r]:g}", "en": "", "pg": "", "via": "",
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
    for n in sorted({rg.of(x) for x in g.supply_nets}):
        if n in outs_all or g.gnd_re.fullmatch(n) or nc.search(n):
            continue
        loads = sorted({k[0] for k in d.pin_net if rg.of(d.pin_net[k]) == n and "supply" in pin_roles.get(k, ())
                        and present(d, k[0], cfg)}, key=natkey)
        if not loads:
            continue
        conns = sorted({k[0] for k in d.pin_net if rg.of(d.pin_net[k]) == n and _prefix(k[0]) in g.off_px},
                       key=natkey)
        conv_ics = {e.conv for e in edges}
        if conns:
            src = f"connector {', '.join(conns)}"
        elif n in built_in:
            src = "root input"
        elif len(loads) == 1 and (loads[0] in conv_ics or any("reg_in" in pin_roles.get(k, ())
                                                              for k in d.pins_of(loads[0]))):
            src = f"likely the internal LDO / bias output of {loads[0]} (decoupling only): confirm"
            parent_ic[n] = loads[0]
        else:
            src = "not identified (shunt regulator / discrete circuit / pin names not in pin_roles)"
        orphan.append({"rail": n, "voltage": rg.volt.get(n), "loads": ", ".join(loads), "source": src,
                       "members": ", ".join(rg.members.get(n, [n])[:8])})

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
        if _prefix(k[0]) in g.off_px:
            off_by_rail[rn].add(k[0])
    rails = {r: {"v": rg.volt.get(r), "members": list(rg.members.get(r, [r])),
                 "loads": sorted(by_rail.get(r, ()), key=natkey), "conns": sorted(off_by_rail.get(r, ()), key=natkey)}
             for r in sorted(rail_names)}
    for o in orphan:
        o["parent_ic"] = parent_ic.get(o["rail"], "")
        o["adjacent"] = _adjacent(d, cfg, g, rg, o["rail"], rail_names)
    edge_rows = [{"conv": e.conv, "mpn": e.mpn, "kind": e.kind, "built": e.built, "rail_in": e.rail_in,
                  "rail_out": e.rail_out, "via": list(e.via), "en": list(e.en), "pg": list(e.pg), "page": e.page}
                 for e in edges]
    return {"rows": rows, "orphans": orphan, "edges": edge_rows, "rails": rails}


def _adjacent(d: Design, cfg: dict, g: NetGraph, rg: RailGroups, rail: str, rail_names: set) -> list[dict]:
    """Built 2-pin D / R parts from an orphan rail to another power rail: plain netlist facts shown next to the
    orphan box (e.g. 3V3_AON <- D106 <- 3V3_STBY diode-OR), not a guess at the source."""
    out = []
    mem = set(rg.members.get(rail, [rail]))
    for n in sorted(mem):
        for r, _p in sorted(d.nets.get(n, []), key=lambda k: (natkey(k[0]), k[1])):
            if _prefix(r) not in ("D", "R") or not present(d, r, cfg):
                continue
            others = sorted({rg.of(d.pin_net[k]) for k in d.pins_of(r)} - {rail})
            if len(others) != 1:
                continue
            o = others[0]
            if g.gnd_re.fullmatch(o) or o in g.signal_nets:
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
            "v_out": fmt(rg.volt.get(e.rail_out)), "en": ", ".join(e.en), "pg": ", ".join(e.pg),
            "via": ", ".join(e.via), "page": e.page,
            "out_members": ", ".join(rg.members.get(e.rail_out, [e.rail_out])[:8])}
