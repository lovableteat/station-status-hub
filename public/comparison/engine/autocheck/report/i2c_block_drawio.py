"""I2C map 陽春版 as an editable draw.io file (owner request 2026-10-15).

Second renderer of the same i2c_block_diagram.layout() (the SVG on pages/3 is the first), so the topology in draw.io
= the web page. The owner rearranges / restyles in draw.io (diagrams.net); AutoCheck keeps the topology right.

Owner decisions 2026-10-15:
  - wires are glued to the parts (甲): every run is split at resistors, join dots and the trunk foot / top corners, each piece
    is an edge with source / target, so dragging a box or a resistor drags its wires along;
  - arrows as on the web page (SCL: upstream -> device; SDA: both ends), wire labels = net names;
  - a branch resistor shared by two devices stays drawn once per device (as on the web page), its tooltip says so;
  - only the 陽春版; dark background by default (owner's drawing preference: dark canvas, light boxes / wires, dark
    text inside boxes, title + description framed).

Format notes (checked against draw.io source 32.4.1 and rendered with the official viewer-static.min.js):
  - uncompressed mxfile, cells "0" / "1" mandatory, edges carry <mxGeometry relative="1">.
    https://www.drawio.com/docs/reference/diagram-generation/
  - mxGraphModel background="..." sets the canvas colour (Editor.js setGraphXml reads 'background');
    adaptiveColors="none" stops draw.io from inverting explicit colours in its dark UI (Graph.js: values auto /
    simple / none, default auto).  https://github.com/jgraph/drawio-mcp/blob/main/shared/xml-reference.md
  - resistor = inline stencil shape=stencil(base64(deflateRaw(encodeURIComponent(xml)))) (Graph.js
    createShape / Graph.decompress). The library shapes mxgraph.electrical.resistors.* load
    stencils/electrical/resistors.xml from the draw.io server at run time (seen in the viewer: blank offline),
    the inline one needs nothing. Zigzag = the SVG's 9 points; ports a (left) / b (right), direction=south for
    a vertical pull-up.
  - wires: edgeStyle=orthogonalEdgeStyle. Every piece is horizontal / vertical with its corners given, so the first
    render is pixel-identical to edgeStyle=none (viewer diff 2026-10-15); after a drag draw.io re-routes it at right
    angles (schematic look) instead of a diagonal. It can then run along another wire: the owner tidies by hand.
  - crossings: jumpStyle=arc on every wire; draw.io draws the hop on the edge painted later, so upstream lines /
    trunks go first (Wire.z = 0) and pull-ups / branches hop over them, as on the web page.
  - DNP resistor = red X (shape=umlDestroy, Sidebar.js) as a child cell of the resistor: it moves with it.
  - tooltips are shown as sanitized HTML (QA 2026-10-15, power tree): text escaped, then XML-escaped.
Ids: "ib|" + Node.key for parts, "iw|" + Wire.key + "|<n>" for the n-th piece of a run; a duplicate node key is a
layout bug and raises (cli then writes no file and reports a warning).
"""
from __future__ import annotations

import base64
import urllib.parse
import zlib
from html import escape

from .i2c_block_diagram import BH, Drawing, Node, Wire, _tw, layout

PALETTES = {
    # dark (default): dark canvas, light wires / boxes, dark text inside boxes, light text on the canvas
    "dark": {"bg": "#1E1E1E", "K": "#F2F2F2", "G": "#A6A6A6", "R": "#FF6B6B", "SCL": "#F4B183", "SDA": "#8FBCE6",
             "dot": "#FF7DFF", "bar": "#F2F2F2", "sep": "#5A5A5A",
             "up_fill": "#F4B183", "up_stroke": "#FBE5D6", "none_fill": "#D9D9D9", "none_stroke": "#A6A6A6",
             "dev_fill": "#D9D9D9", "dev_stroke": "#FFFFFF", "dnp_fill": "#EDEDED", "dnp_stroke": "#A6A6A6",
             "conflict": "#FF6B6B", "box_K": "#000000", "box_G": "#7F7F7F", "box_R": "#C00000", "link": "#0563C1",
             "hdr_fill": "#F2F2F2", "hdr_stroke": "#BFBFBF", "hdr_text": "#000000"},
    # light = the web page colours
    "light": {"bg": "#FFFFFF", "K": "#000000", "G": "#8C8C8C", "R": "#C00000", "SCL": "#C55A11", "SDA": "#1F4E79",
              "dot": "#C000C0", "bar": "#000000", "sep": "#D0D0D0",
              "up_fill": "#F4B183", "up_stroke": "#843C0C", "none_fill": "#F2F2F2", "none_stroke": "#8C8C8C",
              "dev_fill": "#D9D9D9", "dev_stroke": "#000000", "dnp_fill": "#F2F2F2", "dnp_stroke": "#8C8C8C",
              "conflict": "#C00000", "box_K": "#000000", "box_G": "#8C8C8C", "box_R": "#C00000", "link": "#0563C1",
              "hdr_fill": "#FFFFFF", "hdr_stroke": "#000000", "hdr_text": "#000000"},
}

RES_W, RES_H = 24, 8          # resistor body, same as the SVG zigzag
DOT_D = 7.2                   # join dot diameter (SVG r = 3.6)
_STENCIL_XML = ('<shape name="AutoCheck resistor" w="24" h="8" aspect="variable" strokewidth="inherit">'
                '<connections><constraint x="0" y="0.5" perimeter="0" name="a"/>'
                '<constraint x="1" y="0.5" perimeter="0" name="b"/></connections>'
                '<foreground><path><move x="0" y="4"/>'
                + "".join(f'<line x="{3 * i}" y="{4 if i == 8 else (0 if i % 2 else 8)}"/>' for i in range(1, 9))
                + '</path><stroke/></foreground></shape>')


def _stencil(xml: str) -> str:
    """draw.io Graph.compress: base64(deflateRaw(encodeURIComponent(xml)))."""
    raw = urllib.parse.quote(xml, safe="-_.!~*'()").encode("ascii")
    c = zlib.compressobj(9, zlib.DEFLATED, -15)
    return base64.b64encode(c.compress(raw) + c.flush()).decode("ascii")


RES_SHAPE = "stencil(" + _stencil(_STENCIL_XML) + ")"


def _q(s) -> str:
    """XML attribute value (quotes + newlines kept as entities)."""
    return escape(str(s), quote=True).replace("\n", "&#xa;")


def _f(v: float) -> str:
    return f"{v:.1f}".rstrip("0").rstrip(".")


def _html_lines(lines, pal, url=None) -> str:
    """Box text: [(text, size, logical colour, weight)] -> html label (text escaped once, XML-escaped by _q)."""
    rows = []
    for j, (t, s, c, w) in enumerate(lines):
        col = pal["link"] if (j == 0 and url) else pal["box_" + c]
        t = escape(t)
        if w == "bold":
            t = f"<b>{t}</b>"
        if j == 0 and url:
            t = f"<u>{t}</u>"
        rows.append(f'<font style="font-size:{s}px" color="{col}">{t}</font>')
    return "<br>".join(rows)


class _Out:
    def __init__(self):
        self.cells: list[str] = []
        self.ids: set[str] = set()

    def new_id(self, base: str) -> str:
        c, n = base, 1
        while c in self.ids:          # '#' is legal in net / RefDes text: count on until really unused
            n += 1
            c = f"{base}#{n}"
        self.ids.add(c)
        return c


def _vertex(out: _Out, cid: str, value: str, style: str, x, y, w, h, parent="1", tooltip=None, link=None) -> None:
    geo = f'<mxGeometry x="{_f(x)}" y="{_f(y)}" width="{_f(w)}" height="{_f(h)}" as="geometry"/>'
    if tooltip is None and link is None:
        out.cells.append(f'<mxCell id="{_q(cid)}" value="{_q(value)}" style="{style}" vertex="1" '
                         f'parent="{_q(parent)}">{geo}</mxCell>')
        return
    extra = (f' tooltip="{_q(escape(tooltip))}"' if tooltip else "") + (f' link="{_q(link)}"' if link else "")
    out.cells.append(f'<object id="{_q(cid)}" label="{_q(value)}"{extra}><mxCell style="{style}" vertex="1" '
                     f'parent="{_q(parent)}">{geo}</mxCell></object>')


def _port(nd: Node, fx, fy, role: str) -> tuple[str, tuple[float, float]]:
    """(style constraint, absolute point) where a wire meets node nd. role = exit | entry."""
    if nd.kind in ("up", "dev"):
        pt = (nd.x + fx * nd.w, nd.y + fy * nd.h)
        k = "exit" if role == "exit" else "entry"
        return f"{k}X={_f(fx)};{k}Y={fy:.4f};{k}Dx=0;{k}Dy=0;", pt
    if nd.kind == "res":
        # chain direction is always a -> b (left -> right, or top -> bottom for a pull-up)
        if role == "entry":
            pt = (nd.x - RES_W / 2, nd.y) if nd.data["orient"] == "h" else (nd.x, nd.y - RES_W / 2)
            return "entryX=0;entryY=0.5;entryDx=0;entryDy=0;", pt
        pt = (nd.x + RES_W / 2, nd.y) if nd.data["orient"] == "h" else (nd.x, nd.y + RES_W / 2)
        return "exitX=1;exitY=0.5;exitDx=0;exitDy=0;", pt
    return "", (nd.x, nd.y)                       # dot / corner: centre perimeter


def _edges(out: _Out, w: Wire, nodes: dict, nid: dict, pal: dict, dy: float) -> None:
    """Split one run at its node stops into glued edges; free corners become waypoints, a trailing free point the
    target point. Arrows only on the first / last piece, labels on the piece named by the label."""
    pieces = []                      # (src stop | None, waypoints, dst stop | point)
    src, pts = None, []
    for st in w.stops:
        if st[0] == "p":
            pts.append((st[1], st[2]))
            continue
        if src is not None:
            pieces.append((src, pts, st))
        elif pts:
            raise ValueError(f"wire {w.key} starts with a free point")
        src, pts = st, []
    if pts:                          # free end (line without devices)
        pieces.append((src, pts[:-1], ("pt",) + pts[-1]))
    col = pal[w.col]
    for n, (s, wps, t) in enumerate(pieces):
        sn = nodes[s[1]]
        s_style, s_pt = _port(sn, s[2], s[3], "exit")
        if t[0] == "n":
            tn = nodes[t[1]]
            t_style, t_pt = _port(tn, t[2], t[3], "entry")
            term = f' source="{_q(nid[s[1]])}" target="{_q(nid[t[1]])}"'
            tgt_pt = ""
        else:
            t_style, t_pt = "", (t[1], t[2])
            term = f' source="{_q(nid[s[1]])}"'
            tgt_pt = f'<mxPoint x="{_f(t[1])}" y="{_f(t[2] + dy)}" as="targetPoint"/>'
        first, last = n == 0, n == len(pieces) - 1
        start = "startArrow=block;startFill=1;startSize=6;" if (first and w.start_arrow) else "startArrow=none;"
        end = "endArrow=block;endFill=1;endSize=6;" if (last and w.end_arrow and t[0] == "n") else "endArrow=none;"
        lab = [x for x in w.labels if (x[6] == "first" and first) or (x[6] == "last" and last)]
        value, xattr, offset, lstyle = "", "", "", ""
        if lab:
            text, size, bold, lc, lx, ly_, which = lab[0]
            ax, ay = s_pt if which == "first" else t_pt
            value = escape(text)
            # label box: left edge at the SVG text x, bottom ~ baseline + descent (viewer calibration 2026-10-15:
            # align=left / verticalAlign=bottom / spacing=0 puts the box's left-bottom corner on the label point)
            xattr = f' x="{-1 if which == "first" else 1}"'
            offset = f'<mxPoint x="{_f(lx - ax)}" y="{_f(ly_ + 0.2 * size - ay)}" as="offset"/>'
            lstyle = (f"fontSize={size};fontStyle={1 if bold else 0};fontColor={pal[lc]};align=left;"
                      f"verticalAlign=bottom;spacing=0;labelBackgroundColor=none;")
        way = ""
        if wps:
            way = ('<Array as="points">' + "".join(f'<mxPoint x="{_f(x)}" y="{_f(y + dy)}"/>' for x, y in wps)
                   + "</Array>")
        style = (f"html=1;rounded=0;edgeStyle=orthogonalEdgeStyle;jumpStyle=arc;jumpSize=10;{start}{end}"
                 f"strokeColor={col};strokeWidth={_f(w.width)};dashed={1 if w.dash else 0};{s_style}{t_style}{lstyle}")
        out.cells.append(f'<mxCell id="{_q(out.new_id(f"iw|{w.key}|{n}"))}" value="{_q(value)}" style="{style}" '
                         f'edge="1" parent="1"{term}><mxGeometry{xattr} relative="1" as="geometry">'
                         f'{offset}{tgt_pt}{way}</mxGeometry></mxCell>')


LEGEND = [("SDA", "SDA", "swatch"), ("SCL", "SCL", "swatch"), ("dot", "接點", "swatch"),
          ("R", "✕ 電阻 DNP", "text"), ("", "虛線框 = 元件 DNP", "text"), ("", "紅框 = 位址衝突", "text"),
          ("", "7-bit: ? = 位址庫沒有這顆 (缺 datasheet)", "text"),
          ("", "藍字 RefDes 的框 = 開線路圖該頁", "text"), ("", "線上的小弧 = 跨線不相連", "text")]


def render_drawio(m: dict, title: str, pdf_url=None, theme: str = "dark", drawing: Drawing | None = None) -> str:
    """m = checks/i2c_map.build_map() result (same as render_html). Deterministic: no set iteration, no clock."""
    pal = PALETTES[theme]
    d = drawing or layout(m, pdf_url)
    nodes: dict[str, Node] = {}
    for nd in d.nodes:
        if nd.key in nodes:
            raise ValueError(f"duplicate layout key {nd.key!r}")
        nodes[nd.key] = nd
    out = _Out()
    for k in ("0", "1"):
        out.ids.add(k)
    # ---- header (framed title + how to read) and legend boxes
    width = max(d.width, 900.0)
    intro = ("陽春版：誰掛在哪條 bus、7-bit 位址、中間接了哪些電阻；拓撲 = AutoCheck 網頁 (netlist + BOM)。"
             "線黏在元件上，拖框或電阻線會跟著走。箭頭：SCL 上游 → 元件，SDA 兩端 (雙向)；線上字 = net 名。"
             "共用的分支電阻每個元件各畫一次 (滑鼠停在電阻上看)。")
    hdr = f"<b>{escape(title)}</b><br>{escape(intro)}"
    hs = (f"rounded=0;whiteSpace=wrap;html=1;align=left;verticalAlign=middle;spacingLeft=8;fontSize=13;"
          f"fillColor={pal['hdr_fill']};strokeColor={pal['hdr_stroke']};fontColor={pal['hdr_text']};")
    _vertex(out, out.new_id("hdr"), hdr, hs, 16, 10, width - 26, 64)
    # legend: one framed row ON the canvas (QA 2026-10-15: colour swatches on a light box were ~2:1 contrast and
    # the row of small boxes ran past narrow drawings). Swatches use the drawing's own colours; wraps to the width.
    items = []
    for ck, txt, kind in LEGEND:
        if kind == "swatch":
            items.append(f'<font color="{pal[ck]}"><b>{"●" if ck == "dot" else "━━"}</b></font> {escape(txt)}')
        elif ck == "R":
            items.append(f'<font color="{pal["R"]}"><b>✕</b></font>{escape(txt[1:])}')
        else:
            items.append(escape(txt))
    lg_w = width - 26
    n_lines = 1 + int(sum(_tw(t, 12) + 30 for _, t, _ in LEGEND) // (lg_w - 16))
    lg_h = 10 + 18 * n_lines
    _vertex(out, out.new_id("legend"), "　　".join(items),
            f"rounded=0;whiteSpace=wrap;html=1;align=left;verticalAlign=middle;spacingLeft=8;spacingRight=8;"
            f"fontSize=12;fillColor=none;strokeColor={pal['hdr_stroke']};fontColor={pal['K']};", 16, 84, lg_w, lg_h)
    ly = 84 + lg_h - 22
    dy = ly + 22 + 20 - 10                        # drawing y = 10 lands just under the legend
    # ---- ids: one per node, in layout order
    nid = {nd.key: out.new_id("ib|" + nd.key) for nd in d.nodes}
    # shared branch resistors (drawn once per device): RefDes -> devices
    shared: dict[str, list[str]] = {}
    for nd in d.nodes:
        if nd.kind == "res" and nd.data.get("branch_of"):
            shared.setdefault(nd.data["refdes"], []).append(nd.data["branch_of"])
    vertex_cells, dot_cells = [], []
    for nd in d.nodes:
        y = nd.y + dy
        cid = nid[nd.key]
        if nd.kind in ("up", "dev"):
            if nd.kind == "up":
                none = nd.data["kind"] == "none"
                fill, stroke = (pal["none_fill"], pal["none_stroke"]) if none else (pal["up_fill"], pal["up_stroke"])
                dashed, sw, url = int(none), 2, None
            else:
                dnp = nd.data["dnp"]
                fill = pal["dnp_fill"] if dnp else pal["dev_fill"]
                stroke = pal["conflict"] if nd.data["conflict"] else (pal["dnp_stroke"] if dnp else pal["dev_stroke"])
                dashed, sw, url = int(dnp), 3 if nd.data["conflict"] else 2, nd.data["url"]
            st = (f"rounded=0;whiteSpace=nowrap;html=1;align=center;verticalAlign=middle;fillColor={fill};"
                  f"strokeColor={stroke};strokeWidth={sw};dashed={dashed};")
            _vertex(out, cid, _html_lines(nd.data["lines"], pal, url), st, nd.x, y, nd.w, nd.h, link=url)
        elif nd.kind == "res":
            built = nd.data["built"]
            col = pal["K"] if built else pal["G"]
            if nd.data["orient"] == "h":
                st = (f"shape={RES_SHAPE};html=1;fillColor=none;strokeColor={col};strokeWidth=1.4;fontSize=10;"
                      f"fontColor={col};labelBackgroundColor=none;verticalLabelPosition=top;verticalAlign=bottom;"
                      f"labelPosition=center;align=center;spacing=0;spacingBottom=3;resizable=0;")
                gx, gy, gw, gh = nd.x - RES_W / 2, y - RES_H / 2, RES_W, RES_H
                label = escape(nd.data["label"])
            else:
                st = (f"shape={RES_SHAPE};direction=south;html=1;fillColor=none;strokeColor={col};strokeWidth=1.4;"
                      f"fontSize=10;fontColor={col};labelBackgroundColor=none;labelPosition=left;align=right;"
                      f"verticalLabelPosition=middle;verticalAlign=middle;spacing=0;spacingRight=5;resizable=0;")
                gx, gy, gw, gh = nd.x - RES_H / 2, y - RES_W / 2, RES_H, RES_W
                label = f"<b>{escape(nd.data['refdes'])}</b><br>{escape(nd.data['value'])}"
            tip = None
            devs_of = shared.get(nd.data["refdes"], [])
            if nd.data.get("branch_of") and len(devs_of) > 1:
                others = [x for x in devs_of if x != nd.data["branch_of"]]
                tip = (f"{nd.data['refdes']} 同一顆電阻也畫在 {', '.join(others)} 的分支 "
                       f"(陽春版簡化：共用的分支電阻每個元件各畫一次)")
            vertex_cells.append((cid, label, st, gx, gy, gw, gh, tip, "1"))
            if not built:             # red X = child of the resistor (moves with it), centred on the body
                xs = 14
                vertex_cells.append((out.new_id(cid + "|x"), "", f"shape=umlDestroy;html=1;strokeColor={pal['R']};"
                                     f"strokeWidth=2.6;fillColor=none;resizable=0;movable=0;",
                                     (gw - xs) / 2, (gh - xs) / 2, xs, xs, None, cid))
        elif nd.kind == "bar":
            st = (f"shape=line;html=1;strokeColor={pal['bar']};strokeWidth=1.6;fontSize=11;fontStyle=1;"
                  f"fontColor={pal['K']};labelBackgroundColor=none;verticalLabelPosition=top;verticalAlign=bottom;"
                  f"spacing=0;spacingBottom={_f(nd.data['label_dy'] - 7)};")
            vertex_cells.append((cid, escape(nd.data["rail"]), st, nd.x, y - 5, nd.w, 10, None, "1"))
        elif nd.kind == "dot":
            dot_cells.append(nd)
        elif nd.kind == "corner":
            # invisible joint (QA 2026-10-15: a visible dot read as a join); still selectable / draggable in draw.io
            st = "ellipse;html=1;fillColor=none;strokeColor=none;perimeter=centerPerimeter;resizable=0;"
            dot_cells.append((cid, st, nd.x - 3, y - 3, 6, 6))
        elif nd.kind == "sep":
            st = f"shape=line;html=1;strokeColor={pal['sep']};strokeWidth=1;dashed=1;dashPattern=2 4;"
            vertex_cells.append((cid, "", st, nd.x, y - 5, nd.w, 10, None, "1"))
        elif nd.kind == "text":
            size = nd.data["size"]
            st = (f"text;html=1;align=left;verticalAlign=bottom;spacing=0;fontSize={size};"
                  f"fontColor={pal[nd.data['col']]};")
            h = 1.4 * size
            vertex_cells.append((cid, escape(nd.data["text"]), st, nd.x, y + 0.2 * size - h,
                                 _tw(nd.data["text"], size) + 12, h, None, "1"))
    for cid, value, st, x, y, w, h, tip, parent in vertex_cells:
        _vertex(out, cid, value, st, x, y, w, h, parent=parent, tooltip=tip)
    # ---- wires: upstream lines / trunks first (crossing pieces painted later hop over them)
    for w in sorted(d.wires, key=lambda w: w.z):
        _edges(out, w, nodes, nid, pal, dy)
    # ---- join dots last (on top of the wire ends); a dot on a rail bar is the bar's child (moves with it)
    for c in dot_cells:
        if isinstance(c, tuple):
            _vertex(out, c[0], "", c[1], c[2], c[3], c[4], c[5])
            continue
        nd = c
        st = (f"ellipse;html=1;fillColor={pal['dot']};strokeColor=none;perimeter=centerPerimeter;resizable=0;")
        bar = nd.data.get("bar")
        if bar:
            b = nodes[bar]
            _vertex(out, nid[nd.key], "", st, nd.x - b.x - DOT_D / 2, 5 - DOT_D / 2, DOT_D, DOT_D, parent=nid[bar])
        else:
            _vertex(out, nid[nd.key], "", st, nd.x - DOT_D / 2, nd.y + dy - DOT_D / 2, DOT_D, DOT_D)
    model = (f'<mxGraphModel grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" '
             f'page="0" pageScale="1" math="0" shadow="0" background="{pal["bg"]}" adaptiveColors="none">'
             '<root><mxCell id="0"/><mxCell id="1" parent="0"/>' + "".join(out.cells) + "</root></mxGraphModel>")
    return (f'<mxfile host="AutoCheck" type="device"><diagram id="i2cblock" name="{_q("I2C 陽春版")}">'
            + model + "</diagram></mxfile>")
