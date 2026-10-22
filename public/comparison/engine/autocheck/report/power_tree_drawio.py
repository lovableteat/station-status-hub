"""B1 power tree as an editable draw.io file (owner request 2026-10-15).

Third renderer of the same layout() boxes (Excel / SVG / draw.io). The owner opens the file in draw.io
(diagrams.net), rearranges and styles it; AutoCheck keeps the topology right.

File format (uncompressed XML, verified 2026-10-15):
  mxfile > diagram > mxGraphModel > root; cells "0" (root) and "1" (default layer) are mandatory, vertex="1" /
  edge="1", ids unique per diagram.        https://www.drawio.com/docs/reference/diagram-generation/
  <object label= tooltip= link=> wraps an mxCell to carry custom properties; edges need
  <mxGeometry relative="1" as="geometry"/>.  https://github.com/jgraph/drawio-mcp/blob/main/shared/xml-reference.md
  tooltip = predefined shape property.      https://drawio.com/doc/faq/tooltips

Cell ids are stable: box = "pt|" + Box.key, edge = "pe|" + child Box.key (Box.key = kind|conv|rail); a repeated key
gets "#2", "#3" in layout order (QA 2026-10-15: one removed box per A input rail), so a later merge can key on them.
Labels are HTML (html=1) and the tooltip is shown as sanitized HTML too, so both are escaped twice (text, then XML).
Pages: 1 = default view (converter-internal nets hidden, as on the web page), 2 = all nets (only when different).
Edges are attached to source / target (they follow the boxes when moved), carry an arrow (power flow) and the
converter kind as label. Colours = the web page (white background); the owner restyles in draw.io.
"""
from __future__ import annotations

from html import escape

from .power_tree_diagram import LEGEND, SECTION_TITLE, SVG_FILL, Box, section_starts

# geometry (px). Row unit RU keeps layout()'s line grid; a box is 2 x TOP_PAD + lines * TL tall.
# TL = draw.io html label line height (1.2 x font size, measured in the official viewer 2026-10-15), so the anchor
# below lands on the boundary after the 2nd text line (QA 2026-10-15: TL 15 put it inside the 2nd line).
FONT = 12
RU, TL, TOP_PAD = 18, 1.2 * FONT, 4
XGAP, X0 = 170, 20
BOTTOM_EXTRA = 5                       # descenders of the last line (viewer render 2026-10-15)
ANCHOR_LINES = 2                       # connectors at the boundary after the 2nd text line (same as the SVG)
KIND_SHORT = {"buck / switcher": "buck", "LDO / eFuse / switch": "LDO/eFuse/SW", "hot-swap / FET switch": "HSC",
              "FET switch (discrete)": "FET", "diode": "diode"}


def _q(s: str) -> str:
    """XML attribute value (quotes + newlines kept as entities)."""
    return escape(str(s), quote=True).replace("\n", "&#xa;")


def _tw(s: str, size: float, bold: bool = False) -> float:
    """Text width estimate on the safe side (QA 2026-10-15: 0.6 em let bold capitals overflow)."""
    w = sum(size if ord(c) > 0x2E7F else (0.68 * size if (c.isupper() or c.isdigit()) else 0.58 * size) for c in s)
    return w * (1.08 if bold else 1.0)


def _box_style(b: Box) -> str:
    key = b.status or ("orphan" if b.kind == "orphan" else ("dnp" if b.dashed and not b.diode else ""))
    stroke, sw, font = "#000000", 1, "#000000"
    if b.kind == "orphan":
        stroke, sw = "#C00000", 2
    elif b.status == "removed":
        stroke = "#C00000"
    elif b.dashed and not b.diode:
        stroke, font = "#808080", "#808080"
    dashed = 1 if (b.dashed or b.status == "removed") else 0
    return (f"rounded=1;arcSize=4;absoluteArcSize=1;whiteSpace=nowrap;html=1;align=left;verticalAlign=top;"
            f"spacing=0;spacingLeft=6;spacingTop={TOP_PAD};fontSize={FONT};fillColor={SVG_FILL[key]};strokeColor={stroke};"
            f"strokeWidth={sw};dashed={dashed};fontColor={font};")


def _label(b: Box) -> str:
    rows = []
    for i, t in enumerate(b.lines):
        t = escape(t)
        rows.append(f"<b>{t}</b>" if i == 0 else t)
    return "<br>".join(rows)


def _page(boxes: list[Box], title: str, intro: str, pdf_url, a_label: str, b_label: str, pid: str) -> str:
    by_id = {b.id: b for b in boxes}
    bw = max([230.0] + [_tw(t, FONT, i == 0) + 18 for b in boxes for i, t in enumerate(b.lines)])
    bw = float(int(bw + 9) // 10 * 10)
    starts = section_starts(boxes)
    sec_extra = {sec: 2 * RU * k for k, sec in enumerate(s for s in ("tree", "orphan", "removed") if s in starts)}
    maxlvl = max((b.level for b in boxes), default=0)
    width = (maxlvl + 1) * bw + maxlvl * XGAP
    legend_w = sum(_tw(t, 11) + 28 for _, t in LEGEND) - 8
    # cell ids: "pt|" + Box.key; a key seen again (e.g. one removed box per A input rail of the same converter,
    # QA 2026-10-15) gets "#2", "#3" in box order, which layout() keeps deterministic
    # (QA re-check: '#' is legal in net names, so count on until the id is really unused)
    cid: dict[int, str] = {}
    used: set[str] = set()
    for b in boxes:
        c, n = b.key, 1
        while c in used:
            n += 1
            c = f"{b.key}#{n}"
        used.add(c)
        cid[b.id] = c

    cells: list[str] = []
    # header box (title + how to read) and legend box: framed, as the owner asked for diagram headers
    head_h = 64
    cells.append(f'<mxCell id="hdr" value="{_q("<b>" + escape(title) + "</b><br>" + escape(intro))}" '
                 f'style="rounded=0;whiteSpace=wrap;html=1;align=left;verticalAlign=middle;spacingLeft=8;fontSize=13;'
                 f'fillColor=#FFFFFF;strokeColor=#000000;" vertex="1" parent="1">'
                 f'<mxGeometry x="{X0}" y="10" width="{max(width, legend_w, 900):.0f}" height="{head_h}" as="geometry"/></mxCell>')
    ly = 10 + head_h + 10
    lx = X0
    for k, (sk, txt) in enumerate(LEGEND):
        fake = Box(id=-1, kind="orphan" if sk == "orphan" else "conv", rail="", volt=None,
                   built=sk not in ("dnp",), status=sk if sk in ("new", "changed", "removed") else "",
                   edge_kind="diode" if sk == "diode" else "")
        st = _box_style(fake).replace("verticalAlign=top", "verticalAlign=middle")
        w = _tw(txt, 11) + 20
        cells.append(f'<mxCell id="lg{k}" value="{_q(escape(txt))}" style="{st}fontSize=11;" vertex="1" parent="1">'
                     f'<mxGeometry x="{lx:.0f}" y="{ly}" width="{w:.0f}" height="22" as="geometry"/></mxCell>')
        lx += w + 8
    y0 = ly + 22 + 24

    def geo(b: Box) -> tuple[float, float, float]:
        x = X0 + b.level * (bw + XGAP)
        y = y0 + sec_extra.get(b.section, 0) + b.top * RU
        return x, y, TOP_PAD * 2 + b.height * TL + BOTTOM_EXTRA

    for sec, r0 in starts.items():
        if sec in SECTION_TITLE:
            b0 = next(b for b in boxes if b.parent is None and b.section == sec and b.top == r0)
            _, y, _ = geo(b0)
            t = SECTION_TITLE[sec].format(a=a_label, b=b_label)
            cells.append(f'<mxCell id="sec|{sec}" value="{_q(escape(t))}" style="text;html=1;align=left;'
                         f'verticalAlign=middle;fontStyle=1;fontColor=#C00000;fontSize=12;" vertex="1" parent="1">'
                         f'<mxGeometry x="{X0}" y="{y - 26:.0f}" width="{_tw(t, 12) + 20:.0f}" height="20" as="geometry"/>'
                         f'</mxCell>')
    for b in boxes:
        x, y, h = geo(b)
        url = pdf_url(b.page) if (pdf_url and b.page is not None and b.kind == "conv") else None
        link = f' link="{_q(url)}"' if url else ""
        cells.append(f'<object id="{_q(pid + "pt|" + cid[b.id])}" label="{_q(_label(b))}" '   # tooltip is shown
                     f'tooltip="{_q(escape(chr(10).join(b.hover)))}"{link}>'
                     f'<mxCell style="{_box_style(b)}" vertex="1" parent="1">'
                     f'<mxGeometry x="{x:.0f}" y="{y:.0f}" width="{bw:.0f}" height="{h:.0f}" as="geometry"/>'
                     f'</mxCell></object>')
    for b in boxes:                                   # one edge per child, parent -> child = power flow
        if b.parent is None:
            continue
        p = by_id[b.parent]
        _, _, hp = geo(p)
        _, _, hc = geo(b)
        ay = TOP_PAD + ANCHOR_LINES * TL + 0.2 * FONT    # mid-gap between line 2 and 3 (QA pixel check)
        if b.kind == "bias":
            kind = "內部"
        elif b.status == "removed":      # removed boxes carry no edge_kind; the A part / kind is in the tooltip
            kind = "移除"
        else:
            kind = KIND_SHORT.get(b.edge_kind, b.edge_kind) or "?"
        col = "#C00000" if b.status == "removed" else "#404040"
        dashed = 1 if b.dashed else 0
        cells.append(f'<mxCell id="{_q(pid + "pe|" + cid[b.id])}" value="{_q(escape(kind))}" '
                     f'style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=block;endSize=6;'
                     f'strokeColor={col};strokeWidth=1.2;dashed={dashed};fontSize=10;fontColor={col};'
                     f'labelBackgroundColor=none;exitX=1;exitY={min(ay / hp, 1):.4f};exitDx=0;exitDy=0;'
                     f'entryX=0;entryY={min(ay / hc, 1):.4f};entryDx=0;entryDy=0;" edge="1" parent="1" '
                     f'source="{_q(pid + "pt|" + cid[p.id])}" target="{_q(pid + "pt|" + cid[b.id])}">'
                     f'<mxGeometry x="1" relative="1" as="geometry">'       # label at the target end,
                     f'<mxPoint x="{-XGAP / 4:.0f}" y="-9" as="offset"/></mxGeometry></mxCell>')  # above the last run
    return ('<mxGraphModel grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" '
            'pageScale="1" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>'
            + "".join(cells) + "</root></mxGraphModel>")


def render_drawio(boxes: list[Box], title: str, pdf_url=None, a_label: str = "A", b_label: str = "B",
                  diff: bool = True, boxes_all: list[Box] | None = None) -> str:
    """boxes = default view (layout(show_internal=False)); boxes_all = layout(show_internal=True) -> page 2 when
    the default view hides internal nets. Deterministic: no timestamps beyond the title, no set iteration."""
    intro = ("框內：rail 名 / 電壓 / 轉換元件 RefDes / 負載 IC 數。箭頭 = 供電方向，線上字 = 轉換元件類型。"
             "滑鼠停在框上看料號、EN / PG、同組 net、負載清單。")
    if not diff:
        intro += (f"　({a_label} 的 power tree 沒有算出來，本圖沒有變更顏色)" if a_label
                  else "　(單板圖，沒有比對對象，本圖沒有變更顏色)")
    pages = [("預設 (隱藏 IC 內部 net)", boxes, "")]
    n_int = sum(len(b.internal) for b in boxes)          # same rule as render_html's toggle (QA 2026-10-15)
    if boxes_all is not None and n_int:
        pages.append(("含 IC 內部 net", boxes_all, "all|"))
    out = ['<mxfile host="AutoCheck" type="device">']
    for k, (name, bx, pid) in enumerate(pages):
        out.append(f'<diagram id="pt{k}" name="{_q(name)}">'
                   + _page(bx, title, intro, pdf_url, a_label, b_label, pid) + "</diagram>")
    out.append("</mxfile>")
    return "".join(out)
