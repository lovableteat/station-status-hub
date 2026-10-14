"""Command line entry points.

  autocheck compare --a <EVT folder> --b <DVT folder> [--a-label EVT --b-label DVT]
                    [--config cfg.yaml] [--rail-map rail_map.csv] [--out out_dir]
                    [--pdf <B schematic.pdf>] [--base-url http://host/app/static] [--no-publish]
                    [--rail-domain rail_domain.csv] [--i2c-declared i2c_map_declared.csv]
  autocheck selftest --src <one revision folder> [--n 28 --seeds 5]
"""
from __future__ import annotations

import argparse
import sys
from collections import Counter
from pathlib import Path

from .loader import classify, files_in


ROOT = Path(__file__).resolve().parent.parent      # the AutoCheck folder (app.py, static/)


def write_outputs(res, out: Path, schematic_pdf: Path | None = None, base_url: str | None = None,
                  publish: bool = True) -> dict[str, Path]:
    """Write every artefact. schematic_pdf: B-side OrCAD PDF to annotate (default: the .pdf found in B's
    folder). publish: copy the annotated PDF under <ROOT>/static/<run>/ so the Excel links work over http."""
    import shutil

    from .report.circuit_text import circuit_text
    from .report.data_out import write_csv, write_json
    from .report.pdf_report import build_pdf
    from .report.xlsx_tracker import write_tracker
    from .tracking import expand_rows

    out.mkdir(parents=True, exist_ok=True)
    tag = f"{res.a.label}_vs_{res.b.label}"
    paths = {
        "pdf": out / f"AutoCheck_{tag}.pdf",
        "xlsx": out / f"AutoCheck_tracker_{tag}.xlsx",
        "json": out / f"findings_{tag}.json",
        "caps": out / f"cap_table_{res.b.label}.csv",
        "todo": out / "rail_map_todo.csv",
        "domains": out / f"rail_domain_{res.b.label}.csv",
        "circuit_b": out / f"circuit_{res.b.label}.txt",
        "circuit_a": out / f"circuit_{res.a.label}.txt",
    }
    schematic_pdf = schematic_pdf or res.files.get("b", {}).get("pdf")
    if schematic_pdf:
        paths["schematic"] = out / f"AutoCheck_{tag}_schematic_{res.b.label}.pdf"
    for k, p in list(paths.items()):
        paths[k] = _writable(p)
    build_pdf(res, paths["pdf"])
    write_json(res, paths["json"])
    write_csv(res.cap_rows, paths["caps"])
    write_csv(res.rail_todo, paths["todo"], ["net", "voltage", "note"])
    from .checks.netrules import DOMAIN_FIELDS
    write_csv(res.rail_domain, paths["domains"], DOMAIN_FIELDS)
    paths["circuit_b"].write_text(circuit_text(res.b, res.cfg), encoding="utf-8")
    paths["circuit_a"].write_text(circuit_text(res.a, res.cfg), encoding="utf-8")

    rows = expand_rows(res.findings, res.cap_rows, res.b)
    sidecar, url, pdf_name = None, "", ""
    if schematic_pdf:
        from .report.pdf_annotate import annotate_pdf
        sidecar = annotate_pdf(Path(schematic_pdf), rows, res.b.pages, paths["schematic"], res.cfg,
                               res.a.label, res.b.label)
        res.warnings += [f"annotate: {w}" for w in sidecar.get("warnings", [])]
        pdf_name = paths["schematic"].name
        pub = res.cfg.get("publish", {}) or {}
        base = (base_url or pub.get("base_url") or "").rstrip("/")
        if publish and base:
            dest = ROOT / pub.get("static_dir", "static") / tag
            dest.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(paths["schematic"], dest / pdf_name)
            paths["published"] = dest / pdf_name
            url = f"{base}/{tag}/{pdf_name}"
        elif base:
            url = f"{base}/{tag}/{pdf_name}"
    # B1 power tree as boxes: standalone .html (SVG). Links open the annotated PDF at the converter's page.
    pt = getattr(res, "power_tree", None) or {}
    if pt.get("edges") is not None:
        from .report.power_tree_diagram import layout, render_html
        pmap = (sidecar or {}).get("page_map", {})

        def page_url(page):
            n = pmap.get(str(page))
            return f"{url}#page={n}" if (url and n) else None
        pt_a = getattr(res, "power_tree_a", None) or None
        diff = "edges" in (pt_a or {})
        boxes = layout(pt, pt_a, res.a.label, res.b.label, show_internal=False)     # internal nets hidden
        boxes_all = layout(pt, pt_a, res.a.label, res.b.label, show_internal=True)  # toggle on the page
        html = render_html(boxes, f"Power tree 方框圖 {res.b.label}"
                           + (f" (顏色 = {res.a.label} -> {res.b.label} 變更)" if diff else "")
                           + f"　產生 {res.generated}", page_url, res.a.label, res.b.label, diff=diff,
                           boxes_all=boxes_all)
        paths["ptree_html"] = _writable(out / f"power_tree_{res.b.label}.html")
        paths["ptree_html"].write_text(html, encoding="utf-8")
        if publish:
            # the UI page reads this copy from disk (Streamlit static serving sends .html as text/plain)
            dest = ROOT / (res.cfg.get("publish", {}) or {}).get("static_dir", "static") / tag
            dest.mkdir(parents=True, exist_ok=True)
            (dest / f"power_tree_{res.b.label}.html").write_text(html, encoding="utf-8")
    # I2C map (2026-10-12, test state): table csv + boxes .html (+ static copy for pages/3_I2C_map.py)
    im = getattr(res, "i2c_map", None) or {}
    if im.get("buses"):
        from .checks.i2c_map import table_rows
        from .report.i2c_map_diagram import render_html as i2c_html
        pmap = (sidecar or {}).get("page_map", {})

        def page_url2(page):
            n = pmap.get(str(page))
            return f"{url}#page={n}" if (url and n) else None
        paths["i2c_csv"] = _writable(out / f"i2c_map_{res.b.label}.csv")
        write_csv(table_rows(im, res.a.label), paths["i2c_csv"])
        decl = im.get("declared_file") or ""
        note = (f"I2C Block Diagram 對照檔：{Path(decl).name}，{sum(1 for r in im.get('declared', []) if r['verdict'] == '不符')} 列不符"
                if decl else "沒有 I2C Block Diagram 對照檔 (i2c_map_declared*.csv)，只顯示 netlist 推出的 map。")
        html = i2c_html(im, f"I2C map {res.b.label}　產生 {res.generated}", page_url2, res.a.label, note)
        paths["i2c_html"] = _writable(out / f"i2c_map_{res.b.label}.html")
        paths["i2c_html"].write_text(html, encoding="utf-8")
        if publish:
            dest = ROOT / (res.cfg.get("publish", {}) or {}).get("static_dir", "static") / tag
            dest.mkdir(parents=True, exist_ok=True)
            (dest / f"i2c_map_{res.b.label}.html").write_text(html, encoding="utf-8")
        # 陽春版 block diagram (2026-10-13): same map, owner-sample layout; shown under the detailed map on pages/3.
        # File name must NOT match i2c_map_*.html (pages/3 lists runs with that glob). A drawing bug never costs a report.
        try:
            from .report.i2c_block_diagram import render_html as i2c_block_html
            html_b = i2c_block_html(im, f"I2C map 陽春版 {res.b.label}　產生 {res.generated}", page_url2)
            paths["i2c_block_html"] = _writable(out / f"i2c_block_{res.b.label}.html")
            paths["i2c_block_html"].write_text(html_b, encoding="utf-8")
            if publish:
                dest = ROOT / (res.cfg.get("publish", {}) or {}).get("static_dir", "static") / tag
                dest.mkdir(parents=True, exist_ok=True)
                (dest / f"i2c_block_{res.b.label}.html").write_text(html_b, encoding="utf-8")
        except Exception as e:  # noqa: BLE001
            res.warnings.append(f"I2C map 陽春版 not drawn ({type(e).__name__}: {e})")
            # never leave the previous run's drawing next to this run's map (same run folder name every time)
            for old in (out / f"i2c_block_{res.b.label}.html",
                        ROOT / (res.cfg.get("publish", {}) or {}).get("static_dir", "static") / tag
                        / f"i2c_block_{res.b.label}.html"):
                try:
                    old.unlink(missing_ok=True)
                except OSError:
                    pass
    # RD replies: sync this run's rows into the review DB, pre-fill the Excel with replies already given
    from . import review
    db, rep = review_db(res.cfg), {}
    pdf_pages = {k: v.get("pdf_page") for k, v in (sidecar or {}).get("rows", {}).items()}
    try:
        review.sync_run(db, tag, res.a.label, res.b.label, rows, pdf_pages, url)
        rep = review.replies(db, tag)
    except Exception as e:  # noqa: BLE001  (DB problems must not block the reports)
        res.warnings.append(f"review: database not updated ({type(e).__name__}: {e})")
    write_tracker(res, rows, paths["xlsx"], base_url=url, pdf_name=pdf_name, sidecar=sidecar, replies=rep)
    try:
        review.store_xlsx(db, tag, paths["xlsx"])
    except Exception as e:  # noqa: BLE001
        res.warnings.append(f"review: Excel template not stored ({type(e).__name__}: {e})")
    res.publish_url = url
    res.run_tag = tag
    return paths


def review_db(cfg: dict) -> Path:
    """Path of the replies database: env AUTOCHECK_REVIEW_DB, else config review.db (relative to ROOT)."""
    import os
    env = os.environ.get("AUTOCHECK_REVIEW_DB")
    if env:
        return Path(env)
    p = Path((cfg.get("review", {}) or {}).get("db") or "review/review.db")
    return p if p.is_absolute() else ROOT / p


def _writable(p: Path) -> Path:
    """Windows locks files that are open in a viewer (e.g. the previous PDF report). Instead of failing,
    fall back to a time-stamped name and tell the caller via res-independent print/UI message."""
    import datetime as _dt
    if not p.exists():
        return p
    try:
        with open(p, "r+b"):
            return p
    except PermissionError:
        alt = p.with_name(f"{p.stem}_{_dt.datetime.now().strftime('%H%M%S')}{p.suffix}")
        LOCKED.append((p, alt))
        return alt


LOCKED: list[tuple[Path, Path]] = []


def _compare(args) -> int:
    from .pipeline import run

    a = classify(files_in(args.a))
    b = classify(files_in(args.b))
    res = run(a, b, args.a_label, args.b_label, args.config, args.rail_map, args.rail_domain,
              getattr(args, "i2c_declared", None), getattr(args, "datasheets", None))
    paths = write_outputs(res, Path(args.out), Path(args.pdf) if args.pdf else None, args.base_url,
                          publish=not args.no_publish)
    c = Counter((f.severity, f.status) for f in res.findings)
    print(f"{len(res.findings)} findings | NEW ERROR {c[('ERROR', 'NEW')]} | NEW WARN {c[('WARN', 'NEW')]} | "
          f"changes {sum(v for (s, st), v in c.items() if st == 'CHANGE')}")
    for w in res.warnings:
        print("warning:", w)
    for p, alt in LOCKED:
        print(f"note: {p.name} is open in another program (locked); wrote {alt.name} instead")
    for k, p in paths.items():
        print(f"{k:10s} {p}")
    if getattr(res, "publish_url", ""):
        print(f"links      {res.publish_url}#nameddest=<key>   (needs the Streamlit app running: uv run streamlit run app.py)")
    return 0


def _selftest(args) -> int:
    """Plant faults into a copy of a revision, compare, and report recall."""
    import tempfile

    from .faultinject import inject, score
    from .pipeline import run

    base = classify(files_in(args.src))
    planted = detected = 0
    unexplained: list[str] = []
    with tempfile.TemporaryDirectory() as tmp:
        for seed in range(1, args.seeds + 1):
            dst = Path(tmp) / f"inj{seed}"
            key = inject(args.src, dst, n=args.n, seed=seed)
            res = run(base, classify(files_in(dst)), "ORIG", "INJ", args.config)
            sc = score(key, res.findings)
            planted += sc["planted"]
            detected += sc["detected"]
            unexplained += sc["unexplained"]
            for m in sc["missed"]:
                print(f"  seed {seed} MISSED {m['kind']} {m['refdes']} {m['pins']} {m['nets']}")
    print(f"fault injection: {detected}/{planted} detected ({detected / max(planted, 1):.1%}), "
          f"unexplained findings: {len(unexplained)}")
    for u in unexplained[:20]:
        print("  unexplained:", u)
    # single-design netlist rules (A1 / A2 / A3): faults planted on an in-memory copy, one per copy
    from .config import load_config
    from .loader import build_design
    from .ruleinject import run_injection
    d, _ = build_design("SRC", base)
    ri = run_injection(d, load_config(args.config), n_per_kind=args.rule_n, seed=1)
    if ri.get("skipped"):
        print(f"rule injection: skipped ({ri['skipped']})")
    print(f"rule injection: {ri['detected']}/{ri['planted']} detected, unexplained findings: "
          f"{len(ri['unexplained'])} (fault kinds possible on this board: {', '.join(ri['kinds']) or '-'})")
    for m in ri["missed"][:20]:
        print("  MISSED", m)
    for u in ri["unexplained"][:20]:
        print("  unexplained:", u)
    ok_rules = ri["detected"] == ri["planted"] and not ri["unexplained"]
    return 0 if detected == planted and not unexplained and ok_rules else 1


def _i2c_draft(args) -> int:
    """Datasheet PDF -> candidate library entry (yaml) for RD to check against the PDF and sign."""
    from .checks.i2c_map import datasheets_dir
    from .config import load_config
    from .i2c_lib import draft_from_pdf, entry_yaml, validate_entry
    cfg = load_config(args.config)
    r = draft_from_pdf(args.pdf, name=args.name or "", mpn=args.mpn or "")
    out = Path(args.out) if args.out else datasheets_dir(cfg) / "drafts" / (Path(args.pdf).stem + ".yaml")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("# 候選規則 (未簽核)。對照 PDF 第 " + (", ".join(map(str, r["pages"])) or "?") + " 頁核對每一列，\n"
                   "# 腳名改成 symbol 上的名字，填 fmax_khz，再跑: autocheck i2c-accept <這個檔> --by <你的名字>\n"
                   + entry_yaml(r["entry"]), encoding="utf-8")
    err, warn = validate_entry(r["entry"])
    print(f"draft      {out}")
    print(f"pages      {', '.join(map(str, r['pages'])) or '-'}   rows read: {len(r['rows'])}")
    for n in r["notes"] + warn:
        print("  note:", n)
    for e in err:
        print("  待補:", e)
    return 0


def _i2c_accept(args) -> int:
    import yaml as _yaml
    from .checks.i2c_map import lib_paths
    from .config import load_config
    from .i2c_lib import accept_entry, validate_entry
    cfg = load_config(args.config)
    text = Path(args.draft).read_text(encoding="utf-8")
    e = _yaml.safe_load(text) or {}
    _, user = lib_paths(cfg)
    err, warn = validate_entry(e)
    for w in warn:
        print("  note:", w)
    if err:
        for x in err:
            print("  ERROR:", x)
        return 1
    out = accept_entry(e, args.by, user)
    print(f"signed     {out['name']} by {out['signed_by']} {out['signed_date']} -> {user}")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="autocheck")
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("compare", help="compare two revisions")
    c.add_argument("--a", required=True, help="old revision folder (netlist + BOM [+ DSN])")
    c.add_argument("--b", required=True, help="new revision folder")
    c.add_argument("--a-label", default="EVT")
    c.add_argument("--b-label", default="DVT")
    c.add_argument("--config")
    c.add_argument("--rail-map")
    c.add_argument("--rail-domain", help="rail_domain_<rev>.csv reviewed by the owner (confirmed = Y rows -> WARN)")
    c.add_argument("--i2c-declared", help="transcribed I2C block diagram csv (default: i2c_map_declared*.csv in B's folder)")
    c.add_argument("--datasheets", help="I2C datasheet PDF folder (default: config i2c.datasheets_dir = AutoCheck/datasheets)")
    c.add_argument("--out", default="out")
    c.add_argument("--pdf", help="B schematic PDF to annotate (default: the .pdf found in B's folder)")
    c.add_argument("--base-url", help="http base for Excel links (default: config publish.base_url)")
    c.add_argument("--no-publish", action="store_true", help="do not copy the annotated PDF under static/")
    c.set_defaults(func=_compare)
    s = sub.add_parser("selftest", help="fault-injection self test on one revision folder")
    s.add_argument("--src", required=True)
    s.add_argument("--n", type=int, default=28, help="faults per run")
    s.add_argument("--seeds", type=int, default=5)
    s.add_argument("--config")
    s.add_argument("--rule-n", type=int, default=6, help="netlist-rule faults per kind")
    s.set_defaults(func=_selftest)
    d = sub.add_parser("i2c-draft", help="datasheet PDF -> candidate I2C address rule (unsigned yaml)")
    d.add_argument("pdf")
    d.add_argument("--name", help="library entry name, e.g. 'MP5926 (MPS hot-swap)'")
    d.add_argument("--mpn", help="regex searched in symbol VALUE / BOM text, e.g. 'MP5926'")
    d.add_argument("--out", help="draft yaml (default: datasheets/drafts/<pdf stem>.yaml)")
    d.add_argument("--config")
    d.set_defaults(func=_i2c_draft)
    k = sub.add_parser("i2c-accept", help="sign a checked draft into config/i2c_devices_user.yaml")
    k.add_argument("draft")
    k.add_argument("--by", required=True, help="RD who checked the draft against the datasheet")
    k.add_argument("--config")
    k.set_defaults(func=_i2c_accept)
    args = ap.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
