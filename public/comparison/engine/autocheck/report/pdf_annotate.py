"""Box the findings on the schematic PDF (OrCAD-exported, text layer required).

Output = [index pages] + [schematic pages with boxes]. Every tracking row gets
  * a named destination  (#nameddest=<dest>) so Excel / web links land on it,
  * a bookmark            (Findings > severity > key),
  * a box + label drawn as page content (renders and prints in every viewer, Ctrl+F finds the key),
  * a Square annotation with the key / title / detail as comment text (Acrobat comment panel).
A sidecar JSON records page map, box coordinates and misses for the web stage.

Libraries: pdfplumber (MIT) to locate text, pypdf (BSD) to write; no AGPL dependency.
"""
from __future__ import annotations

import io
import json
import re
import uuid
from collections import defaultdict
from pathlib import Path

import pdfplumber
from pypdf import PdfReader, PdfWriter, Transformation
from pypdf.annotations import Link, Rectangle
from pypdf.generic import (ArrayObject, FloatObject, NameObject, NumberObject, TextStringObject, DictionaryObject,
                           RectangleObject)
from pypdf.generic import Fit
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfgen import canvas

from ..tracking import TrackRow
from .pdf_report import _FONT, _setup_font

SEV_RGB = {"ERROR": (0.78, 0.09, 0.09), "WARN": (0.90, 0.50, 0.0), "INFO": (0.16, 0.42, 0.75)}
_WORD = re.compile(r"[A-Za-z0-9_.+/-]+")
# multi-section part label: Q168A / U12B -> RefDes Q168 / U12 (used only when the bare RefDes is absent)
_SECTION = re.compile(r"^([A-Z]{1,4}\d+)[A-H]$")
# OrCAD bold = same glyph drawn 3x with a tiny offset ("TTTiiitttllleee"); merge within this distance (pt)
DEDUPE_TOL = 1.0
# tight tokenizer: split when the gap to the previous glyph exceeds this fraction of the font size.
# Real OrCAD print: glyphs inside a RefDes touch (gap ~0), a pin number next to it sits 0.14-0.26 x size away.
TIGHT_GAP = 0.10


def _tight_tokens(chars: list[dict], h: float):
    """Re-tokenise upright glyphs: same baseline and font size, gap <= TIGHT_GAP x size.
    Splits 'C5952' (RefDes C595 + pin number 2) that pdfplumber's x_tolerance=3 glues together, and
    'R4591' where the pin number sits on a baseline 0.4 pt lower."""
    lines: dict[tuple, list[dict]] = defaultdict(list)
    for c in chars:
        if not c.get("upright", True) or not c["text"].strip():
            continue
        lines[(round(float(c["bottom"]) * 5), round(float(c["size"]), 1))].append(c)
    for (_b, size), cs in lines.items():
        cs.sort(key=lambda c: float(c["x0"]))
        group = [cs[0]]
        for c in cs[1:] + [None]:
            if c is not None and 0 <= float(c["x0"]) - float(group[-1]["x0"]) \
                    and float(c["x0"]) - float(group[-1]["x1"]) <= TIGHT_GAP * size:
                group.append(c)
                continue
            text = "".join(g["text"] for g in group)
            bbox = (float(group[0]["x0"]), h - max(float(g["bottom"]) for g in group),
                    float(group[-1]["x1"]), h - min(float(g["top"]) for g in group))
            yield text, bbox
            if c is not None:
                group = [c]


# ----------------------------------------------------------------------------------- normalise
def _apply(ctm: tuple, x: float, y: float) -> tuple[float, float]:
    a, b, c, d, e, f = ctm
    return a * x + c * y + e, b * x + d * y + f


def _transform_annots(page, ctm: tuple) -> int:
    """Move the page's pre-existing annotations (OrCAD off-page /Link, earlier comments) through the same
    ctm as the content, so they stay on the thing they point at. /Rect and /QuadPoints are re-derived from
    the transformed corners; a cached appearance (/AP) is dropped because its /Matrix would be wrong."""
    n = 0
    for ref in page.get("/Annots") or []:
        a = ref.get_object()
        rect = a.get("/Rect")
        if not rect:
            continue
        x0, y0, x1, y1 = (float(v) for v in rect)
        pts = [_apply(ctm, x, y) for x, y in ((x0, y0), (x1, y0), (x0, y1), (x1, y1))]
        xs, ys = [q[0] for q in pts], [q[1] for q in pts]
        a[NameObject("/Rect")] = ArrayObject([FloatObject(v) for v in (min(xs), min(ys), max(xs), max(ys))])
        qp = a.get("/QuadPoints")
        if qp:
            vals = [float(v) for v in qp]
            moved = []
            for k in range(0, len(vals) - 1, 2):
                moved += _apply(ctm, vals[k], vals[k + 1])
            a[NameObject("/QuadPoints")] = ArrayObject([FloatObject(v) for v in moved])
        if "/AP" in a and (ctm[1] or ctm[2]):
            del a[NameObject("/AP")]
        n += 1
    return n


def normalize_pdf(pdf_path: Path) -> tuple[io.BytesIO, list[str]]:
    """Rewrite every page into one plain coordinate system: /Rotate 0, MediaBox = CropBox = (0,0,w,h), no /UserUnit.

    Schematic PDFs arrive any way a print driver felt like: portrait paper + /Rotate 90 (content stored sideways),
    CropBox offsets, mixed page sizes, /UserUnit scaling. pdfplumber reports *displayed* coordinates while pypdf
    merge_page / annotations write *user space*, so on such pages every box lands 90 degrees off. Baking the
    rotation and the crop offset into the content (one exact `cm` prepended by pypdf add_transformation) makes
    the two agree, with no per-page maths downstream. Pages that are already plain pass through unchanged.
    The rotation matrices are exact integers on purpose: pypdf's transfer_rotation_to_content() uses cos/sin and
    writes 6e-17 instead of 0, which flips pdfminer's `upright` flag (a*d > 0) on the rotated pin-number glyphs,
    and pdfplumber then glues them into the RefDes lines ("R916" -> "R", "9", ...). Verified on OrCAD output.
    Returns the normalised PDF in memory and a note per page that was touched."""
    reader = PdfReader(str(pdf_path))
    writer = PdfWriter()
    writer.append(reader)
    notes: list[str] = []
    for i, p in enumerate(writer.pages):
        what = []
        cb, mb = p.cropbox, p.mediabox
        cbv = tuple(float(v) for v in cb)
        w, h = cbv[2] - cbv[0], cbv[3] - cbv[1]
        ctm = None                                   # (a, b, c, d, e, f): content -> plain page
        if cbv[:2] != (0.0, 0.0) or cbv != tuple(float(v) for v in mb):
            what.append(f"cropbox {[round(v, 1) for v in cbv]}")
            ctm = (1, 0, 0, 1, -cbv[0], -cbv[1])
        rot = p.rotation % 360
        turn = {90: (0, -1, 1, 0, 0, w), 180: (-1, 0, 0, -1, w, h), 270: (0, 1, -1, 0, h, 0)}.get(rot)
        if rot and turn is None:
            what.append(f"rotate {rot} is not a multiple of 90, ignored")
            if "/Rotate" in p:
                del p[NameObject("/Rotate")]
        elif rot:
            what.append(f"rotate {rot}")
            # viewer shows the page turned clockwise by rot; apply that turn to the content instead
            ctm = turn if ctm is None else Transformation(ctm).transform(Transformation(turn)).ctm
            if rot in (90, 270):
                w, h = h, w
        if ctm is not None:
            p.add_transformation(Transformation(ctm))
            p.compress_content_streams()
            r = RectangleObject((0, 0, w, h))
            p.mediabox = r
            p.cropbox = r
            for k in ("/BleedBox", "/TrimBox", "/ArtBox"):
                if k in p:
                    del p[NameObject(k)]
            if "/Rotate" in p:
                del p[NameObject("/Rotate")]
            n_ann = _transform_annots(p, ctm)
            if n_ann:
                what.append(f"{n_ann} existing annotation(s) moved")
        if "/UserUnit" in p:
            what.append(f"userunit {float(p['/UserUnit'])}")
            del p[NameObject("/UserUnit")]
        if what:
            notes.append(f"page {i + 1}: {', '.join(what)}")
    buf = io.BytesIO()
    writer.write(buf)
    buf.seek(0)
    return buf, notes


# ----------------------------------------------------------------------------------- text index
class PageIndex:
    """Words per PDF page with bboxes in PDF user space (origin bottom-left).

    Two tokenisations are merged (deduplicated by position): pdfplumber words (handles vertical text,
    punctuation) and a tight per-baseline split (handles pin numbers glued to RefDes). Overprinted bold
    text is collapsed first. Section labels (Q168A) are kept in a separate index used only as fallback."""

    def __init__(self, pdf_path: Path | io.BytesIO):
        self.words: list[dict[str, list[tuple[float, float, float, float]]]] = []
        self.sections: list[dict[str, list[tuple[float, float, float, float]]]] = []
        self.text: list[str] = []
        self.size: list[tuple[float, float]] = []
        self.rotation: list[int] = []
        if isinstance(pdf_path, io.BytesIO):
            pdf_path.seek(0)
        with pdfplumber.open(pdf_path if isinstance(pdf_path, io.BytesIO) else str(pdf_path)) as pdf:
            for p in pdf.pages:
                h = float(p.height)
                q = p.dedupe_chars(tolerance=DEDUPE_TOL)
                idx: dict[str, list] = defaultdict(list)
                sect: dict[str, list] = defaultdict(list)
                seen: set[tuple] = set()

                def add(tok: str, bbox: tuple, target: dict) -> None:
                    k = (id(target), tok, tuple(round(v) for v in bbox))
                    if k not in seen:
                        seen.add(k)
                        target[tok].append(bbox)

                words = q.extract_words(keep_blank_chars=False, use_text_flow=False)
                cands = [(w["text"], (float(w["x0"]), h - float(w["bottom"]), float(w["x1"]), h - float(w["top"])))
                         for w in words]
                cands += list(_tight_tokens(q.chars, h))
                for text, bbox in cands:
                    # RefDes glued to punctuation ("C693," / "(R12)"): index the bare token too
                    for tok in {text, *_WORD.findall(text)}:
                        add(tok, bbox, idx)
                        m = _SECTION.match(tok)
                        if m:
                            add(m.group(1), bbox, sect)
                self.words.append(idx)
                self.sections.append(sect)
                self.text.append(" ".join(w["text"] for w in words))
                self.size.append((float(p.width), h))
                self.rotation.append(int(p.rotation or 0))

    def find(self, page: int, token: str) -> list[tuple[float, float, float, float]]:
        hits = self.words[page].get(token) or self.sections[page].get(token) or []
        return list(hits)

    def pages_with(self, token: str) -> list[int]:
        exact = [i for i, w in enumerate(self.words) if token in w]
        return exact or [i for i, s in enumerate(self.sections) if token in s]

    def pages_with_text(self, phrase: str) -> list[int]:
        key = re.sub(r"\s+", " ", phrase).strip().upper()
        if not key:
            return []
        return [i for i, t in enumerate(self.text) if key in t.upper()]


def map_pages(index: PageIndex, sch_pages: dict[int, str], override: dict[int, int] | None = None
              ) -> tuple[dict[int, int | None], list[str]]:
    """schematic page number (pstxprt P_PATH) -> PDF page index (0-based). Match by page title text.
    Fallback for unmatched pages: identity (page N -> index N-1) if in range, else None."""
    out: dict[int, int | None] = {}
    warn: list[str] = []
    used: set[int] = set()
    n = len(index.words)
    for num, title in sorted(sch_pages.items(), key=lambda kv: (-len(kv[1]), kv[0])):
        if override and num in override:
            out[num] = override[num]
            used.add(override[num])
            continue
        hits = [i for i in index.pages_with_text(title) if i not in used] if title else []
        if len(hits) == 1:
            out[num] = hits[0]
        elif len(hits) > 1:
            # prefer the identity position when ambiguous (title repeated e.g. "POWER" in other text)
            pick = num - 1 if (num - 1) in hits else hits[0]
            out[num] = pick
            warn.append(f"page {num} '{title}': title found on PDF pages {[h + 1 for h in hits]}, using {pick + 1}")
        else:
            out[num] = num - 1 if 0 <= num - 1 < n else None
            warn.append(f"page {num} '{title}': title not found in PDF text, "
                        + (f"assuming PDF page {num}" if out[num] is not None else "no PDF page"))
        if out[num] is not None:
            used.add(out[num])
    if not sch_pages:
        warn.append("no schematic page titles (DSN missing): PDF page = schematic page number")
    return out, warn


# ----------------------------------------------------------------------------------- locate
def locate(rows: list[TrackRow], index: PageIndex, page_map: dict[int, int | None]) -> dict[str, dict]:
    """key -> {pdf_page, boxes:[(x0,y0,x1,y1,refdes)], missing:[refdes]}"""
    out: dict[str, dict] = {}
    for r in rows:
        pdf_page = page_map.get(r.page) if r.page else None
        boxes, missing = [], []
        for rd in r.refdes:
            pg = pdf_page
            hits = index.find(pg, rd) if pg is not None else []
            if not hits:
                # not on the mapped page: accept a unique hit elsewhere (page map may be off)
                pages = index.pages_with(rd)
                if len(pages) == 1:
                    pg = pages[0]
                    hits = index.find(pg, rd)
            if hits:
                boxes += [(*b, rd, pg) for b in hits]
            else:
                missing.append(rd)
        if pdf_page is None and boxes:
            pdf_page = boxes[0][5]
        out[r.key] = {"pdf_page": pdf_page, "boxes": boxes, "missing": missing}
    return out


# ----------------------------------------------------------------------------------- drawing
def _overlay(size: tuple[float, float], items: list[tuple[tuple, str, str]], pad: float) -> PdfReader:
    """items: ((x0,y0,x1,y1), severity, label). Boxes sharing a bbox are nested (inner = most severe)
    and their labels stacked, so one part hit by several rules stays readable."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=size)
    order = {"ERROR": 0, "WARN": 1, "INFO": 2}
    groups: dict[tuple, list] = defaultdict(list)
    for bbox, sev, label in items:
        groups[tuple(round(v, 1) for v in bbox)].append((sev, label))
    for (x0, y0, x1, y1), members in groups.items():
        members.sort(key=lambda m: order.get(m[0], 9))
        for k, (sev, label) in enumerate(members):
            rgb = SEV_RGB.get(sev, SEV_RGB["INFO"])
            p = pad + 2.2 * k
            c.setStrokeColorRGB(*rgb)
            c.setLineWidth(1.2 if sev != "INFO" else 0.6)
            c.rect(x0 - p, y0 - p, (x1 - x0) + 2 * p, (y1 - y0) + 2 * p, stroke=1, fill=0)
            c.setFillColorRGB(*rgb)
            c.setFont("Helvetica-Bold", 5.5)
            c.drawString(x0 - pad, y1 + pad + 1.5 + 6 * k, label)
    c.showPage()
    c.save()
    buf.seek(0)
    return PdfReader(buf)


def _index_pages(rows: list[TrackRow], loc: dict[str, dict], b_label: str, a_label: str,
                 rowno: dict[str, int]) -> tuple[PdfReader, list[tuple[int, tuple, str]]]:
    """Index table. Returns reader and link slots: (index_page_no, rect, key)."""
    _setup_font()
    font = _FONT["name"]
    size = landscape(A4)
    W, H = size
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=size)
    cols = [(14, "#", 22), (38, "Key", 150), (190, "Sev", 32), (224, "St", 40), (266, "Pg", 24), (292, "RefDes", 70), (364, "Title", 450)]
    links: list[tuple[int, tuple, str]] = []
    y = 0
    page_no = 0

    def header():
        nonlocal y
        c.setFont(font, 13)
        c.drawString(14, H - 30, f"AutoCheck findings on schematic {b_label} (vs {a_label}): {len(rows)} items")
        c.setFont(font, 7.5)
        c.drawString(14, H - 44, "Click a row to jump to the boxed part. Red = ERROR, orange = WARN, blue = INFO. "
                                 "Boxes are page content (print + search); comments carry the key.")
        c.setFont(font, 7.5)
        for x, name, _w in cols:
            c.drawString(x, H - 62, name)
        c.line(14, H - 65, W - 14, H - 65)
        y = H - 78

    header()
    for r in rows:
        n = rowno[r.key]
        if y < 30:
            c.showPage(); page_no += 1; header()
        info = loc.get(r.key, {})
        found = bool(info.get("boxes"))
        rgb = SEV_RGB.get(r.severity, SEV_RGB["INFO"])
        c.setFillColorRGB(*rgb)
        c.setFont(font, 7)
        c.drawString(cols[0][0], y, f"#{n}")
        c.drawString(cols[1][0], y, r.key[:34])
        c.drawString(cols[2][0], y, r.severity)
        c.setFillColorRGB(0, 0, 0)
        c.drawString(cols[3][0], y, r.status)
        c.drawString(cols[4][0], y, str(r.page or ""))
        c.drawString(cols[5][0], y, ", ".join(r.refdes)[:14])
        title = r.title if _FONT["cjk"] else r.title.encode("latin-1", "replace").decode("latin-1")
        c.drawString(cols[6][0], y, title[:105] + ("" if found else "   [not located]"))
        if info.get("pdf_page") is not None:
            links.append((page_no, (12, y - 2.5, W - 12, y + 7.5), r.key))
        y -= 10.5
    c.showPage()
    c.save()
    buf.seek(0)
    return PdfReader(buf), links


# ----------------------------------------------------------------------------------- main
def center_view(box: tuple[float, float, float, float], page: tuple[float, float],
                view: tuple[float, float]) -> tuple[float, float]:
    """/XYZ left, top that put the box centre in the middle of a viewer window showing `view` (w, h) points
    at the destination zoom. Viewers anchor /XYZ at the window's top-left corner, so the window size has to
    be assumed (config annotate.view_pt); the result is clamped so the window stays on the page."""
    x0, y0, x1, y1 = box
    pw, ph = page
    vw, vh = view
    left = min(max(0.0, (x0 + x1) / 2 - vw / 2), max(0.0, pw - vw))
    top = max(min(ph, (y0 + y1) / 2 + vh / 2), min(ph, vh))
    return round(left, 1), round(top, 1)


def fit_rect(box: tuple[float, float, float, float], page: tuple[float, float],
             view: tuple[float, float]) -> tuple[float, float, float, float]:
    """/FitR left, bottom, right, top: a `view` (w, h) point area centred on the box, clamped to the page.
    The viewer scales this area to fill its own window, so no screen size has to be assumed. Chrome:
    zoom = min(window w / rect w, window h / rect h) with 1 pt = 4/3 px at 100 %, capped at 500 %,
    rect top-left at the window top-left (verified in Chromium 2026-10-09; open_pdf_params_parser.ts)."""
    x0, y0, x1, y1 = box
    pw, ph = page
    vw, vh = min(view[0], pw), min(view[1], ph)
    left = min(max(0.0, (x0 + x1) / 2 - vw / 2), pw - vw)
    bottom = min(max(0.0, (y0 + y1) / 2 - vh / 2), ph - vh)
    return round(left, 1), round(bottom, 1), round(left + vw, 1), round(bottom + vh, 1)


def annotate_pdf(schematic_pdf: Path, rows: list[TrackRow], sch_pages: dict[int, str], out_pdf: Path,
                 cfg: dict | None = None, a_label: str = "A", b_label: str = "B",
                 page_override: dict[int, int] | None = None) -> dict:
    acfg = (cfg or {}).get("annotate", {}) or {}
    box_sev = set(acfg.get("box_severities", ["ERROR", "WARN"]))
    dest_sev = set(acfg.get("dest_severities", ["ERROR", "WARN", "INFO"]))
    zoom = float(acfg.get("zoom", 2.0))
    pad = float(acfg.get("box_padding", 3.0))
    view = tuple(float(v) for v in (acfg.get("view_pt") or (460.0, 275.0)))
    jump = str(acfg.get("jump", "fitr")).lower()      # fitr: viewer fits view_pt to its window; xyz: fixed zoom
    if jump not in ("fitr", "xyz"):
        raise ValueError(f"annotate.jump must be fitr or xyz, got {jump!r}")

    rowno = {r.key: i + 1 for i, r in enumerate(rows)}      # same numbering as the Excel tracker (項次)
    run_id = uuid.uuid4().hex[:8]                            # tags this run's comment boxes (/NM) for the self-check
    rows = [r for r in rows if r.severity in dest_sev]
    norm_buf, norm_notes = normalize_pdf(schematic_pdf)
    index = PageIndex(norm_buf)
    page_map, warnings = map_pages(index, sch_pages, page_override)
    n_words = sum(len(w) for w in index.words)
    if n_words < 5 * max(1, len(index.words)):
        warnings.append(f"PDF text layer looks empty ({n_words} words on {len(index.words)} pages): "
                        "export the schematic from OrCAD as PDF with text, not as an image/print scan")
    if norm_notes:
        warnings.append(f"normalised {len(norm_notes)} page(s) (rotate/cropbox/userunit baked into content): "
                        + "; ".join(norm_notes[:4]) + (" ..." if len(norm_notes) > 4 else ""))
    loc = locate(rows, index, page_map)

    index_reader, links = _index_pages(rows, loc, b_label, a_label, rowno)
    n_index = len(index_reader.pages)
    norm_buf.seek(0)
    src = PdfReader(norm_buf)
    writer = PdfWriter()
    writer.append(index_reader)
    writer.append(src)

    # 1. boxes as page content (one overlay per schematic page)
    per_page: dict[int, list] = defaultdict(list)
    for r in rows:
        if r.severity not in box_sev:
            continue
        for x0, y0, x1, y1, rd, pg in loc[r.key]["boxes"]:
            per_page[pg].append(((x0, y0, x1, y1), r.severity, f"#{rowno[r.key]}"))
    for pg, items in per_page.items():
        ov = _overlay(index.size[pg], items, pad)
        writer.pages[n_index + pg].merge_page(ov.pages[0])

    # 2. comments, named destinations, bookmarks
    root = writer.add_outline_item(f"AutoCheck findings ({b_label})", 0)
    sev_nodes = {s: writer.add_outline_item(s, 0, parent=root) for s in ("ERROR", "WARN", "INFO") if s in dest_sev}
    sidecar = {"page_map": {str(k): (v + 1 + n_index if v is not None else None) for k, v in page_map.items()},
               "index_pages": n_index, "jump": jump, "run_id": run_id, "rows": {}, "warnings": warnings}
    for r in rows:
        info = loc[r.key]
        if info["pdf_page"] is None and not info["boxes"]:
            sidecar["rows"][r.key] = {"dest": r.dest, "pdf_page": None, "bbox": None, "missing": info["missing"]}
            continue
        if info["boxes"]:
            x0, y0, x1, y1, _rd, pg = info["boxes"][0]
            page_no = n_index + pg
            if jump == "fitr":
                vrect = fit_rect((x0, y0, x1, y1), index.size[pg], view)
                fit = Fit.fit_rectangle(*vrect)
                dest = ArrayObject([writer.pages[page_no].indirect_reference, NameObject("/FitR"),
                                    *(FloatObject(v) for v in vrect)])
                vout = list(vrect)
            else:
                left, top = center_view((x0, y0, x1, y1), index.size[pg], view)
                fit = Fit.xyz(left=left, top=top, zoom=zoom)
                dest = ArrayObject([writer.pages[page_no].indirect_reference, NameObject("/XYZ"),
                                    FloatObject(left), FloatObject(top), FloatObject(zoom)])
                vout = [left, top]
            bbox = [round(x0 - pad, 1), round(y0 - pad, 1), round(x1 + pad, 1), round(y1 + pad, 1)]
            if r.severity in box_sev:
                ann = Rectangle(rect=(x0 - pad, y0 - pad, x1 + pad, y1 + pad), title_bar="AutoCheck")
                ann[NameObject("/C")] = ArrayObject([FloatObject(v) for v in SEV_RGB[r.severity]])
                ann[NameObject("/CA")] = FloatObject(0.0)
                ann[NameObject("/BS")] = DictionaryObject({NameObject("/W"): NumberObject(0)})
                ann[NameObject("/Contents")] = TextStringObject(
                    f"#{rowno[r.key]} {r.key}\n{r.severity} {r.status}\n{r.title}\n{r.detail}")
                ann[NameObject("/Subj")] = TextStringObject(r.key)
                ann[NameObject("/NM")] = TextStringObject(f"AutoCheck:{run_id}:{r.key}")
                writer.add_annotation(page_number=page_no, annotation=ann)
        else:
            page_no = n_index + info["pdf_page"]
            fit = Fit.fit()
            dest = ArrayObject([writer.pages[page_no].indirect_reference, NameObject("/Fit")])
            bbox = None
            vout = None
        writer.add_named_destination_array(TextStringObject(r.dest), dest)
        writer.add_outline_item(f"{r.key}  {r.title[:60]}", page_no, parent=sev_nodes.get(r.severity, root), fit=fit)
        sidecar["rows"][r.key] = {"n": rowno[r.key], "dest": r.dest, "pdf_page": page_no + 1, "bbox": bbox,
                                  "missing": info["missing"], "found": [b[4] for b in info["boxes"]],
                                  "view": vout if bbox else None}

    # 3. index links
    rowinfo = {r.key: r for r in rows}
    for ipage, rect, key in links:
        s = sidecar["rows"].get(key)
        if not s or s["pdf_page"] is None:
            continue
        tgt = s["pdf_page"] - 1
        v = s.get("view")
        fit = (Fit.fit_rectangle(*v) if v and len(v) == 4 else
               Fit.xyz(left=v[0], top=v[1], zoom=zoom) if v else Fit.fit())
        writer.add_annotation(page_number=ipage, annotation=Link(rect=rect, target_page_index=tgt, fit=fit))
    writer.add_metadata({"/Title": f"AutoCheck {a_label} -> {b_label} annotated schematic", "/Producer": "AutoCheck"})
    out_pdf.parent.mkdir(parents=True, exist_ok=True)
    with open(out_pdf, "wb") as fh:
        writer.write(fh)

    located = sum(1 for v in sidecar["rows"].values() if v.get("bbox"))
    mismatch = verify_boxes(out_pdf, sidecar)
    if mismatch:
        warnings.append(f"BOX_MISMATCH on {len(mismatch)} row(s): the written comment box does not enclose the "
                        f"part text when the output is re-read: {mismatch[:5]}" + (" ..." if len(mismatch) > 5 else ""))
    sidecar["summary"] = {"rows": len(rows), "located": located,
                          "page_only": sum(1 for v in sidecar["rows"].values() if v["pdf_page"] and not v.get("bbox")),
                          "unplaced": sum(1 for v in sidecar["rows"].values() if not v["pdf_page"]),
                          "box_mismatch": len(mismatch)}
    out_pdf.with_suffix(".annotations.json").write_text(json.dumps(sidecar, ensure_ascii=False, indent=1), encoding="utf-8")
    return sidecar


# ----------------------------------------------------------------------------------- self-check
def _pdfstr(v) -> str:
    if isinstance(v, bytes):
        try:
            return v.decode("utf-16") if v.startswith(b"\xfe\xff") else v.decode("latin-1")
        except UnicodeDecodeError:
            return v.decode("latin-1", "replace")
    return str(v)


def verify_boxes(out_pdf: Path, sidecar: dict, tol: float = 0.75) -> list[str]:
    """Re-read the written PDF and check every Square comment really encloses the text of one of the parts it was
    placed on. Guards the coordinate pipeline (normalise -> locate -> write) against page geometry we have not met
    yet: a mismatch means the viewer will show the box somewhere else than the part. Marks, never blocks:
    Only the boxes this run wrote are checked (/NM = AutoCheck:<run_id>:<key>), so leftovers from an earlier
    annotation pass on the same input cannot mask a wrong box. Section labels (U12A) count for part U12, as in
    PageIndex. sidecar rows get box_check = ok | mismatch | none (no comment box, e.g. INFO rows).
    Returns mismatched keys."""
    bad: list[str] = []
    run_id = sidecar.get("run_id", "")
    with pdfplumber.open(str(out_pdf)) as pdf:
        words_cache: dict[int, list[tuple[str, tuple]]] = {}

        def words(pno: int):
            if pno not in words_cache:
                p = pdf.pages[pno]
                h = float(p.height)
                q = p.dedupe_chars(tolerance=DEDUPE_TOL)
                ws = q.extract_words(keep_blank_chars=False, use_text_flow=False)
                words_cache[pno] = [(w["text"], (float(w["x0"]), h - float(w["bottom"]),
                                                 float(w["x1"]), h - float(w["top"]))) for w in ws]
                words_cache[pno] += list(_tight_tokens(q.chars, h))      # same tokeniser as the locator
            return words_cache[pno]

        for key, s in sidecar["rows"].items():
            if not s.get("bbox") or not s.get("pdf_page"):
                s["box_check"] = "none"
                continue
            pno = s["pdf_page"] - 1
            p = pdf.pages[pno]
            h = float(p.height)
            rects = [(float(a["x0"]), h - float(a["bottom"]), float(a["x1"]), h - float(a["top"]))
                     for a in (p.annots or [])
                     if "Square" in repr(a["data"].get("Subtype"))
                     and _pdfstr(a["data"].get("NM", "")) == f"AutoCheck:{run_id}:{key}"]
            if not rects:
                s["box_check"] = "none"
                continue
            wanted = set(s.get("found") or [])
            ok = False
            for ax0, ay0, ax1, ay1 in rects:
                for text, (x0, y0, x1, y1) in words(pno):
                    tok = next((t for t in (text, *_WORD.findall(text))
                                if t in wanted or (_SECTION.match(t) and _SECTION.match(t).group(1) in wanted)), None)
                    if tok and ax0 - tol <= x0 and ay0 - tol <= y0 and x1 <= ax1 + tol and y1 <= ay1 + tol:
                        ok = True
                        break
                if ok:
                    break
            s["box_check"] = "ok" if ok else "mismatch"
            if not ok:
                bad.append(key)
    return bad
