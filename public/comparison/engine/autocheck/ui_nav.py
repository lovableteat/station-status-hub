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
    """I2C datasheet folder chosen in app.py block C (this session, else the remembered path), else config
    i2c.datasheets_dir (AutoCheck/datasheets). The I2C 位址庫 page and the compare run use the same folder."""
    from .checks.i2c_map import datasheets_dir
    v = st.session_state.get("ds_dir")
    if not v:
        try:
            v = json.loads(PREFS.read_text(encoding="utf-8")).get("ds_dir", "")
        except Exception:  # noqa: BLE001
            v = ""
    v = str(v or "").strip().strip('"').strip("'")
    # relative path = relative to the AutoCheck folder, same rule as the compare run (i2c_map.datasheets_dir)
    return datasheets_dir({"i2c": {"datasheets_dir": v}}) if v else datasheets_dir(cfg)
