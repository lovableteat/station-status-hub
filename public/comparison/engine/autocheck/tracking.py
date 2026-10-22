"""Tracking rows: the unit that RDs disposition, that waivers key on, and that PDF destinations point at.

A Finding may group many parts (root-cause grouping). For tracking we expand it back to one row per
part (part-level rules), one row per pin (pin-level rules) or one row per net (net-level rules).

Each row carries a stable *key* that survives a netlist re-export:
  part level  RULE|RefDes            e.g. MLCC_DERATING|C693
  pin level   RULE|RefDes.pin        e.g. PIN_MOVED|C1140.2
  net level   RULE|<named net>       e.g. GROUND_ISLAND|AGND
              RULE|<pin list>        when the net is tool-named (N12345) or the rule is about pins moving
The group finding id (DRC-439F66 ...) is NOT part of the key: it changes whenever the group membership
changes. `dest_name(key)` turns a key into a PDF named destination / URL fragment.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from .findings import Finding

# rule -> tracking level. Rules not listed are part level.
RULE_LEVEL = {
    "GROUND_ISLAND": "net", "SINGLE_PIN_NET": "net", "AUTO_NET_NAME": "net", "SIMILAR_NET_NAMES": "net",
    "CAP_UNRESOLVED": "net", "NET_RENAMED": "net", "NET_SPLIT": "net", "NET_MERGED": "net",
    "PIN_MOVED": "pin", "PIN_DISCONNECTED": "pin", "PIN_CONNECTED": "pin",
    "STRAP_PU_PD_BOTH": "net", "OD_NO_PULLUP": "net", "OD_PULLUP_OFFBOARD": "net", "OD_PULLUP_STRONG": "net", "OD_PULLUP_UNKNOWN": "net",
    "PULLUP_OVERVOLT": "net", "PULLUP_BACKPOWER": "net",
    "I2C_PU_DUPLICATE": "net", "I2C_NO_PULLUP": "net",
    "DECOUPLE_MISSING": "net", "DECOUPLE_NO_SMALL": "net", "PULLUP_DOUBLE": "net",
}
_PIN_KEYED_NET_RULES = ("NET_SPLIT", "NET_MERGED", "AUTO_NET_NAME")
_KEY_AS_IS_RULES = ("FET_GATE_LEVEL",)          # part-level rules whose Finding.key already carries the pin
_AUTO_NET = re.compile(r"^N\d+$")


@dataclass
class TrackRow:
    key: str
    gid: str                 # group finding id (for cross-reference with the PDF report)
    category: str
    rule: str
    severity: str
    status: str
    page: int | None
    page_title: str
    refdes: list[str]        # parts to box on the schematic
    pins: list[str]
    nets: list[str]
    title: str
    detail: str
    related: list[str] = field(default_factory=list)

    @property
    def dest(self) -> str:
        return dest_name(self.key)


def dest_name(key: str) -> str:
    """PDF named destination / URL fragment: only [A-Za-z0-9._-], '|' -> '_'."""
    return re.sub(r"[^A-Za-z0-9._-]+", "_", key).strip("_")


def _rd(pin: str) -> str:
    return pin.rsplit(".", 1)[0]


def _detail_for(refdes: str, detail: str) -> str:
    """Pick the line of a grouped detail that belongs to one RefDes; drop the 'RefDes: ...' roster line."""
    lines = detail.split("\n")
    for s in (x.strip() for x in lines):
        if s.startswith(refdes + " ") or s.startswith(refdes + ":") or s.startswith(refdes + "."):
            return s
    return "\n".join(x for x in lines if not x.startswith("RefDes:"))


def _pins_from_detail(detail: str) -> list[str]:
    if "pins:" not in detail:
        return []
    seg = detail.split("pins:", 1)[1].split("\n")[0]
    out = [p.strip().split(" ")[0].rstrip(".;,") for p in seg.split(",") if p.strip()]
    return [p for p in out if "." in p]


def expand_rows(findings: list[Finding], cap_rows: list[dict] | None = None, design=None) -> list[TrackRow]:
    """design: the B-side Design, used to give each part-level row its own page (a grouped finding
    carries only the group's first page)."""
    cap = {r["refdes"]: r for r in (cap_rows or [])}
    rows: list[TrackRow] = []

    def page_of(refdes: str, default_page, default_title):
        if design is not None and refdes:
            p = design.page_of(refdes)
            if p:
                return p, design.page_title(p)
        return default_page, default_title

    for f in findings:
        level = RULE_LEVEL.get(f.rule, "part")
        base = dict(gid=f.id, category=f.category, rule=f.rule, severity=f.severity, status=f.status,
                    page=f.page, page_title=f.page_title, title=f.title, related=list(f.related))
        if level == "net":
            named = [n for n in f.nets if not _AUTO_NET.match(n)]
            pins = list(f.pins) or (_pins_from_detail(f.detail) if f.rule == "AUTO_NET_NAME" else [])
            by_pins = bool(pins) and (not named or f.rule in _PIN_KEYED_NET_RULES)
            tail = ",".join(sorted(pins)) if by_pins else (named[0] if named else ",".join(sorted(f.refdes)))
            # parts to box: pins' parts first, else every member part
            refs = sorted({_rd(p) for p in pins}) or list(f.refdes)
            rows.append(TrackRow(key=f"{f.rule}|{tail}", refdes=refs, pins=pins, nets=list(f.nets),
                                 detail=f.detail, **base))
        elif level == "pin":
            for p in f.pins or [""]:
                nets = ([f.evidence.get("A", ""), f.evidence.get("B", "")] if f.evidence else list(f.nets))
                pg, pt = page_of(_rd(p) if p else "", f.page, f.page_title)
                rows.append(TrackRow(key=f"{f.rule}|{p}", refdes=[_rd(p)] if p else [], pins=[p] if p else [],
                                     nets=[n for n in nets if n], detail=f.detail,
                                     **{**base, "page": pg, "page_title": pt}))
        elif f.rule in _KEY_AS_IS_RULES:
            # one row per finding, key = Finding.key (RULE|RefDes or RULE|RefDes.<pin> for each half of a dual FET):
            # the #n collision suffix would move with finding order (QA 2026-10-21 C1)
            r = f.refdes[0] if f.refdes else ""
            pg, pt = page_of(r, f.page, f.page_title)
            rows.append(TrackRow(key=f.key, refdes=list(f.refdes), pins=list(f.pins), nets=list(f.nets),
                                 detail=f.detail, **{**base, "page": pg, "page_title": pt}))
        else:
            refs = f.refdes or [""]
            for r in refs:
                pins = [p for p in f.pins if _rd(p) == r]
                nets = list(f.nets)
                detail = _detail_for(r, f.detail) if len(refs) > 1 else f.detail
                if f.category == "CAPV" and r in cap:
                    c = cap[r]
                    detail = (f"{c['value']} | {c['net1']} {c['v1'] or '?'} V / {c['net2']} {c['v2'] or '?'} V | "
                              f"rated {c['rated']} V, stress {c['stress'] or '?'} V, required {c.get('required') or '?'} V"
                              f" | {c['verdict']}")
                    nets = [c["net1"], c["net2"]]
                pg, pt = page_of(r, f.page, f.page_title)
                rows.append(TrackRow(key=f"{f.rule}|{r}", refdes=[r] if r else [], pins=pins, nets=nets,
                                     detail=detail, **{**base, "page": pg, "page_title": pt}))
    # keys must be unique: a part can legitimately hit the same rule twice only via different findings
    seen: dict[str, int] = {}
    for r in rows:
        if r.key in seen:
            seen[r.key] += 1
            r.key = f"{r.key}#{seen[r.key]}"
        else:
            seen[r.key] = 0
    sev = {"ERROR": 0, "WARN": 1, "INFO": 2}
    rows.sort(key=lambda r: (sev.get(r.severity, 9), 0 if r.status == "NEW" else 1, r.page or 999, r.key))
    return rows
