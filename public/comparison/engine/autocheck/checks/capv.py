"""Capacitor voltage derating.

Stress = |V(net1) - V(net2)|, NOT net-to-ground: a cap across a current-sense pair sitting at
48 V common mode only sees millivolts. Owner rule (2026-10-08): MLCC rated >= 2 x stress.
Non-MLCC parts are reported as INFO ratio only.

Net voltage sources, in priority order:
  1. rail_map.csv (user supplied)        2. ground regex -> 0 V
  3. voltage token in the net name       4. propagation across stuffed tie parts
Anything still unknown is listed in rail_map_todo.csv for the user to fill.
"""
from __future__ import annotations

import re

from ..findings import Finding
from ..model import Design, natkey
from ..values import net_voltage_from_name, parse_cap
from .drc import tie_edges


def resolve_voltages(d: Design, cfg: dict, rail_map: dict) -> tuple[dict, list[Finding]]:
    gnd_re = re.compile(cfg["ground"]["regex"])
    bl = {x.upper() for x in cfg["net_voltage"]["blacklist"]}
    volts: dict[str, tuple[float, str]] = {}
    for n in d.nets:
        if n in rail_map:
            volts[n] = (rail_map[n][0], "rail_map")
        elif gnd_re.fullmatch(n):
            volts[n] = (0.0, "ground")
        else:
            v = net_voltage_from_name(n, bl)
            if v is not None:
                volts[n] = (v, "net name")
    conflicts: list[Finding] = []
    if cfg["net_voltage"]["propagate"]:
        edges = tie_edges(d, cfg)
        changed = True
        while changed:
            changed = False
            for n1, n2, r in edges:
                for x, y in ((n1, n2), (n2, n1)):
                    if x in volts and y not in volts:
                        volts[y] = (volts[x][0], f"via {r} from {x}")
                        changed = True
        for n1, n2, r in edges:
            if n1 in volts and n2 in volts and abs(volts[n1][0] - volts[n2][0]) > 0.05:
                if volts[n1][1].startswith("via") or volts[n2][1].startswith("via"):
                    continue
                conflicts.append(Finding(
                    category="DRC", rule="TIE_BETWEEN_RAILS", severity="ERROR",
                    title=f"{r} ties {n1} ({volts[n1][0]:g} V) to {n2} ({volts[n2][0]:g} V)",
                    detail=f"stuffed {d.value(r)} between two nets of different voltage "
                           f"(sources: {volts[n1][1]} / {volts[n2][1]})",
                    refdes=[r], nets=[n1, n2], page=d.page_of(r),
                    page_title=d.page_title(d.page_of(r))).finalize())
    return volts, conflicts


def required_rating(stress: float, cc: dict) -> float:
    """Rule A: smallest common rating >= factor x V x (1 - tol). 3.3 V -> 6.3 V, 12 V -> 25 V."""
    target = float(cc["mlcc_derating_factor"]) * stress * (1 - float(cc.get("mlcc_tolerance", 0)))
    for r in sorted(float(x) for x in cc.get("standard_ratings", [])):
        if r + 1e-9 >= target:
            return r
    return target


def cap_check(d: Design, cfg: dict, rail_map: dict) -> tuple[list[Finding], list[dict], list[dict]]:
    """Returns (findings, table rows for every cap, todo rows for unresolved nets)."""
    cc = cfg["capacitor"]
    factor = float(cc["mlcc_derating_factor"])
    mlcc_bom = re.compile(cc["mlcc_bom_regex"], re.I)
    mlcc_prim = re.compile(cc["mlcc_primitive_regex"], re.I)
    volts, out = resolve_voltages(d, cfg, rail_map)
    rows: list[dict] = []
    todo: dict[str, set] = {}

    for r in sorted(d.parts, key=natkey):
        if not re.match(r"C\d", r):
            continue
        pr = d.prim(r)
        ks = d.pins_of(r)
        if pr is None or len(pr.all_pin_numbers()) != 2 or len(ks) != 2:
            continue
        n1, n2 = d.pin_net[ks[0]], d.pin_net[ks[1]]
        if n1 == n2:
            continue  # reported by DRC TWO_PIN_SHORTED
        st = d.stuffed(r)
        src_txt = d.bom[r].desc if (st and d.bom and r in d.bom) else pr.value
        _, rated = parse_cap(src_txt)
        if rated is None:
            _, rated = parse_cap(pr.value)
        if st and d.bom and r in d.bom:
            is_mlcc = bool(mlcc_bom.search(d.bom[r].desc))
            kind_src = "BOM"
        else:
            is_mlcc = bool(mlcc_prim.search(pr.name))
            kind_src = "primitive (assumed)"
        v1, v2 = volts.get(n1), volts.get(n2)
        row = {"refdes": r, "value": pr.value, "stuffed": st, "mlcc": is_mlcc, "kind_source": kind_src,
               "net1": n1, "v1": v1[0] if v1 else None, "src1": v1[1] if v1 else "",
               "net2": n2, "v2": v2[0] if v2 else None, "src2": v2[1] if v2 else "",
               "rated": rated, "stress": None, "ratio": None, "verdict": "", "page": d.page_of(r)}
        if v1 is None or v2 is None:
            for n, v in ((n1, v1), (n2, v2)):
                if v is None:
                    todo.setdefault(n, set()).add(r)
            row["verdict"] = "UNRESOLVED"
            rows.append(row)
            continue
        stress = abs(v1[0] - v2[0])
        row["stress"] = stress
        if rated is None:
            row["verdict"] = "NO RATING"
            out.append(Finding(category="CAPV", rule="CAP_NO_RATING", severity="WARN",
                               title=f"{r} rated voltage not found ({pr.value})", refdes=[r], nets=[n1, n2],
                               page=d.page_of(r), page_title=d.page_title(d.page_of(r))).finalize())
            rows.append(row)
            continue
        row["ratio"] = stress / rated if rated else None
        need = required_rating(stress, cc) if stress > 0 else 0.0
        row["required"] = need
        if is_mlcc:
            if rated + 1e-9 < need:
                row["verdict"] = "FAIL"
                out.append(Finding(
                    category="CAPV", rule="MLCC_DERATING", severity="ERROR" if st else "WARN",
                    title=f"{r} {rated:g} V MLCC on {stress:g} V (required >= {need:g} V)" + ("" if st else " [DNP]"),
                    detail=f"{n1} = {v1[0]:g} V ({v1[1]}), {n2} = {v2[0]:g} V ({v2[1]}); "
                           f"rule: ~{factor:g} x |V1-V2| rounded to a common rating; type from {kind_src}",
                    refdes=[r], nets=[n1, n2], page=d.page_of(r), page_title=d.page_title(d.page_of(r)),
                    evidence={"rated": rated, "stress": stress, "required": need, "stuffed": st}).finalize())
            else:
                row["verdict"] = "PASS"
        else:
            row["verdict"] = f"INFO {row['ratio']:.0%}"
            if stress > 0:
                out.append(Finding(
                    category="CAPV", rule="NON_MLCC_RATIO", severity="INFO",
                    title=f"{r} non-MLCC {rated:g} V at {stress:g} V ({row['ratio']:.0%} of rating)",
                    detail=f"{(d.bom[r].desc if d.bom and r in d.bom else pr.value)}; no derating rule defined yet",
                    refdes=[r], nets=[n1, n2], page=d.page_of(r), page_title=d.page_title(d.page_of(r)),
                    evidence={"rated": rated, "stress": stress, "stuffed": st}).finalize())
        rows.append(row)

    todo_rows = [{"net": n, "voltage": "", "note": "caps: " + " ".join(sorted(c, key=natkey))}
                 for n, c in sorted(todo.items())]
    if todo_rows:
        n_caps = sum(1 for x in rows if x["verdict"] == "UNRESOLVED")
        out.append(Finding(category="CAPV", rule="CAP_UNRESOLVED", severity="WARN",
                           title=f"{n_caps} capacitors not checked: {len(todo_rows)} net voltages unknown",
                           detail="fill rail_map_todo.csv (net,voltage) and re-run; see appendix",
                           key="CAP_UNRESOLVED").finalize())
    return out, rows, todo_rows
