"""I2C address library maintenance (owner 2026-10-12): datasheet PDF -> candidate rule -> RD check -> signed entry.

Flow (owner choice A + 甲):
  1. RD drops the datasheet PDF into AutoCheck/datasheets (file name = MPN; NDA / pre-release parts welcome,
     nothing leaves the PC).
  2. draft_from_pdf() finds the pages that talk about the address pins, pulls every row that pairs pin states with
     a 7-bit address (pdfplumber tables + text lines), and builds a CANDIDATE entry. It never decides alone:
     datasheet tables differ too much, and a wrong address is worse than no address.
  3. RD compares the candidate with the PDF page shown next to it, edits it, signs it (accept_entry):
     validate_entry() refuses anything malformed; the entry goes to config/i2c_devices_user.yaml with
     src = "<pdf> p.<n>", signed_by, signed_date. Only signed entries count as verified.
Pure library: the CLI (autocheck i2c-draft / i2c-accept) and the UI page are thin shells over this module.
"""
from __future__ import annotations

import datetime as dt
import re
from collections import Counter
from pathlib import Path

import yaml

STATES = ("0", "1", "Z", "SDA", "SCL")

# datasheet wording -> strap state (upper-cased, spaces collapsed). Resistor-programmed states (150k to GND, ...)
# are deliberately absent: those parts need the resistor-value support that is not built yet.
STATE_WORDS = {
    "GND": "0", "AGND": "0", "DGND": "0", "VSS": "0", "L": "0", "LOW": "0", "0": "0",
    "VS": "1", "VS+": "1", "V+": "1", "VDD": "1", "VCC": "1", "VIO": "1", "INTVCC": "1", "H": "1", "HIGH": "1", "1": "1",
    "SDA": "SDA", "SCL": "SCL",
    "NC": "Z", "N/C": "Z", "FLOAT": "Z", "FLOATING": "Z", "OPEN": "Z", "Z": "Z", "HIGH-Z": "Z", "HI-Z": "Z",
}
# address pin names seen in datasheets (header cells / text). Full match, upper case.
PIN_RX = re.compile(r"^(A[0-7]|E[0-2]|ADR[0-7]?|ADDR[0-7]?|AD[0-7]|ADD|ADDR_?SEL|SA[0-2])$")
PAGE_RX = re.compile(r"(slave|target|secondary|device|bus|i2c|pmbus|smbus)\s+address|address\s+(pins?|select|decode|"
                     r"reference)|ADR[0-2]|ADDR|A2\s+A1\s+A0", re.I)
HEX_RX = re.compile(r"(?:0x|0X)([0-9A-Fa-f]{2})\b|\b([0-9A-Fa-f]{2})h\b|\b([0-9A-Fa-f]{2})\s*\(hex")
BIN7_RX = re.compile(r"(?<![01])([01]{7})(?![01])")


def _addr_of(cells: list[str]) -> tuple[int | None, str]:
    """(7-bit address, how it was read) from a row. Binary 7-bit wins (TI prints it), else hex."""
    txt = " ".join(cells)
    b = BIN7_RX.search(txt)
    if b:
        return int(b.group(1), 2), "bin7"
    h = HEX_RX.search(txt)
    if h:
        return int(next(g for g in h.groups() if g), 16), "hex"
    return None, ""


def _states_of(cells: list[str]) -> list[str]:
    out = []
    for c in cells:
        w = re.sub(r"\s+", " ", (c or "").strip().upper())
        if w in STATE_WORDS:
            out.append(STATE_WORDS[w])
    return out


def _rows_from_page(page) -> tuple[list[tuple[list[str], list[str]]], list[list[str]]]:
    """(table hits, all rows). A ruled table whose header names the address pins is read by column, so an index
    column ("0", "1", ...) or a bit column can never be taken for a pin state. Text lines are the fallback."""
    hits: list[tuple[list[str], list[str]]] = []      # (states, raw cells)
    rows: list[list[str]] = []
    try:
        tables = page.extract_tables() or []
    except Exception:            # pdfplumber table finder can choke on odd vector art; text lines still work
        tables = []
    for t in tables:
        t = [[(c or "").strip() for c in r] for r in t if r]
        rows += t
        cols, head_i = [], -1
        for i, r in enumerate(t[:3]):
            cols = [j for j, c in enumerate(r) if PIN_RX.fullmatch(c.upper() or "-")]
            if cols:
                head_i = i
                break
        if not cols:
            continue
        for r in t[head_i + 1:]:
            st = _states_of([r[j] if j < len(r) else "" for j in cols])
            if len(st) == len(cols):
                hits.append((st, r))
    for line in (page.extract_text() or "").splitlines():
        rows.append(line.split())
    return hits, rows


def _pin_header(rows: list[list[str]]) -> list[str]:
    """Most common sequence of address-pin names in one row (e.g. ['A2','A1','A0'])."""
    seqs = Counter()
    for r in rows:
        names = [c.strip().upper() for c in r if PIN_RX.fullmatch(c.strip().upper() or "-")]
        if len(names) >= 1 and len(set(names)) == len(names):
            seqs[tuple(names)] += 1
    if not seqs:
        return []
    best = max(seqs.items(), key=lambda t: (t[1], len(t[0])))
    return list(best[0])


def draft_from_pdf(pdf: str | Path, name: str = "", mpn: str = "") -> dict:
    """Candidate library entry from a datasheet PDF. Returns
    {"entry": dict, "pages": [page numbers 1-based], "rows": [(page, states, addr, raw)], "notes": [...]}."""
    import pdfplumber

    pdf = Path(pdf)
    stem = re.sub(r"[^A-Za-z0-9]", "", pdf.stem).upper()
    core = re.search(r"[A-Z]{2,}\d{3,}", stem)            # MP5926GF -> MP5926: order-code suffixes vary (GF / GQV)
    notes: list[str] = []
    found: list[tuple[int, list[str], int, str]] = []
    pages: list[int] = []
    header: list[str] = []
    with pdfplumber.open(str(pdf)) as doc:
        for i, page in enumerate(doc.pages, 1):
            text = page.extract_text() or ""
            if not PAGE_RX.search(text):
                continue
            thits, rows = _rows_from_page(page)
            hits = []
            for st, r in thits:
                a, _ = _addr_of(r)
                if a is not None:
                    hits.append((i, st, a, " | ".join(r)))
            if not hits:                                  # no ruled table with pin columns: read text lines
                for r in rows:
                    st = _states_of(r)
                    a, _ = _addr_of(r)
                    if st and a is not None:
                        hits.append((i, st, a, " | ".join(r)))
            if hits:
                pages.append(i)
                found += hits
                header = header or _pin_header(rows)
    if not found:
        notes.append("沒找到「狀態 + 位址」成對的列：位址可能是電阻設定 (查電阻表) 或表格是圖片，請照 PDF 手填。")
    # the table = rows whose state count is the most common one (drops prose lines that happen to hold a hex number)
    arity = Counter(len(s) for _, s, _, _ in found).most_common(1)[0][0] if found else 0
    table: dict[str, int] = {}
    conflicts = []
    for pg, st, a, raw in found:
        if len(st) != arity:
            continue
        k = " ".join(st)
        if k in table and table[k] != a:
            conflicts.append(f"{k}: 0x{table[k]:02X} vs 0x{a:02X} (p.{pg})")
            continue
        table.setdefault(k, a)
    if conflicts:
        notes.append("同一組狀態讀到不同位址，請對 PDF：" + "; ".join(conflicts))
    if table and max(table.values()) > 0x77 and all(v % 2 == 0 for v in table.values()):
        notes.append("位址全是偶數且大於 0x77：datasheet 印的可能是 8-bit (含 R/W)，已除以 2，請確認。")
        table = {k: v >> 1 for k, v in table.items()}
    if not header or len(header) != arity:
        if arity:
            notes.append(f"抓不到位址腳名 (或數量跟狀態欄 {arity} 不同)，先填 PIN{arity - 1}..PIN0，請改成 symbol 上的腳名 (MSB 在前)。")
        header = [f"PIN{arity - 1 - j}" for j in range(arity)]
    entry = {
        "name": name or pdf.stem,
        "mpn": mpn or (rf"(?<![A-Z0-9]){core.group(0)}(?![0-9])" if core else ""),
        "addr_pins": header,
        "float_ok": any("Z" in k.split() for k in table),
        "fmax_khz": None,
        "src": f"{pdf.name} p.{','.join(str(p) for p in pages) or '?'}",
        "table": {k: f"0x{v:02X}" for k, v in sorted(table.items(), key=lambda t: t[1])},
        "verified": False,
    }
    return {"entry": entry, "pages": pages, "rows": found, "notes": notes}


def page_text(pdf: str | Path, page: int, limit: int = 6000) -> str:
    """Plain text of one page, for showing next to the candidate."""
    import pdfplumber
    with pdfplumber.open(str(pdf)) as doc:
        if 1 <= page <= len(doc.pages):
            return (doc.pages[page - 1].extract_text() or "")[:limit]
    return ""


def _hex(v) -> int:
    if isinstance(v, int):
        return v
    s = str(v).strip()
    return int(s, 16) if s.lower().startswith("0x") else int(s)


def validate_entry(e: dict, existing: list[dict] | None = None) -> tuple[list[str], list[str]]:
    """(errors, warnings). Errors block signing."""
    err, warn = [], []
    for k in ("name", "mpn", "src"):
        if not str(e.get(k) or "").strip():
            err.append(f"缺 {k}")
    try:
        rx = re.compile(str(e.get("mpn") or ""), re.I)
        if len(str(e.get("mpn") or "")) < 4:
            err.append("mpn 太短，會誤抓別的料")
    except re.error as x:
        err.append(f"mpn 不是合法 regex: {x}")
        rx = None
    kind = str(e.get("kind") or "device")
    if kind not in ("device", "mux", "buffer"):
        err.append(f"kind 只能 device / mux / buffer，現在是 {kind}")
    pins = e.get("addr_pins") or []
    if not isinstance(pins, list):
        err.append("addr_pins 要是清單，例 [A2, A1, A0]")
        pins = []
    for p in pins:
        names = [p] if isinstance(p, str) else list(p) if isinstance(p, list) else [p]
        for nm in names:
            if not isinstance(nm, str) or not nm.strip():
                err.append(f"位址腳名不能空白 ({nm!r})")
            elif re.fullmatch(r"PIN\d+", nm):
                err.append(f"位址腳名 {nm} 還是佔位名，請改成 symbol 上的腳名")
    fa = e.get("float_as")
    if fa not in (None, "") and str(fa) not in ("0", "1"):
        err.append(f"float_as 只能 0 或 1，現在是 {fa!r}")
    has = [k for k in ("fixed", "base", "table") if e.get(k) not in (None, {}, "")]
    if kind != "buffer" and len(has) != 1:
        err.append("fixed / base / table 要剛好填一個")
    used: dict[int, str] = {}
    try:
        if e.get("fixed") not in (None, ""):
            used[_hex(e["fixed"])] = "fixed"
            if pins:
                err.append("fixed 位址的料不該有 addr_pins")
        if e.get("base") not in (None, ""):
            b = _hex(e["base"])
            for v in range(2 ** len(pins)):
                used[b + v] = f"{v:0{len(pins)}b}"
            if not pins:
                err.append("base 要配 addr_pins")
        tab = e.get("table") or {}
        if tab and not isinstance(tab, dict):
            err.append("table 要是 狀態 -> 位址 的對照")
            tab = {}
        for k, v in tab.items():
            st = str(k).split()
            if len(st) != len(pins):
                err.append(f"table 列 '{k}' 有 {len(st)} 個狀態，addr_pins 有 {len(pins)} 支")
            bad = [s for s in st if s not in STATES]
            if bad:
                err.append(f"table 列 '{k}' 有不認得的狀態 {bad} (只能 {' / '.join(STATES)})")
            a = _hex(v)
            if a in used:
                err.append(f"位址 0x{a:02X} 重複 ('{used[a]}' 和 '{k}')")
            used[a] = str(k)
            if "Z" in st and not e.get("float_ok"):
                err.append(f"table 有浮接狀態 '{k}'，float_ok 要設 true")
    except (ValueError, TypeError) as x:
        err.append(f"位址格式錯 (用 0x4C 這種寫法): {x}")
    for a in used:
        if not 0 <= a <= 0x7F:
            err.append(f"位址 0x{a:02X} 超過 7-bit")
        elif a <= 0x07 or a >= 0x78:
            warn.append(f"位址 0x{a:02X} 在 I2C 保留區 (0x00-0x07 / 0x78-0x7F)，確認是 7-bit 不是 8-bit")
    tab = e.get("table") or {}
    if isinstance(tab, dict) and tab and pins and all(set(str(k).split()) <= {"0", "1"} for k in tab):
        if len(tab) < 2 ** len(pins):
            warn.append(f"table 只有 {len(tab)} 列，{len(pins)} 支腳 0/1 共 {2 ** len(pins)} 種：缺的組合工具會報解不出來；"
                        "若是 base + 二進位，改填 base 比較乾淨")
    if kind == "mux" and not (e.get("channel_sda") and e.get("channel_scl")):
        err.append("mux 要填 channel_sda / channel_scl")
    if kind == "buffer" and not (e.get("side_sda") and e.get("side_scl")):
        err.append("buffer 要填 side_sda / side_scl")
    if rx is not None:
        # a user entry is searched before the built-in library: a loose regex would capture every I2C part on the board
        for probe in ("0603-01RS000 GENERIC IC ABC1234-XYZ", "0000-00000 RES 10K 1% 0402", "TEMP_SENSOR", "EEPROM 2Kb"):
            if rx.search(probe):
                err.append(f"mpn regex 太寬，連 '{probe}' 都符合")
                break
        targets = [str(e.get("name") or ""), str(e.get("src") or "").split(" ", 1)[0]]
        if not any(rx.search(t) for t in targets if t):
            warn.append("mpn regex 連庫名稱 / PDF 檔名都不符合，確認 BOM 上的料號真的會被抓到")
    if rx is not None and existing:
        for o in existing:
            if str(o.get("name")) == str(e.get("name")):
                warn.append(f"使用者庫已有同名 '{o.get('name')}'，簽核會取代舊的")
    return err, warn


def load_user(path: str | Path) -> list[dict]:
    p = Path(path)
    if not p.is_file():
        return []
    try:
        doc = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
    except yaml.YAMLError:
        return []
    items = doc.get("devices") if isinstance(doc, dict) else None
    return [x for x in items if isinstance(x, dict)] if isinstance(items, list) else []


def accept_entry(e: dict, signed_by: str, path: str | Path, today: str | None = None) -> dict:
    """Validate, stamp signature, write into the user library (same name replaced). Raises ValueError on errors."""
    if not str(signed_by or "").strip():
        raise ValueError("缺簽核人")
    cur = load_user(path)
    p = Path(path)
    doc = {}
    if p.is_file():
        try:
            doc = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
        except yaml.YAMLError as x:
            raise ValueError(f"{p.name} 不是合法 yaml，先修好再簽核：{x}")
        if not isinstance(doc, dict):
            raise ValueError(f"{p.name} 最上層要是 devices: [...]")
    err, _ = validate_entry(e, cur)
    if err:
        raise ValueError("；".join(err))
    out = {k: v for k, v in e.items() if v not in (None, "") and k != "verified"}
    for k in ("fixed", "base"):                 # stored as "0x4C" text: RD reads hex, the loader accepts both
        if k in out:
            out[k] = f"0x{_hex(out[k]):02X}"
    if out.get("table"):
        out["table"] = {str(k): f"0x{_hex(v):02X}" for k, v in out["table"].items()}
    out["signed_by"] = signed_by.strip()
    out["signed_date"] = today or dt.date.today().isoformat()
    cur = [o for o in cur if not isinstance(o, dict) or str(o.get("name")) != str(out["name"])] + [out]
    head = ""
    if p.is_file():                       # keep the leading comment header and any other top-level keys
        lines = p.read_text(encoding="utf-8").splitlines(True)
        for ln in lines:
            if not ln.startswith("#"):
                break
            head += ln
    doc["devices"] = cur
    body = yaml.safe_dump(doc, allow_unicode=True, sort_keys=False, width=200)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(head + body, encoding="utf-8")
    return out


def entry_yaml(e: dict) -> str:
    return yaml.safe_dump(e, allow_unicode=True, sort_keys=False, width=200)
