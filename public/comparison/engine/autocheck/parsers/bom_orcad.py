"""OrCAD Capture 'Bill of Materials' report and other flat EDA BOM exports (2026-10-22).

Observed format (OrCAD Capture Tools > Bill of Materials, Vera CPU TPM test kit, 2026-10-22):
  * .BOM text file (tab separated) and the same content saved by Excel as .xlsx ("Open in Excel").
  * Title block first (Cover Page / project / company / author, "Bill Of Materials <date> <time>  Page1"),
    header row around row 12: Item | Quantity | Reference | Part, then '____' rule, then one line per Item.
  * Reference = comma separated RefDes of every instance with the same combined property string.
  * Part = the VALUE text (0.1UF/16V, 10KOhm, ST33KTPM2X32DKJ1). The default dialog writes NO part number and
    NO DNP column: a part not in the BOM is not placed (same rule as the company BOMs).
  * The header / property string is user defined in the dialog, so extra columns appear by name, e.g. the EMA
    walk-through: PCB Footprint | Vendor | Vendor Part Number | Manufacturer | Manufacturer Part Number.
Tolerated variants (no sample yet, handled defensively):
  * a long Reference list wrapped onto following lines with an empty Item cell -> appended to the item above;
  * 'Place each part entry on a separate line' (same Item number repeated) -> merged into one item, Qty summed;
  * a page break repeating the title / header / '____' lines -> skipped;
  * ranges 'R1-R4' (same prefix both ends) -> expanded.
Also accepts flat Altium-like exports (Designator / Comment / Quantity) since the header match is by name.

Field mapping into BomItem (checks/drc.py parses capacitor / resistor values out of desc):
  pn    company part number column if present, else manufacturer part number, else the Part / Value text
  desc  Part / Value text (Description column only when there is no value column)
  spec  Description, 'Manufacturer: MPN', footprint joined with ' | '
"""
from __future__ import annotations

import re

from ..model import BomItem

# header text normalised: lower case, '_' / '.' / multiple spaces -> one space
HEAD = {
    "item": ["item", "item no", "item #", "#", "no"],
    "qty": ["quantity", "qty", "count"],
    "ref": ["reference", "references", "ref des", "refdes", "ref designator", "reference designator",
            "reference designators", "designator", "designators", "part reference", "location"],
    "value": ["part", "value", "part value", "comment", "val"],
    "pn": ["part number", "partnumber", "pn", "p/n", "part no", "internal pn", "company pn", "pegatron pn",
           "pegatron part number", "料號", "公司料號", "stock code"],
    "mpn": ["manufacturer part number", "manufacturer pn", "mfr part number", "mfr pn", "mfr p/n", "mpn",
            "vendor part number", "vendor pn"],
    "mfr": ["manufacturer", "mfr", "mfr name", "manufacturer name", "vendor"],
    "desc": ["description", "desc"],
    "fp": ["pcb footprint", "footprint", "package"],
}
_PLAIN_REF = re.compile(r"^[A-Za-z][A-Za-z0-9_]*$")
_RANGE = re.compile(r"^([A-Za-z]+)(\d+)-\1(\d+)$")


def _s(x) -> str:
    if x is None:
        return ""
    s = str(x).strip()
    return "" if s.lower() == "nan" else s


def _norm(x) -> str:
    return re.sub(r"[\s_.]+", " ", _s(x).lower()).strip()


def _match(cells: list[str]) -> dict[str, int]:
    cols: dict[str, int] = {}
    for j, c in enumerate(cells):
        n = _norm(c)
        for key, names in HEAD.items():
            if key not in cols and n in names:
                cols[key] = j
                break
    return cols


def find_header(rows: list[list[str]], scan: int = 60) -> tuple[int, dict[str, int]] | None:
    """Row index and column map, or None. Needs a RefDes column, something that names the part (value / PN /
    MPN) and at least three recognised columns, so a random sheet with a 'Part' cell does not qualify."""
    for i, row in enumerate(rows[:scan]):
        cols = _match(list(row))
        if "ref" in cols and ({"value", "pn", "mpn"} & cols.keys()) and len(cols) >= 3:
            return i, cols
    return None


def split_refdes(text: str) -> tuple[list[str], list[str]]:
    """(plain RefDes with ranges expanded, tokens that are not a RefDes)."""
    refs: list[str] = []
    bad: list[str] = []
    for ent in re.split(r"[,;\s]+", text or ""):
        ent = ent.strip()
        if not ent or ent == "-":
            continue
        m = _RANGE.match(ent)
        if m and int(m.group(2)) < int(m.group(3)) and int(m.group(3)) - int(m.group(2)) <= 500:
            refs += [f"{m.group(1)}{k}" for k in range(int(m.group(2)), int(m.group(3)) + 1)]
        elif _PLAIN_REF.match(ent):
            refs.append(ent)
        else:
            bad.append(ent)
    return refs, bad


def _qty(x: str) -> float | None:
    m = re.match(r"\s*(\d+(?:\.\d+)?)", x or "")
    return float(m.group(1)) if m else None


def text_rows(text: str) -> list[list[str]]:
    """Rows of a .BOM text report: tab separated; a file without any tab is split on runs of 2+ spaces."""
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    if any("\t" in ln for ln in lines):
        return [ln.split("\t") for ln in lines]
    return [re.split(r"\s{2,}", ln.strip()) for ln in lines]


def parse_rows(rows: list[list[str]]) -> tuple[list[BomItem], list[tuple[str, str]]]:
    hit = find_header(rows)
    if hit is None:
        raise ValueError("OrCAD / EDA BOM header (Reference + Part / Value / Part Number) not found")
    h, c = hit

    def cell(row, key):
        j = c.get(key)
        return _s(row[j]) if j is not None and j < len(row) else ""

    items: list[BomItem] = []
    bad_tokens: dict[int, list[str]] = {}
    last: BomItem | None = None
    last_item_no = ""
    for i in range(h + 1, len(rows)):
        row = list(rows[i])
        if not any(_s(x) for x in row):
            continue
        if set("".join(_s(x) for x in row)) <= set("_-= "):
            continue                                    # '_____' rule under the header
        if find_header([row], 1) is not None:
            continue                                    # header repeated after a page break
        refs, bad = split_refdes(cell(row, "ref"))
        if not refs and not bad:
            continue                                    # title / page lines, rows without RefDes
        item_no, value = cell(row, "item"), cell(row, "value")
        pn_cell, mpn, mfr = cell(row, "pn"), cell(row, "mpn"), cell(row, "mfr")
        cont = last is not None and (
            ("item" in c and not item_no and not value and not pn_cell)        # wrapped Reference list
            or ("item" in c and item_no and item_no == last_item_no))          # one line per instance
        if cont:
            last.refdes += [r for r in refs if r not in last.refdes]
            bad_tokens.setdefault(last.row, []).extend(bad)
            q = _qty(cell(row, "qty"))
            if q is not None and item_no and item_no == last_item_no:
                last.qty = (last.qty or 0) + q
            continue
        desc = value or cell(row, "desc")
        spec_parts = []
        if value and cell(row, "desc"):
            spec_parts.append(cell(row, "desc"))
        if mpn:
            spec_parts.append(f"{mfr}: {mpn}" if mfr else mpn)
        elif mfr:
            spec_parts.append(mfr)
        if cell(row, "fp"):
            spec_parts.append(cell(row, "fp"))
        it = BomItem(pn=pn_cell or mpn or value, desc=desc, spec=" | ".join(spec_parts),
                     qty=_qty(cell(row, "qty")), refdes=refs, row=i + 1)
        items.append(it)
        bad_tokens.setdefault(it.row, []).extend(bad)
        last, last_item_no = it, item_no
    problems: list[tuple[str, str]] = []
    seen: dict[str, BomItem] = {}
    for it in items:
        bad = bad_tokens.get(it.row) or []
        if it.qty is not None and abs(it.qty - len(it.refdes)) > 1e-6:
            extra = f"; unreadable Reference entries: {', '.join(bad)}" if bad else ""
            problems.append(("BOM_QTY_MISMATCH",
                             f"{it.pn} qty {it.qty:g} but {len(it.refdes)} RefDes listed (row {it.row}){extra}"))
        for r in it.refdes:
            if r in seen:
                problems.append(("BOM_DUP_REFDES", f"{r} listed under {seen[r].pn} and {it.pn}"))
            seen[r] = it
    return items, problems
