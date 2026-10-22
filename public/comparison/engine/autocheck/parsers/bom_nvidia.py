"""NVIDIA 'Multi-Level BOM With AML' parser (2026-10-21, Vera CPU module 685-25032-0200-100 A.2).

Observed format (xlsx, one sheet):
  rows 1-4   title block ("Nvidia Multi-Level BOM With AML", "Target Part :", "Execution Time :", "Configuration :")
  row 6      header: Level | Item Type | Number | Name | Version | State | Find # | Qty | Alt Qty | Primary | Ref Des |
             Manufacturer Part Number | Ordering Restrictions | Manufacturer | Sourcing Status | Supplier Intent | BOM Notes
  Level 0    the target assembly (Project Part)
  Level 1    sub-BOMs (Project Part, Ref Des = "SBOM320" ...): grouping only, never a placed part
  Level 2    Library Part / NVIDIA Silicon Part / Project Part (CPLD firmware assembly, EdgeLock kit) with Ref Des
  Level 3    Document / Manufacturer Document rows (Ref Des '-') and the programmed devices inside a firmware
             assembly (Ref Des 'CPLD' / 'MCU': placeholders, not netlist RefDes; left as plain RefDes so they show
             up as BOM-only parts instead of being silently dropped)
  AML        one row per approved manufacturer: SAME Level / Number / Find # / Ref Des repeated, Primary = True on
             every one of them, so the dedupe key is (sub-BOM Number, Find #) -> first row = main item, later
             rows = alternates. Primary = False marks an unselected variant (CPLD FW 36D, Qty 0, same RefDes
             U1550 as the selected 36P) and is skipped.
  DNP        no marking anywhere: a part not in the BOM is not placed (same rule as the company BOMs).
  Qty == number of Ref Des on every row of the sample; checked like the other parsers.
"""
from __future__ import annotations

import re

from ..model import BomItem

HEAD = {
    "level": ["Level"],
    "type": ["Item Type"],
    "pn": ["Number"],
    "desc": ["Name"],
    "find": ["Find #", "Find Num"],
    "qty": ["Qty"],
    "primary": ["Primary"],
    "ref": ["Ref Des"],
    "mpn": ["Manufacturer Part Number"],
    "mfr": ["Manufacturer"],
    "status": ["Sourcing Status"],
}
REQUIRED = ("level", "type", "pn", "find", "ref", "mpn")
PLAIN_REF = re.compile(r"^[A-Za-z][A-Za-z0-9_\-]*$")


def _s(x) -> str:
    if x is None:
        return ""
    s = str(x).strip()
    return "" if s.lower() == "nan" else s


def find_header(rows: list[list[str]], scan: int = 20) -> tuple[int, dict[str, int]] | None:
    """Row index and column map of the NVIDIA header, or None when this is not an NVIDIA multi-level BOM.
    'Number' and 'Name' are generic words, so the Agile-specific 'Item Number' header never matches here
    (Agile has no 'Item Type' / 'Primary' columns)."""
    for i, row in enumerate(rows[:scan]):
        cells = [_s(c) for c in row]
        cols: dict[str, int] = {}
        for key, names in HEAD.items():
            for j, c in enumerate(cells):
                if c in names:
                    cols[key] = j
                    break
        if all(k in cols for k in REQUIRED):
            return i, cols
    return None


def split_refdes(text: str) -> list[str]:
    out: list[str] = []
    for ent in re.split(r"[,;\s]+", text or ""):
        ent = ent.strip()
        if ent and ent != "-" and PLAIN_REF.match(ent):
            out.append(ent)
    return out


def _qty(x: str) -> float | None:
    m = re.match(r"\s*([\d.]+)", x or "")
    try:
        return float(m.group(1)) if m else None
    except ValueError:
        return None


def parse_rows(rows: list[list[str]]) -> tuple[list[BomItem], list[tuple[str, str]]]:
    hit = find_header(rows)
    if hit is None:
        raise ValueError("NVIDIA multi-level BOM header (Level / Item Type / Number / Find # / Ref Des) not found")
    h, c = hit

    def cell(row, key):
        j = c.get(key)
        return _s(row[j]) if j is not None and j < len(row) else ""

    items: list[BomItem] = []
    problems: list[tuple[str, str]] = []
    by_key: dict[tuple[str, str, str], BomItem] = {}   # (sub-BOM number, level, Find #) -> main item
    sub_bom: dict[int, str] = {}                        # level -> Number of the enclosing Project Part
    for i in range(h + 1, len(rows)):
        row = rows[i]
        lvl_s = cell(row, "level")
        if not re.fullmatch(r"\d+", lvl_s):
            if lvl_s:
                break                                   # "End Of Report"
            continue
        lvl = int(lvl_s)
        pn, typ = cell(row, "pn"), cell(row, "type")
        if not pn:
            continue
        for d in [d for d in sub_bom if d >= lvl]:
            del sub_bom[d]
        refs = split_refdes(cell(row, "ref"))
        if (typ == "Project Part" and not refs) or re.fullmatch(r"SBOM\w*", cell(row, "ref")):
            sub_bom[lvl] = pn                           # assembly / sub-BOM: grouping only
            continue
        if not refs:
            continue                                    # documents, '-' rows
        if cell(row, "primary").lower() == "false":
            continue                                    # unselected variant (CPLD FW 36D vs 36P: qty 0, same RefDes)
        parent = sub_bom.get(lvl - 1) if lvl - 1 in sub_bom else (sub_bom[max(sub_bom)] if sub_bom else None)
        mfr, mpn = cell(row, "mfr"), cell(row, "mpn")
        tag = f"{mfr}: {mpn}" if mfr and mpn else (mpn or mfr)
        status = cell(row, "status")
        if status and status not in ("Approved", "Production"):
            tag = f"{tag} [{status}]" if tag else f"[{status}]"
        key = (parent or "", lvl_s, cell(row, "find"))
        main = by_key.get(key)
        if main is not None and main.pn == pn and main.refdes == refs:
            main.alternates.append((pn, cell(row, "desc"), tag))   # AML row of the same item
            continue
        it = BomItem(pn=pn, desc=cell(row, "desc"), spec=tag, qty=_qty(cell(row, "qty")), refdes=refs, row=i + 1,
                     parent_pn=parent)
        by_key[key] = it
        items.append(it)
    seen: dict[str, BomItem] = {}
    for it in items:
        if it.qty is not None and abs(it.qty - len(it.refdes)) > 1e-6:
            problems.append(("BOM_QTY_MISMATCH", f"{it.pn} qty {it.qty:g} but {len(it.refdes)} RefDes listed (row {it.row})"))
        for r in it.refdes:
            if r in seen and seen[r].pn != it.pn:
                problems.append(("BOM_DUP_REFDES", f"{r} listed under {seen[r].pn} and {it.pn}"))
            seen[r] = it
    return items, problems
