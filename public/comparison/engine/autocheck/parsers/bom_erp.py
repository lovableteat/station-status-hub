"""Parser for the ERP "Product Structure Report" BOM export.

Observed format (CATANIA PDB EVT/DVT, 2026-10):
  * File extension .xls but content is an HTML table, charset BIG5.
  * Columns: 項次 | 主件料號 | 品名 | 規格 | 組成用量 | 插件位置 | 承認狀態 | ...
  * Tree depth encoded by '|' characters in 主件料號; '-S-' marks an alternate (second source)
    of the item directly above it; '---' marks a real item.
  * Sub-assemblies (e.g. VGCS50VB0010) have children one level deeper and may have their own
    alternates at sub-assembly level (whose children are not listed).
Also accepts a real .xlsx / .csv with the same column headers.
An Agile PLM export (real BIFF .xls / .xlsx, "Level / Find Num / Item Number / Ref Des" header) is
detected first and handed to bom_agile.py; the ERP path below is unchanged.
2026-10-22: OrCAD Capture 'Bill of Materials' report (.BOM text or its Excel copy, header Item / Quantity /
Reference / Part below a title block) and other flat EDA exports go to bom_orcad.py. Tried LAST, after the ERP
header AND all five ERP columns resolve, so a company BOM is never re-read as a flat one. ERP header scan widened
from 10 to 30 rows.
"""
from __future__ import annotations

import io
import re
from pathlib import Path

import pandas as pd

from ..model import BomItem, Design, SourceFile
from . import bom_agile, bom_nvidia, bom_orcad, read_text, sha256_of

COLS = {
    "pn": ["主件料號", "料號", "Part Number", "PN"],
    "desc": ["品名", "Description"],
    "spec": ["規格", "Spec", "Manufacturer PN"],
    "qty": ["組成用量", "Qty", "Quantity"],
    "ref": ["插件位置", "Reference", "RefDes", "Designator"],
}


def _decode_html(raw: bytes) -> str:
    m = re.search(rb"charset\s*=\s*([A-Za-z0-9_-]+)", raw[:2000])
    encs = []
    if m:
        cs = m.group(1).decode("ascii", "ignore").lower()
        encs.append("cp950" if cs in ("big5", "big-5", "x-big5") else cs)
    encs += ["utf-8", "cp950"]
    for e in encs:
        try:
            return raw.decode(e)
        except (UnicodeDecodeError, LookupError):
            continue
    return raw.decode("cp950", errors="replace")


def _raw_frame(path: Path) -> pd.DataFrame | None:
    """Header-less frame of a real Excel file (Agile sniffing), None for HTML-as-.xls and .csv."""
    if path.suffix.lower() not in (".xls", ".xlsx"):
        return None
    head = path.read_bytes()[:8]
    if not (head.startswith(b"\xd0\xcf\x11\xe0") or head.startswith(b"PK")):
        return None      # ERP HTML disguised as .xls: leave it to _read_table
    return pd.read_excel(path, header=None, dtype=str)


def _read_table(path: Path) -> pd.DataFrame:
    raw = path.read_bytes()
    head = raw[:512].lstrip().lower()
    if head.startswith(b"<!doctype html") or head.startswith(b"<html") or b"<table" in raw[:4000].lower():
        tables = pd.read_html(io.StringIO(_decode_html(raw)), header=None)
        df = max(tables, key=len)
    elif path.suffix.lower() == ".csv":
        df = pd.read_csv(path, header=None, dtype=str, encoding_errors="replace")
    else:
        df = pd.read_excel(path, header=None, dtype=str)
    # locate header row
    for i in range(min(30, len(df))):
        row = [str(x).strip() for x in df.iloc[i].tolist()]
        if any(c in row for c in COLS["pn"]) and any(c in row for c in COLS["ref"]):
            df.columns = row
            return df.iloc[i + 1:].reset_index(drop=True)
    raise ValueError(f"BOM header row not found in {path.name}")


def _col(df: pd.DataFrame, key: str) -> str:
    for c in COLS[key]:
        if c in df.columns:
            return c
    raise ValueError(f"BOM column for '{key}' not found; have {list(df.columns)}")


def _s(x) -> str:
    return "" if pd.isna(x) else str(x).strip()


def _qty(x: str) -> float | None:
    m = re.match(r"\s*([\d.]+)", x or "")
    return float(m.group(1)) if m else None


def _erp_cols(df: pd.DataFrame) -> tuple[str, ...]:
    return tuple(_col(df, k) for k in ("pn", "desc", "spec", "qty", "ref"))


def _flat_rows(path: Path) -> list[list[str]] | None:
    """Header-less rows for the OrCAD / flat parser: .BOM / .txt text report, real Excel, .csv, HTML table."""
    suf = path.suffix.lower()
    if suf in (".bom", ".txt"):
        return bom_orcad.text_rows(read_text(path))
    frame = _raw_frame(path)
    if frame is None:
        raw = path.read_bytes()
        if b"<table" in raw[:4000].lower():
            frame = max(pd.read_html(io.StringIO(_decode_html(raw)), header=None), key=len)
        elif suf == ".csv":
            import csv
            return [r for r in csv.reader(io.StringIO(read_text(path)))]
        else:
            return None
    return frame.fillna("").astype(str).values.tolist()


def sniff_bom(path: str | Path) -> str | None:
    """'Agile' / 'NVIDIA' / 'ERP' when one of the parsers recognises the file's header, else None. Used by
    loader.classify_report to tell a BOM from any other spreadsheet in a design kit (never raises)."""
    path = Path(path)
    try:
        frame = _raw_frame(path)
        if frame is not None:
            rows = frame.fillna("").astype(str).values.tolist()
            if bom_agile.find_header(rows) is not None:
                return "Agile"
            if bom_nvidia.find_header(rows) is not None:
                return "NVIDIA"
    except Exception:  # noqa: BLE001
        pass
    if path.suffix.lower() not in (".bom", ".txt"):
        try:
            _erp_cols(_read_table(path))
            return "ERP"
        except Exception:  # noqa: BLE001
            pass
    try:
        if path.suffix.lower() in (".bom", ".txt"):     # sniff the head only: a kit may hold big .txt logs
            with open(path, "rb") as f:
                head = f.read(65536)
            rows = bom_orcad.text_rows(head.decode("utf-8", errors="replace") if b"\0" not in head else "")
        else:
            rows = _flat_rows(path)
        if rows is not None and bom_orcad.find_header(rows) is not None:
            return "OrCAD"
    except Exception:  # noqa: BLE001
        pass
    return None


def parse_bom(path: str | Path) -> tuple[list[BomItem], list[tuple[str, str]]]:
    path = Path(path)
    frame = _raw_frame(path)
    if frame is not None:
        rows = frame.fillna("").astype(str).values.tolist()
        if bom_agile.find_header(rows) is not None:
            return bom_agile.parse_rows(rows)
        if bom_nvidia.find_header(rows) is not None:
            return bom_nvidia.parse_rows(rows)
    try:
        df = _read_table(path) if path.suffix.lower() not in (".bom", ".txt") else None
        cols = _erp_cols(df) if df is not None else None
    except ValueError:
        df = cols = None
    if cols is None:
        rows = _flat_rows(path)
        if rows is not None and bom_orcad.find_header(rows) is not None:
            return bom_orcad.parse_rows(rows)
        raise ValueError(f"BOM header not recognised in {path.name} (ERP / Agile / NVIDIA / OrCAD)")
    cpn, cdesc, cspec, cqty, cref = cols
    items: list[BomItem] = []
    problems: list[tuple[str, str]] = []
    stack: dict[int, BomItem] = {}  # depth -> last real item at that depth
    for i, r in df.iterrows():
        raw_pn = _s(r[cpn])
        if not raw_pn:
            continue
        depth = raw_pn.count("|")
        is_alt = "-S-" in raw_pn
        pn = re.split(r"-S-|---", raw_pn)[-1].strip()
        desc, spec = _s(r[cdesc]), _s(r[cspec])
        if is_alt:
            owner = stack.get(depth - 1)
            if owner is not None:
                owner.alternates.append((pn, desc, spec))
            continue
        refs = [x.strip() for x in re.split(r"[,\s;]+", _s(r[cref])) if x.strip()]
        parent = stack.get(depth - 1)
        it = BomItem(pn=pn, desc=desc, spec=spec, qty=_qty(_s(r[cqty])), refdes=refs, row=int(i) + 2)
        if parent is not None and not parent.refdes and depth >= 3:
            it.parent_pn = parent.pn
            it.parent_alternates = parent.alternates  # same list object, filled as parsed
        stack[depth] = it
        for d in [d for d in stack if d > depth]:
            del stack[d]
        items.append(it)
    # integrity
    seen: dict[str, BomItem] = {}
    for it in items:
        if it.refdes and it.qty is not None and abs(it.qty - len(it.refdes)) > 1e-6:
            problems.append(("BOM_QTY_MISMATCH",
                             f"{it.pn} qty {it.qty:g} but {len(it.refdes)} RefDes listed (row {it.row})"))
        for r in it.refdes:
            if r in seen:
                problems.append(("BOM_DUP_REFDES", f"{r} listed under {seen[r].pn} and {it.pn}"))
            seen[r] = it
    return items, problems


def load_bom(design: Design, path: str | Path) -> None:
    items, problems = parse_bom(path)
    design.bom_format = sniff_bom(path) or ""
    design.sources.append(SourceFile(role="bom", path=str(path), sha256=sha256_of(path)))
    design.bom_items = items
    design.bom = {r: it for it in items for r in it.refdes}
    design.bom_problems = problems
