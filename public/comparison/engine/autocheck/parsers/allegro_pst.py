"""Parser for the Allegro/OrCAD Capture "pst" netlist trio (PSTWRITER output):

  pstxnet.dat  FILE_TYPE = EXPANDEDNETLIST  -> nets and their (refdes, pin) nodes
  pstxprt.dat  FILE_TYPE = EXPANDEDPARTLIST -> refdes -> primitive, schematic page (P_PATH)
  pstchip.dat  FILE_TYPE = LIBRARY_PARTS    -> primitive -> pins / VALUE / JEDEC_TYPE

Format verified against PSTWRITER 17.4.0 output (CATANIA PDB EVT/DVT, 2026-10) and Packager-XL
(Design Entry HDL / Concept, NVIDIA Vera CPU module p5032_a01, 2026-10-21). Concept differences handled here:
  * PART_NAME line carries properties between ':' and ';' (REUSE_INSTANCE= ...), OrCAD writes ': ;'.
  * PIN_NUMBER is a per-section vector '(0,0,A3,0,0,0)': '0' = not in that section. Zeros are dropped and the
    remaining numbers de-duplicated (a shared GND pin is listed once per section); section index is not kept
    because nothing downstream uses it (OrCAD '(1,4)' was always flattened the same way).
  * long property values wrap with '~' + newline (P_PATH, REUSE_INSTANCE); joined before any regex runs.
  * Page numbers of a hierarchical Concept design are UNVERIFIED (P_PATH top page vs sub-design PHYS_PAGE);
    only the top-level pageNN of P_PATH is taken, as for OrCAD.
"""
from __future__ import annotations

import re
from pathlib import Path

from ..model import Design, Part, Primitive, SourceFile
from . import read_text, sha256_of

_STAMP = re.compile(r"\{\s*(?:Using PSTWRITER|Packager-XL run on)[^}]*\}")


def _norm(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    return text.replace("~\n", "") if "~\n" in text else text   # Concept line continuation


def _stamp(text: str) -> str:
    m = _STAMP.search(text[:400])
    return m.group(0).strip("{} ") if m else ""


# ---------------------------------------------------------------- pstchip
_PRIM = re.compile(r"^primitive\s+'((?:[^']|'')*)';\s*$(.*?)^end_primitive;", re.M | re.S)
_PIN = re.compile(r"^\s*'((?:[^']|'')*)':\s*\n\s*PIN_NUMBER='\(([^)]*)\)';", re.M)
_PROP = re.compile(r"^\s*([A-Z_][A-Z0-9_]*)='((?:[^']|'')*)';", re.M)


def parse_pstchip(text: str) -> dict[str, Primitive]:
    out: dict[str, Primitive] = {}
    for m in _PRIM.finditer(_norm(text)):
        name, body = m.group(1).replace("''", "'"), m.group(2)
        prim = Primitive(name=name)
        pin_sec, _, body_sec = body.partition("end_pin;")
        for pm in _PIN.finditer(pin_sec):
            nums = [n.strip() for n in pm.group(2).split(",") if n.strip()]
            if len(nums) > 1:                           # section vector: Concept '0' = absent in that section;
                seen: list[str] = []                    # a pin shared by every section ('(3,3)', GND of a dual
                for n in nums:                          # buffer) is listed once per section -> keep it once
                    if n != "0" and n not in seen:
                        seen.append(n)
                nums = seen or ["0"]
            prim.pins[pm.group(1).replace("''", "'")] = nums
        body_sec = body_sec.split("end_body;")[0]
        for bm in _PROP.finditer(body_sec):
            prim.props[bm.group(1)] = bm.group(2).replace("''", "'")
        out[name] = prim
    return out


# ---------------------------------------------------------------- pstxprt
_PART = re.compile(r"^PART_NAME\s*\n\s*(\S+)\s+'((?:[^']|'')*)'\s*:", re.M)   # OrCAD ': ;' / Concept ': props ;'
_PAGE = re.compile(r"P_PATH='[^']*?:page(\d+)_", re.I)
_PPROP = re.compile(r"^\s*([A-Z_][A-Z0-9_]*)='((?:[^']|'')*)'[,;]", re.M)   # NV_PN='032-0561-000', (G0 2026-10-22)


def parse_pstxprt(text: str) -> dict[str, Part]:
    text = _norm(text)
    parts: dict[str, Part] = {}
    matches = list(_PART.finditer(text))
    for i, m in enumerate(matches):
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        block = text[m.end():end]
        pages = []
        for pg in _PAGE.findall(block):
            n = int(pg)
            if n not in pages:
                pages.append(n)
        refdes = m.group(1)
        props: dict[str, str] = {}
        for pm in _PPROP.finditer(block):      # first section wins (a property repeated per section is the same)
            props.setdefault(pm.group(1), pm.group(2).replace("''", "'"))
        parts[refdes] = Part(refdes=refdes, primitive=m.group(2).replace("''", "'"), pages=pages, props=props)
    return parts


# ---------------------------------------------------------------- pstxnet
_NET = re.compile(r"^NET_NAME\s*\n'((?:[^']|'')*)'", re.M)
_NODE = re.compile(r"^NODE_NAME\s+(\S+)\s+(\S+)\s*\n[^\n]*\n\s*'((?:[^']|'')*)'\s*:", re.M)


def parse_pstxnet(text: str):
    text = _norm(text)
    nets: dict[str, list] = {}
    pin_net: dict = {}
    pin_name: dict = {}
    dup: list[tuple] = []
    heads = list(_NET.finditer(text))
    for i, h in enumerate(heads):
        end = heads[i + 1].start() if i + 1 < len(heads) else len(text)
        name = h.group(1).replace("''", "'")
        nodes = nets.setdefault(name, [])
        for nm in _NODE.finditer(text, h.end(), end):
            key = (nm.group(1), nm.group(2))
            if key in pin_net and pin_net[key] != name:
                dup.append((key, pin_net[key], name))
            nodes.append(key)
            pin_net[key] = name
            pin_name[key] = nm.group(3).replace("''", "'")
    return nets, pin_net, pin_name, dup


# ---------------------------------------------------------------- loader
def load_netlist(design: Design, pstxnet: str | Path, pstxprt: str | Path, pstchip: str | Path) -> list[str]:
    """Fill design with netlist data. Returns a list of parser warnings."""
    warnings: list[str] = []
    for role, p in (("pstxnet", pstxnet), ("pstxprt", pstxprt), ("pstchip", pstchip)):
        t = read_text(p)
        design.sources.append(SourceFile(role=role, path=str(p), sha256=sha256_of(p), stamp=_stamp(t)))
        if role == "pstxnet":
            design.nets, design.pin_net, design.pin_name, dup = parse_pstxnet(t)
            for key, a, b in dup:
                warnings.append(f"pin {key[0]}.{key[1]} appears on two nets: {a} / {b}")
        elif role == "pstxprt":
            design.parts = parse_pstxprt(t)
        else:
            design.primitives = parse_pstchip(t)

    missing_prim = sorted({p.primitive for p in design.parts.values()} - set(design.primitives))
    for mp in missing_prim:
        warnings.append(f"primitive referenced in pstxprt but missing in pstchip: {mp}")
    orphan = sorted({k[0] for k in design.pin_net} - set(design.parts))
    for r in orphan:
        warnings.append(f"refdes on a net but not in pstxprt: {r}")
    if not design.nets or not design.parts or not design.primitives:
        warnings.append("one of the netlist files parsed to zero records; check the file type")
    return warnings
