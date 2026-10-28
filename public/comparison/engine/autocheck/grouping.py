"""Root-cause grouping and cross references (applied after NEW/EXISTING tagging).

  STUFF_CHANGED        -> one finding per (page, direction)    e.g. "p13: 20 parts stuffed -> DNP"
  PART_SYMBOL_CHANGED  -> one finding per (page, severity)
  MLCC_DERATING        -> one per (stress, rated, required, stuffed, status)  e.g. "28 x 16 V on 12 V"
  NON_MLCC_RATIO       -> one per (stress, rated, stuffed)
Individual items are kept as detail lines, and every RefDes stays in Finding.refdes, so the
schematic-PDF annotator (v0.2) can still box each part.
"""
from __future__ import annotations

import re
from collections import defaultdict

from .findings import Finding
from .model import Design, natkey

ACTIVE = re.compile(r"^(U|Q|J|CN|D)\d")


def _group(fs: list[Finding], rule: str, keyf, build) -> list[Finding]:
    keep, groups = [], defaultdict(list)
    for f in fs:
        if f.rule == rule:
            groups[keyf(f)].append(f)
        else:
            keep.append(f)
    for k, g in groups.items():
        keep.append(build(k, sorted(g, key=lambda x: natkey(x.refdes[0]) if x.refdes else [])))
    return keep


def group_findings(fs: list[Finding], a: Design, b: Design) -> list[Finding]:
    def stuff(k, g):
        page, direction = k
        refs = [x for f in g for x in f.refdes]
        act = [r for r in refs if ACTIVE.match(r)]
        title = f"p{page or '?'} {b.page_title(page)}: {len(refs)} part(s) {direction}"
        if act:
            title += f" (incl. {', '.join(act[:4])}{'...' if len(act) > 4 else ''})"
        return Finding(category="PART", rule="STUFF_CHANGED", severity="WARN", title=title,
                       detail="\n".join(f"{f.refdes[0]}: {f.detail}" for f in g), refdes=refs,
                       page=page, page_title=b.page_title(page), status="CHANGE",
                       key=f"STUFF_CHANGED|{page}|{direction}|{','.join(refs)}").finalize()

    fs = _group(fs, "STUFF_CHANGED", lambda f: (f.page, f.title.split(" ", 1)[1]), stuff)

    def sym(k, g):
        page, sev = k
        refs = [x for f in g for x in f.refdes]
        return Finding(category="PART", rule="PART_SYMBOL_CHANGED", severity=sev,
                       title=f"p{page or '?'} {b.page_title(page)}: {len(refs)} symbol/value change(s)",
                       detail="\n".join(f"{f.title} | {f.detail}" for f in g), refdes=refs, page=page,
                       page_title=b.page_title(page), status="CHANGE",
                       key=f"PART_SYMBOL_CHANGED|{page}|{sev}|{','.join(refs)}").finalize()

    fs = _group(fs, "PART_SYMBOL_CHANGED", lambda f: (f.page, f.severity), sym)

    def mlcc(k, g):
        stress, rated, need, st, status, _weak = k
        refs = [x for f in g for x in f.refdes]
        nets = sorted({n for f in g for n in f.nets})
        pages = sorted({f.page for f in g if f.page})
        weak = bool(g[0].evidence.get("weak"))
        why = ([("voltage from a legacy net name only (未驗證), fill rail_map.csv to confirm")]
               if any(f.evidence.get("legacy") for f in g) else [])
        why += (["a net has only capacitors (no source, see CAP_ONLY_NET)"] if any(f.evidence.get("nosrc") for f in g)
                else [])
        return Finding(category="CAPV", rule="MLCC_DERATING", severity="ERROR" if st and not weak else "WARN",
                       title=f"{len(refs)} x {rated:g} V MLCC on {stress:g} V (required >= {need:g} V)"
                             + ("" if st else " [DNP]"),
                       detail=f"RefDes: {', '.join(refs)}\nnets: {', '.join(nets[:12])}"
                              + (" ..." if len(nets) > 12 else "") + f"\npages: {', '.join(map(str, pages))}"
                              + "".join(f"\nWARN, not ERROR: {w}" for w in why),
                       refdes=refs, nets=nets, page=pages[0] if pages else None,
                       page_title=b.page_title(pages[0]) if pages else "", status=status,
                       evidence={"rated": rated, "stress": stress, "required": need},
                       key=f"MLCC_DERATING|{stress}|{rated}|{st}|{status}|{','.join(refs)}").finalize()

    fs = _group(fs, "MLCC_DERATING", lambda f: (f.evidence["stress"], f.evidence["rated"], f.evidence["required"],
                                                f.evidence["stuffed"], f.status, bool(f.evidence.get("weak"))), mlcc)

    def nonm(k, g):
        stress, rated, st = k
        refs = [x for f in g for x in f.refdes]
        pages = sorted({f.page for f in g if f.page})
        return Finding(category="CAPV", rule="NON_MLCC_RATIO", severity="INFO",
                       title=f"{len(refs)} x non-MLCC {rated:g} V at {stress:g} V ({stress / rated:.0%} of rating)"
                             + ("" if st else " [DNP]"),
                       detail=f"RefDes: {', '.join(refs)}\n{g[0].detail}", refdes=refs,
                       nets=sorted({n for f in g for n in f.nets}), page=pages[0] if pages else None,
                       page_title=b.page_title(pages[0]) if pages else "", status=g[0].status,
                       key=f"NON_MLCC_RATIO|{stress}|{rated}|{st}").finalize()

    fs = _group(fs, "NON_MLCC_RATIO", lambda f: (f.evidence["stress"], f.evidence["rated"], f.evidence["stuffed"]), nonm)
    return fs


def cross_reference(fs: list[Finding], limit: int = 8) -> None:
    """Fill Finding.related with ids of other findings that share a RefDes (most specific first)."""
    by_ref = defaultdict(list)
    for f in fs:
        for r in set(f.refdes):
            by_ref[r].append(f)
    for f in fs:
        if len(f.refdes) > 40:      # very large groups would relate to everything
            continue
        rel = {}
        for r in f.refdes:
            for o in by_ref[r]:
                if o is not f and len(o.refdes) <= 60:
                    rel.setdefault(o.id, (len(o.refdes), o))
        f.related = [o.id for _, o in sorted(rel.values(), key=lambda t: t[0])][:limit]


def page_overview(fs: list[Finding], cap_rows: list[dict], b: Design) -> list[dict]:
    rows = defaultdict(lambda: {"CONN": 0, "SYMBOL": 0, "STUFF": 0, "BOM": 0, "DRC_NEW": 0, "CAP_FAIL": 0})
    for f in fs:
        if f.category == "CONN":
            rows[f.page]["CONN"] += 1
        elif f.rule == "PART_SYMBOL_CHANGED":
            rows[f.page]["SYMBOL"] += len(f.refdes)
        elif f.rule == "STUFF_CHANGED":
            rows[f.page]["STUFF"] += len(f.refdes)
        elif f.rule in ("PART_ADDED", "PART_REMOVED"):
            rows[f.page]["SYMBOL"] += 1
        elif f.category == "BOM":
            for r in f.refdes:
                rows[b.page_of(r) or f.page]["BOM"] += 1
        elif f.category in ("DRC", "NETRULE") and f.status == "NEW" and f.severity != "INFO":
            rows[f.page]["DRC_NEW"] += 1
    for r in cap_rows:
        if r["verdict"] == "FAIL":
            rows[r["page"]]["CAP_FAIL"] += 1
    out = []
    for p in sorted(rows, key=lambda x: (x is None, x or 0)):
        out.append({"page": p, "title": b.page_title(p), **rows[p]})
    return out
