"""Orchestration: inputs -> designs -> checks -> grouping -> Result. No rendering here."""
from __future__ import annotations

import datetime as _dt
from dataclasses import dataclass, field
from pathlib import Path

from . import __version__
from .checks.capv import cap_check
from .checks.diff import diff_designs
from .checks.drc import bom_checks, drc, tag_new
from .checks.netrules import NetGraph, domain_rows, load_rail_domain, netrules
from .checks.i2c_map import i2c_map, load_declared, mark_changes
from .checks.power_tree import power_tree
from .config import load_config, load_rail_map
from .findings import Finding, sort_findings
from .grouping import cross_reference, group_findings, page_overview
from .bom_socket import resolve as resolve_bom_tokens
from .loader import build_design
from .model import Design


@dataclass
class Result:
    a: Design
    b: Design
    cfg: dict
    findings: list[Finding]
    cap_rows: list[dict]
    rail_todo: list[dict]
    warnings: list[str]
    input_issues: list[tuple[str, str]] = field(default_factory=list)   # (level, message)
    overview: list[dict] = field(default_factory=list)
    folders: dict = field(default_factory=dict)
    files: dict = field(default_factory=dict)          # {"a": {...}, "b": {...}} input paths by role
    power_tree: dict = field(default_factory=dict)      # B1 on B: {"rows", "orphans", "edges", "rails"}
    power_tree_a: dict = field(default_factory=dict)    # same on A, only for the diagram's change colours
    rail_domain: list[dict] = field(default_factory=list)   # A3 rail table (guesses + user rows) for B
    i2c_map: dict = field(default_factory=dict)         # I2C map on B (+ "declared" comparison rows)
    i2c_map_a: dict = field(default_factory=dict)       # same on A, only for the change column / colours
    publish_url: str = ""                               # http URL of the annotated PDF (set by write_outputs)
    run_tag: str = ""                                   # "<A>_vs_<B>", key of the review DB run (set by write_outputs)
    generated: str = field(default_factory=lambda: _dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    tool_version: str = __version__


def input_issues(d: Design) -> list[tuple[str, str]]:
    out = []
    if d.bom is None:
        out.append(("ERROR", f"{d.label}: no BOM found. DNP rule disabled (every part treated as stuffed), "
                             "BOM checks skipped, capacitor results include DNP parts. Point the folder at the "
                             "revision root that contains the BOM."))
    if not d.pages:
        out.append(("WARN", f"{d.label}: no DSN found. No page titles and no change history in the report."))
    return out


def run(a_files: dict[str, Path], b_files: dict[str, Path], a_label: str = "A", b_label: str = "B",
        config: str | Path | None = None, rail_map: str | Path | None = None,
        rail_domain: str | Path | None = None, i2c_declared: str | Path | None = None,
        datasheets_dir: str | Path | None = None) -> Result:
    cfg = load_config(config)
    if datasheets_dir:  # UI 區塊 C / CLI --datasheets: where I2C datasheet PDFs live (overrides config i2c.datasheets_dir)
        cfg.setdefault("i2c", {})
        cfg["i2c"] = dict(cfg["i2c"] or {}, datasheets_dir=str(Path(datasheets_dir)))
    rmap = load_rail_map(rail_map)
    a, wa = build_design(a_label, a_files)
    b, wb = build_design(b_label, b_files)
    resolve_bom_tokens(a, cfg)   # BOM "FOR J2" style entries -> netlist RefDes (no-op for plain BOMs)
    resolve_bom_tokens(b, cfg)

    findings = diff_designs(a, b, cfg)
    # single-design checks on B, tagged NEW / EXISTING against the same checks on A
    cap_b, rows, todo = cap_check(b, cfg, rmap)
    cap_a, _, _ = cap_check(a, cfg, rmap)
    findings += tag_new(drc(b, cfg) + bom_checks(b, cfg) + cap_b, drc(a, cfg) + bom_checks(a, cfg) + cap_a)
    # netlist rules from pin names (A1 / A2 / A3) and the B1 power tree. A failure here must not cost the
    # report of everything else: it becomes a warning.
    extra_warn: list[str] = []
    ptree, drows, ptree_a, ga, gb = {}, [], {}, None, None
    try:
        doms = load_rail_domain(rail_domain)
    except Exception as e:  # noqa: BLE001
        doms = {}
        extra_warn.append(f"rail_domain file not read, domains guessed ({type(e).__name__}: {e})")
    try:
        gb = NetGraph(b, cfg, rmap)
        new_rules = netrules(b, cfg, domains=doms, graph=gb)
        try:
            ga = NetGraph(a, cfg, rmap)
            old_rules = netrules(a, cfg, domains=doms, graph=ga)
        except Exception as e:  # noqa: BLE001
            old_rules = []
            extra_warn.append(f"netlist rules on {a.label} failed, every {b.label} rule finding shown as NEW "
                              f"({type(e).__name__}: {e})")
        findings += tag_new(new_rules, old_rules)
        drows = domain_rows(gb, doms)
        ptree = power_tree(b, cfg, gb)
        extra_warn += ptree.get("warnings", [])
    except Exception as e:  # noqa: BLE001
        extra_warn.append(f"netlist rules / power tree skipped ({type(e).__name__}: {e})")
    # I2C map (2026-10-12, test state). Own try: a failure costs only the I2C part of the report.
    i2cb, i2ca = {}, {}
    if (cfg.get("i2c", {}) or {}).get("enabled", True):
        try:
            decl_path = i2c_declared or b_files.get("i2c_declared")
            try:
                decl = load_declared(decl_path) if decl_path else []
            except Exception as e:  # noqa: BLE001  (a bad diagram file must not cost the map itself)
                decl = []
                extra_warn.append(f"I2C declared table not read ({type(e).__name__}: {e})")
            if decl_path and not decl:
                extra_warn.append(f"I2C declared table {decl_path} has no rows")
            i2cb, fb = i2c_map(b, cfg, gb or NetGraph(b, cfg, rmap), decl)
            try:
                i2ca, fa = i2c_map(a, cfg, ga or NetGraph(a, cfg, rmap))
            except Exception as e:  # noqa: BLE001
                fa = []
                extra_warn.append(f"I2C map on {a.label} failed, every I2C finding shown as NEW "
                                  f"({type(e).__name__}: {e})")
            findings += tag_new(fb, fa)
            i2cb["_findings"] = fb
            mark_changes(i2cb, i2ca)
            i2cb["declared_file"] = str(decl_path or "")
        except Exception as e:  # noqa: BLE001
            extra_warn.append(f"I2C map skipped ({type(e).__name__}: {e})")
    if ptree:                             # A side only for the EVT -> DVT colouring of the power tree diagram
        try:
            ptree_a = power_tree(a, cfg, ga or NetGraph(a, cfg, rmap))
        except Exception as e:  # noqa: BLE001
            extra_warn.append(f"power tree on {a.label} failed, diagram drawn without change colours "
                              f"({type(e).__name__}: {e})")
    for f in findings:
        if f.category in ("PART", "BOM", "CONN"):
            f.status = "CHANGE"
    overview = page_overview(findings, rows, b)
    findings = group_findings(findings, a, b)
    cross_reference(findings)
    folders = {}
    for lab, files in ((a_label, a_files), (b_label, b_files)):
        paths = [Path(p) for p in files.values()]
        if paths:
            import os
            folders[lab] = os.path.commonpath([str(p.parent) for p in paths])
    return Result(a=a, b=b, cfg=cfg, findings=sort_findings(findings), cap_rows=rows, rail_todo=todo,
                  warnings=wa + wb + extra_warn, power_tree=ptree, power_tree_a=ptree_a, rail_domain=drows,
                  i2c_map=i2cb, i2c_map_a=i2ca, input_issues=input_issues(a) + input_issues(b), overview=overview,
                  folders=folders, files={"a": dict(a_files), "b": dict(b_files)})
