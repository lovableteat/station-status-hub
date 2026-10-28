"""Locate input files inside a folder (or a list of files) and build a Design.

Selection is by CONTENT, not by "first / last file of that extension" (2026-10-21, owner request: a lazy user points
the tool at the parent folder of a whole design kit and must still get the right files):

  netlist  every folder holding pstxnet + pstxprt + pstchip is a candidate. The one with the most PART_NAME records
           wins; any other trio under half its size whose RefDes (bare, before the reuse suffix '_C0P1') are all in
           the winner's is a packaged sub-design (Concept HDL s_power/sub_*/packaged) and is dropped silently; what is left is listed as an
           alternative the user may want instead (a parent folder holding EVT\\ and DVT\\ at once: DVT's RefDes are
           a subset of EVT's too, size is what tells a revision from a sub-design).
  bom      a .xls/.xlsx/.csv/.htm(l)/.bom/.txt file whose header one of the BOM parsers recognises (ERP / Agile /
           NVIDIA / OrCAD Capture report, 2026-10-22: .bom/.txt added for the Capture text report).
           Concept schematic pages (sch_*/page*.csv), i2c_map_declared*.csv and AutoCheck's own csv outputs are never
           candidates. Several recognised BOMs: the one whose RefDes are found in the chosen netlist (BOM -> netlist,
           never the other way round: netlist-only parts are the DNPs) wins.
  pdf      assembly / fab artwork / drawings / stackup are excluded by name, a name containing 'sch' is preferred,
           then the file closest to the chosen netlist folder. Nothing is opened (no size / page scan).
  dsn      closest to the chosen netlist folder.
classify() keeps its old signature; classify_report() adds a per-role reason text for the UI.
"""
from __future__ import annotations

import re
from pathlib import Path

from .model import Design
from .parsers.allegro_pst import load_netlist
from .parsers.bom_erp import load_bom, sniff_bom
from .parsers.dsn import load_dsn

_COMPANY_BOM = ("ERP", "Agile", "NVIDIA")
BOM_EXT = {".xls", ".xlsx", ".htm", ".html", ".csv", ".bom", ".txt"}
_PART_RE = re.compile(r"^PART_NAME\s*\n\s*(\S+)", re.M)
_SCH_PAGE_CSV = re.compile(r"^page\d+\.csv$", re.I)
_OUR_CSV = re.compile(r"^(autocheck|rail_map|rail_domain|cap_table|i2c_map)[_.]", re.I)
_PDF_SKIP = re.compile(r"assy|assembly|fab|artwork|drawing|dwg|stackup|gerber|datasheet", re.I)


def _refdes_of(pstxprt: Path) -> set[str]:
    try:
        text = pstxprt.read_text(encoding="utf-8", errors="replace").replace("\r\n", "\n")
    except OSError:
        return set()
    return set(_PART_RE.findall(text))


def _base(refdes: str) -> str:
    """'C1_C0P1' -> 'C1': a Concept reuse instance suffix is added when the sub-design is packaged into the top
    level, so a sub-design's own pstxprt lists the bare RefDes."""
    return refdes.split("_", 1)[0]


def _closeness(p: Path, anchor: Path | None) -> int:
    """Number of shared leading path parts with the netlist folder (higher = closer)."""
    if anchor is None:
        return 0
    n = 0
    for a, b in zip(p.parent.parts, anchor.parts):
        if a != b:
            break
        n += 1
    return n


def classify_report(paths: list[Path]) -> tuple[dict[str, Path], dict[str, str]]:
    """(role -> chosen file, role -> reason text). Reasons are Traditional Chinese one-liners for the UI."""
    found: dict[str, Path] = {}
    why: dict[str, str] = {}
    # ---------------------------------------------------------------- netlist trios
    trios: dict[Path, dict[str, Path]] = {}
    for p in paths:
        n = p.name.lower()
        for key in ("pstxnet", "pstxprt", "pstchip"):
            if key in n and n.endswith(".dat"):
                trios.setdefault(p.parent, {})[key] = p
    full = {d: f for d, f in trios.items() if len(f) == 3}
    anchor: Path | None = None
    if full:
        sizes = {d: _refdes_of(f["pstxprt"]) for d, f in full.items()}
        order = sorted(full, key=lambda d: (-len(sizes[d]), str(d)))
        best = order[0]
        found.update(full[best])
        anchor = best
        base_best = {_base(r) for r in sizes[best]}
        subs = [d for d in order[1:] if len(sizes[d]) * 2 < len(sizes[best])
                and (sizes[d] <= sizes[best] or {_base(r) for r in sizes[d]} <= base_best)]
        others = [d for d in order[1:] if d not in subs]
        msg = f"{len(sizes[best])} 顆零件"
        if subs:
            msg += f"，略過 {len(subs)} 組子電路 netlist"
        if others:
            msg += "；另有 " + "、".join(f"{'/'.join(d.parts[-2:])} ({len(sizes[d])} 顆)" for d in others[:4]) + "，請確認要的是哪一組"
        for key in ("pstxnet", "pstxprt", "pstchip"):
            why[key] = msg
    else:
        partial = [d for d, f in trios.items() if f]
        if partial:
            for key in ("pstxnet", "pstxprt", "pstchip"):
                why[key] = "找到的 netlist 資料夾不齊 (三個 .dat 要在同一個資料夾)"
    # ---------------------------------------------------------------- declared I2C csv
    for p in paths:
        if p.name.lower().startswith("i2c_map_declared") and p.suffix.lower() == ".csv":
            found["i2c_declared"] = p     # transcribed I2C block diagram (owner signs it off); never the BOM
            break
    # ---------------------------------------------------------------- BOM
    bom_cands: list[Path] = []
    for p in paths:
        n = p.name.lower()
        if p.suffix.lower() not in BOM_EXT or n.startswith("i2c_map_declared") or _OUR_CSV.match(n):
            continue
        if _SCH_PAGE_CSV.match(n) and p.parent.name.lower().startswith("sch"):
            continue                       # Concept HDL schematic page, not a BOM
        bom_cands.append(p)
    recognised = [(p, fmt) for p in bom_cands if (fmt := sniff_bom(p))]
    if len(recognised) == 1:
        found["bom"], fmt = recognised[0]
        why["bom"] = f"格式 {fmt}"
    elif recognised:
        net_rd = sizes[anchor] if anchor is not None else set()
        scored = []
        for p, fmt in recognised:
            try:
                from .parsers.bom_erp import parse_bom
                items, _ = parse_bom(p)
                rd = {r for it in items for r in it.refdes}
            except Exception:  # noqa: BLE001
                rd = set()
            hit = len(rd & net_rd) / len(rd) if rd else 0.0
            # company BOM before an OrCAD Capture report (QA 2026-10-22: a 3-line .BOM scored 100 % and hid the ERP BOM)
            scored.append((0 if fmt in _COMPANY_BOM else 1, hit, _closeness(p, anchor), p, fmt))
        scored.sort(key=lambda t: (t[0], -t[1], -t[2], str(t[3])))
        _, hit, _, p, fmt = scored[0]
        found["bom"] = p
        why["bom"] = (f"{len(recognised)} 個 BOM 候選，公司 BOM 優先，再選 RefDes 命中 netlist 最高的 ({hit:.0%}，格式 {fmt})"
                      if net_rd else f"{len(recognised)} 個 BOM 候選，無 netlist 可比對，公司 BOM 優先、再取最近的 (格式 {fmt})")
    elif bom_cands:
        why["bom"] = f"{len(bom_cands)} 個表格/報表檔都不是已知 BOM 格式 (ERP / Agile / NVIDIA / OrCAD)"
    # ---------------------------------------------------------------- PDF / DSN
    pdfs = [p for p in paths if p.suffix.lower() == ".pdf" and not p.name.lower().startswith("autocheck")]
    kept = [p for p in pdfs if not _PDF_SKIP.search(p.name)] or pdfs
    if kept:
        kept.sort(key=lambda p: (0 if "sch" in p.name.lower() else 1, -_closeness(p, anchor), str(p)))
        found["pdf"] = kept[0]
        if len(pdfs) > 1:
            why["pdf"] = f"{len(pdfs)} 個 PDF，排除圖面/疊構後取檔名含 sch、離 netlist 最近的"
    dsns = [p for p in paths if p.suffix.lower() == ".dsn"]
    if dsns:
        dsns.sort(key=lambda p: (-_closeness(p, anchor), str(p)))
        found["dsn"] = dsns[0]
        if len(dsns) > 1:
            why["dsn"] = f"{len(dsns)} 個 DSN，取離 netlist 最近的"
    return found, why


def classify(paths: list[Path]) -> dict[str, Path]:
    return classify_report(paths)[0]


def files_in(folder: str | Path) -> list[Path]:
    return sorted(p for p in Path(folder).rglob("*") if p.is_file())


def apply_ni(d: Design, cfg: dict) -> None:
    """DSN NI -> Design.ni; ni_applies when the BOM is not a company BOM (config dnp, owner 2026-10-22)."""
    dc = cfg.get("dnp", {}) or {}
    names = list(dc.get("dsn_property", ["Optional"]))
    vals = {str(v).strip().upper() for v in dc.get("dsn_values", ["NI"])}
    d.ni = {r for r, p in d.dsn_props.items() if any(str(p.get(k, "")).strip().upper() in vals for k in names)}
    d.ni_applies = d.bom is None or d.bom_format not in set(dc.get("company_bom_formats", ["ERP", "Agile", "NVIDIA"]))


def build_design(label: str, files: dict[str, Path], cfg: dict | None = None) -> tuple[Design, list[str]]:
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
    if cfg is None:
        from .config import load_config
        cfg = load_config()
    apply_ni(d, cfg)
    if d.ni_applies and d.ni:
        src = f"{d.bom_format} BOM lists every placed part" if d.bom is not None else "no BOM"
        warnings.append(f"{label}: DNP from DSN NI ({src}): {len(d.ni)} part(s) treated as not stuffed")
    return d, [f"{label}: {w}" if not w.startswith(label) else w for w in warnings]
