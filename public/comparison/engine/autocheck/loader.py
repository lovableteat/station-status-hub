"""Locate input files inside a folder (or a list of files) and build a Design."""
from __future__ import annotations

from pathlib import Path

from .model import Design
from .parsers.allegro_pst import load_netlist
from .parsers.bom_erp import load_bom
from .parsers.dsn import load_dsn

BOM_EXT = {".xls", ".xlsx", ".htm", ".html", ".csv"}


def classify(paths: list[Path]) -> dict[str, Path]:
    found: dict[str, Path] = {}
    for p in paths:
        n = p.name.lower()
        if n.startswith("i2c_map_declared") and p.suffix.lower() == ".csv":
            found["i2c_declared"] = p     # transcribed I2C block diagram (owner signs it off); never the BOM
            continue
        for key in ("pstxnet", "pstxprt", "pstchip"):
            if key in n and n.endswith(".dat"):
                found[key] = p
        if p.suffix.lower() in BOM_EXT and "bom" not in found:
            found["bom"] = p
        if p.suffix.lower() == ".dsn":
            found["dsn"] = p
        if p.suffix.lower() == ".pdf" and not n.startswith("autocheck"):
            found["pdf"] = p          # schematic PDF (OrCAD export); our own reports are skipped
    return found


def files_in(folder: str | Path) -> list[Path]:
    return sorted(p for p in Path(folder).rglob("*") if p.is_file())


def build_design(label: str, files: dict[str, Path]) -> tuple[Design, list[str]]:
    d = Design(label=label)
    warnings: list[str] = []
    need = [k for k in ("pstxnet", "pstxprt", "pstchip") if k not in files]
    if need:
        raise FileNotFoundError(f"{label}: missing netlist file(s): {', '.join(need)}")
    warnings += load_netlist(d, files["pstxnet"], files["pstxprt"], files["pstchip"])
    if "bom" in files:
        load_bom(d, files["bom"])
    else:
        warnings.append(f"{label}: no BOM supplied; every part treated as stuffed")
    if "dsn" in files:
        warnings += load_dsn(d, files["dsn"])
    return d, [f"{label}: {w}" if not w.startswith(label) else w for w in warnings]
