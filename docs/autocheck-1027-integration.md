# AutoCheck 1027 integration

The browser engine now uses the user-provided `AutoCheck_1027.zip` (2026-10-27). Its source SHA-256 is `b6449e6b08c64c6bf3fb69511ec5b44a87cbbc2852ed32f19358180270196bd5`; `public/comparison/engine/manifest.json` records the origin, revision `2026-10-27`, version `0.2.0`, and hashes for 52 deployed Python/config files. As before, only `autocheck/**/*.py` and the four `config/*.yaml` files are deployed; the Streamlit app, `pages/`, `.venv`, backups, `static/` reports and tests in the archive are not.

## Difference from the deployed 1022 engine

Of the 49 previous manifest files, 27 are unchanged and 22 are updated; three modules are added (`autocheck/checks/bom_consistency.py`, `autocheck/checks/shortopen.py`, `autocheck/parsers/bom_orcad.py`). From the archive's `HANDOVER.md` sections 0p18 to 0p21:

- OrCAD Capture "Bill Of Materials" reports (`.BOM` text or the same layout saved as xlsx) are recognised by `bom_erp.sniff_bom()` as `OrCAD` and parsed by `bom_orcad.py`; DSN `NI` parts count as DNP when there is no company BOM.
- Short / open checks (`shortopen.py`): `NET_SHORTED` (two old nets merged in B, with the pins of each side as evidence), `PIN_ISOLATED`, `NET_SPLIT`, `NET_MERGED`, `SINGLE_PIN_NET`, and `CAP_ONLY_NET` (INFO by default, `drc.cap_only_severity`).
- G0 BOM / netlist consistency (`bom_consistency.py`): per side, BOM value / type / PN compared with the netlist, a banner on the power tree when a converter, inductor, FET or shunt mismatches, and `Result.bom_check`.
- Root-cause grouping (B-full): `tracking.link_root_causes()` marks consequence rows of a `NET_SHORTED` / `CAP_ONLY_NET` row as children (`TrackRow.parent` / `children`); the Excel tracker gets a 父項 column after 狀態 and derives every column index from the header names; the PDF boxes only the parent (children keep a box only for `PIN_ISOLATED` or when the parent is not located on the same page); `review.sync_run()` stores the boxed flag.
- PDF annotation: `NET_SHORTED` boxes one net label per side, `NET_SPLIT` / `NET_MERGED` box only the net label nearest to any moved part, line width 0.6 (`annotate.box_line_width`).

## Browser bridge and website

- `browser_bridge.py` calls `link_root_causes` on the rows it returns to the page, so the website rows carry the same `parent` / `children` keys as the Excel workbook written by `cli.write_outputs`, and returns `result.rootcause` (`parents`, `children`, annotate summary).
- `_safe_workbook` no longer hard-codes the 追蹤表 PDF link column (`W`) or the 規則說明 rule column (`E`): both letters and the 版本資訊 base cell come from `xlsx_tracker.COL` / `BASE_URL_CELL`. With the 1022 bridge the 1027 workbook's PDF formulas (now in column X) would have been downgraded to plain text.
- Artifact keys are unique: the engine writes a sidecar for each annotated schematic (`…_schematic_<B>.annotations.json` → `annotations`, `…_schematic_<A>.annotations.json` → `annotations_a`), and any other repeated key gets a numeric suffix. With the 1022 bridge both sidecars shared the key `annotations`, the page's session store rejected the result (「本機儲存失敗…報表 Key 或檔名重複」), so a finished comparison could not be saved or reviewed. This was found by the headless-browser run, not by the unit tests, which now assert key uniqueness.
- `storage.ts` accepts the optional row fields `evidence`, `parent`, `children` and the optional result field `rootcause`; sessions saved by earlier engines still validate. The results table shows `同根因 → #n` on child rows and the child list on parent rows; row numbers follow the engine's row order, the same numbers the Excel 父項 column uses.
- The worker URL revision is `2026-10-27`, so browsers refetch the worker and engine manifest.
- The compatibility adapters are unchanged: `browser_compat.py` wraps `tracking.expand_rows` (same signature) and `pdf_annotate.normalize_pdf` / `_transform_annots` (same signatures in 1027); `power_tree_compat.py` wraps `power_tree_diagram.layout` (same signature; `render_html` / `render_drawio` gained a `banner` argument that the CLI passes and the A-side copies leave empty).

## Verification recorded for this integration

- The archive's own suite on native Python 3.12 (`uv sync --frozen`, pandas 3.0.6): 372 passed, 28 skipped (real-data cases).
- A synthetic TPM-style package (Allegro pst netlists, OrCAD-layout BOM xlsx, fake schematic PDF; B shorts the two SPI host nets and adds a cap-only rail) through the native CLI: 13 findings, NEW WARN 2, changes 7, root cause 1 parent / 6 children, 14 rows located, 5 boxed.
- The same package through the production build in headless Edge (worker, Pyodide, bridge): see the figures in the commit message / final report.
- `tests/comparison/python-runtime.test.mjs` with `AUTOCHECK_PYODIDE=1` and the manifest / draw.io contract tests.
