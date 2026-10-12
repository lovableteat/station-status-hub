"""Fault injection for the single-design netlist rules (A1 / A2 / A3). The diff injector (faultinject.py)
edits files and scores A -> B changes; these rules judge one revision, so the faults are planted on an
in-memory copy of the Design, one fault per copy, and the rules are re-run.

  STRAP_BOTH        stuff the DNP side of a strap pin that has one side stuffed  expect STRAP_PU_PD_BOTH
  OD_NO_PULLUP      DNP every pull-up of an on-board open-drain node with a reader expect OD_NO_PULLUP
  OD_OFFBOARD       same on a node that leaves through a connector               expect OD_PULLUP_OFFBOARD
  OD_STRONG         one pull-up value -> 47 ohm                                  expect OD_PULLUP_STRONG
  OVERVOLT          pull-up (node without pull-down) moved to the highest rail   expect PULLUP_OVERVOLT
  BACKPOWER         pull-up moved to a same-voltage rail of an earlier domain     expect PULLUP_BACKPOWER
                    (domain table = the tool's guesses, all marked confirmed)
Recall = planted faults reported with the expected rule on the expected node. Unexplained = new findings
that touch none of the faulted node's nets.
"""
from __future__ import annotations

import copy
import random

from .checks.drc import present
from .checks.netrules import NetGraph, domain_rows, guess_domain, netrules
from .model import BomItem, Design, Primitive

KINDS = ["STRAP_BOTH", "OD_NO_PULLUP", "OD_OFFBOARD", "OD_STRONG", "OVERVOLT", "BACKPOWER"]
EXPECT = {"STRAP_BOTH": "STRAP_PU_PD_BOTH", "OD_NO_PULLUP": "OD_NO_PULLUP", "OD_OFFBOARD": "OD_PULLUP_OFFBOARD",
          "OD_STRONG": "OD_PULLUP_STRONG", "OVERVOLT": "PULLUP_OVERVOLT", "BACKPOWER": "PULLUP_BACKPOWER"}


def _stuff(d: Design, r: str) -> None:
    if d.bom is None:
        return
    d.bom[r] = BomItem(pn="INJECTED", desc=d.value(r), spec="", qty=1, refdes=[r])


def _unstuff(d: Design, r: str) -> None:
    if d.bom is not None:
        d.bom.pop(r, None)


def _set_value(d: Design, r: str, value: str) -> None:
    old = d.prim(r)
    new = Primitive(name=f"{old.name}__INJ_{value}", pins=dict(old.pins), props={**old.props, "VALUE": value})
    d.primitives[new.name] = new
    d.parts[r].primitive = new.name


def _move(d: Design, r: str, from_net: str, to_net: str) -> None:
    for k in d.pins_of(r):
        if d.pin_net[k] == from_net:
            d.nets[from_net].remove(k)
            d.nets.setdefault(to_net, []).append(k)
            d.pin_net[k] = to_net
            return


def candidates(d: Design, cfg: dict, rail_map: dict | None = None) -> list[dict]:
    """Every fault this design allows: [{kind, node, apply(d)}]."""
    g = NetGraph(d, cfg, rail_map)
    order = [x.upper() for x in (cfg.get("rail_domain", {}) or {}).get("order", [])]
    rails = {n: g.voltage(n) for n in d.nets if g.is_rail(n) and g.voltage(n) and not g.gnd_re.fullmatch(n)}
    top = max(rails, key=lambda n: (rails[n], n)) if rails else None
    out = []
    for node in g.nodes:
        pu, pdn = g.pull_ups(node), g.pull_downs(node)
        pu_dnp, pd_dnp = g.pull_ups(node, built=False), g.pull_downs(node, built=False)
        if g.ic_pins(node, "strap"):
            if pu and pd_dnp and not pdn:
                out.append({"kind": "STRAP_BOTH", "node": node, "parts": [pd_dnp[0].r],
                            "do": lambda d, r=pd_dnp[0].r: _stuff(d, r)})
            elif pdn and pu_dnp and not pu:
                out.append({"kind": "STRAP_BOTH", "node": node, "parts": [pu_dnp[0].r],
                            "do": lambda d, r=pu_dnp[0].r: _stuff(d, r)})
        od = g.ic_pins(node, "open_drain")
        if od and pu and (len(od) > 1 or g.listeners(node, od)):
            rs = [p.r for p in pu]
            kind = "OD_OFFBOARD" if g.offboard(node) else "OD_NO_PULLUP"
            out.append({"kind": kind, "node": node, "parts": rs,
                        "do": lambda d, rs=rs: [_unstuff(d, r) for r in rs]})
            if all(p.v is not None and p.v > 0.4 for p in pu):
                out.append({"kind": "OD_STRONG", "node": node, "parts": [pu[0].r],
                            "do": lambda d, r=pu[0].r: _set_value(d, r, "47ohm")})
        # A3: logic receivers with a known supply
        recv = []
        for k in g.ic_pins(node):
            if g.roles.of(d, k) & {"supply", "ground", "reg_in", "reg_sw", "reg_out", "reg_gate", "analog"}:
                continue
            sup = [s for s in g.supplies_of(k[0]) if g.voltage(s) is not None]
            if sup:
                recv.append((k, sup))
        pu_known = [p for p in pu if p.v is not None and p.v > 0]
        # only a pure pull-up: no pull-down and no other resistor on the node (a divider chain such as
        # 48V -150K- EN -R- OVLO -R- GND keeps the level low wherever the top resistor goes)
        other_r = [k for k in node.pins if k[0].startswith("R")]
        if (recv and pu_known and not pdn and not other_r and len(pu_known) == 1 and top
                and rails[top] > pu_known[0].v + 1
                and rails[top] > max(g.voltage(s) for _, ss in recv for s in ss) + 1):
            p = pu_known[0]
            out.append({"kind": "OVERVOLT", "node": node, "parts": [p.r],
                        "do": lambda d, p=p: _move(d, p.r, p.net, top)})
        if recv and pu_known and order and len(pu_known) == 1:
            p = pu_known[0]
            rdom = [guess_domain(s, cfg).upper() for _, ss in recv for s in ss]
            rdom = [x for x in rdom if x in order]
            if rdom:
                late = max(order.index(x) for x in rdom)
                for n in sorted(rails):
                    dn = guess_domain(n, cfg).upper()
                    if dn in order and order.index(dn) < late and abs(rails[n] - p.v) < 0.05 and n != p.net:
                        out.append({"kind": "BACKPOWER", "node": node, "parts": [p.r],
                                    "do": lambda d, p=p, n=n: _move(d, p.r, p.net, n)})
                        break
    return out


def run_injection(d: Design, cfg: dict, n_per_kind: int = 6, seed: int = 1, rail_map: dict | None = None) -> dict:
    rnd = random.Random(seed)
    if d.bom is None:          # stuffing faults need a BOM (no BOM = every part built)
        return {"planted": 0, "detected": 0, "missed": [], "unexplained": [], "kinds": [], "candidates": 0,
                "skipped": "no BOM in the source folder"}
    g0 = NetGraph(d, cfg, rail_map)
    doms = {r["net"]: {**r, "confirmed": "Y"} for r in domain_rows(g0, {}) if r.get("domain")}
    base = {f.key for f in netrules(d, cfg, rail_map, doms, graph=g0)}
    cands = candidates(d, cfg, rail_map)
    planted, hit, missed, unexplained = 0, 0, [], []
    for kind in KINDS:
        cs = [c for c in cands if c["kind"] == kind]
        rnd.shuffle(cs)
        for c in cs[:n_per_kind]:
            dd = copy.deepcopy(d)
            c["do"](dd)
            fs = netrules(dd, cfg, rail_map, doms)
            nets = set(c["node"].nets)
            planted += 1
            got = [f for f in fs if f.rule == EXPECT[kind] and set(f.nets) & nets]
            if got:
                hit += 1
            else:
                missed.append(f"{kind} {c['node'].rep} parts {c['parts']}")
            for f in fs:
                if f.key not in base and f not in got and not (set(f.nets) & nets):
                    unexplained.append(f"{kind} {c['node'].rep}: {f.rule} {f.title}")
    kinds_seen = sorted({c["kind"] for c in cands})
    return {"planted": planted, "detected": hit, "missed": missed, "unexplained": unexplained,
            "kinds": kinds_seen, "candidates": len(cands)}


__all__ = ["run_injection", "candidates", "present"]
