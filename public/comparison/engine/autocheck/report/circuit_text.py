"""Per-IC connection text: the compact, LLM-readable representation used by phase 3
(datasheet / PDG review). One block per active part; for every pin: net and one-hop neighbours
with value and stuffing state. Large nets (rails, ground) are summarised instead of listed."""
from __future__ import annotations

import re

from ..checks.drc import present
from ..model import Design, natkey

BIG_NET = 10


def _prefix(r: str) -> str:
    m = re.match(r"[A-Za-z_]+", r)
    return m.group(0).upper() if m else ""


def circuit_text(d: Design, cfg: dict, prefixes=("U",)) -> str:
    lines = [f"# Circuit description: {d.label}",
             "# Format: pin <num> <name> | net <name> | neighbours <refdes.pin value [DNP]>",
             ""]
    for r in sorted((x for x in d.parts if _prefix(x) in prefixes), key=natkey):
        pr = d.prim(r)
        st = "stuffed" if present(d, r, cfg) else "DNP"
        bom = d.bom.get(r) if d.bom else None
        page = d.page_of(r)
        lines.append(f"## {r} {pr.value if pr else ''} [{st}] page {page} {d.page_title(page)}")
        if bom:
            lines.append(f"BOM: {bom.pn} {bom.desc} | {bom.spec}"
                         + (f" | alt: {', '.join(a[0] + ' ' + a[1] for a in bom.alternates)}" if bom.alternates else ""))
        connected = set()
        for k in d.pins_of(r):
            connected.add(k[1])
            net = d.pin_net[k]
            others = [p for p in d.nets[net] if p != k]
            if len(others) > BIG_NET:
                nb = f"{len(others)} other pins (rail/ground)"
            else:
                nb = ", ".join(f"{p[0]}.{p[1]} {d.value(p[0])}" + ("" if present(d, p[0], cfg) else " DNP")
                               for p in sorted(others, key=lambda p: natkey(p[0])))
            lines.append(f"pin {k[1]} {d.pin_name.get(k, '')} | net {net} | {nb or '-'}")
        if pr:
            nc = sorted(pr.all_pin_numbers() - connected, key=natkey)
            if nc:
                names = {n: nm for nm, nums in pr.pins.items() for n in nums}
                lines.append("unconnected: " + ", ".join(f"{n} {names.get(n, '')}" for n in nc))
        lines.append("")
    return "\n".join(lines)
