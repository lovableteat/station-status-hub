> 集中副本；原始路徑：`docs/autocheck-1022-integration.md`；程式參考基準：`0b0dee080f02ceb8d58b38744fabe3b5d5f4bcfd`。歷史文件保留當時語意，先以 00_閱讀指南.md 與現行手冊判定適用範圍。

# AutoCheck 1022 integration

The browser engine now uses the user-provided `AutoCheck_1022.zip` (2026-10-22). Its source SHA-256 is `4dac9b2e1690cc30d4ec4f571eee24fafc01b1c797d888850a3f7d1ee6a39e2b`; `public/comparison/engine/manifest.json` records the origin, revision `2026-10-22`, version `0.2.0`, and hashes for 49 deployed Python/config files. Only `autocheck/**/*.py` and the four `config/*.yaml` files are deployed; the Streamlit app, `pages/`, `.venv`, backups and tests in the archive are not.

## Difference from the deployed 1015 engine

Of the previous 47 manifest files, 27 are unchanged, 20 are updated and two are added (`autocheck/parsers/bom_nvidia.py`, `autocheck/ui_viewer.py`). The engine changes that reach the website, taken from the archive's `HANDOVER.md` sections 0p10 to 0p15:

- Design check list rules C1 `DECOUPLE_MISSING` / `DECOUPLE_NO_SMALL`, C2 `PULLUP_DOUBLE` (severity from `rail_domain`), C3 `FET_GATE_LEVEL` (one INFO row per built FET with Vg / Vs / Vgs plus a FET coverage block in the Excel 統計 sheet) and `I2C_ADDR_RESERVED` (UM10204 reserved 7-bit ranges). `config/default.yaml` enables them under `netrules.enabled` and adds `fet_source`, `fet_drain`, `vbat` pin roles.
- Concept HDL (Packager-XL) netlists and NVIDIA multi-level BOMs with AML rows are parsed; `bom_erp.sniff_bom()` reports ERP / Agile / NVIDIA.
- Speed: `Design.pins_of` uses a RefDes index and large `netrules` systems solve through numpy (`SOLVE_PY_MAX` nets); numpy is already part of the Pyodide pandas bundle the worker loads.
- Power tree boxes show the voltage source line again and dual FETs are drawn by their own gate half.

## Browser bridge

`public/comparison/browser_bridge.py` no longer calls `autocheck.loader.classify`. The 1022 loader selects files by content across a whole design-kit folder and requires all three netlist files in one call, while the website already lets the user pick one file per role and sends only those files. The bridge therefore assigns roles from the file names with the 1015 rules (`pstxnet` / `pstxprt` / `pstchip` `.dat`, spreadsheet BOM, `.dsn`, `.pdf`, `i2c_map_declared*.csv`), keeps the duplicate-role and missing-netlist errors, and passes the files to the unchanged `pipeline.run`, `cli.write_outputs`, `tracking.expand_rows`, `review` and draw.io entry points, whose signatures are the same as in 1015.

The website interface is unchanged apart from the optional-tools pickers (規則設定 YAML, Net 電壓對照 CSV, 電源域 CSV, I²C Block Diagram 對照 CSV), which now use the same button-plus-filename control as the A/B panels instead of a bare native file input.

## Verification recorded for this integration

- `tests/comparison/python-runtime.test.mjs` with `AUTOCHECK_PYODIDE=1`: the Pyodide end-to-end comparison passed on the 1022 engine (library, run, tracker, datasheet, Agile BOM, hostile input and broken PDF cases; 5 passed, the native-Python case skipped).
- Manifest tests in `python-runtime.test.mjs` and `drawio-engine.test.mjs` verify the 49 hashes, origin and revision.
- The native-Python regressions (`AUTOCHECK_PYTHON`) were not run on this machine; the archive's own suite expects 338 passed per its handover notes.
