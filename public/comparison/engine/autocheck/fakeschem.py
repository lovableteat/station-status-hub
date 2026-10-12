"""Synthetic OrCAD-like schematic PDF for annotation tests (no real schematic needed).

Each page: title block text (title, "Sheet N of M"), RefDes + value labels at deterministic
pseudo-random positions, repeated net labels, and decoy tokens that share a prefix with real
RefDes (C693 -> C6930, C69). Returns the ground truth {refdes: (page_index, x, y, w, h)}.
"""
from __future__ import annotations

import random
from pathlib import Path

from reportlab.lib.pagesizes import A3, landscape
from reportlab.pdfgen import canvas

FONT = "Helvetica"


def make_fake_schematic(out: Path, pages: dict[int, str], parts_by_page: dict[int, list[tuple[str, str]]],
                        page_order: list[int] | None = None, seed: int = 1, nets: list[str] | None = None,
                        skip_title_on: set[int] | None = None, bold_title: bool = False, glue_pins: bool = False,
                        sections: set[str] | None = None) -> dict[str, tuple[int, float, float, float, float]]:
    """pages: page number -> title. parts_by_page: page number -> [(refdes, value)].
    page_order: PDF order of page numbers (default ascending). Returns truth: refdes -> (pdf_index, x, y, w, h)
    with (x, y) the text baseline origin in PDF user space.
    Real OrCAD print quirks (seen on CATANIA DVT, Microsoft Print to PDF):
      bold_title  title drawn 3x with a sub-point offset (OrCAD bold) -> 'TTTiiitttllleee' in the text layer
      glue_pins   pin number printed right after the RefDes: alternately 0.18 x size gap on the same
                  baseline, and touching but 0.4 pt lower (both glued into one pdfplumber word)
      sections    these RefDes print with a section suffix ('Q50' -> 'Q50A')"""
    rnd = random.Random(seed)
    order = page_order or sorted(pages)
    W, H = landscape(A3)
    c = canvas.Canvas(str(out), pagesize=(W, H))
    truth: dict[str, tuple[int, float, float, float, float]] = {}
    nets = nets or ["3V3_STBY", "GND", "P12V", "HSC1_GATE"]
    for pdf_idx, num in enumerate(order):
        title = pages[num]
        # frame + title block
        c.setLineWidth(0.8)
        c.rect(20, 20, W - 40, H - 40)
        c.setFont(FONT, 9)
        if not (skip_title_on and num in skip_title_on):
            for dx in ((0.0, 0.25, 0.5) if bold_title else (0.0,)):
                c.drawString(W - 320 + dx, 40, f"Title: {title}")
        c.drawString(W - 320, 28, f"Sheet {pdf_idx + 1} of {len(order)}    Rev DVT")
        c.setFont(FONT, 7)
        # grid of cells so no two text items overlap (overlapping glyphs merge in the text layer)
        cw, ch = 58.0, 30.0
        cells = [(60 + i * cw, 90 + j * ch) for i in range(int((W - 300) / cw)) for j in range(int((H - 150) / ch))]
        rnd.shuffle(cells)
        def cell():
            if not cells:
                raise RuntimeError("fake schematic page too dense")
            return cells.pop()
        # wires + net labels
        for _ in range(12):
            x, y = cell()
            c.line(x, y, x + 40, y)
            c.drawString(x, y + 2, rnd.choice(nets))
        # parts
        for k, (refdes, value) in enumerate(parts_by_page.get(num, [])):
            x, y = cell()
            c.setFont(FONT, 7)
            label = refdes + ("A" if sections and refdes in sections else "")
            c.drawString(x, y, label)
            w = c.stringWidth(label, FONT, 7)
            if glue_pins:
                if k % 2:
                    c.drawString(x + w + 0.18 * 7, y, "2")          # same baseline, small gap
                else:
                    c.drawString(x + w, y - 0.4, "1")               # touching, baseline 0.4 pt lower
            c.drawString(x, y - 9, value)
            c.rect(x - 2, y - 22, max(w, 24) + 4, 8, stroke=1, fill=0)   # symbol body
            truth[refdes] = (pdf_idx, x, y, w, 7.0)
        # decoys: same prefix, one char longer / shorter
        for refdes, _v in parts_by_page.get(num, [])[:3]:
            x, y = cell()
            c.drawString(x, y, refdes + "0")
            x, y = cell()
            c.drawString(x, y, refdes[:-1] if len(refdes) > 2 else refdes + "X")
        c.showPage()
    c.save()
    return truth
