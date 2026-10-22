"""Sidebar menu shared by every UI page.

Streamlit's default page list names the entry page after its file (app.py -> "app") and has no setting to rename it
(https://docs.streamlit.io/develop/tutorials/multipage/st.page_link-nav). So .streamlit/config.toml turns the default
list off ([client] showSidebarNavigation = false) and each page calls sidebar_nav() right after st.set_page_config.
Add a page = add one line to PAGES."""
from __future__ import annotations

import json
from pathlib import Path

import streamlit as st

PREFS = Path(__file__).resolve().parent.parent / ".autocheck_ui.json"    # app.py remembers the last used paths here
# main-page path / label fields: plain session_state keys (app.py FIELDS), written to PREFS only by 開始檢查
PREF_FIELDS = ("a_dir", "b_dir", "ds_dir", "out_dir", "rail_map", "rail_domain", "i2c_declared", "config",
               "a_label", "b_label")


def board_prefs(session, saved: dict) -> dict:
    """Paths / options for the single-board panel: this session's main-page fields win (they survive page switches,
    a field cleared this session stays cleared), PREFS only fills what the main page has not set in this session
    (page opened first in a new tab). Bug 2026-10-21: the panel read PREFS only, so a folder changed without
    pressing 開始檢查 was ignored."""
    return {**saved, **{k: session[k] for k in PREF_FIELDS if k in session}}


def ui_prefs() -> dict:
    """board_prefs(st.session_state, PREFS file); an unreadable / missing file counts as empty."""
    try:
        saved = json.loads(PREFS.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        saved = {}
    return board_prefs(st.session_state, saved if isinstance(saved, dict) else {})


MAIN_LABEL = "AutoCheck 比對"
PAGES = (                                         # (path relative to app.py, sidebar label, icon)
    ("app.py", MAIN_LABEL, ":material/compare_arrows:"),
    ("pages/1_審查回覆.py", "審查回覆", ":material/rate_review:"),
    ("pages/2_Power_tree.py", "Power tree 圖", ":material/account_tree:"),
    ("pages/3_I2C_map.py", "I2C map", ":material/lan:"),
    ("pages/4_I2C_位址庫.py", "I2C 位址庫", ":material/menu_book:"),
)


def sidebar_nav() -> None:
    with st.sidebar:
        for path, label, icon in PAGES:
            st.page_link(path, label=label, icon=icon)


BRAND = "Cody Chueh"


def brand_line() -> None:
    """'Powered by Cody Chueh' above each page title (orange, bold, h4 size)."""
    st.markdown(f"#### :material/bolt: Powered by :orange[**{BRAND}**]")


def ui_datasheets_dir(cfg: dict) -> Path:
    """I2C datasheet folder chosen in app.py block C (this session's field, else the remembered path), else config
    i2c.datasheets_dir (AutoCheck/datasheets). The I2C 位址庫 page and the compare run use the same folder.
    QA 2026-10-21 (F1): a field cleared this session stays cleared (= config default, as the compare run does);
    before, an empty field fell back to the remembered PREFS folder."""
    from .checks.i2c_map import datasheets_dir
    v = str(ui_prefs().get("ds_dir") or "").strip().strip('"').strip("'")
    # relative path = relative to the AutoCheck folder, same rule as the compare run (i2c_map.datasheets_dir)
    return datasheets_dir({"i2c": {"datasheets_dir": v}}) if v else datasheets_dir(cfg)


def single_board_panel(kind: str) -> None:
    """「只畫單板圖」expander on pages/2 and pages/3 (2026-10-19, owner): draw the power tree + I2C map of A or B alone
    (paths / labels / options = this session's main-page fields, else .autocheck_ui.json: ui_prefs / board_prefs) or of
    any other folder, without a compare run. Output = static/單板_<label>/ (overwritten each time) + <out_dir>/單板_<label>/. kind = "pt" / "i2c" only
    makes the widget keys unique per page. On success the page reruns so the new run shows in the selectbox."""
    from .cli import SINGLE_PREFIX, write_single
    from .loader import classify, files_in
    from .pipeline import run_single
    prefs = ui_prefs()

    def clean(v) -> str:
        return str(v or "").strip().strip('"').strip("'")

    with st.expander("只畫單板圖 (不跑比對)", expanded=False):
        st.caption(f"用「{MAIN_LABEL}」頁目前欄位裡的 A / B 路徑與選用設定 (這次沒開過主頁則用上次「開始檢查」存的)，"
                   "只算 power tree 與 I2C map，不出 findings / Excel / PDF。"
                   "單板沒有標註線路圖，圖上的 RefDes 不帶連結。結果存在 static/單板_<標籤>/，每次覆蓋。")
        # QA F2: show the folders in plain text (help is a tooltip only); a path typed on the main page without Enter can
        # be lost if Streamlit coalesces two reruns, and this line makes that visible before drawing
        st.caption("目前路徑：" + "　".join(
            f"{clean(prefs.get(f'{s}_label')) or s.upper()} = {clean(prefs.get(f'{s}_dir')) or '(未填)'}" for s in ("a", "b")),
            help="這裡不是你要的資料夾，就回主頁確認欄位 (打完路徑按 Enter)。")
        cols = st.columns(3)
        picks = []
        for i, side in enumerate(("a", "b")):
            folder, label = clean(prefs.get(f"{side}_dir")), clean(prefs.get(f"{side}_label")) or side.upper()
            if cols[i].button(f"產生 {label} 的圖", key=f"single_{kind}_{side}", disabled=not folder,
                              help=folder or f"「{MAIN_LABEL}」頁還沒填 {side.upper()} 路徑"):
                picks.append((folder, label))
        cfolder = cols[2].text_input("其他資料夾", key=f"single_{kind}_dir", placeholder="任何一版的 netlist 資料夾")
        clabel = cols[2].text_input("標籤", key=f"single_{kind}_label", placeholder="例：CRB")
        if cols[2].button("產生這個資料夾的圖", key=f"single_{kind}_custom", disabled=not clean(cfolder)):
            picks.append((clean(cfolder), clean(clabel) or Path(clean(cfolder)).name))
        for folder, label in picks:
            p = Path(folder)
            if not p.is_dir():
                st.error(f"找不到資料夾: {folder}")
                continue
            files = classify(files_in(p))
            if not {"pstxnet", "pstxprt", "pstchip"} <= set(files):
                st.error(f"{folder} 缺 pstxnet / pstxprt / pstchip，不能畫。")
                continue
            out_root = clean(prefs.get("out_dir"))
            out = (Path(out_root) if out_root else PREFS.parent / "out") / f"{SINGLE_PREFIX}{label}"
            with st.spinner(f"解析 {label} 並畫圖..."):
                try:
                    res = run_single(files, label, clean(prefs.get("config")) or None, clean(prefs.get("rail_map")) or None,
                                     clean(prefs.get("i2c_declared")) or None, datasheets_dir=clean(prefs.get("ds_dir")) or None)
                    paths = write_single(res, out)
                except Exception as e:  # noqa: BLE001
                    st.error(f"畫圖失敗: {type(e).__name__}: {e}")
                    continue
            for lv, msg in res.input_issues:
                (st.error if lv == "ERROR" else st.warning)(msg)
            for w in res.warnings:
                st.warning(w)
            st.success(f"{label} 的圖已產生：{out}　({', '.join(sorted(x.name for x in paths.values()))})")
            st.session_state.pop(f"{kind}_run", None)      # drop the stale selectbox choice, the rerun picks the newest file
            st.rerun()


def run_heading(run_dir: str) -> str:
    """'比對：EVT → DVT' for a compare run folder, '單板：CRB' for a single-board one (static/<run>/)."""
    from .cli import SINGLE_PREFIX
    if run_dir.startswith(SINGLE_PREFIX):
        return f"單板：{run_dir[len(SINGLE_PREFIX):]}"
    return f"比對：{run_dir.replace('_vs_', ' → ')}"
