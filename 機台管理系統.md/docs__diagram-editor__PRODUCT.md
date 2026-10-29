> 集中副本；原始路徑：`docs/diagram-editor/PRODUCT.md`；程式參考基準：`06c686951b17afa920cf325ddfec9114590aeee0`。歷史文件保留當時語意，先以 00_閱讀指南.md 與現行手冊判定適用範圍。

# AutoCheck Diagram Editor

<!-- impeccable:product-schema 1 -->

This product record applies only to the AutoCheck diagram editor. It does not define the surrounding website.

## Platform

web

## Users

Existing AutoCheck comparison users who need to draw or edit diagrams while working with comparison results.

## Product Purpose

Provide an editable drawing workspace for Block Diagrams, flowcharts, circuit sketches, Power Tree diagrams, and I²C maps. The default workspace embeds the official draw.io editor with its full shape libraries. Users can begin with a blank document, open a native `.drawio` file, or bring a generated Power Tree or I²C diagram into a separate editable document. The existing native editor remains available as “快速繪圖”.

## Operating Context

The editor is part of the existing AutoCheck comparison workspace. The default DRAWIO workspace loads `https://embed.diagrams.net` and requires a network connection; it retains the official editor's shape libraries, canvas, tools, and properties. The host document controls and the retained quick editor use the existing graphite design. The surrounding website remains in its existing design.

## Capabilities and Constraints

- Use the official DRAWIO editor's general, basic, arrow, flowchart, and electrical libraries, with additional libraries available through its own “更多圖形” control.
- Open and download native `.drawio` / XML files. The host stores the raw XML container, preserving compressed and multiple pages rather than converting foreign files into the native eight-shape model. The file limit is 20 MiB.
- Automatically save DRAWIO documents in the current browser under the signed-in account, with a local-document picker, save status, load/retry states, theme switching, and full-canvas mode. DRAWIO loading requires network access; there is no cloud document copy.
- Open new comparison-generated A/B Power Tree and I²C DRAWIO artifacts directly as separate editable copies. Existing results without these artifacts retain the quick-editor source path.
- In the retained quick editor, draw freeform Block Diagrams and flowcharts with shapes and connections.
- The quick editor offers eight library shapes: rectangle, ellipse, diamond, note, resistor, capacitor, ground, and Net Name. Electrical symbols expose their actual terminals and rotate in 90° steps; Net Name tags and connection labels are editable.
- In quick drawing, draw arrows directly by dragging on the canvas, with free or shape-attached endpoints. Edit routing, arrowheads, line style, width, and direction, and reconnect either endpoint.
- In quick drawing, draw double-ended arrows directly, choose custom stroke colors, and apply optional custom fills to basic shapes and Net Name tags. Crossing bridges mark wires that cross without connecting; each wire can enable or disable them.
- Bring Power Tree or I²C source graphs into an editable diagram without changing the original comparison result.
- Use dark mode by default, with a header control for switching to light mode. The appearance preference belongs to the current browser rather than an account or diagram document.
- Save diagram documents automatically in the current browser, scoped to the signed-in account.
- Export and reopen the quick editor's separate editable JSON backup. Export quick diagrams as editable DRAWIO files, or use “檔案 → 在 DRAWIO 編輯副本” to open a separate copy in the full editor. This conversion is one-way; cubic curves become editable approximate paths.
- The quick editor exports SVG, PNG, and PDF presentations on a white page, independently of editor appearance.
- User-edited DRAWIO and quick-editor documents have no cloud copy and are not included in the comparison workspace's `.autocheck.zip` backup. Download edited `.drawio` or JSON documents separately. Original generated DRAWIO artifacts do remain part of the comparison result and its backup.
- The quick editor's editable JSON retains document version 1; arrow, crossing, fill, and rotation fields are optional so earlier version-1 documents remain readable.
- If quick-editor crossing calculations exceed their density limits, the canvas keeps the original routes and reports that bridges are paused. Visual export stops with the same notice; editable JSON remains available.

Audience details beyond existing AutoCheck comparison users, formal success measures, collaboration requirements, and additional accessibility requirements have not been confirmed.

## Brand Commitments

The user explicitly requested Apple design colors, dark mode, and colored shapes while retaining the earlier dark backgrounds. The implemented default is Apple-inspired neutral graphite with colored shape-library roles, brighter foreground accents, and a light-mode option. This is a scoped editor change; the existing site's exterior design is preserved. The actual editor palette and reusable visual rules are recorded in the adjacent `DESIGN.md`.

## Evidence on Hand

- `src/components/comparison/ComparisonDiagramWorkspace.tsx` and `DrawioDiagramEditor.tsx`: default full-editor entry, source routing, document tools, autosave, local picker, and frame states.
- `src/components/comparison/drawioEmbed.ts`, `drawioDocument.ts`, and `drawioStorage.ts`: official-frame protocol, raw XML validation, and account-scoped browser storage.
- `src/components/comparison/diagramDrawioExport.ts`: one-way conversion of native diagrams into editable DRAWIO cells and portable circuit stencils.
- `src/components/comparison/ComparisonDiagramEditor.tsx`: retained quick-editor tools, eight-shape library, canvas, properties, and import/export actions.
- `src/components/comparison/diagramStorage.ts`: browser-local documents indexed by account.
- `src/components/comparison/diagramExport.ts`: JSON, SVG, PNG, and PDF exports.
- `src/components/comparison/diagramTheme.ts`, `diagramInteractions.ts`, and `diagramGeometry.ts`: browser-local appearance, arrow targeting, and shared arrow routing.
- `src/components/comparison/diagramSymbols.ts`, `diagramPalette.ts`, `DiagramPaletteIcons.tsx`, `diagramCrossings.ts`, and `DiagramColorControl.tsx`: shared circuit symbols, library definitions/icons, crossing bridges, and custom color controls.
- `src/components/comparison/ComparisonWorkspace.tsx` and `ComparisonCharts.tsx`: blank-editor and source-diagram entry points.
- `src/components/comparison/ComparisonGuide.tsx`: user-facing instructions and backup limitations.
- `public/comparison/browser_bridge.py`, `public/comparison/engine/autocheck/report/power_tree_drawio.py`, and `public/comparison/engine/autocheck/report/i2c_block_drawio.py`: independent generated DRAWIO source artifacts for A/B revisions.

## Product Principles

- Keep freeform drawing and editing of comparison graphs available in the same workspace.
- Preserve the original comparison data when editing a diagram.
- Make local storage and the separate editable backup clear to users.
- Preserve the surrounding site's established design while improving the editor.
