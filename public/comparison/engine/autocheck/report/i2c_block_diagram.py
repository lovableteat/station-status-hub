"""I2C map 陽春版 (2026-10-13, owner request): the hand-drawn "I2C Block Diagram" style, nothing more.

Owner: the detailed I2C map (report/i2c_map_diagram.py) is too busy for a review meeting; this one only answers
"who sits on which bus, at which 7-bit address, through which resistors". Same data (checks/i2c_map.build_map),
no strap detail / speed / change colours / tooltip; the detailed map stays above it on pages/3_I2C_map.py.

Layout per upstream end (connector / other IC such as the BMC / mux channel), modelled on the owner's sample:
  upstream box (left, bottom) -- one SCL + one SDA line per bus, labelled with the net name --
  pull-ups dropping from a rail bar onto those lines (RefDes + VALUE, DNP = red X) --
  one SCL + one SDA vertical trunk per bus (first bus leftmost, its devices on top) --
  branch per device: dot on the trunk, series R (RefDes + VALUE), device-side net name, arrow into the box.
  Box = RefDes / BOM main description (DNP: symbol VALUE) / 7-bit address ("?" = no library entry).
Crossings that are not connections get a hop (semicircle); joins get a dot. Deterministic: every order is natkey.
Pure SVG, shared page frame from report/diagram_html.py (own zoom key).
"""
from __future__ import annotations

import re
from html import escape

from ..model import natkey
from .diagram_html import page

LINE = {"SDA": "#1F4E79", "SCL": "#C55A11"}   # SDA blue, SCL orange (also labelled, never colour alone)
GREY = "#8C8C8C"
RED = "#C00000"
DOT = "#C000C0"                               # join dot, as on the owner's sample
TG = 30                                       # gap between the trunks
PU_DX = 86                                    # pull-up pitch
RS_DX = 92                                    # series part pitch on a branch
BH, BGAP = 66, 18                             # device box height / gap
BR = {"SCL": 18, "SDA": 48}                   # branch y inside a device box (SCL above SDA, as on the sample)
LGAP = 30                                     # gap between upstream lines
HOP = 5


def _tw(s: str, size: float) -> float:
    """Rough text width in px (CJK = 1 em, others 0.6 em)."""
    return sum(size if ord(c) > 0x2E80 else 0.6 * size for c in s)


def _text(x, y, t, size=11, col="#000", weight="normal", anchor="start") -> str:
    return (f'<text x="{x:.0f}" y="{y:.0f}" font-size="{size}" fill="{col}" font-weight="{weight}" '
            f'text-anchor="{anchor}">{escape(t)}</text>')


def _hline(x1, x2, y, col, crosses=(), width=1.6, dash="", start="", end="") -> str:
    """Horizontal wire x1 -> x2 with a hop over every x in crosses (strictly inside)."""
    d = f"M{x1:.0f},{y:.0f}"
    for cx in sorted(c for c in crosses if x1 + HOP < c < x2 - HOP):
        d += f" L{cx - HOP:.0f},{y:.0f} A{HOP},{HOP} 0 0 1 {cx + HOP:.0f},{y:.0f}"
    d += f" L{x2:.0f},{y:.0f}"
    mk = (f' marker-start="url(#{start})"' if start else "") + (f' marker-end="url(#{end})"' if end else "")
    return f'<path d="{d}" fill="none" stroke="{col}" stroke-width="{width}"{dash}{mk}/>'


def _vline(x, y1, y2, col, crosses=(), width=1.6, dash="") -> str:
    """Vertical wire y1 -> y2 (y1 < y2) with a hop to the right over every y in crosses."""
    d = f"M{x:.0f},{y1:.0f}"
    for cy in sorted(c for c in crosses if y1 + HOP < c < y2 - HOP):
        d += f" L{x:.0f},{cy - HOP:.0f} A{HOP},{HOP} 0 0 1 {x:.0f},{cy + HOP:.0f}"
    d += f" L{x:.0f},{y2:.0f}"
    return f'<path d="{d}" fill="none" stroke="{col}" stroke-width="{width}"{dash}/>'


def _dot(x, y) -> str:
    return f'<circle cx="{x:.0f}" cy="{y:.0f}" r="3.6" fill="{DOT}"/>'


def _res_h(x, y, col) -> str:
    """Horizontal resistor (zigzag) centred on x, 24 px long, on a wire at y."""
    pts = " ".join(f"{x - 12 + 3 * i:.0f},{y + (0 if i in (0, 8) else (-4 if i % 2 else 4)):.0f}" for i in range(9))
    return (f'<rect x="{x - 13:.0f}" y="{y - 6:.0f}" width="26" height="12" fill="#fff" stroke="none"/>'
            f'<polyline points="{pts}" fill="none" stroke="{col}" stroke-width="1.4"/>')


def _res_v(x, y, col) -> str:
    """Vertical resistor (zigzag) centred on y, 24 px long, on a wire at x."""
    pts = " ".join(f"{x + (0 if i in (0, 8) else (4 if i % 2 else -4)):.0f},{y - 12 + 3 * i:.0f}" for i in range(9))
    return (f'<rect x="{x - 6:.0f}" y="{y - 13:.0f}" width="12" height="26" fill="#fff" stroke="none"/>'
            f'<polyline points="{pts}" fill="none" stroke="{col}" stroke-width="1.4"/>')


def _xmark(x, y) -> str:
    return (f'<path d="M{x - 7:.0f},{y - 7:.0f} L{x + 7:.0f},{y + 7:.0f} M{x + 7:.0f},{y - 7:.0f} L{x - 7:.0f},{y + 7:.0f}" '
            f'stroke="{RED}" stroke-width="2.6"/>')


_PU_RX = re.compile(r"^(\S+)\s+(.*?)\s*->\s*(\S+)")


def _pullup(txt: str) -> tuple[str, str, str]:
    """'R1016 2.21Kohm -> 3V3_STBY [DNP]' -> (R1016, 2.21Kohm, 3V3_STBY)."""
    m = _PU_RX.match(txt.replace(" [DNP]", ""))
    if not m:
        return txt.split(" ", 1)[0], "", "?"
    return m.group(1), m.group(2), m.group(3)


def _series(dv, line: str) -> list[tuple[str, str, bool]]:
    """(RefDes, VALUE, built) of the series parts at this device's pin on one line, e.g. 'SDA R432 33.2ohm'."""
    return _ser_list(dv.series, line)


def _branch(dv, b, line: str) -> list[tuple[str, str, bool]]:
    """Parts on the device's branch, trunk side first (Bus.branches); maps built before that field: Device.series."""
    br = getattr(b, "branches", None) or {}
    if (dv.refdes, line) in br:
        return _ser_list([f"{line} {t}" for t in br[(dv.refdes, line)]], line)
    return _series(dv, line)


def _ser_list(items, line: str) -> list[tuple[str, str, bool]]:
    out = []
    for x in items:
        if not x.startswith(line + " "):
            continue
        body = x[len(line) + 1:]
        built = "[DNP]" not in body
        r, _, v = body.replace(" [DNP]", "").partition(" ")
        out.append((r, v, built))
    return out


def _dev_net(dv, b, line: str) -> str:
    own = set(b.sda_nets if line == "SDA" else b.scl_nets)
    nets = [n for l2, n in dv.line_nets if l2 == line and n in own] or (dv.sda_nets if line == "SDA" else dv.scl_nets)
    return nets[0] if nets else "?"


def _end_net(b, line: str) -> str:
    """Net at the upstream end of one line: connector / host pin net, else the busiest segment's hub."""
    for ln, net, _ in list(b.conn_pins) + list(getattr(b, "host_pins", []) or []):
        if ln == line:
            return net
    segs = [s for s in b.segments if s.line == line]
    if not segs:
        return "?"
    s = sorted(segs, key=lambda s: (-len(s.devices), natkey(s.sid)))[0]
    return s.sid.split(":", 1)[1]


def upstream(b) -> tuple[str, tuple[str, ...]]:
    """(kind, refdes...) of a bus's upstream end: conn (connector, also when a host IC shares the bus), ic (other IC
    pin that is not an I2C device pin, e.g. the BMC), mux (channel bus of a library mux), none."""
    if b.parent:
        return "mux", (b.parent,)
    conns = sorted({p.split(".", 1)[0] for _, _, p in b.conn_pins}, key=natkey)
    hosts = sorted({p.split(".", 1)[0] for _, _, p in (getattr(b, "host_pins", []) or [])}, key=natkey)
    if conns or hosts:
        return ("conn" if conns else "ic"), tuple(conns + hosts)
    return "none", (b.bid,)


def groups(m: dict) -> list[tuple[tuple[str, tuple[str, ...]], list]]:
    """Buses grouped by upstream end; order: connector, other IC, mux channel, none; natkey inside."""
    out: dict[tuple[str, tuple[str, ...]], list] = {}
    for b in sorted(m.get("buses", []), key=lambda b: natkey(b.bid)):
        out.setdefault(upstream(b), []).append(b)
    rank = {"conn": 0, "ic": 1, "mux": 2, "none": 3}
    return sorted(out.items(), key=lambda t: (rank[t[0][0]], [natkey(x) for x in t[0][1]]))


_MFR_RX = re.compile(r"^\s*[^:;]+:\s*([^;]+)")   # Agile spec "IDT: 9ZXL0451EKILF; ..." -> first MPN
MAXC = 40


def bom_part(dv) -> str:
    """Line 2 of a box: BOM main part. Agile spec gives the MPN ("Mfr: MPN"); ERP has only the description (short,
    usually holds the MPN). No BOM row (DNP) -> symbol VALUE. Cut at MAXC characters so one long description
    cannot stretch every box."""
    if not dv.bom:
        t = dv.symbol
    else:
        m = _MFR_RX.match(getattr(dv, "bom_spec", "") or "")
        t = m.group(1).strip() if m else (dv.bom.split(" ", 1)[1] if " " in dv.bom else dv.bom)
    return t if len(t) <= MAXC else t[:MAXC - 1] + "…"


def _box_lines(dv) -> list[tuple[str, int, str, str]]:
    """(text, size, colour, weight) of a device box."""
    dnp = not dv.built
    base = GREY if dnp else "#000"
    part = bom_part(dv)
    addr = dv.addr_txt or "?"
    return [(dv.refdes + ("  DNP" if dnp else ""), 13, base, "bold"),
            (part, 11, base, "normal"),
            (f"7-bit: {addr}", 12, RED if (addr == "?" and not dnp) else base, "bold")]


def _group_svg(key, buses, devs: dict, y0: float, pdf_url, conflict: set) -> tuple[list[str], float, float]:
    """SVG parts of one upstream group starting at y0. Returns (parts, bottom y, right x)."""
    kind, refs = key
    parts: list[str] = []
    mux_ref = refs[0].split(" ", 1)[0] if kind == "mux" else ""
    rows = [[devs[x] for x in b.devices if x in devs and x != mux_ref] for b in buses]

    # ---- device boxes (right), bus 0 on top
    y = y0 + 10
    box_y: list[list[float]] = []
    for i, ds in enumerate(rows):
        box_y.append([])
        for _ in ds:
            box_y[i].append(y)
            y += BH + BGAP
        if ds:
            y += 10
    boxes_bottom = y

    # ---- upstream lines: bus0 SCL, bus0 SDA, bus1 SCL, ... below the boxes, leaving room for the pull-up bars
    # upstream chain per line: nets n0..nk and series parts p1..pk (checks/i2c_map Bus.end_chain); a pull-up on n_j is
    # drawn in zone j, i.e. between p_j and p_j+1, so the picture keeps which side of a damping R it sits on.
    chain = {}
    for i, b in enumerate(buses):
        for ln in ("SCL", "SDA"):
            c = (getattr(b, "end_chain", {}) or {}).get(ln) or [_end_net(b, ln)]
            chain[(i, ln)] = (c[0::2], _ser_list([f"{ln} {t}" for t in c[1::2]], ln))
    kmax = max(len(v[1]) for v in chain.values())
    pus = []   # (bus i, line, refdes, value, rail, built, zone)
    for i, b in enumerate(buses):
        for ln in ("SCL", "SDA"):
            nets = chain[(i, ln)][0]
            pun = getattr(b, "pu_net", {}) or {}
            for sg in b.segments:
                if sg.line != ln:
                    continue
                for t, built in [(t, True) for t in sg.built_pullups] + [(t, False) for t in sg.dnp_pullups]:
                    r, v, rail = _pullup(t)
                    z = nets.index(pun[r]) if pun.get(r) in nets else len(nets) - 1
                    pus.append((i, ln, r, v, rail, built, z))
    first_rail: dict[str, int] = {}
    for p in pus:
        first_rail.setdefault(p[4], len(first_rail))
    pus.sort(key=lambda p: (p[6], first_rail[p[4]]))   # stable: zone, rail (one bar per rail), then line order
    bar_y = max(boxes_bottom - BGAP, y0 + 40) + (34 if pus else 0)
    line_y0 = bar_y + (78 if pus else 24)
    ly = {(i, ln): line_y0 + LGAP * (2 * i + (0 if ln == "SCL" else 1)) for i in range(len(buses)) for ln in ("SCL", "SDA")}
    last_ly = max(ly.values())

    # ---- upstream box (left)
    if kind == "mux":
        box_txt = [(refs[0], 13, "#000", "bold"), ("mux channel", 10, GREY, "normal")]
    elif kind == "none":
        box_txt = [("上游未接", 13, GREY, "bold"), ("netlist 找不到連接器或其他 IC", 10, GREY, "normal")]
    else:
        vals = {}
        for b in buses:
            vals.update(getattr(b, "part_values", {}) or {})
        box_txt = []
        for r in refs:
            box_txt.append((r, 13, "#000", "bold"))
            v = vals.get(r, "")
            if v:
                box_txt.append((v, 10, GREY, "normal"))
    ex_w = max(150, max(_tw(t, s) for t, s, _, _ in box_txt) + 20)
    ex_x, ex_r = 16, 16 + ex_w
    ex_top = line_y0 - 26
    ex_h = max(last_ly - line_y0 + 46, 18 * len(box_txt) + 16)
    fill, stroke, dash = ("#F2F2F2", GREY, ' stroke-dasharray="5,4"') if kind == "none" else ("#F4B183", "#843C0C", "")
    parts.append(f'<rect x="{ex_x}" y="{ex_top:.0f}" width="{ex_w:.0f}" height="{ex_h:.0f}" fill="{fill}" '
                 f'stroke="{stroke}" stroke-width="2"{dash}/>')
    ty = ex_top + ex_h / 2 - 9 * (len(box_txt) - 1)
    for t, s, c, w in box_txt:
        parts.append(_text(ex_x + ex_w / 2, ty + 5, t, s, c, w, "middle"))
        ty += 18

    # ---- x positions: net labels, pull-ups, trunks, series parts, device boxes
    end_net = {k: v[0][0] for k, v in chain.items()}
    x = ex_r + 20 + max(_tw(n, 11) for n in end_net.values()) + 10     # cursor: right edge of what is placed
    pux: list[float] = []
    colx: list[float] = []                                            # x of upstream series column 1..kmax
    for z in range(kmax + 1):
        for p in pus:
            if p[6] == z:
                lw = max(_tw(p[2], 10), _tw(p[3] + ("" if p[5] else " DNP"), 10))
                pux.append(x + max(PU_DX - 10, lw + 22))
                x = pux[-1] + 10
        if z < kmax:
            colx.append(x + 45)
            x = colx[-1] + 30
    xt0 = x + 30
    xt = {(i, ln): xt0 + TG * (2 * i + (0 if ln == "SCL" else 1)) for i in range(len(buses)) for ln in ("SCL", "SDA")}
    xt_last = max(xt.values())
    nser = max([len(_branch(dv, buses[i], ln)) for i, ds in enumerate(rows) for dv in ds for ln in ("SCL", "SDA")] + [0])
    xs0 = xt_last + 60
    net_x = xs0 + RS_DX * nser - (24 if nser else 30)
    dnets = [_dev_net(dv, buses[i], ln) for i, ds in enumerate(rows) for dv in ds for ln in ("SCL", "SDA")]
    x_dev = net_x + max([_tw(n, 10) for n in dnets] + [60]) + 30
    bw = max([150] + [_tw(t, s) + 20 for ds in rows for dv in ds for t, s, _, _ in _box_lines(dv)])

    # ---- trunks (vertical): from the first branch down to this bus's upstream line
    trunk_rng: dict[tuple[int, str], tuple[float, float]] = {}
    for i, ds in enumerate(rows):
        for ln in ("SCL", "SDA"):
            top = (box_y[i][0] + BR[ln]) if ds else ly[(i, ln)]
            trunk_rng[(i, ln)] = (top, ly[(i, ln)])
            if ds:
                parts.append(_vline(xt[(i, ln)], top, ly[(i, ln)], LINE[ln], width=2.4))

    # ---- upstream lines (horizontal): box -> own trunk; SDA arrow into the box (data both ways), SCL plain
    for i, b in enumerate(buses):
        for ln in ("SCL", "SDA"):
            yy = ly[(i, ln)]
            x2 = xt[(i, ln)]
            parts.append(_hline(ex_r, x2, yy, LINE[ln], width=2, start="aw" + ln if ln == "SDA" else ""))
            parts.append(_text(ex_r + 20, yy - 5, end_net[(i, ln)], 11, LINE[ln], "bold"))
            for q, (r, v, built) in enumerate(chain[(i, ln)][1]):
                sx = colx[q]
                parts.append(_res_h(sx, yy, "#000" if built else GREY))
                if not built:
                    parts.append(_xmark(sx, yy))
                parts.append(_text(sx, yy - 9, f"{r} {v}".strip(), 10, "#000" if built else GREY, anchor="middle"))
            if not rows[i]:
                parts.append(_text(x2 + 8, yy + 4, "(沒有 I2C 元件)", 11, GREY))

    # ---- pull-ups: rail bar (shared by consecutive same-rail parts), vertical down to its line, hop over lines above
    k = 0
    run_no = 0
    while k < len(pus):
        rail = pus[k][4]
        j = k
        while j + 1 < len(pus) and pus[j + 1][4] == rail and pus[j + 1][6] == pus[k][6]:
            j += 1
        x1, x2 = pux[k], pux[j]
        parts.append(f'<line x1="{x1 - 10:.0f}" y1="{bar_y:.0f}" x2="{x2 + 10:.0f}" y2="{bar_y:.0f}" stroke="#000" '
                     f'stroke-width="1.6"/>')
        parts.append(_text((x1 + x2) / 2, bar_y - 8 - 13 * (run_no % 2), rail, 11, "#000", "bold", "middle"))
        for q in range(k, j + 1):
            i, ln, r, v, _, built, _ = pus[q]
            x = pux[q]
            yy = ly[(i, ln)]
            col = LINE[ln] if built else GREY
            above = [ly[t] for t in ly if ly[t] < yy]
            parts.append(_dot(x, bar_y))
            parts.append(_vline(x, bar_y, yy, col, crosses=above, width=1.6))
            ry = bar_y + 28
            parts.append(_res_v(x, ry, "#000" if built else GREY))
            if not built:
                parts.append(_xmark(x, ry))
            parts.append(_text(x - 9, ry - 2, r, 10, "#000" if built else GREY, "bold", "end"))
            parts.append(_text(x - 9, ry + 11, v + ("" if built else " DNP"), 10, "#000" if built else GREY,
                               anchor="end"))
            parts.append(_dot(x, yy))
        run_no += 1
        k = j + 1

    # ---- branches + device boxes
    for i, ds in enumerate(rows):
        b = buses[i]
        for dv, by in zip(ds, box_y[i]):
            dnp = not dv.built
            for ln in ("SCL", "SDA"):
                yy = by + BR[ln]
                ser = _branch(dv, b, ln)
                grey = dnp or any(not s[2] for s in ser)
                col = GREY if grey else LINE[ln]
                dash = ' stroke-dasharray="5,4"' if grey else ""
                crosses = []
                if ln == "SCL":   # an SCL branch crosses this bus's SDA trunk when the trunk spans its height
                    t0, t1 = trunk_rng[(i, "SDA")]
                    if rows[i] and t0 < yy < t1:
                        crosses.append(xt[(i, "SDA")])
                parts.append(_hline(xt[(i, ln)], x_dev, yy, col, crosses=crosses, width=1.6, dash=dash,
                                    end="ar" + ("G" if grey else ln)))
                if yy != trunk_rng[(i, ln)][0]:
                    parts.append(_dot(xt[(i, ln)], yy))
                for s, (r, v, built) in enumerate(ser):
                    sx = xs0 + RS_DX * s
                    parts.append(_res_h(sx, yy, "#000" if built else GREY))
                    if not built:
                        parts.append(_xmark(sx, yy))
                    parts.append(_text(sx, yy - 9, f"{r} {v}".strip(), 10, "#000" if built else GREY, anchor="middle"))
                parts.append(_text(net_x, yy - 5, _dev_net(dv, b, ln), 10, col, "bold"))
            st = RED if dv.refdes in conflict else (GREY if dnp else "#000")
            sw = 3 if dv.refdes in conflict else 2
            fillb = "#F2F2F2" if dnp else "#D9D9D9"
            bdash = ' stroke-dasharray="5,4"' if dnp else ""
            parts.append(f'<rect x="{x_dev:.0f}" y="{by:.0f}" width="{bw:.0f}" height="{BH}" fill="{fillb}" stroke="{st}" '
                         f'stroke-width="{sw}"{bdash}/>')
            url = pdf_url(dv.page) if pdf_url and dv.page else None
            for j, (t, s, c, w) in enumerate(_box_lines(dv)):
                tx, tyy = x_dev + bw / 2, by + 18 + 18 * j
                if j == 0 and url:
                    parts.append(f'<a href="{escape(url)}" target="_blank"><text x="{tx:.0f}" y="{tyy:.0f}" font-size="{s}" '
                                 f'font-weight="{w}" text-anchor="middle" fill="#0563C1" text-decoration="underline">'
                                 f'{escape(t)}</text></a>')
                else:
                    parts.append(_text(tx, tyy, t, s, c, w, "middle"))
    bottom = max(ex_top + ex_h, last_ly + 20, boxes_bottom)
    right = x_dev + bw + 20 if any(rows) else xt_last + 160
    return [p for p in parts if p], bottom, right


def _defs() -> str:
    out = []
    for name, col in (("SDA", LINE["SDA"]), ("SCL", LINE["SCL"]), ("G", GREY)):
        out.append(f'<marker id="ar{name}" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="9" markerHeight="9" '
                   f'orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="{col}"/></marker>')
    out.append(f'<marker id="awSDA" viewBox="0 0 10 10" refX="0" refY="5" markerWidth="9" markerHeight="9" '
               f'orient="auto"><path d="M10,0 L0,5 L10,10 z" fill="{LINE["SDA"]}"/></marker>')
    return "<defs>" + "".join(out) + "</defs>"


def render_svg(m: dict, pdf_url=None) -> str:
    devs = m.get("devices", {})
    conflict: set[str] = set()
    for f in m.get("_findings", []):
        if f.rule == "I2C_ADDR_CONFLICT":
            conflict |= set(f.refdes)
    parts, y, w = [], 10.0, 400.0
    gs = groups(m)
    for n, (key, buses) in enumerate(gs):
        if n:
            parts.append(f'<line x1="10" y1="{y:.0f}" x2="__W__" y2="{y:.0f}" stroke="#D0D0D0" stroke-dasharray="2,4"/>')
            y += 16
        p, bottom, right = _group_svg(key, buses, devs, y, pdf_url, conflict)
        parts += p
        y = bottom + 24
        w = max(w, right)
    rem = m.get("removed") or []
    if rem:
        parts.append(_text(16, y + 12, "上一版有、本版沒有的 I2C 裝置: " + ", ".join(rem), 12, RED))
        y += 24
    body = "".join(parts).replace("__W__", f"{w - 10:.0f}")
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w:.0f}" height="{y + 10:.0f}" '
            f'viewBox="0 0 {w:.0f} {y + 10:.0f}" font-family="Arial, Microsoft JhengHei, sans-serif">'
            + _defs() + body + "</svg>")


def render_html(m: dict, title: str, pdf_url=None) -> str:
    """Standalone page in the shared frame (zoom bar, height = drawing), own zoom key."""
    svg = render_svg(m, pdf_url)
    intro = ("<p>陽春版：只看誰掛在哪條 bus、7-bit 位址、中間接了哪些電阻。資料跟上面的 I2C map 同一份 (netlist + BOM)，"
             "strap 推導、變更、speed 等細節看上面那張。</p>")
    legend = ('<div><span class="lg"><i style="background:#1F4E79"></i>SDA</span>'
              '<span class="lg"><i style="background:#C55A11"></i>SCL</span>'
              '<span class="lg"><i style="background:#C000C0;border-radius:6px;width:12px"></i>接點</span>'
              '<span class="lg">⌒ = 跨線不相連</span>'
              '<span class="lg"><b style="color:#C00000;margin-right:5px">✕</b>電阻 DNP</span>'
              '<span class="lg"><i style="background:#F2F2F2;border:1px dashed #8C8C8C"></i>元件 DNP</span>'
              '<span class="lg"><i style="background:#fff;border:2px solid #C00000"></i>位址衝突</span>'
              '<span class="lg">7-bit: ? = 位址庫沒有這顆 (缺 datasheet)</span>'
              '<span class="lg">藍字 RefDes = 開線路圖該頁</span></div>')
    return page(title, intro, svg, zoom_key="autocheck_i2c_block_zoom", legend=legend)
