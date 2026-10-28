"""並排瀏覽 (2026-10-20, HANDOVER 0p9): A / B annotated schematic PDFs side by side, one tracking row at a time,
like OrCAD Graphical Design Difference. Shown as the first tab of pages/1_審查回覆.py; pages stay thin shells.

How the jump works (spike 2026-10-20, owner-verified): each side is a raw <iframe> written with st.markdown(
unsafe_allow_html=True) whose src is <annotated pdf url>?v=<n>#nameddest=<dest>. Chrome's built-in PDF viewer
parses the open parameters once when the document loads and ignores a later hash change, so every jump bumps
?v=n to force a reload (the PDF is re-fetched each time; a few MB over localhost, acceptable for now).
st.iframe is NOT usable: Streamlit renders it with a sandbox attribute and no allow-* flag lifts the plugin
restriction, so Chrome's PDF plugin stays blank inside it (frontend IFrame.tsx DEFAULT_IFRAME_SANDBOX_POLICY,
https://raw.githubusercontent.com/streamlit/streamlit/1.66.0/frontend/lib/src/components/elements/IFrame/IFrame.tsx;
https://discuss.streamlit.io/t/workaround-the-sandbox-in-chrome/63955).

Row selection uses st.dataframe(on_select=callback, selection_mode="single-row"): the RD ticks the row's checkbox.
st.data_editor cannot be used for selection (its state cannot be set programmatically,
https://docs.streamlit.io/develop/api-reference/data/st.data_editor), so editing lives in the 批次填寫 tab and in
the single-row form under the viewers here. The dataframe key changes with every jump so the tick clears and the
same row can be picked again later.

A side: a key whose "PDF 頁 A" is None (A has no PDF, or the part is not in A: NEW parts) keeps the previous A
drawing and shows a banner "A 無此件"; status NEW / EXISTING / CHANGE is never used to decide this.
"""
from __future__ import annotations

import datetime as dt
import html
from pathlib import Path

import pandas as pd
import streamlit as st

from . import review
from .rules_zh import DISPOSITIONS, RULES

SEVS = ["ERROR", "WARN", "INFO"]
STATUSES = ["NEW", "EXISTING", "CHANGE"]
HEIGHTS = {"筆電": 460, "桌機": 740, "大螢幕": 1090}
BLANK = "未填"
EDITABLE = review.REPLY_FIELDS                      # 處置 / 負責人 / 預計版次 / 備註


def _rule_name(rule: str) -> str:
    return RULES[rule][2] if rule in RULES else rule


ZOOMS = {"自動 (nameddest)": 0, "150 %": 150, "200 %": 200, "300 %": 300, "400 %": 400}
WIDTHS = {"筆電 1366": 1366, "筆電 1536": 1536, "桌機 1920": 1920, "大螢幕 2560": 2560}
PX_PER_PT = 4 / 3            # Chrome PDF viewer: 1 pt = 4/3 CSS px at 100 % (pdfium_engine.cc GetPageSizeForLayout, 96/72)
TOOLBAR_PX = 56              # Chrome's viewer toolbar inside the iframe (QA 2026-10-20): the scroller is this much shorter
SIDEBAR_PX = 336             # Streamlit sidebar (21 rem) + main padding ~96 px + column gap 16 px, layout="wide"


def _src(url: str, dest: str, v: int, page=None, centre=None, zoom: int = 0, frame_px=(900, 740)) -> str:
    """Viewer URL for one row. zoom 0 = #nameddest (the PDF's own /FitR destination; in an iframe Chrome did not apply
    its zoom, owner screenshot 2026-10-20). zoom > 0 = Chrome open parameter #page=N&zoom=S,left,top
    (https://chromium.googlesource.com/chromium/src/+/main/chrome/browser/resources/pdf/open_pdf_params_parser.ts;
    viewport.goToPageAndXy adds left / top to the page's top-left in layout px at 100 % and multiplies by the zoom), so
    left / top = box centre (pt from the page top-left, review row "PDF 中心") x 4/3 minus half the frame in
    page px at that zoom. The frame size is the owner-picked window class, so the centring is approximate."""
    if zoom and page and centre:
        fw, fh = frame_px
        left = max(0.0, centre[0] * PX_PER_PT - fw / (zoom / 100) / 2)
        top = max(0.0, centre[1] * PX_PER_PT - fh / (zoom / 100) / 2)
        return f"{url}?v={v}#page={page}&zoom={zoom},{left:.0f},{top:.0f}"
    return f"{url}?v={v}#nameddest={dest}"


def _frame(src: str, height: int, title: str) -> None:
    st.markdown(f'<iframe src="{html.escape(src, quote=True)}" width="100%" height="{height}" '
                f'style="border:1px solid #666;background:#fff" title="{html.escape(title, quote=True)}"></iframe>',
                unsafe_allow_html=True)


def with_parents(view: list[dict], rows: list[dict]) -> list[dict]:
    """A child in the view pulls its parent in, whatever the filter dropped it for (owner 2026-10-27 13:49: five rows
    pointing at an INFO #15 that the default ERROR / WARN filter had hidden made the chain unreadable)."""
    shown = {d["項次"] for d in view}
    need = {d["父項"] for d in view if d.get("父項") and d["父項"] not in shown}
    if not need:
        return view
    extra = [d for d in rows if d["項次"] in need]
    return sorted(view + extra, key=lambda d: d["項次"])


def fold_children(view: list[dict], fold: bool) -> list[dict]:
    """B-full (2026-10-27): hide child rows whose parent is in the view. A child whose parent is filtered out (an INFO
    CAP_ONLY_NET parent under the default ERROR / WARN filter, say) stays visible, so folding never hides a WARN.
    A child that carries its own box on the annotated PDF ("PDF 框", e.g. PIN_ISOLATED = the open end of a short) is never
    folded either: every #n drawn on the schematic must be findable in the table (owner 2026-10-27 12:13)."""
    if not fold:
        return view
    shown = {d["項次"] for d in view}
    return [d for d in view if not (d.get("父項") and d["父項"] in shown and not d.get("PDF 框"))]


def parent_label(d: dict, fold: bool = True) -> str:
    """說明 (工具) with the root-cause prefix / child count rendered in (the stored text stays untouched)."""
    t = d.get("說明 (工具)") or ""
    if d.get("父項"):
        return f"同根因 → #{d['父項']}：{t}"
    kids = d.get("子項") or []
    if kids:        # in FRONT of the title: a long title would push a suffix out of the cell (owner screenshot 2026-10-27)
        return f"[含 {len(kids)} 筆子項 #{' #'.join(str(k) for k in kids)}] {t}" if fold else f"[{len(kids)} 筆子項] {t}"
    return t


def side_by_side(db: Path, run: str, info: dict, rows: list[dict]) -> None:
    """info = one entry of review.runs(); rows = review.load(db, run) (tool columns + replies)."""
    ss = st.session_state
    url_b, url_a = info.get("pdf_url") or "", info.get("pdf_url_a") or ""
    a_label, b_label = info["a_label"], info["b_label"]
    if not url_b:
        st.warning("這次比對沒有框選線路圖 (B 資料夾沒有 PDF)，並排瀏覽不能用；請把 OrCAD 匯出的 PDF 放進 B 資料夾再跑。")
        return

    # ------------------------------------------------------------------ filters
    f1, f2, f3, f4, f5 = st.columns([2, 2, 2, 2, 3])
    sev = f1.multiselect("嚴重度", SEVS, ["ERROR", "WARN"], key="sb_sev")
    rules_all = sorted({d["規則"] for d in rows})
    rule = f2.multiselect("規則", rules_all, format_func=_rule_name, key="sb_rule", placeholder="全部")
    status = f3.multiselect("狀態", STATUSES, key="sb_status", placeholder="全部")
    disp = f4.selectbox("處置", ["全部", "未填", "已填", *DISPOSITIONS], key="sb_disp")
    q = f5.text_input("搜尋 (RefDes / Net / 規則 / 負責人 / 說明)", key="sb_q").strip().upper()
    fold = st.checkbox("摺疊子項 (同根因的子項藏在父項底下)", True, key="sb_fold")   # not part of sb_sig: no frame reload

    def keep(d: dict) -> bool:
        if d["嚴重度"] not in sev or (rule and d["規則"] not in rule) or (status and d["狀態"] not in status):
            return False
        if disp == "未填" and d["處置"] or disp == "已填" and not d["處置"]:
            return False
        if disp not in ("全部", "未填", "已填") and d["處置"] != disp:
            return False
        if q:
            hay = " ".join(str(d.get(c, "")) for c in ("RefDes", "Net", "規則", "負責人", "說明 (工具)", "追蹤 Key"))
            return q in hay.upper()
        return True

    view = fold_children(with_parents([d for d in rows if keep(d)], rows), fold)
    ss.setdefault("sb_run", run)
    if ss["sb_run"] != run:                            # switched compare: start over, drop the other run's drawings
        ss["sb_run"], ss["sb_key"] = run, None
        ss.pop("sb_src_a", None)
        ss.pop("sb_src_b", None)
    lk = review.last_key(db, run)                      # read once per run (also feeds the 回上次審到 button)
    want = ss.get("sb_key") or lk                      # first visit: the key the RD stopped at
    if fold and want and want not in {d["追蹤 Key"] for d in view}:
        # 回上次審到 / a jump landed on a folded child: show it anyway instead of falling back to the first row
        hidden = next((d for d in rows if d["追蹤 Key"] == want and d.get("父項")), None)
        if hidden is not None and keep(hidden):
            view = sorted(view + [hidden], key=lambda d: d["項次"])
    if not view:
        st.info("篩選後沒有列。")
        return
    keys = [d["追蹤 Key"] for d in view]
    ss["sb_keys"] = keys                               # callbacks (next run) index into this list

    # ------------------------------------------------------------------ current row
    ss.setdefault("sb_v", 0)                           # ?v counter: +1 whenever the shown key changes (see below)
    if ss.get("sb_key") is None:                       # first visit of this run: resume where the RD stopped
        ss["sb_key"] = lk if lk in keys else keys[0]
    cur_key = ss["sb_key"]
    if cur_key not in keys:                            # the filter hides the current row: show the first visible one
        cur_key = keys[0]                              # (sb_key kept, so relaxing the filter returns to it)
    # the viewer reloads only when ?v changes (QA 2026-10-20): bump it at render time whenever the shown key
    # differs from the last one drawn, whatever caused the change (jump, filter, run switch)
    if ss.get("sb_shown") != cur_key:
        ss["sb_v"] += 1
        ss["sb_shown"] = cur_key
    i = keys.index(cur_key)
    cur = view[i]

    def jump_to(k: str) -> None:
        if k and k != ss.get("sb_key"):
            ss["sb_key"] = k
            try:
                review.set_last_key(db, run, k)
            except Exception:  # noqa: BLE001  (memory only is fine)
                pass

    def jump(idx: int) -> None:
        ks = ss.get("sb_keys") or []
        if ks:
            jump_to(ks[max(0, min(len(ks) - 1, idx))])

    def next_same_refdes() -> None:
        ks = ss.get("sb_keys") or []
        byk = {d["追蹤 Key"]: d for d in view}
        rd = cur["RefDes"]
        if not rd:
            return
        for step in range(1, len(ks)):
            k = ks[(i + step) % len(ks)]
            if byk.get(k, {}).get("RefDes") == rd:
                jump_to(k)
                return

    def on_table() -> None:
        dk = f"sb_df_{run}_{ss['sb_v']}"
        sel = (ss.get(dk) or {}).get("selection", {}).get("rows") or []
        if sel:
            jump(sel[0])        # ticking the row already shown is a no-op (the tick stays until the next jump)

    # ------------------------------------------------------------------ toolbar
    t = st.columns([1, 1, 5, 1, 1, 2, 2, 2])
    t[0].button("|<", key="sb_first", on_click=jump, args=(0,), help="第一筆")
    t[1].button("<", key="sb_prev", on_click=jump, args=(i - 1,), help="上一筆")
    ss["sb_pick"] = i                                  # keyed widget: push the current row in before it is drawn
    t[2].selectbox("項次", range(len(view)), key="sb_pick", label_visibility="collapsed",
                   on_change=lambda: jump(ss["sb_pick"]),
                   format_func=lambda j: f'#{view[j]["項次"]}  {view[j]["嚴重度"]}  {view[j]["RefDes"]}  '
                                         f'{_rule_name(view[j]["規則"])}')
    t[3].button(">", key="sb_next", on_click=jump, args=(i + 1,), help="下一筆")
    t[4].button(">|", key="sb_last", on_click=jump, args=(len(view) - 1,), help="最後一筆")
    t[5].button("下一個同 RefDes", key="sb_same", on_click=next_same_refdes)
    t[6].button("回上次審到", key="sb_lastk", on_click=jump_to, args=(lk,), disabled=not lk or lk not in keys)
    hsel = t[7].selectbox("viewer 高度", list(HEIGHTS), index=1, key="sb_h", label_visibility="collapsed")
    z1, z2, z3 = st.columns([2, 2, 6])
    zsel = z1.selectbox("跳轉縮放", list(ZOOMS), index=2, key="sb_zoom",
                        help="自動 = PDF 內建目的地 (iframe 裡 Chrome 不放大)；百分比 = 以該倍率把框放到畫面中間")
    wsel = z2.selectbox("視窗寬度 (置中用)", list(WIDTHS), index=2, key="sb_width",
                        help="只影響置中的估算；左右各半的 iframe 寬度 = (視窗寬 - 側欄) / 2")
    show = z3.checkbox("顯示線路圖", True, key="sb_show")
    zoom = ZOOMS[zsel]
    frame_px = ((WIDTHS[wsel] - SIDEBAR_PX - 112) // 2, HEIGHTS[hsel] - TOOLBAR_PX)
    if ss.get("sb_sig") != (zoom, wsel, hsel):          # a new zoom / size must reload the frames too (?v bump)
        ss["sb_v"] += 1
        ss["sb_sig"] = (zoom, wsel, hsel)
    pa, pb = cur.get("PDF 頁 A"), cur.get("PDF 頁")
    st.caption(f'目前 #{cur["項次"]} / {len(view)} 列　{cur["嚴重度"]}　{_rule_name(cur["規則"])}　{cur["RefDes"]}　'
               f'頁 {a_label} {pa or "-"}　頁 {b_label} {pb or "-"}　狀態 {cur["狀態"]}　key {cur["追蹤 Key"]}'
               + ("" if cur.get("PDF 中心") or not zoom else "　(此列沒有框，退回 PDF 目的地，不放大)"))
    st.markdown(f'**{parent_label(cur, False)}**' + (f'　{cur["細節 (工具)"]}' if cur.get("細節 (工具)") else ""))
    if cur.get("子項"):
        byn = {d["項次"]: d for d in rows}
        with st.expander(f"同根因的子項 {len(cur['子項'])} 筆 (PDF 上不另外框，除嚴重度高於父項者)", expanded=False):
            kid_rows = [byn[k] for k in cur["子項"] if k in byn]
            st.dataframe(pd.DataFrame([{"項次": d["項次"], "嚴重度": d["嚴重度"], "規則": _rule_name(d["規則"]),
                                        "RefDes": d["RefDes"], "Net": d["Net"], "處置": d["處置"] or BLANK,
                                        "說明 (工具)": d["說明 (工具)"]} for d in kid_rows]),
                         hide_index=True, width="stretch", height=min(300, 40 + 35 * len(kid_rows)),
                         key=f"sb_kids_{run}_{cur['追蹤 Key']}")
            kc = st.columns(len(kid_rows[:8]) or 1)
            for j, d in enumerate(kid_rows[:8]):
                kc[j].button(f"看 #{d['項次']}", key=f"sb_kid_{run}_{d['追蹤 Key']}", on_click=jump_to, args=(d["追蹤 Key"],))

    # ------------------------------------------------------------------ viewers
    if show:
        ca, cb = st.columns(2)
        with ca:
            if not url_a:
                st.info(f"{a_label} 沒有框選 PDF (A 資料夾沒有線路圖 PDF)。")
            elif pa:
                ss["sb_src_a"] = _src(url_a, cur["PDF 目的地"], ss["sb_v"], pa, cur.get("PDF 中心 A"), zoom, frame_px)
            else:
                st.warning(f"{a_label} 無此件 (不在 {a_label} 的 PDF 裡)，左邊停在上一筆。")
            if url_a and ss.get("sb_src_a"):
                st.markdown(f"**{a_label}**")
                _frame(ss["sb_src_a"], HEIGHTS[hsel], a_label)
        with cb:
            if pb:
                ss["sb_src_b"] = _src(url_b, cur["PDF 目的地"], ss["sb_v"], pb, cur.get("PDF 中心"), zoom, frame_px)
            else:
                st.warning(f"{b_label} 無此件 (這列沒有定位到 PDF 頁)，右邊停在上一筆。")
            if ss.get("sb_src_b"):
                st.markdown(f"**{b_label}**")
                _frame(ss["sb_src_b"], HEIGHTS[hsel], b_label)

    # ------------------------------------------------------------------ reply form (single row)
    with st.container(border=True):
        r1, r2, r3, r4 = st.columns([2, 2, 2, 5])
        kk = cur["追蹤 Key"]
        wk = f"sb_f_{run}_{kk}"                        # widget keys per row: values follow the row, not the slot
        opts = [BLANK, *DISPOSITIONS]
        if cur["處置"] and cur["處置"] not in opts:
            opts.append(cur["處置"])                 # a stored value outside the list (Excel free text) is kept, not cleared
        r1.selectbox("處置", opts, key=f"{wk}_disp", index=opts.index(cur["處置"]) if cur["處置"] else 0)
        r2.text_input("負責人", cur["負責人"], key=f"{wk}_owner")
        r3.text_input("預計版次", cur["預計版次"], key=f"{wk}_rev")
        r4.text_input("備註", cur["備註"], key=f"{wk}_note")

        def save(go_next: bool) -> None:
            # read the widgets from session_state inside the callback (a closure over this run's values is stale)
            d0 = ss.get(f"{wk}_disp", BLANK)
            vals = {"處置": "" if d0 == BLANK else d0, "負責人": ss.get(f"{wk}_owner", ""),
                    "預計版次": ss.get(f"{wk}_rev", ""), "備註": ss.get(f"{wk}_note", "")}
            # compare against the DB as it is NOW (the 批次填寫 tab may have changed this row meanwhile; QA 2026-10-20)
            now = next((d for d in review.load(db, run) if d["追蹤 Key"] == kk), cur)
            ch = {f: (v or "").strip() for f, v in vals.items() if (v or "").strip() != (now.get(f) or "")}
            if ch:
                n = review.save(db, run, {kk: ch})
                ss["sb_msg"] = f"已儲存 {n} 格 ({dt.datetime.now():%H:%M:%S})"
            if go_next:
                jump(i + 1)

        b1, b2, b3 = st.columns([1, 1, 6])
        b1.button("儲存", key="sb_save", on_click=save, args=(False,))
        b2.button("儲存並下一筆", key="sb_save_next", on_click=save, args=(True,), type="primary")
        b3.caption(f'填寫日期 {cur["填寫日期"] or "-"}　　處置、負責人等也可到「批次填寫」分頁整表編輯。')
    if msg := ss.pop("sb_msg", None):
        st.toast(msg)

    # ------------------------------------------------------------------ table
    df = pd.DataFrame([{
        "項次": d["項次"], "嚴重度": d["嚴重度"], "規則": _rule_name(d["規則"]), "RefDes": d["RefDes"],
        a_label: "✔" if d.get("PDF 頁 A") else "✖", b_label: "✔" if d.get("PDF 頁") else "✖",
        "頁 B": d["PDF 頁"], "狀態": d["狀態"], "父項": f'#{d["父項"]}' if d.get("父項") else "",
        "處置": d["處置"] or BLANK, "負責人": d["負責人"],
        "說明 (工具)": parent_label(d, fold), "追蹤 Key": d["追蹤 Key"],
    } for d in view])
    st.caption(f"勾選列首的方框跳到該筆 (兩邊同步)。顯示 {len(view)} / {len(rows)} 列；"
               f"{a_label} / {b_label} 欄 ✔ = 該側 PDF 有定位到。"
               + "　子項在表裡時父項一律跟著顯示 (不受嚴重度篩選)。"
               + ("　摺疊中：子項藏在父項底下 (父項說明開頭列出 #n)；圖上有框的子項不摺。" if fold else ""))
    st.dataframe(df, hide_index=True, on_select=on_table, selection_mode="single-row",
                 key=f"sb_df_{run}_{ss['sb_v']}", height=min(460, 40 + 35 * len(view)),
                 column_config={"項次": st.column_config.NumberColumn(width="small"),
                                a_label: st.column_config.TextColumn(width="small"),
                                b_label: st.column_config.TextColumn(width="small"),
                                "頁 B": st.column_config.NumberColumn(width="small")})
