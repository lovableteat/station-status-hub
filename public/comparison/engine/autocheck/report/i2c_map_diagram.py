"""I2C map as a picture (2026-10-12): one block per bus, laid out like a hand-drawn I2C block diagram.

  connector box (left) -- trunk -- branch per device (series part on the branch) -- device box (right)
  pull-ups printed on the trunk, per line; DNP pull-ups / branches / devices grey dashed.
Colours = A -> B change keyed on RefDes (new green, changed yellow); red border = address conflict;
red '圖不符' tag = an I2C_DECLARED_MISMATCH row on that part. Pure SVG, no Graphviz (same reason as the
power tree diagram: nothing to install on the laptop / a server).
"""
from __future__ import annotations

from html import escape

from ..model import natkey

FILL = {"new": "#C6EFCE", "changed": "#FFEB9C", "same": "#FFFFFF", "": "#FFFFFF", "dnp": "#F2F2F2"}
DASH = ' stroke-dasharray="5,4"'
X_CONN, CONN_W = 16, 250                 # connector box (left)
X_SDA, X_SCL = 330, 362                  # the two trunks
X_DEV, DEV_W = 700, 520                  # device boxes (right)
LINE = {"SDA": "#1F4E79", "SCL": "#C55A11"}   # SDA blue, SCL orange (also labelled, never colour alone)
GREY = "#808080"
LH = 17                                  # text line height inside a device box


def _strap_by_pin(dv) -> dict[str, tuple[list[str], list[str]]]:
    out: dict[str, tuple[list[str], list[str]]] = {}
    for src, built in ((dv.strap, True), (dv.strap_dnp, False)):
        for t in src:
            pin, _, part = t.partition(": ")
            out.setdefault(pin, ([], []))[0 if built else 1].append(part.replace(" -> ", " → ").replace(" [DNP]", ""))
    return out


def _addr_line(dv) -> str:
    st = " ".join(dv.pin_states) or "(無位址腳)"
    if dv.addr_txt:
        return f"{st}  →  {dv.addr_txt}"
    return f"{st}  →  ?" + (f"  ({dv.addr_note})" if dv.addr_note else "")


def _dev_rows(dv) -> list[tuple[str, str, str]]:
    """(text, colour, weight) lines of a device box."""
    dnp = not dv.built
    base = GREY if dnp else "#000"
    part = dv.bom.split(" ", 1)[1] if dv.bom and " " in dv.bom else (dv.bom or dv.symbol)
    rows = [(f"{dv.refdes}  {dv.symbol}", base, "bold"),
            (f"BOM: {part}" if dv.bom else "BOM: - (DNP)", base, "normal"),
            ("位址: " + _addr_line(dv), "#C00000" if not dv.addr_txt and not dnp else base, "bold")]
    sp = _strap_by_pin(dv)
    for ps in dv.pin_states:
        pin = ps.split("=", 1)[0]
        built, dnp_parts = sp.get(pin, ([], []))
        txt = f"  {ps}: " + (", ".join(built) if built else "無上件 strap")
        if dnp_parts:
            txt += "   (DNP: " + ", ".join(dnp_parts) + ")"
        rows.append((txt, base if built else GREY, "normal"))
    return rows


def _res(x: float, y: float, vertical: bool = False, col: str = "#000", dash: str = "") -> str:
    if vertical:
        return f'<rect x="{x - 4}" y="{y - 9}" width="8" height="18" fill="#fff" stroke="{col}"{dash}/>'
    return f'<rect x="{x - 11}" y="{y - 4}" width="22" height="8" fill="#fff" stroke="{col}"{dash}/>'


def _text(x, y, t, size=11, col="#000", weight="normal", anchor="start") -> str:
    return (f'<text x="{x}" y="{y}" font-size="{size}" fill="{col}" font-weight="{weight}" '
            f'text-anchor="{anchor}">{escape(t)}</text>')


def _trunk_net(b, line: str) -> str:
    for ln, net, _ in b.conn_pins:
        if ln == line:
            return net
    segs = [s for s in b.segments if s.line == line]
    if not segs:
        return ""
    s = sorted(segs, key=lambda s: (-len(s.devices), natkey(s.sid)))[0]
    return s.sid.split(":", 1)[1]


def render_svg(m: dict, pdf_url=None, a_label: str = "A") -> str:
    devs = m.get("devices", {})
    conflict = set()
    mism = {}
    for f in m.get("_findings", []):
        if f.rule == "I2C_ADDR_CONFLICT":
            conflict |= set(f.refdes)
        if f.rule == "I2C_DECLARED_MISMATCH":
            for r in f.refdes:
                mism.setdefault(r, f.title)
    X = {"SDA": X_SDA, "SCL": X_SCL}
    parts, y = [], 10
    buses = sorted(m.get("buses", []), key=lambda b: (not any(devs[x].built for x in b.devices), natkey(b.bid)))
    for b in buses:
        head = f"{b.bid}   speed {b.speed}" + (f"   (mux {b.parent})" if b.parent else "")
        parts.append(_text(X_CONN, y + 14, head, 14, weight="bold"))
        y += 26
        trunk = {ln: _trunk_net(b, ln) for ln in ("SDA", "SCL")}
        # trunk names
        parts.append(_text(X_SDA - 6, y + 11, f"SDA: {trunk['SDA']}", 11, LINE["SDA"], "bold", "end"))
        parts.append(_text(X_SCL + 6, y + 11, f"SCL: {trunk['SCL']}", 11, LINE["SCL"], "bold"))
        y += 20
        top = y
        # pull-ups: a stub from its own trunk to the right, resistor, rail
        for line in ("SDA", "SCL"):
            ups = []
            for sg in b.segments:
                if sg.line != line:
                    continue
                where = sg.sid.split(":", 1)[1]
                ups += [(p, True, len(sg.built_pullups) > 1, where) for p in sg.built_pullups]
                ups += [(p, False, False, where) for p in sg.dnp_pullups]
            if not ups:
                parts.append(_text(X_SCL + 24, y + 4, f"{line} pull-up: 板上沒有", 11, "#C00000", "bold"))
                parts.append(f'<circle cx="{X[line]}" cy="{y}" r="3" fill="#C00000"/>')
                y += 18
            for p, built, dup, where in ups:
                col = "#C00000" if dup else ("#000" if built else GREY)
                dash = DASH if not built else ""
                parts.append(f'<line x1="{X[line]}" y1="{y}" x2="{X_SCL + 40}" y2="{y}" stroke="{LINE[line] if built else GREY}" '
                             f'stroke-width="1.5"{dash}/>')
                parts.append(f'<circle cx="{X[line]}" cy="{y}" r="3.5" fill="{LINE[line] if built else GREY}"/>')
                parts.append(_res(X_SCL + 28, y, col=col, dash=dash))
                txt = f"{line} pull-up {p.replace(' -> ', ' → ').replace(' [DNP]', '')}" + ("  [DNP]" if not built else "") \
                    + ("  (重複)" if dup else "") + (f"   在 {where}" if where != trunk[line] else "")
                parts.append(_text(X_SCL + 46, y + 4, txt, 11, col, "bold" if dup else "normal"))
                y += 18
        y += 8
        # connector box: one entry per off-board pin, the net name first, symbol pin name as a note
        ctaps: list[tuple[str, float]] = []
        if b.conn_pins:
            ch = 24 + 30 * len(b.conn_pins)
            parts.append(f'<rect x="{X_CONN}" y="{y}" width="{CONN_W}" height="{ch}" fill="#FCE4D6" stroke="#C65911"/>')
            parts.append(_text(X_CONN + 8, y + 16, "連接器 (出板)", 12, weight="bold"))
            for i, (ln, net, pin) in enumerate(b.conn_pins):
                cy = y + 34 + 30 * i
                ref, _, pname = pin.partition(" ")
                parts.append(_text(X_CONN + 8, cy, f"{ln}  {net}", 11, LINE[ln], "bold"))
                parts.append(_text(X_CONN + 8, cy + 13, f"{ref}" + (f"  (symbol pin 名 {pname}，僅附註)" if pname else ""),
                                   9, GREY))
                parts.append(f'<line x1="{X_CONN + CONN_W}" y1="{cy - 4}" x2="{X[ln]}" y2="{cy - 4}" stroke="{LINE[ln]}" '
                             f'stroke-width="2"/>')
                parts.append(f'<circle cx="{X[ln]}" cy="{cy - 4}" r="3.5" fill="{LINE[ln]}"/>')
                ctaps.append((ln, cy - 4))
            cbottom = y + ch
        else:
            cbottom = y
        # devices: SDA branch and SCL branch, series part on the branch, pin net name after it
        rows = [devs[x] for x in b.devices]
        last = {"SDA": y, "SCL": y}
        for dv in rows:
            lines = _dev_rows(dv)
            h = 10 + LH * len(lines)
            ry = y
            dnp = not dv.built
            for j, ln in enumerate(("SDA", "SCL")):
                by = ry + 14 + 18 * j
                ser = [x[len(ln) + 1:] for x in dv.series if x.startswith(ln + " ")]
                dnp_br = dnp or any("[DNP]" in x for x in ser)
                col = GREY if dnp_br else LINE[ln]
                dash = DASH if dnp_br else ""
                parts.append(f'<line x1="{X[ln]}" y1="{by}" x2="{X_DEV}" y2="{by}" stroke="{col}" stroke-width="1.8"{dash}/>')
                parts.append(f'<circle cx="{X[ln]}" cy="{by}" r="3.5" fill="{col}"/>')
                last[ln] = max(last[ln], by)
                # the net this device actually touches on THIS bus (a mux on its channel bus = the channel net)
                own = set(b.sda_nets if ln == "SDA" else b.scl_nets)
                nets = [n for l2, n in dv.line_nets if l2 == ln and n in own] or (dv.sda_nets if ln == "SDA" else dv.scl_nets)
                # SDA labels sit above the SDA branch, SCL labels below the SCL branch (no text on a wire)
                ty = by - 7 if ln == "SDA" else by + 15
                xr = X_SCL + 70
                for k, sx in enumerate(ser[:2]):
                    parts.append(_res(xr + 80 * k, by, col=col, dash=DASH if "[DNP]" in sx else ""))
                    parts.append(_text(xr + 80 * k, ty, sx.replace(" [DNP]", " DNP"), 9, col, anchor="middle"))
                nx = xr + 80 * len(ser[:2]) - (10 if ser else 50)
                parts.append(_text(nx, ty, f"{ln} {', '.join(nets) or '?'}", 10, col, "bold"))
            fill = FILL["dnp"] if dnp else FILL.get(dv.change, "#FFFFFF")
            stroke = "#C00000" if dv.refdes in conflict else (GREY if dnp else "#000")
            sw = 3 if dv.refdes in conflict else 1.5
            hover = escape("\n".join([f"{dv.refdes} {dv.symbol}", f"BOM {dv.bom or '-'}", f"lib {dv.lib or '-'}",
                                      f"SDA {'; '.join(dv.sda_pins)}", f"SCL {'; '.join(dv.scl_pins)}",
                                      f"位址空間 {dv.scope.split(':', 1)[-1]}"] + (dv.series or [])
                                     + [f"strap {t}" for t in dv.strap] + [f"strap {t} (DNP)" for t in dv.strap_dnp]
                                     + ([f"變更 vs {a_label}: {dv.change_note}"] if dv.change_note else [])
                                     + ([mism[dv.refdes]] if dv.refdes in mism else [])))
            parts.append(f'<g class="box"><title>{hover}</title><rect x="{X_DEV}" y="{ry}" width="{DEV_W}" height="{h}" '
                         f'fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{DASH if dnp else ""}/>')
            url = pdf_url(dv.page) if pdf_url and dv.page else None
            for j, (t, c, w) in enumerate(lines):
                fs = 13 if j == 0 else 11
                txt = escape(t)
                if j == 0 and url:
                    txt = (f'<a href="{escape(url)}" target="_blank"><tspan fill="#0563C1" text-decoration="underline">'
                           f'{escape(dv.refdes)}</tspan></a>{escape(t[len(dv.refdes):])}')
                parts.append(f'<text x="{X_DEV + 8}" y="{ry + 16 + LH * j}" font-size="{fs}" font-weight="{w}" '
                             f'fill="{c}">{txt}</text>')
            tag = []
            if dnp:
                tag.append(("DNP", GREY))
            if dv.change in ("new", "changed"):
                tag.append(({"new": f"新增 vs {a_label}", "changed": f"變更 vs {a_label}"}[dv.change], "#375623"))
            if dv.refdes in conflict:
                tag.append(("位址衝突", "#C00000"))
            if dv.refdes in mism:
                tag.append(("圖不符", "#C00000"))
            tx = X_DEV + DEV_W + 8
            for t, c in tag:
                parts.append(_text(tx, ry + 16, t, 11, c, "bold"))
                tx += 12 * len(t) + 10
            parts.append("</g>")
            y = ry + max(h, 50) + 14
        # trunks: from the name row down to the lowest tap (pull-up, connector or branch)
        for ln in ("SDA", "SCL"):
            bot = max([last[ln], top] + [ty for l2, ty in ctaps if l2 == ln])
            parts.append(f'<line x1="{X[ln]}" y1="{top - 6}" x2="{X[ln]}" y2="{bot}" stroke="{LINE[ln]}" stroke-width="3"/>')
        y = max(y, cbottom) + 24
    rem = m.get("removed") or []
    if rem:
        parts.append(_text(X_CONN, y + 12, f"{a_label} 有、本版沒有的 I2C 裝置: {', '.join(rem)}", 12, "#C00000"))
        y += 24
    w = X_DEV + DEV_W + 220
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{y + 10}" viewBox="0 0 {w} {y + 10}" '
            f'font-family="Arial, Microsoft JhengHei, sans-serif">' + "".join(parts) + "</svg>")


def render_html(m: dict, title: str, pdf_url=None, a_label: str = "A", declared_note: str = "") -> str:
    svg = render_svg(m, pdf_url, a_label)
    return f"""<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{escape(title)}</title>
<style>
:root {{ color-scheme: light; }}
body {{ margin: 0; padding: 12px 16px; background: #fff; color: #000; font: 13px Arial, 'Microsoft JhengHei', sans-serif; }}
h1 {{ font-size: 16px; margin: 0 0 6px; }}
p {{ margin: 4px 0; color: #444; }}
.wrap {{ overflow: auto; border-top: 1px solid #ddd; margin-top: 8px; padding-top: 8px; }}
.box:hover rect {{ stroke-width: 2.5; }}
</style></head><body>
<h1>{escape(title)}</h1>
<p>從 netlist + BOM + config/i2c_devices.yaml 推出的 I2C map (測試狀態)。藍線 = SDA、橘線 = SCL，每段標 net name，分支上的電阻 = 串接件，主幹上方 = pull-up；
連接器框以 net name 為主，symbol pin 名只當附註。框內：RefDes (藍字 = 開線路圖該頁) / symbol 料號 / BOM 主料 /
位址 (strap 狀態 → 算出的 7-bit 位址) / 每支位址腳實際上件的 strap 電阻 (DNP 列在括號內)。
strap 狀態：0 = GND、1 = 接到 rail、Z = 空接、SDA / SCL = 接自己的 SDA / SCL、X = 上下拉都上件、? = 不明。灰色虛線 = DNP。綠 = 新增、黃 = 變更 (相對 {escape(a_label)})；紅框 = 位址衝突；「圖不符」= 跟 I2C Block Diagram 對不上。滑鼠停在框上看細節。</p>
<p>{escape(declared_note)}</p>
<div class="wrap">{svg}</div>
</body></html>
"""
