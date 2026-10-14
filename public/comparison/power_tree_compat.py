"""Restore voltage presentation omitted by the 2026-10-14 engine bundle.

Keep the original engine files and voltage decisions intact. The adapter only
adds source, approximation and conflict text to the existing layout boxes, so
the SVG/HTML and Excel renderers share the same information.
"""
from __future__ import annotations

from functools import wraps
import math


_SOURCE_LABELS = {
    "名稱": "net 名稱", "腳名": "IC 腳名", "規格": "負載規格",
    "接頭": "接頭腳名", "繼承": "繼承",
}


def _voltage_text(value) -> str:
    if not isinstance(value, (int, float)) or not math.isfinite(value):
        return "?"
    return f"{value:.3f}".rstrip("0").rstrip(".") or "0"


def _vline(rail: dict) -> str:
    value = _voltage_text(rail.get("v"))
    source = str(rail.get("vsrc") or "")
    approximate = bool(rail.get("vapprox")) or source.startswith("≈")
    source = source.removeprefix("≈")
    line = f"{'≈' if approximate and value != '?' else ''}{value} V"
    if approximate and source == "diode":
        line += " (diode，未扣 Vf)"
    elif source and source != "名稱":
        line += f" ({_SOURCE_LABELS.get(source, source)})"
    return ("⚠ " if rail.get("vconflict") else "") + line


def _vhover(rail: dict) -> list[str]:
    groups: dict[tuple, list[str]] = {}
    for candidate in rail.get("vcands") or []:
        if not isinstance(candidate, dict):
            continue
        source = str(candidate.get("src") or "")
        voltage = _voltage_text(candidate.get("v"))
        groups.setdefault((source, voltage), []).append(str(candidate.get("detail") or ""))
    lines = []
    for (source, voltage), details in groups.items():
        count = f" ×{len(details)}" if len(details) > 1 else ""
        detail = details[0] + (" …" if len(details) > 1 else "")
        suffix = f" ({detail})" if detail else ""
        lines.append(f"電壓來源: {_SOURCE_LABELS.get(source, source)} {voltage} V{count}{suffix}")
    if not groups and rail.get("vsrc"):
        source = str(rail["vsrc"]).removeprefix("≈")
        lines.append(f"電壓來源: {_SOURCE_LABELS.get(source, source)}")
    if rail.get("vapprox") or str(rail.get("vsrc") or "").startswith("≈"):
        lines.append("diode 電壓為估算值，未扣 Vf" if str(rail.get("vsrc") or "").removeprefix("≈") == "diode" else "電壓為估算值")
    if rail.get("vconflict"):
        conflict = str(rail["vconflict"])
        lines.append(conflict if conflict.startswith("電壓來源不一致") else f"電壓來源不一致: {conflict}")
    return lines


def apply_power_tree_compat() -> None:
    from autocheck.report import power_tree_diagram as diagram

    if getattr(diagram.layout, "_autocheck_voltage_compat", False):
        return
    original_layout = diagram.layout

    @wraps(original_layout)
    def voltage_layout(*args, **kwargs):
        tree = args[0] if args else kwargs.get("pt", {})
        previous_tree = args[1] if len(args) > 1 else kwargs.get("pt_a")
        boxes = original_layout(*args, **kwargs)
        for box in boxes:
            old = box.kind == "removed"
            rails = ((previous_tree if old else tree) or {}).get("rails") or {}
            rail = rails.get(box.rail)
            if not isinstance(rail, dict):
                continue
            if not old and len(box.lines) > 1:
                box.lines[1] = _vline({**rail, "v": box.volt})
            details = _vhover(rail)
            if old and rail.get("v") is not None:
                a_label = args[2] if len(args) > 2 else kwargs.get("a_label", "A")
                details.insert(0, f"{a_label} 電壓: {_vline(rail)}")
            box.hover.extend(line for line in details if line not in box.hover)
        return boxes

    voltage_layout._autocheck_voltage_compat = True
    diagram._vline = _vline
    diagram._vhover = _vhover
    diagram.layout = voltage_layout


apply_power_tree_compat()
