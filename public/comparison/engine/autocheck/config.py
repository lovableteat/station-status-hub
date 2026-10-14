from __future__ import annotations

import csv
import hashlib
from pathlib import Path

import yaml

DEFAULT = Path(__file__).resolve().parent.parent / "config" / "default.yaml"


def load_config(path: str | Path | None = None) -> dict:
    base = yaml.safe_load(DEFAULT.read_text(encoding="utf-8"))
    if path:
        user = yaml.safe_load(Path(path).read_text(encoding="utf-8")) or {}
        _merge(base, user)
    h = hashlib.sha1(yaml.safe_dump(base, sort_keys=True).encode())
    lib = (base.get("power_tree", {}) or {}).get("library")      # power_parts.yaml changes the tree's voltages
    if lib:
        lp = Path(lib) if Path(lib).is_absolute() else DEFAULT.parent / lib
        if lp.exists():
            h.update(lp.read_bytes())
    base["_hash"] = h.hexdigest()[:10]
    return base


def _merge(a: dict, b: dict) -> None:
    for k, v in b.items():
        if isinstance(v, dict) and isinstance(a.get(k), dict):
            _merge(a[k], v)
        else:
            a[k] = v


def load_rail_map(path: str | Path | None) -> dict[str, tuple[float, str]]:
    """CSV columns: net,voltage[,note]. Blank voltage rows are ignored (todo rows)."""
    out: dict[str, tuple[float, str]] = {}
    if not path or not Path(path).exists():
        return out
    with open(path, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            net = (row.get("net") or "").strip()
            v = (row.get("voltage") or "").strip()
            if net and v:
                out[net] = (float(v), (row.get("note") or "").strip())
    return out
