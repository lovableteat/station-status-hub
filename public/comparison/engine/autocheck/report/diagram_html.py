"""Shared HTML page around a diagram SVG (2026-10-13): title, intro, legend, zoom bar, the SVG.

Used by power_tree_diagram.render_html and i2c_map_diagram.render_html so both pages get the same zoom bar
(buttons, 符合寬度, Ctrl + wheel, zoom remembered per diagram in localStorage) and the same height policy:
the page is as tall as the drawing. pages/2_Power_tree.py and pages/3_I2C_map.py show it with
st.iframe(html) whose height defaults to "content" (Streamlit >= 1.65:
https://docs.streamlit.io/develop/api-reference/text/st.iframe), so the only scrollbar is the browser's.
Horizontal: the drawing scrolls inside .wrap when wider than the window (or press 符合寬度).

Optional second view (power tree "顯示 converter 內部 net"): the page holds both SVGs and switches between
them; a click on an element with class "intl" and data-key="<g data-key>" expands and scrolls to that box.
No f-string here: the JS has many braces, so placeholders are replaced with str.replace.
"""
from __future__ import annotations

from html import escape

_PAGE = """<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>__TITLE__</title>
<style>
:root { color-scheme: light; }
body { margin: 0; padding: 12px 16px; box-sizing: border-box; background: #fff; color: #000;
       font: 13px Arial, 'Microsoft JhengHei', sans-serif; }
h1 { font-size: 16px; margin: 0 0 6px; }
p { margin: 4px 0; color: #444; }
.warn { color: #C00000; }
.lg { display: inline-flex; align-items: center; margin: 2px 14px 2px 0; font-size: 12px; }
.lg i { display: inline-block; width: 18px; height: 12px; margin-right: 5px; }
.bar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 8px; }
.bar button { font: 12px Arial, 'Microsoft JhengHei', sans-serif; padding: 2px 9px; min-width: 30px; cursor: pointer;
              background: #f4f4f4; border: 1px solid #bbb; border-radius: 3px; color: #000; }
.bar button:hover { background: #e6e6e6; }
#zl { min-width: 44px; text-align: center; font-variant-numeric: tabular-nums; }
.tg { margin-left: 14px; cursor: pointer; user-select: none; }
.hint { color: #777; font-size: 12px; margin-left: 10px; }
.wrap { overflow-x: auto; overflow-y: visible; border-top: 1px solid #ddd; margin-top: 8px; padding-top: 8px; }
.view svg { display: block; }
.box:hover rect { stroke-width: 2.5; }
.intl { cursor: pointer; }
.flash rect { stroke: #0563C1 !important; stroke-width: 3 !important; }
</style></head><body>
<h1>__TITLE__</h1>
__INTRO__
__LEGEND__
__NOTE__
<div class="bar"><button type="button" id="zo" title="縮小">−</button><span id="zl">100%</span>
<button type="button" id="zi" title="放大">+</button><button type="button" id="z1">100%</button>
<button type="button" id="zf">符合寬度</button>__TOGGLE__<span class="hint">Ctrl + 滾輪也可以縮放</span></div>
<div class="wrap" id="wrap">__VIEWS__</div>
<script>
(function () {
  var ZKEY = '__ZKEY__';
  var wrap = document.getElementById('wrap'), zl = document.getElementById('zl');
  var cb = document.getElementById('showint'), vc = document.getElementById('v-c'), ve = document.getElementById('v-e');
  var zoom = 1;
  try { var z0 = parseFloat(localStorage.getItem(ZKEY)); if (z0 > 0) zoom = z0; } catch (e) {}
  var svgs = Array.prototype.slice.call(document.querySelectorAll('.view svg'));
  svgs.forEach(function (s) { s.dataset.w = s.getAttribute('width'); s.dataset.h = s.getAttribute('height'); });
  function cur() { return (ve && !ve.hidden) ? ve.querySelector('svg') : vc.querySelector('svg'); }
  function apply() {
    zoom = Math.min(4, Math.max(0.2, zoom));
    svgs.forEach(function (s) {
      s.setAttribute('width', (s.dataset.w * zoom).toFixed(0));
      s.setAttribute('height', (s.dataset.h * zoom).toFixed(0));
    });
    zl.textContent = Math.round(zoom * 100) + '%';
    try { localStorage.setItem(ZKEY, String(zoom)); } catch (e) {}
  }
  document.getElementById('zi').onclick = function () { zoom *= 1.25; apply(); };
  document.getElementById('zo').onclick = function () { zoom /= 1.25; apply(); };
  document.getElementById('z1').onclick = function () { zoom = 1; apply(); };
  document.getElementById('zf').onclick = function () {
    var s = cur(); if (s) { zoom = Math.min(1.5, (wrap.clientWidth - 8) / s.dataset.w); apply(); }
  };
  wrap.addEventListener('wheel', function (ev) {
    if (!ev.ctrlKey) return;
    ev.preventDefault();
    zoom *= ev.deltaY < 0 ? 1.1 : 1 / 1.1; apply();
  }, { passive: false });
  function show(expanded, key) {
    if (!ve) return;
    vc.hidden = expanded; ve.hidden = !expanded; if (cb) cb.checked = expanded;
    if (!key) return;
    var g = (expanded ? ve : vc).querySelector('g[data-key="' + CSS.escape(key) + '"]');
    if (g) {
      g.scrollIntoView({ block: 'center', inline: 'center' });
      g.classList.add('flash'); setTimeout(function () { g.classList.remove('flash'); }, 1600);
    }
  }
  if (cb) cb.onchange = function () { show(cb.checked); };
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest ? ev.target.closest('.intl') : null;
    if (!t) return;
    ev.preventDefault(); ev.stopPropagation();
    show(true, t.getAttribute('data-key'));
  }, true);
  apply();
})();
</script>
</body></html>
"""


def page(title: str, intro: str, svg: str, *, zoom_key: str, svg_expanded: str = "", toggle: str = "",
         legend: str = "", note: str = "") -> str:
    """Whole HTML page. title = plain text (escaped here); intro / legend / note / toggle = ready HTML fragments
    (intro = one or more <p>; legend = <div> of .lg spans; note = <p class="warn">; toggle = <label class="tg">
    with <input id="showint">). svg_expanded = the second view shown by the toggle. zoom_key = localStorage
    key, one per diagram so each remembers its own zoom."""
    views = f'<div class="view" id="v-c">{svg}</div>'
    if svg_expanded:
        views += f'<div class="view" id="v-e" hidden>{svg_expanded}</div>'
    out = _PAGE
    for k, v in (("__TITLE__", escape(title)), ("__INTRO__", intro), ("__LEGEND__", legend), ("__NOTE__", note),
                 ("__TOGGLE__", toggle), ("__VIEWS__", views), ("__ZKEY__", zoom_key.replace("'", ""))):
        out = out.replace(k, v)
    return out
