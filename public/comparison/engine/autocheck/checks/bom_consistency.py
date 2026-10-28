"""G0 BOM / netlist consistency (power tree v4.6 design §G0; owner decisions 2026-10-22, HANDOVER 0p18).

Why: the power tree (and every check that asks "is this part built, what is its value") trusts the BOM. A BOM of a
different revision than the netlist (CRB: BOM 685-25032-0200-100 A.2 vs netlist p5032_a01) silently draws a wrong
tree. G0 lists, per part that is in BOTH the BOM and the netlist, whether the two agree.

Key per part:
  * "pn" mode: the netlist part carries a part-number property (config bomchk.netlist_pn_props, Concept NV_PN).
    Equal to the BOM line Number or one of its AML alternates -> OK_PN.
  * "text" mode (OrCAD: the ERP BOM has no MPN column, the symbol VALUE holds the MPN for ICs, the value for
    passives): passives (bomchk.value_kind) by value, everything else by the symbol MPN found in the BOM main /
    alternate description + spec text (separators ignored).
When the PN differs, passives fall back to type + value: same -> SAME_VALUE (second source, statistics only).

Status        finding
  OK_PN       -
  OK_VALUE    -          (text mode passive, value agrees)
  SAME_VALUE  -          (pn mode, PN differs, same type and value)
  TYPE_DIFF   value_diff_severity (netlist C / R / L, BOM description names another type)
  VALUE_DIFF  value_diff_severity
  PN_DIFF     strong_severity for bomchk.strong_prefixes, else other_severity
  UNCHECKED   -          (nothing to compare: no PN property, no value / MPN text)
Parts already reported by drc.bom_checks (BOM_VALUE_MISMATCH / BOM_MPN_NOT_FOUND) get no second finding; their row
still counts in the statistics and the power tree ⚠ set. Rows / statistics never depend on set iteration order.
"""
from __future__ import annotations

import re

from ..findings import Finding
from ..model import BomItem, Design, natkey
from ..values import close, fmt_cap, parse_cap, parse_ind, parse_res, parse_res_loose

RULE = "BOM_NETLIST_MISMATCH"
MISMATCH = ("TYPE_DIFF", "VALUE_DIFF", "PN_DIFF")
STATUS_ZH = {"OK_PN": "料號相同", "OK_VALUE": "值相同", "SAME_VALUE": "同值換料號", "TYPE_DIFF": "零件類型不同",
             "VALUE_DIFF": "值不同", "PN_DIFF": "料號不同", "UNCHECKED": "無法比對"}
COVERED_RULES = ("BOM_VALUE_MISMATCH", "BOM_MPN_NOT_FOUND")


def _prefix(r: str) -> str:
    m = re.match(r"[A-Za-z_]+", r)
    return m.group(0).upper() if m else ""


def _norm(s: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", (s or "").upper())


def _bcfg(cfg: dict) -> dict:
    return cfg.get("bomchk", {}) or {}


def _netlist_value(d: Design, r: str) -> str:
    p = d.parts.get(r)
    v = (p.props.get("VALUE", "") if p else "") or d.value(r)
    return v


def _value(kind: str, text: str, loose: bool = False):
    if kind == "cap":
        return parse_cap(text)                       # (farad, volt)
    if kind == "res":
        v = parse_res(text)
        return parse_res_loose(text) if (v is None and loose) else v
    if kind == "ind":
        return parse_ind(text)
    return None


def _fmt(kind: str, v) -> str:
    if v is None:
        return "?"
    if kind == "cap":
        f, volt = v
        return fmt_cap(f) + (f"/{volt:g}V" if volt else "")
    if kind == "res":
        for u, m in (("M", 1e6), ("k", 1e3), ("", 1.0), ("m", 1e-3)):
            if v >= m * 0.999:
                return f"{v / m:g}{u}ohm"
        return f"{v:g}ohm"
    if kind == "ind":
        for u, m in (("mH", 1e-3), ("uH", 1e-6), ("nH", 1e-9)):
            if v >= m * 0.999:
                return f"{v / m:g}{u}"
        return f"{v:g}H"
    return str(v)


def _compare_value(kind: str, net, bom) -> str | None:
    """None = agree, '' = not comparable, else what differs."""
    if kind == "cap":
        (fa, va), (fb, vb) = net, bom
        if fa is None or fb is None:
            return ""
        bad = []
        if not close(fa, fb):
            bad.append("capacitance")
        if va and vb and not close(va, vb):
            bad.append("voltage")
        return "/".join(bad) or None
    if net is None or bom is None:
        return ""
    return None if close(net, bom) else ("resistance" if kind == "res" else "inductance")


def _bom_type(desc: str, cfg: dict) -> str:
    hits = [k for k, rx in sorted((_bcfg(cfg).get("type_regex") or {}).items()) if re.search(rx, desc or "", re.I)]
    return hits[0] if len(hits) == 1 else ""


def _bom_text(it: BomItem) -> str:
    return " ".join([it.desc, it.spec] + [f"{a[0]} {a[1]} {a[2]}" for a in it.alternates])


def classify(d: Design, cfg: dict) -> dict:
    """{"mode": "pn" | "text" | "mixed", "rows": [...], "stats": {...}} for the parts in BOM and netlist.
    Empty rows when the design has no BOM."""
    bc = _bcfg(cfg)
    if d.bom is None:
        return {"mode": "", "rows": [], "stats": _stats([], cfg, d)}
    pn_props = list(bc.get("netlist_pn_props") or [])
    vkind = {str(k).upper(): v for k, v in (bc.get("value_kind") or {}).items()}
    skip = {str(x).upper() for x in (bc.get("skip_prefixes") or [])}
    mech = re.compile((cfg.get("parts", {}) or {}).get("mechanical_refdes_regex") or r"(?!)")
    rows: list[dict] = []
    for r in sorted(set(d.bom) & set(d.parts), key=natkey):
        px = _prefix(r)
        if px in skip or mech.match(r):
            continue
        it = d.bom[r]
        part = d.parts[r]
        kind = vkind.get(px, "")
        val = _netlist_value(d, r)
        if kind == "cap" and part.props.get("MAX_VOLTAGE") and _value("cap", val)[1] is None:
            val_cmp = f"{val}/{part.props['MAX_VOLTAGE']}"          # Concept keeps the rating in its own property
        else:
            val_cmp = val
        pn = next((part.props[p] for p in pn_props if part.props.get(p)), "")
        row = {"refdes": r, "prefix": px, "mode": "pn" if pn else "text", "netlist_pn": pn, "netlist_value": val,
               "bom_pn": it.pn, "bom_desc": it.desc, "bom_spec": it.spec, "bom_row": it.row,
               "alternates": [a[0] for a in it.alternates], "status": "", "what": "", "page": part.page}
        if pn:
            if pn == it.pn or pn in row["alternates"]:
                row["status"] = "OK_PN"
            elif kind:
                bt = _bom_type(it.desc, cfg)
                if bt and bt != kind:
                    row["status"], row["what"] = "TYPE_DIFF", f"netlist {kind} / BOM {bt}"
                else:
                    diff = _compare_value(kind, _value(kind, val_cmp, loose=True), _value(kind, it.desc))
                    if diff is None:
                        row["status"] = "SAME_VALUE"
                    elif diff == "":
                        row["status"], row["what"] = "PN_DIFF", "value not comparable"
                    else:
                        row["status"], row["what"] = "VALUE_DIFF", diff
            else:
                row["status"] = "PN_DIFF"
        elif kind:
            bt = _bom_type(it.desc, cfg)
            if bt and bt != kind:
                row["status"], row["what"] = "TYPE_DIFF", f"netlist {kind} / BOM {bt}"
            else:
                diff = _compare_value(kind, _value(kind, val_cmp, loose=True), _value(kind, it.desc))
                if diff is None:
                    row["status"] = "OK_VALUE"
                elif diff == "":
                    row["status"], row["what"] = "UNCHECKED", "value not parsed"
                else:
                    row["status"], row["what"] = "VALUE_DIFF", diff
        else:
            pr = d.prim(r)
            mpn = val or (pr.name.split("_")[-1] if pr else "")
            if not _norm(mpn):
                row["status"], row["what"] = "UNCHECKED", "no symbol MPN"
            elif _norm(mpn) in _norm(_bom_text(it)):
                row["status"] = "OK_PN"
            else:
                row["status"], row["what"] = "PN_DIFF", "symbol MPN not in BOM text"
        if kind and row["status"] in ("SAME_VALUE", "VALUE_DIFF", "OK_VALUE", "PN_DIFF"):
            row["netlist_fmt"] = _fmt(kind, _value(kind, val_cmp, loose=True))
            row["bom_fmt"] = _fmt(kind, _value(kind, it.desc))
        rows.append(row)
    modes = {x["mode"] for x in rows}
    mode = "mixed" if len(modes) > 1 else (next(iter(modes)) if modes else "")
    return {"mode": mode, "rows": rows, "stats": _stats(rows, cfg, d)}


def _stats(rows: list[dict], cfg: dict, d: Design) -> dict:
    strong = {str(x).upper() for x in (_bcfg(cfg).get("strong_prefixes") or [])}
    cnt = {s: 0 for s in STATUS_ZH}
    by_px: dict[str, int] = {}
    strong_refs: list[str] = []
    for x in rows:
        cnt[x["status"]] = cnt.get(x["status"], 0) + 1
        if x["status"] in MISMATCH:
            by_px[x["prefix"]] = by_px.get(x["prefix"], 0) + 1
            if x["prefix"] in strong:
                strong_refs.append(x["refdes"])
    bom_refs = set(d.bom or {})
    return {"compared": len(rows), "status": cnt,
            "mismatch": sum(cnt[s] for s in MISMATCH),
            "by_prefix": dict(sorted(by_px.items(), key=lambda kv: (-kv[1], kv[0]))),
            "strong_prefixes": sorted(strong), "strong": strong_refs,
            "netlist_not_in_bom": len(set(d.parts) - bom_refs) if d.bom is not None else 0,
            "bom_not_in_netlist": len(bom_refs - set(d.parts))}


def banner(chk: dict, label: str = "") -> str:
    """One line for the top of the power tree diagram ("" when nothing strong disagrees)."""
    st = (chk or {}).get("stats") or {}
    n = len(st.get("strong") or [])
    if not n:
        return ""
    px = "/".join(st.get("strong_prefixes") or [])
    who = f"{label} " if label else ""
    return (f"⚠ {who}BOM 與 netlist 不一致：{px} {n} 顆 (全部不符 {st.get('mismatch', 0)} / 比對 {st.get('compared', 0)})，"
            f"標 ⚠ 的 converter 用到這些料，請先確認 BOM 與 netlist 同版。")


def tag_power_tree(pt: dict, chk: dict, d: Design) -> None:
    """Additive marks on a power_tree() result (v3): edges whose converter / via parts are in the strong mismatch
    set get "bom_mismatch" (RefDes list) + "bom_note" (hover lines); pt["bom_check"] carries the banner and stats.
    Nothing is added when there is no mismatch, so outputs of a consistent board stay byte-identical."""
    if not pt or not chk:
        return
    st = chk.get("stats") or {}
    strong = set(st.get("strong") or [])
    if not strong:
        return
    rows = {x["refdes"]: x for x in chk.get("rows", [])}
    for e in pt.get("edges") or []:
        refs = [e.get("conv", "")] + list(e.get("via") or [])
        hit = sorted({r for r in refs if r in strong}, key=natkey)
        if hit:
            e["bom_mismatch"] = hit
            e["bom_note"] = [_note(rows[r]) for r in hit]
    pt["bom_check"] = {"banner": banner(chk, d.label), "strong": sorted(strong, key=natkey),
                       "mismatch": st.get("mismatch", 0), "compared": st.get("compared", 0)}


def _note(x: dict) -> str:
    net = x.get("netlist_fmt") or x.get("netlist_pn") or x.get("netlist_value") or "?"
    bom = x.get("bom_fmt") or " ".join(t for t in (x["bom_pn"], x["bom_desc"], x["bom_spec"]) if t)
    return f"BOM 不符 {x['refdes']} ({STATUS_ZH.get(x['status'], x['status'])})：netlist {net} / BOM {bom}"


def findings(d: Design, cfg: dict, chk: dict, covered: set[str] | None = None) -> list[Finding]:
    """One finding per mismatching part not already reported by drc.bom_checks (covered RefDes)."""
    from .drc import _f
    bc = _bcfg(cfg)
    strong = {str(x).upper() for x in (bc.get("strong_prefixes") or [])}
    out: list[Finding] = []
    for x in chk.get("rows", []):
        if x["status"] not in MISMATCH or x["refdes"] in (covered or set()):
            continue
        if x["status"] == "PN_DIFF":
            sev = bc.get("strong_severity", "WARN") if x["prefix"] in strong else bc.get("other_severity", "INFO")
        else:
            sev = bc.get("value_diff_severity", "WARN")
        r = x["refdes"]
        if x["mode"] == "pn":
            net = f"NV_PN {x['netlist_pn']}" if x["netlist_pn"] else x["netlist_value"]
        else:
            net = x["netlist_value"] or "?"
        if x.get("netlist_fmt") and x["status"] != "PN_DIFF":
            title = f"{r} netlist {x['netlist_fmt']} vs BOM {x['bom_fmt']} ({x['what']})"
        elif x["status"] == "TYPE_DIFF":
            title = f"{r} netlist {x['prefix']} {x['netlist_value']} vs BOM {x['bom_desc'][:40]} ({x['what']})"
        else:
            title = f"{r} netlist {net} vs BOM {x['bom_pn']} ({x['what'] or 'part number differs'})"
        detail = (f"netlist: {net}" + (f", VALUE {x['netlist_value']}" if x["mode"] == "pn" and x["netlist_value"] else "")
                  + f" | BOM row {x['bom_row']}: {x['bom_pn']} {x['bom_desc']} | {x['bom_spec']}"
                  + (f" | alternates {', '.join(x['alternates'])}" if x["alternates"] else ""))
        out.append(_f(d, category="BOMCHK", rule=RULE, severity=str(sev).upper(), title=title, refdes=[r],
                      detail=detail, evidence={"netlist": net, "BOM": f"{x['bom_pn']} {x['bom_desc']}"},
                      key=f"{RULE}|{r}"))
    return out


def covered_refdes(fs: list[Finding]) -> set[str]:
    return {r for f in fs if f.rule in COVERED_RULES for r in f.refdes}


def sheet_rows(chk_by_side: list[tuple[str, dict]]) -> list[dict]:
    """Rows for the Excel sheet 'BOM 一致性': every part whose status is not OK, both sides, side first."""
    out = []
    for side, chk in chk_by_side:
        for x in (chk or {}).get("rows", []):
            if x["status"] in ("OK_PN", "OK_VALUE"):
                continue
            out.append({"side": side, **x})
    return out
