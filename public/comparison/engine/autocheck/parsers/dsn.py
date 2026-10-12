"""Minimal read-only access to an OrCAD Capture .DSN (OLE compound file).

Only two things are extracted, both verified on CATANIA PDB EVT/DVT DSN (Capture 17.4):
  * page titles:  stream names under Views/<schematic>/Pages/<NN.Title>
  * change history text: text objects on pages whose title contains 'History'.
    Text in page streams is stored as <uint16 little-endian length><bytes><0x00>.
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
    return warnings
