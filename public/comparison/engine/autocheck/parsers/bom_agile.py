"""Parser for an Agile PLM BOM export (.xls BIFF8, also .xlsx with the same layout).

Observed format (OTA01 DC-SCM, agile_20260408_071631666.xls, 2026-10):
  * One sheet. Header blocks first ("Title Block", "Page Two", "Page Three"), then a "BOM" block whose
    header row holds: Level | ... | Find Num | Main / Sub | Item Number | Item Description | Item Rev |
    Qty | Ref Des | ... | Mfr. Name | Mfr. Part Number | ...
  * Item rows carry a numeric Level. Main / Sub = M is the item, S is an approved substitute of the M row
    with the same Find Num (S rows have no Ref Des).
    S may also come BEFORE its M row (OTA01 row 394/395, the PCB): substitutes are attached after the scan.
  * The first manufacturer sits on the item row itself (Mfr. Name / Mfr. Part Number columns); further
    manufacturers follow on rows with an empty Level that fill only those two columns.
  * Ref Des is comma separated. A socketed programmed part is written "FOR J2" (the flash that sits in
    socket J2); such entries are kept as raw tokens and resolved against the netlist by bom_socket.py.
Pure function parse_rows() works on a 2-D list of strings so tests need no Excel file.
"""
from __future__ import annotations

import re

from ..model import BomItem

HEAD = {
    "level": ["Level"],
    "find": ["Find Num"],
    "ms": ["Main / Sub", "Main/Sub"],
    "pn": ["Item Number"],
    "desc": ["Item Description"],
    "qty": ["Qty"],
    "ref": ["Ref Des"],
    "mfr": ["Mfr. Name"],
    "mpn": ["Mfr. Part Number"],
}
REQUIRED = ("level", "find", "pn", "ref")
PLAIN_REF = re.compile(r"^[A-Za-z][A-Za-z0-9_\-]*$")


def _s(x) -> str:
    if x is None:
        return ""
    s = str(x).strip()
    return "" if s.lower() == "nan" else s


def find_header(rows: list[list[str]], scan: int = 200) -> tuple[int, dict[str, int]] | None:
    """Row index and column map of the Agile BOM header, or None when this is not an Agile export."""
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


def split_refdes(text: str) -> tuple[list[str], list[str]]:
    """'C1,C2 C3;FOR J2' -> (['C1','C2','C3'], ['FOR J2']). Comma / semicolon separate entries; an entry
    that is not one plain RefDes is split on blanks only if every piece is a plain RefDes, else kept raw."""
    refs: list[str] = []
    raw: list[str] = []
    for ent in re.split(r"[,;]", text or ""):
        ent = " ".join(ent.split())
        if not ent:
            continue
        if PLAIN_REF.match(ent):
            refs.append(ent)
            continue
        parts = ent.split(" ")
        if all(PLAIN_REF.match(p) for p in parts) and not any(p.upper() in ("FOR", "ON", "IN", "AT") for p in parts):
            refs += parts
        else:
            raw.append(ent)
    return refs, raw


def _qty(x: str) -> float | None:
    m = re.match(r"\s*([\d.]+)", x or "")
    try:
        return float(m.group(1)) if m else None
    except ValueError:
        return None


def parse_rows(rows: list[list[str]]) -> tuple[list[BomItem], list[tuple[str, str]]]:
    hit = find_header(rows)
    if hit is None:
        raise ValueError("Agile BOM header (Level / Find Num / Item Number / Ref Des) not found")
    h, c = hit

    def cell(row, key):
        j = c.get(key)
        return _s(row[j]) if j is not None and j < len(row) else ""

    items: list[BomItem] = []
    problems: list[tuple[str, str]] = []
    stack: dict[int, BomItem] = {}           # level -> last M item at that level
    find_of: dict[int, tuple[int, str]] = {}  # id(item) -> (level, Find Num)
    last_main: BomItem | None = None          # last M item (owner of following S rows)
    subs: list[dict] = []                     # S rows, attached to their M item after the scan
    target = None                              # where the next manufacturer row goes: BomItem or S-row dict
    def add_mfr(row, tgt):
        mfr, mpn = cell(row, "mfr"), cell(row, "mpn")
        if not (mfr or mpn) or tgt is None:
            return
        tag = f"{mfr}: {mpn}" if mfr and mpn else (mpn or mfr)
        if isinstance(tgt, BomItem):
            tgt.spec = f"{tgt.spec}; {tag}" if tgt.spec else tag
        else:
            tgt["spec"] = f"{tgt['spec']}; {tag}" if tgt["spec"] else tag

    for i in range(h + 1, len(rows)):
        row = rows[i]
        lvl_s = cell(row, "level")
        if not lvl_s:
            add_mfr(row, target)
            continue
        if not re.fullmatch(r"\d+", lvl_s):
            break                                   # next block of the export
        lvl = int(lvl_s)
        pn, desc = cell(row, "pn"), cell(row, "desc")
        if not pn:
            continue
        ms = cell(row, "ms").upper()
        find = cell(row, "find")
        if ms == "S":
            owner = last_main if last_main is not None and find_of[id(last_main)] == (lvl, find) else None
            target = {"pn": pn, "desc": desc, "spec": "", "level": lvl, "find": find, "row": i + 1, "owner": owner}
            subs.append(target)
            add_mfr(row, target)
            continue
        refs, raw = split_refdes(cell(row, "ref"))
        it = BomItem(pn=pn, desc=desc, spec="", qty=_qty(cell(row, "qty")), refdes=refs, row=i + 1,
                     ref_tokens=raw)
        parent = stack.get(lvl - 1)
        if parent is not None and not parent.refdes and not parent.ref_tokens:
            it.parent_pn = parent.pn
            it.parent_alternates = parent.alternates
        stack[lvl] = it
        for d in [d for d in stack if d > lvl]:
            del stack[d]
        items.append(it)
        find_of[id(it)] = (lvl, find)
        last_main = it
        target = it
        add_mfr(row, it)
    for sb in subs:                          # file order, so alternates keep the BOM sequence
        owner = sb["owner"]
        if owner is None:
            same = [it for it in items if find_of[id(it)] == (sb["level"], sb["find"])]
            owner = same[0] if len(same) == 1 else None
        if owner is None:
            problems.append(("BOM_ALT_ORPHAN",
                             f"substitute {sb['pn']} (Find Num {sb['find']}) matches no single main item (row {sb['row']})"))
            continue
        owner.alternates.append((sb["pn"], sb["desc"], sb["spec"]))
    # integrity (same rules as the ERP parser; a raw token such as "FOR J2" counts as one placement)
    seen: dict[str, BomItem] = {}
    for it in items:
        n = len(it.refdes) + len(it.ref_tokens)
        if n and it.qty is not None and abs(it.qty - n) > 1e-6:
            problems.append(("BOM_QTY_MISMATCH",
                             f"{it.pn} qty {it.qty:g} but {n} RefDes listed (row {it.row})"))
        for r in it.refdes:
            if r in seen:
                problems.append(("BOM_DUP_REFDES", f"{r} listed under {seen[r].pn} and {it.pn}"))
            seen[r] = it
    return items, problems
