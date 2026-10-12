"""Unified in-memory data model shared by all parsers, checks and renderers.

Primary keys (agreed design decisions, see CLAUDE.md):
  * Pin key = (RefDes, physical pin number), taken verbatim from pstxnet NODE_NAME.
    Rev-to-rev diff relies on RefDes being frozen between revisions (company rule).
  * Nets are NOT keyed by name. Nets are matched between revisions by pin-set overlap;
    the name is a secondary attribute. This is what makes renames / splits / merges
    detectable as a single root cause.
"""
from __future__ import annotations

from dataclasses import dataclass, field

PinKey = tuple[str, str]  # (refdes, pin_number)


@dataclass
class Primitive:
    name: str
    pins: dict[str, list[str]] = field(default_factory=dict)  # pin_name -> [pin numbers]
    props: dict[str, str] = field(default_factory=dict)       # VALUE, PART_NAME, JEDEC_TYPE ...

    @property
    def value(self) -> str:
        return self.props.get("VALUE", "")

    @property
    def jedec(self) -> str:
        return self.props.get("JEDEC_TYPE", "")

    @property
    def part_name(self) -> str:
        return self.props.get("PART_NAME", "")

    def all_pin_numbers(self) -> set[str]:
        return {n for nums in self.pins.values() for n in nums}


@dataclass
class Part:
    refdes: str
    primitive: str
    pages: list[int] = field(default_factory=list)  # schematic page numbers from P_PATH

    @property
    def page(self) -> int | None:
        return self.pages[0] if self.pages else None


@dataclass
class BomItem:
    pn: str
    desc: str
    spec: str
    qty: float | None
    refdes: list[str]
    alternates: list[tuple[str, str, str]] = field(default_factory=list)  # (pn, desc, spec)
    parent_pn: str | None = None            # sub-assembly this item sits under, if any
    parent_alternates: list[tuple[str, str, str]] = field(default_factory=list)
    row: int = 0                            # source row in the BOM file (traceability)


@dataclass
class SourceFile:
    role: str          # pstxnet / pstxprt / pstchip / bom / dsn
    path: str
    sha256: str
    stamp: str = ""    # e.g. PSTWRITER timestamp line


@dataclass
class Design:
    label: str
    parts: dict[str, Part] = field(default_factory=dict)
    primitives: dict[str, Primitive] = field(default_factory=dict)
    nets: dict[str, list[PinKey]] = field(default_factory=dict)
    pin_net: dict[PinKey, str] = field(default_factory=dict)
    pin_name: dict[PinKey, str] = field(default_factory=dict)
    bom_items: list[BomItem] = field(default_factory=list)
    bom: dict[str, BomItem] | None = None    # refdes -> item; None means "no BOM supplied"
    bom_problems: list[tuple[str, str]] = field(default_factory=list)  # (rule, detail)
    pages: dict[int, str] = field(default_factory=dict)               # page number -> title
    change_history: list[tuple[str, list[str]]] = field(default_factory=list)  # (page title, lines)
    sources: list[SourceFile] = field(default_factory=list)

    # ---- convenience -------------------------------------------------
    def prim(self, refdes: str) -> Primitive | None:
        p = self.parts.get(refdes)
        return self.primitives.get(p.primitive) if p else None

    def value(self, refdes: str) -> str:
        pr = self.prim(refdes)
        return pr.value if pr else ""

    def stuffed(self, refdes: str) -> bool:
        """Company rule: a part not present in the BOM is DNP / DNI / NI."""
        if self.bom is None:
            return True
        return refdes in self.bom

    def pins_of(self, refdes: str) -> list[PinKey]:
        return sorted((k for k in self.pin_net if k[0] == refdes), key=lambda k: _natkey(k[1]))

    def page_title(self, page: int | None) -> str:
        if page is None:
            return ""
        return self.pages.get(page, "")

    def page_of(self, refdes: str) -> int | None:
        p = self.parts.get(refdes)
        return p.page if p else None


def _natkey(s: str):
    import re
    return [int(t) if t.isdigit() else t for t in re.split(r"(\d+)", s)]


def natkey(s: str):
    return _natkey(s)
