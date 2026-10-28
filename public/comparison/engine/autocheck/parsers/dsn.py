"""Minimal read-only access to an OrCAD Capture .DSN (OLE compound file).

Only three things are extracted, verified on CATANIA PDB EVT/DVT DSN (Capture 17.4):
  * page titles:  stream names under Views/<schematic>/Pages/<NN.Title>
  * change history text: text objects on pages whose title contains 'History'.
    Text in page streams is stored as <uint16 little-endian length><bytes><0x00>.
  * part instance properties (2026-10-22, CIS properties such as Optional / Part Number / Component_Name):
    the 'Library' stream holds the design string table = <uint32 count> then count x <uint16 len><bytes><0x00>;
    a placed part in a page stream carries <uint16 n> + n x (<uint32 name index> <uint32 value index>) into that
    table, followed by the 4-byte tag ff e4 5c 39, before its reference designator <uint16 len><RefDes><0x00>.
    Reverse-engineered, not a Cadence spec. Verified: Vera CPU TPM test kit (19/19 parts, Optional=NI exactly the
    6 parts printed 'NI' in the PDF) and CATANIA EVT / DVT (992 / 991 netlist parts all found; DVT Optional=NI 447
    parts = exactly the parts absent from the ERP BOM, I / N/A 476 = exactly the parts in it). Anything that does not
    parse is skipped, never guessed; the caller reports coverage.
Nothing here edits the DSN.
"""
from __future__ import annotations

import re
import struct
from pathlib import Path

from ..model import Design, SourceFile
from . import sha256_of

_TEMPLATE_WORDS = {"DATE", "VERSION", "CHANGE LIST", "REV", "DESCRIPTION", "PAGE"}


def _strings(buf: bytes) -> list[str]:
    out: list[str] = []
    i, n = 0, len(buf)
    while i < n - 3:
        ln = struct.unpack_from("<H", buf, i)[0]
        if 2 <= ln <= 1000 and i + 2 + ln < n and buf[i + 2 + ln] == 0:
            chunk = buf[i + 2:i + 2 + ln]
            if 0 not in chunk and all(c >= 0x20 or c in (9, 10, 13) for c in chunk):
                try:
                    s = chunk.decode("cp950")
                except UnicodeDecodeError:
                    s = None
                if s and sum(ch.isalnum() for ch in s) >= 2:
                    # multi-line text objects use CRLF; keep each line as its own entry
                    out.extend(x.strip() for x in s.replace("\r\n", "\n").split("\n") if x.strip())
                    i += 3 + ln
                    continue
        i += 1
    return out


_PROP_TAG = b"\xff\xe4\x5c\x39"
_REFDES = re.compile(rb"\x00([A-Za-z][A-Za-z0-9_\-]{0,40})\x00")


def _string_table(lib: bytes) -> list[str] | None:
    """Design string table of the 'Library' stream: the <uint32 count> whose count entries end at the stream end."""
    n = len(lib)
    for off in range(0, n - 4):
        cnt = struct.unpack_from("<I", lib, off)[0]
        if not 1 <= cnt <= 500000:
            continue
        i, out = off + 4, []
        for _ in range(cnt):
            if i + 2 > n:
                break
            ln = struct.unpack_from("<H", lib, i)[0]
            if i + 2 + ln >= n or lib[i + 2 + ln] != 0:
                break
            out.append(lib[i + 2:i + 2 + ln].decode("cp950", errors="replace"))
            i += 3 + ln
        else:
            if n - i < 64:
                return out
    return None


def _prop_block(buf: bytes, end: int, strs: list[str], lo: int = 0) -> list[tuple[int, int]] | None:
    """Nearest (name, value) index block closing with the property tag between `lo` (end of the previous placed
    part's RefDes) and `end`. Bounded by `lo` so a part without properties never inherits its neighbour's block.
    The block sits ~230 bytes before the RefDes (other records with the same 4 bytes lie in between: try each)."""
    hi = end
    lo = max(lo, end - 1500)
    while True:
        k = buf.rfind(_PROP_TAG, lo, hi)
        if k < 0:
            return None
        hi = k
        for cnt in range(1, 100):
            j = k - 8 * cnt - 2
            if j < lo:
                break
            if struct.unpack_from("<H", buf, j)[0] != cnt:
                continue
            pairs = [struct.unpack_from("<II", buf, j + 2 + 8 * t) for t in range(cnt)]
            if all(0 < a < len(strs) and b < len(strs) for a, b in pairs):
                return pairs


def read_part_props(path: str | Path, wanted: set[str] | None = None) -> dict[str, dict[str, str]]:
    """RefDes -> {property name: value} of every placed part found in the page streams ({} when unreadable).
    wanted: only these names (the netlist RefDes); the RefDes pattern also matches net labels / MPN strings."""
    import olefile

    try:
        ole = olefile.OleFileIO(str(path))
    except Exception:  # noqa: BLE001
        return {}
    out: dict[str, dict[str, str]] = {}
    with ole:
        if not ole.exists("Library"):
            return {}
        strs = _string_table(ole.openstream("Library").read())
        if not strs:
            return {}
        for entry in ole.listdir():
            if not (len(entry) >= 4 and entry[0] == "Views" and entry[2] == "Pages"):
                continue
            buf = ole.openstream(entry).read()
            prev_end = 0
            for m in _REFDES.finditer(buf):
                rd = m.group(1).decode("ascii")
                if wanted is not None and rd not in wanted:
                    continue
                if m.start() < 1 or struct.unpack_from("<H", buf, m.start() - 1)[0] != len(rd):
                    continue
                pairs = _prop_block(buf, m.start(), strs, prev_end)
                prev_end = m.end()
                if pairs:
                    out.setdefault(rd, {}).update({strs[a]: strs[b] for a, b in pairs})
    return out


def load_dsn(design: Design, path: str | Path) -> list[str]:
    import olefile

    warnings: list[str] = []
    path = Path(path)
    design.sources.append(SourceFile(role="dsn", path=str(path), sha256=sha256_of(path)))
    try:
        ole = olefile.OleFileIO(str(path))
    except Exception as e:  # noqa: BLE001
        return [f"DSN not readable as OLE compound file: {e}"]
    with ole:
        for entry in ole.listdir():
            if len(entry) >= 4 and entry[0] == "Views" and entry[2] == "Pages":
                title = entry[3].replace("\x02", "/")
                m = re.match(r"\s*(\d+)\s*[.\-_ ]\s*(.*)", title)
                if not m:
                    continue
                num, name = int(m.group(1)), m.group(2).strip()
                design.pages[num] = name
                if "history" in name.lower():
                    buf = ole.openstream(entry).read()
                    lines = [s for s in _strings(buf)
                             if s != title and s != name and s.upper() not in _TEMPLATE_WORDS
                             and not s.endswith("_Title_Block")]
                    design.change_history.append((f"{num:02d}.{name}", lines))
    if not design.pages:
        warnings.append("no schematic pages found in DSN")
    props = read_part_props(path, wanted=set(design.parts))
    design.dsn_props = {r: p for r, p in props.items() if r in design.parts}
    if design.parts and len(design.dsn_props) < len(design.parts):
        miss = sorted(set(design.parts) - set(design.dsn_props))
        warnings.append(f"DSN part properties found for {len(design.dsn_props)}/{len(design.parts)} netlist parts "
                        f"(missing e.g. {', '.join(miss[:5])}); NI from the DSN applies to the found ones only")
    return warnings
