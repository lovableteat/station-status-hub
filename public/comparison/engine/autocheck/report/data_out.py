"""Machine-readable outputs: findings.json, cap table CSV, rail_map_todo.csv."""
from __future__ import annotations

import csv
import json
from pathlib import Path


def meta(res) -> dict:
    return {
        "tool_version": res.tool_version,
        "rules_version": res.cfg.get("rules_version"),
        "config_hash": res.cfg.get("_hash"),
        "generated": res.generated,
        "a": {"label": res.a.label, "sources": [vars(s) for s in res.a.sources]},
        "b": {"label": res.b.label, "sources": [vars(s) for s in res.b.sources]},
        "warnings": res.warnings,
    }


def write_json(res, path: Path) -> None:
    payload = {"meta": meta(res), "findings": [f.to_dict() for f in res.findings]}
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")


def write_csv(rows: list[dict], path: Path, fields: list[str] | None = None) -> None:
    fields = fields or (list(rows[0]) if rows else ["net", "voltage", "note"])
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)
