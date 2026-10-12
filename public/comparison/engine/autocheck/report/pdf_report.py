"""Standalone PDF report with a clickable bookmark tree (Category > Severity > Finding).

Phase 1a output (no schematic PDF available). Phase 1b will add a second renderer that boxes
the same findings on the schematic PDF; both read the same Result.
"""
from __future__ import annotations

import os
from collections import Counter
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (Flowable, KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer,
                                Table, TableStyle)

from ..checks.drc import present
from ..findings import CATEGORIES, RULE_HELP, SEVERITIES

SEV_COLOR = {"ERROR": colors.HexColor("#C62828"), "WARN": colors.HexColor("#E08A00"),
             "INFO": colors.HexColor("#607D8B")}
STATUS_COLOR = {"NEW": colors.HexColor("#6A1B9A"), "EXISTING": colors.HexColor("#9E9E9E"),
                "CHANGE": colors.HexColor("#1565C0")}

# TrueType CJK fonts (reportlab cannot embed CFF/OTF). First hit wins.
_CJK_CANDIDATES = [
    (r"C:\Windows\Fonts\msjh.ttc", 0), (r"C:\Windows\Fonts\msjh.ttf", None),
    (r"C:\Windows\Fonts\mingliu.ttc", 0), (r"C:\Windows\Fonts\kaiu.ttf", None),
    ("/usr/share/fonts/truetype/arphic/uming.ttc", 0), ("/usr/share/fonts/truetype/wqy/wqy-microhei.ttc", 0),
]
_FONT = {"name": "Helvetica", "bold": "Helvetica-Bold", "cjk": False}


def _setup_font() -> None:
    if _FONT["cjk"]:
        return
    for path, idx in _CJK_CANDIDATES:
        if not os.path.exists(path):
            continue
        try:
            kw = {"subfontIndex": idx} if idx is not None else {}
            pdfmetrics.registerFont(TTFont("CJK", path, **kw))
            _FONT.update(name="CJK", bold="CJK", cjk=True)
            return
        except Exception:  # noqa: BLE001  (CFF outlines or unreadable font)
            continue


def _t(s) -> str:
    s = "" if s is None else str(s)
    if not _FONT["cjk"]:
        s = s.encode("latin-1", "replace").decode("latin-1")
    return escape(s).replace("\n", "<br/>")


class Bookmark(Flowable):
    """Zero-size flowable: named destination + outline entry at the current position."""

    def __init__(self, key: str, title: str, level: int, closed: bool = True):
        super().__init__()
        self.key, self.title, self.level, self.closed = key, title, level, closed
        self.width = self.height = 0

    def draw(self):
        self.canv.bookmarkPage(self.key)
        self.canv.addOutlineEntry(self.title, self.key, level=self.level, closed=self.closed)


def _styles():
    f, fb = _FONT["name"], _FONT["bold"]
    return {
        "h1": ParagraphStyle("h1", fontName=fb, fontSize=16, leading=20, spaceAfter=6),
        "h2": ParagraphStyle("h2", fontName=fb, fontSize=12.5, leading=16, spaceBefore=8, spaceAfter=4),
        "h3": ParagraphStyle("h3", fontName=fb, fontSize=10.5, leading=13, spaceBefore=6, spaceAfter=2),
        "b": ParagraphStyle("b", fontName=f, fontSize=8.5, leading=11, alignment=TA_LEFT),
        "small": ParagraphStyle("s", fontName=f, fontSize=7.2, leading=9),
        "cell": ParagraphStyle("c", fontName=f, fontSize=7.6, leading=9.4),
        "cellb": ParagraphStyle("cb", fontName=fb, fontSize=7.6, leading=9.4),
    }


def _grid(data, widths, header=True, zebra=False):
    t = Table(data, colWidths=widths, repeatRows=1 if header else 0)
    st = [("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#B0BEC5")),
          ("VALIGN", (0, 0), (-1, -1), "TOP"),
          ("LEFTPADDING", (0, 0), (-1, -1), 3), ("RIGHTPADDING", (0, 0), (-1, -1), 3),
          ("TOPPADDING", (0, 0), (-1, -1), 1.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5)]
    if header:
        st.append(("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#ECEFF1")))
    if zebra:
        for i in range(2, len(data), 2):
            st.append(("BACKGROUND", (0, i), (-1, i), colors.HexColor("#FAFAFA")))
    t.setStyle(TableStyle(st))
    return t


def _badge(sev: str, status: str) -> str:
    c = SEV_COLOR.get(sev, colors.black).hexval()[2:]
    s = f'<font color="#{c}"><b>[{sev}]</b></font>'
    if status:
        sc = STATUS_COLOR.get(status, colors.grey).hexval()[2:]
        s += f' <font color="#{sc}"><b>[{status}]</b></font>'
    return s


def _link(fid: str, text: str) -> str:
    return f'<a href="#{fid}" color="blue">{text}</a>'


def _net_members(res, net: str, max_pins: int = 24) -> str:
    for d in (res.b, res.a):
        if net in d.nets:
            pins = d.nets[net]
            if len(pins) > max_pins:
                return f"{net} ({d.label}): {len(pins)} pins (rail/ground, not listed)"
            items = []
            for k in sorted(pins, key=lambda k: (k[0], k[1])):
                nm = d.pin_name.get(k, "")
                tag = "" if present(d, k[0], res.cfg) else " DNP"
                items.append(f"{k[0]}.{k[1]}{'(' + nm + ')' if nm and nm != k[1] else ''} {d.value(k[0])}{tag}")
            return f"{net} ({d.label}): " + ", ".join(items)
    return ""


def build_pdf(res, out: Path) -> None:
    _setup_font()
    S = _styles()
    W = landscape(A4)[0] - 24 * mm
    story = []
    a, b = res.a, res.b
    by_id = {f.id: f for f in res.findings}

    # ---------------------------------------------------------------- summary
    story += [Bookmark("summary", "Summary", 0),
              Paragraph(_t(f"AutoCheck revision report: {a.label} -> {b.label}"), S["h1"]),
              Paragraph(_t(f"Generated {res.generated} | tool {res.tool_version} | rules "
                           f"{res.cfg.get('rules_version')} | config {res.cfg.get('_hash')}"), S["small"]),
              Spacer(1, 4)]
    errs = [m for lv, m in res.input_issues if lv == "ERROR"]
    warns = [m for lv, m in res.input_issues if lv != "ERROR"]
    if errs or warns:
        box = [[Paragraph(f'<font color="#FFFFFF"><b>{"INPUT INCOMPLETE: RESULTS NOT RELIABLE" if errs else "Input warning"}'
                          f'</b><br/>{"<br/>".join(_t(m) for m in errs + warns)}</font>', S["b"])]]
        t = Table(box, colWidths=[W])
        t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), SEV_COLOR["ERROR"] if errs else SEV_COLOR["WARN"]),
                               ("LEFTPADDING", (0, 0), (-1, -1), 6), ("TOPPADDING", (0, 0), (-1, -1), 5),
                               ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
        story += [t, Spacer(1, 6)]
    if not _FONT["cjk"]:
        story.append(Paragraph("Note: no CJK TrueType font found on this machine; non-Latin text shown as '?'.",
                               S["small"]))

    # what this revision introduced
    hot = [f for f in res.findings if f.status == "NEW" and f.severity in ("ERROR", "WARN")]
    story.append(Paragraph(f"Introduced in {_t(b.label)} (NEW, ERROR/WARN): {len(hot)}", S["h2"]))
    for f in hot:
        story.append(Paragraph(f'{_badge(f.severity, "")} {_link(f.id, f.id)} p{f.page or "?"} {_t(f.title)}', S["b"]))

    # counts
    cnt = Counter((f.category, f.severity) for f in res.findings)
    new = Counter(f.category for f in res.findings if f.status == "NEW" and f.severity != "INFO")
    rows = [[Paragraph(f"<b>{h}</b>", S["cell"]) for h in ("Category", "ERROR", "WARN", "INFO", "NEW (ERROR+WARN)")]]
    for c, title in CATEGORIES.items():
        if any(k[0] == c for k in cnt):
            rows.append([Paragraph(_link(f"cat_{c}", _t(title)), S["cell"])]
                        + [Paragraph(str(cnt.get((c, s), 0)), S["cell"]) for s in SEVERITIES]
                        + [Paragraph(str(new.get(c, 0)) if c in ("DRC", "CAPV", "BOMCHK") else "-", S["cell"])])
    story += [Paragraph("Finding counts (after root-cause grouping)", S["h2"]),
              _grid(rows, [110 * mm, 22 * mm, 22 * mm, 22 * mm, 40 * mm])]

    # per-page overview + declared change history side by side
    if res.overview:
        hdr = ["Page", "Title", "Conn", "Symbol/value", "Stuffing", "BOM PN", "DRC NEW", "Cap FAIL"]
        rows = [[Paragraph(f"<b>{h}</b>", S["cell"]) for h in hdr]]
        for o in res.overview:
            pg = o["page"]
            rows.append([Paragraph(_link(f"page_{pg}", str(pg or "?")), S["cell"]), Paragraph(_t(o["title"]), S["cell"])]
                        + [Paragraph(str(o[k] or ""), S["cellb" if o[k] else "cell"])
                           for k in ("CONN", "SYMBOL", "STUFF", "BOM", "DRC_NEW", "CAP_FAIL")])
        story += [Paragraph("What changed, by schematic page (counts of parts / items)", S["h2"]),
                  _grid(rows, [14 * mm, 80 * mm, 18 * mm, 26 * mm, 22 * mm, 22 * mm, 22 * mm, 22 * mm], zebra=True)]
    if b.change_history or a.change_history:
        story.append(Paragraph("Declared change history (from DSN): compare with the table above", S["h2"]))
        for page, lines in (b.change_history or a.change_history):
            story.append(Paragraph(_t(f"{page}: " + (" | ".join(lines) or "(empty)")), S["b"]))

    # inputs
    rows = [[Paragraph(f"<b>{h}</b>", S["cell"]) for h in ("Rev", "Role", "File (relative to folder)", "SHA-256 (12)", "Stamp")]]
    for d in (a, b):
        base = res.folders.get(d.label, "")
        for s_ in d.sources:
            rel = Path(s_.path)
            try:
                rel = rel.relative_to(base)
            except ValueError:
                pass
            rows.append([Paragraph(_t(d.label), S["cell"]), Paragraph(s_.role, S["cell"]),
                         Paragraph(_t(str(rel)), S["cell"]), Paragraph(s_.sha256[:12], S["cell"]),
                         Paragraph(_t(s_.stamp), S["cell"])])
    story.append(Paragraph("Inputs (traceability)", S["h2"]))
    for lab, folder in res.folders.items():
        story.append(Paragraph(_t(f"{lab} folder: {folder}"), S["small"]))
    story.append(_grid(rows, [18 * mm, 20 * mm, 105 * mm, 30 * mm, W - 173 * mm]))

    pending = ["mechanical RefDes regex", "ground net regex", "net-tie prefixes", "test pads TP as always built",
               "MLCC detection for DNP caps", "net-name voltage blacklist"]
    story += [Paragraph("Rule defaults pending owner confirmation", S["h2"]),
              Paragraph(_t(", ".join(pending) + " (config/default.yaml, lines marked DEFAULT). Schematic PDF "
                           "annotation arrives in v0.2; page numbers are schematic page numbers (netlist P_PATH)."), S["b"])]
    if res.warnings:
        story.append(Paragraph("Parser warnings", S["h2"]))
        for w in res.warnings:
            story.append(Paragraph(_t(w), S["small"]))

    # ---------------------------------------------------------------- findings
    for c, title in CATEGORIES.items():
        fs = [f for f in res.findings if f.category == c]
        if not fs:
            continue
        story += [PageBreak(), Bookmark(f"cat_{c}", f"{title} ({len(fs)})", 0),
                  Paragraph(_t(f"{title}  ({len(fs)})"), S["h1"])]
        for sev in SEVERITIES:
            group = [f for f in fs if f.severity == sev]
            if not group:
                continue
            story += [Bookmark(f"cat_{c}_{sev}", f"{sev} ({len(group)})", 1),
                      Paragraph(_badge(sev, "") + f" {len(group)}", S["h2"])]
            for f in sorted(group, key=lambda x: (0 if x.status == "NEW" else 1, x.page or 999, x.title)):
                label = f"{'[NEW] ' if f.status == 'NEW' else ''}p{f.page or '?'} {f.title}"
                bm = Bookmark(f.id, label[:120], 2)
                if sev == "INFO":
                    story += [bm, Paragraph(f'<b>{f.id}</b> p{f.page or "?"} {_t(f.title)}'
                                            + (f' <font color="#607D8B">| {_t(f.detail.splitlines()[0][:160])}</font>'
                                               if f.detail else ""), S["small"])]
                else:
                    story += _finding_block(f, S, W, bm, res, by_id)

    # ---------------------------------------------------------------- index by page
    story += [PageBreak(), Bookmark("by_page", "Index by schematic page", 0),
              Paragraph("Index by schematic page", S["h1"]),
              Paragraph("Walk the schematic page by page; every entry links to its finding.", S["b"])]
    pages = sorted({f.page for f in res.findings} | {o["page"] for o in res.overview},
                   key=lambda p: (p is None, p or 0))
    for pg in pages:
        fs = [f for f in res.findings if f.page == pg]
        story += [Bookmark(f"page_{pg}", f"p{pg or '?'} {b.page_title(pg)} ({len(fs)})", 1),
                  Paragraph(_t(f"p{pg or '?'}  {b.page_title(pg)}  ({len(fs)})"), S["h3"])]
        if not fs:
            story.append(Paragraph("(only part of a grouped finding listed under another page; see "
                                   "Appendix A for per-capacitor rows)", S["small"]))
        for f in sorted(fs, key=lambda x: (SEVERITIES.index(x.severity), x.category)):
            story.append(Paragraph(f'{_badge(f.severity, f.status if f.status == "NEW" else "")} '
                                   f'{_link(f.id, f.id)} {_t(f.title)}', S["small"]))

    # ---------------------------------------------------------------- appendices
    story += [PageBreak(), Bookmark("app_caps", "Appendix A: capacitor voltage table", 0),
              Paragraph(_t(f"Appendix A: capacitor voltage table ({b.label})"), S["h1"]),
              Paragraph(_t(RULE_HELP["MLCC_DERATING"] + " Non-MLCC: ratio only."), S["b"])]
    hdr = ["RefDes", "Value", "Built", "Type", "Net 1", "V1", "Net 2", "V2", "Stress", "Rated", "Req", "Verdict", "Pg"]
    rows = [[Paragraph(f"<b>{h}</b>", S["cell"]) for h in hdr]]
    for r in res.cap_rows:
        vc = {"FAIL": "#C62828", "PASS": "#2E7D32", "UNRESOLVED": "#E08A00"}.get(r["verdict"].split()[0], "#455A64")
        req = r.get("required")
        rows.append([Paragraph(_t(x), S["cell"]) for x in (
            r["refdes"], r["value"], "Y" if r["stuffed"] else "DNP", "MLCC" if r["mlcc"] else "other",
            r["net1"], "" if r["v1"] is None else f"{r['v1']:g}", r["net2"], "" if r["v2"] is None else f"{r['v2']:g}",
            "" if r["stress"] is None else f"{r['stress']:g}", "" if r["rated"] is None else f"{r['rated']:g}",
            f"{req:g}" if (req and r["mlcc"]) else "")]
                    + [Paragraph(f'<font color="{vc}"><b>{_t(r["verdict"])}</b></font>', S["cell"]),
                       Paragraph(str(r["page"] or ""), S["cell"])])
    story.append(_grid(rows, [15 * mm, 25 * mm, 10 * mm, 12 * mm, 50 * mm, 10 * mm, 50 * mm, 10 * mm, 12 * mm,
                              12 * mm, 11 * mm, 22 * mm, 8 * mm], zebra=True))

    story += [PageBreak(), Bookmark("app_todo", "Appendix B: nets needing a voltage (rail_map_todo.csv)", 0),
              Paragraph("Appendix B: nets needing a voltage", S["h1"]),
              Paragraph("Fill the 'voltage' column in rail_map_todo.csv, save it as rail_map.csv and re-run. "
                        "Differential pairs at the same potential (e.g. sense +/-) get the same value.", S["b"])]
    rows = [[Paragraph("<b>Net</b>", S["cell"]), Paragraph("<b>Capacitors touching it</b>", S["cell"])]]
    for t_ in res.rail_todo:
        rows.append([Paragraph(_t(t_["net"]), S["cell"]), Paragraph(_t(t_["note"]), S["cell"])])
    story.append(_grid(rows, [80 * mm, W - 80 * mm], zebra=True))

    doc = SimpleDocTemplate(str(out), pagesize=landscape(A4), leftMargin=12 * mm, rightMargin=12 * mm,
                            topMargin=12 * mm, bottomMargin=12 * mm,
                            title=f"AutoCheck {a.label} -> {b.label}", author="AutoCheck")

    def _footer(canv, doc_):
        canv.saveState()
        canv.setFont(_FONT["name"], 7)
        canv.setFillColor(colors.grey)
        canv.drawString(12 * mm, 7 * mm, _plain(f"AutoCheck {res.tool_version} | {a.label} -> {b.label} | {res.generated}"
                                                + (" | INPUT INCOMPLETE" if errs else "")))
        canv.drawRightString(landscape(A4)[0] - 12 * mm, 7 * mm, f"page {doc_.page}")
        canv.restoreState()

    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)


def _plain(s: str) -> str:
    return s if _FONT["cjk"] else s.encode("latin-1", "replace").decode("latin-1")


def _finding_block(f, S, W, bm, res, by_id):
    head = Paragraph(f'{_badge(f.severity, f.status)} <b>{f.id}</b>  {_t(f.title)}', S["h3"])
    kv = [("Rule", f.rule), ("Page", f"{f.page or '?'}  {f.page_title}"),
          ("RefDes", ", ".join(f.refdes)), ("Nets", ", ".join(f.nets[:12]) + (" ..." if len(f.nets) > 12 else "")),
          ("Pins", ", ".join(f.pins)), ("Detail", f.detail)]
    if f.evidence and f.category in ("CONN", "BOM"):
        kv.append(("Evidence", "  |  ".join(f"{k}: {v}" for k, v in f.evidence.items())))
    data = [[Paragraph(f"<b>{k}</b>", S["cell"]), Paragraph(_t(v), S["cell"])] for k, v in kv if v]
    if f.category in ("DRC", "CONN", "NETRULE") and f.nets:
        mem = [m for m in (_net_members(res, n) for n in f.nets[:3]) if m]
        if mem:
            data.append([Paragraph("<b>Net members</b>", S["cell"]), Paragraph("<br/>".join(_t(m) for m in mem), S["cell"])])
    if f.related:
        links = "<br/>".join(f'{_link(i, i)} {_t(by_id[i].title)}' for i in f.related if i in by_id)
        data.append([Paragraph("<b>Related</b>", S["cell"]), Paragraph(links, S["cell"])])
    if f.rule in RULE_HELP:
        data.append([Paragraph("<b>Why / check</b>", S["cell"]), Paragraph(_t(RULE_HELP[f.rule]), S["cell"])])
    t = _grid(data, [24 * mm, W - 24 * mm], header=False)
    # long groups may exceed one page: only keep short blocks together
    items = [bm, head, t, Spacer(1, 3)]
    return [KeepTogether(items)] if sum(len(str(x)) for x in kv) < 1500 else items
