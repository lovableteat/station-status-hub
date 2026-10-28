"""Capacitor voltage derating.

Stress = |V(net1) - V(net2)|, NOT net-to-ground: a cap across a current-sense pair sitting at
48 V common mode only sees millivolts. Owner rule (2026-10-08): MLCC rated >= 2 x stress.
Non-MLCC parts are reported as INFO ratio only.

Net voltage sources, in priority order:
  1. rail_map.csv (user supplied)        2. ground regex -> 0 V
  3. voltage token in the net name       4. propagation across stuffed tie parts
Anything still unknown is listed in rail_map_todo.csv for the user to fill.
2026-10-22: 3b. legacy supply-word prefix (VDD_12V / VCC_3V3, config net_voltage.legacy_prefix_words, the word must be
the first token and the voltage token right after it); source 'net name (legacy prefix, unverified)': an MLCC fail
resting only on it is WARN, never ERROR. MLCC type: BOM description, then the DSN part property text
(config capacitor.mlcc_dsn_properties, e.g. CIS Component_Name 'MLCC 0.1UF/16V X7R 5%'), then the primitive regex.
CAP_UNRESOLVED: the v0.1 summary row stays (key CAP_UNRESOLVED), plus one row per unresolved net carrying its capacitors
(locatable on the PDF), key CAP_UNRESOLVED|<net>, severity capacitor.unresolved_severity (INFO: CATANIA has 107 such nets).
"""
from __future__ import annotations

import re

from ..findings import Finding
from ..model import Design, natkey
from ..values import net_voltage_from_name, parse_cap, voltage_token
from .drc import tie_edges


def resolve_voltages(d: Design, cfg: dict, rail_map: dict, legacy: bool = False) -> tuple[dict, list[Finding]]:
    """legacy=True only from cap_check: VDD_12V style names (NetGraph / netrules / power tree never see them)."""
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
            elif legacy:
                v = _legacy_prefix_volt(n, bl, cfg)
                if v is not None:
                    volts[n] = (v, LEGACY_SRC)
    conflicts: list[Finding] = []
    if cfg["net_voltage"]["propagate"]:
        edges = tie_edges(d, cfg)
        changed = True
        while changed:
            changed = False
            for n1, n2, r in edges:
                for x, y in ((n1, n2), (n2, n1)):
                    if x in volts and y not in volts:
                        volts[y] = (volts[x][0], f"via {r} from {x}"
                                    + (f" ({LEGACY_SRC})" if LEGACY_SRC in volts[x][1] else ""))
                        changed = True
        for n1, n2, r in edges:
            if n1 in volts and n2 in volts and abs(volts[n1][0] - volts[n2][0]) > 0.05:
                if volts[n1][1].startswith("via") or volts[n2][1].startswith("via"):
                    continue
                guess = LEGACY_SRC in volts[n1][1] or LEGACY_SRC in volts[n2][1]
                conflicts.append(Finding(
                    category="DRC", rule="TIE_BETWEEN_RAILS", severity="WARN" if guess else "ERROR",
                    title=f"{r} ties {n1} ({volts[n1][0]:g} V) to {n2} ({volts[n2][0]:g} V)",
                    detail=f"stuffed {d.value(r)} between two nets of different voltage "
                           f"(sources: {volts[n1][1]} / {volts[n2][1]})",
                    refdes=[r], nets=[n1, n2], page=d.page_of(r),
                    page_title=d.page_title(d.page_of(r))).finalize())
    return volts, conflicts


LEGACY_SRC = "net name (legacy prefix, unverified)"


def _legacy_prefix_volt(net: str, bl: set[str], cfg: dict) -> float | None:
    """VDD_12V -> 12 when the first token is a legacy supply word and the very next token is the voltage."""
    words = {str(x).upper() for x in (cfg["net_voltage"].get("legacy_prefix_words") or [])}
    toks = [t for t in re.split(r"[_\-\s]+", net.upper()) if t]
    if len(toks) < 2 or toks[0] not in words or voltage_token(toks[1]) is None:
        return None
    return net_voltage_from_name("_".join(toks[1:]), bl)


def _mlcc_kind(d: Design, r: str, st: bool, cc: dict, mlcc_bom, mlcc_prim, pr) -> tuple[bool, str]:
    """(is MLCC, where the type came from). Company BOM text first (unchanged behaviour), then DSN text."""
    if st and d.bom and r in d.bom and (mlcc_bom.search(d.bom[r].desc) or d.bom_format != "OrCAD"):
        return bool(mlcc_bom.search(d.bom[r].desc)), "BOM"
    props = d.dsn_props.get(r, {})
    for k in cc.get("mlcc_dsn_properties", []) or []:
        txt = str(props.get(k, ""))
        if txt.strip():
            return bool(mlcc_bom.search(txt)), f"DSN {k}"
    return bool(mlcc_prim.search(pr.name)), "primitive (assumed)"


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
    volts, out = resolve_voltages(d, cfg, rail_map, legacy=True)
    gnd_free = {n for n in d.nets if re.fullmatch(cfg["ground"]["regex"], n)}   # ground nets are never "no source"
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
        is_mlcc, kind_src = _mlcc_kind(d, r, st, cc, mlcc_bom, mlcc_prim, pr)
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
                legacy = LEGACY_SRC in v1[1] or LEGACY_SRC in v2[1]
                nosrc = any(n not in gnd_free and all(re.match(r"C\d", p[0]) for p in d.nets.get(n, []))
                            for n in (n1, n2))
                weak = legacy or nosrc
                out.append(Finding(
                    category="CAPV", rule="MLCC_DERATING", severity="ERROR" if st and not weak else "WARN",
                    title=f"{r} {rated:g} V MLCC on {stress:g} V (required >= {need:g} V)" + ("" if st else " [DNP]"),
                    detail=f"{n1} = {v1[0]:g} V ({v1[1]}), {n2} = {v2[0]:g} V ({v2[1]}); "
                           f"rule: ~{factor:g} x |V1-V2| rounded to a common rating; type from {kind_src}"
                           + ("; voltage from a legacy net name only (未驗證): WARN, fill rail_map.csv to confirm"
                              if legacy else "")
                           + ("; the net has only capacitors (no source, see CAP_ONLY_NET)"
                              if nosrc else ""),
                    refdes=[r], nets=[n1, n2], page=d.page_of(r), page_title=d.page_title(d.page_of(r)),
                    evidence={"rated": rated, "stress": stress, "required": need, "stuffed": st,
                              "weak": weak, "legacy": legacy, "nosrc": nosrc}).finalize())
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
    if todo_rows:      # summary row unchanged since v0.1 (key CAP_UNRESOLVED): tracking replies stay attached
        n_caps = sum(1 for x in rows if x["verdict"] == "UNRESOLVED")
        out.append(Finding(category="CAPV", rule="CAP_UNRESOLVED", severity="WARN",
                           title=f"{n_caps} capacitors not checked: {len(todo_rows)} net voltages unknown",
                           detail="fill rail_map_todo.csv (net,voltage) and re-run; see appendix",
                           key="CAP_UNRESOLVED").finalize())
    sev = cc.get("unresolved_severity", "INFO")
    for n, caps in (sorted(todo.items()) if cc.get("unresolved_per_net", True) else []):
        cs = sorted(caps, key=natkey)
        pg = d.page_of(cs[0])
        out.append(Finding(category="CAPV", rule="CAP_UNRESOLVED", severity=sev,
                           title=f"{n}: voltage unknown, {len(cs)} capacitor(s) not checked",
                           detail=f"caps: {', '.join(cs)}. Fill rail_map_todo.csv (net,voltage) and re-run",
                           refdes=cs, nets=[n], page=pg, page_title=d.page_title(pg),
                           key=f"CAP_UNRESOLVED|{n}").finalize())
    return out, rows, todo_rows
