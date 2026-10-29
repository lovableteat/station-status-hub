> 集中副本；原始路徑：`docs/autocheck-1015-integration.md`；程式參考基準：`0b0dee080f02ceb8d58b38744fabe3b5d5f4bcfd`。歷史文件保留當時語意，先以 00_閱讀指南.md 與現行手冊判定適用範圍。

# AutoCheck 1015 integration

The browser engine now uses the user-provided `AutoCheck_1015.zip`. Its source SHA-256 is `dd6ab9090ebb60fe86575a6c349355f0a0a4b3a5acca31e29df624d264ac2e35`; `public/comparison/engine/manifest.json` records the origin, revision `2026-10-15`, and hashes for 47 deployed Python/config files.

## Difference from the deployed 1014 engine

Of the previous 45 manifest files, 43 are unchanged and two are updated: `autocheck/cli.py` adds independent DRAWIO report output, and `autocheck/report/i2c_block_diagram.py` shares its layout with a second renderer. The two added modules are `autocheck/report/power_tree_drawio.py` and `autocheck/report/i2c_block_drawio.py`. Existing browser and Power Tree compatibility adapters remain in place. The surrounding website interface is unchanged.

`public/comparison/browser_bridge.py` exposes generated files as `power_drawio_a`, `power_drawio_b`, `i2c_drawio_a`, and `i2c_drawio_b`, with MIME `application/vnd.jgraph.mxfile`. A-revision output has separate filenames and does not overwrite B. The adapter retains existing report artifacts, reports isolated renderer failures, and rewrites local schematic links for portable output. `runtime.ts` and the worker use the updated engine revision.

## Editing and persistence

`ComparisonDiagramWorkspace.tsx` opens generated DRAWIO artifacts directly in the official `embed.diagrams.net` editor. The full editor is the default; old source graphs without DRAWIO artifacts and the existing native eight-shape editor remain available through “快速繪圖”. Native diagrams can export `.drawio` or open an editable copy; this is one-way conversion, with cubic curves represented by editable approximate paths.

`DrawioDiagramEditor.tsx`, `drawioEmbed.ts`, `drawioDocument.ts`, and `drawioStorage.ts` provide official-frame messaging, XML validation, and account-scoped browser storage. Raw `.drawio` XML is kept intact, including compressed and multiple pages, with a 20 MiB limit. Loading the official editor requires network access. Neither editor creates a cloud document copy.

Generated source DRAWIO artifacts remain part of the comparison result and its `.autocheck.zip` backup. User-edited DRAWIO documents require a separate `.drawio` download; native quick-editor documents retain their separate editable JSON backup.

## Verification recorded for this integration

- Engine regression: 70 passed, four environment-dependent skips.
- Browser bridge DRAWIO regression: four passed, covering A/B artifact keys, MIME and XML topology, independent filenames, and report preservation on renderer failure.
- Pyodide end-to-end comparison passed with existing reports and the four DRAWIO source artifacts.
- Native-to-DRAWIO conversion: 12 passed in `tests/comparison/diagramDrawioExport.test.ts`, including portable symbol geometry, rotation, endpoint rules, editable line styles, XML escaping, and rejection of invalid input.

These checks are defined in `tests/comparison/drawio-engine.test.mjs`, `tests/comparison/python-runtime.test.mjs`, and `tests/comparison/diagramDrawioExport.test.ts`. Host editor protocol, storage, and UI regressions are maintained separately in the DRAWIO document, embed, storage, and editor test files.
