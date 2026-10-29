> 集中副本；原始路徑：`docs/diagram-editor/DESIGN.md`；程式參考基準：`06c686951b17afa920cf325ddfec9114590aeee0`。歷史文件保留當時語意，先以 00_閱讀指南.md 與現行手冊判定適用範圍。

---
name: AutoCheck Diagram Editor
description: Scoped Apple-inspired neutral graphite workspace with colored shapes and a light variant
colors:
  action-blue: "#0071e3"
  primary-hover: "#0066cc"
  on-primary: "#ffffff"
  focus-blue: "#69afff"
  action-text: "#9ecbff"
  selection-fill: "#244a71"
  chrome: "#242426"
  surface: "#2c2c2e"
  canvas: "#1c1c1e"
  field: "#323235"
  text: "#f5f5f7"
  control-text: "#dce5f2"
  secondary-text: "#b2bbc9"
  separator: "#454548"
  control-border: "#636369"
  destructive: "#ff9490"
  dark-canvas-detail: "#c1c9d5"
  canvas-text: "#1f2937"
  canvas-detail: "#526171"
  light-action-text: "#0066cc"
  light-selection-fill: "#e8f2ff"
  light-chrome: "#f5f5f7"
  light-surface: "#ffffff"
  light-text: "#1d1d1f"
  light-control-text: "#45484e"
  light-secondary-text: "#62666c"
  light-separator: "#d8dce1"
  light-control-border: "#c8cdd3"
  light-destructive: "#c93430"
  shape-blue: "#80b9ff"
  shape-blue-fill: "#203e62"
  shape-teal: "#79dfd0"
  shape-teal-fill: "#1f4647"
  shape-violet: "#cab1f0"
  shape-violet-fill: "#393350"
  shape-amber: "#e8c685"
  shape-amber-fill: "#4c3e28"
  light-shape-blue: "#2868b7"
  light-shape-blue-fill: "#edf4ff"
  light-shape-teal: "#14786e"
  light-shape-teal-fill: "#eaf8f4"
  light-shape-violet: "#7950a6"
  light-shape-violet-fill: "#f4effb"
  light-shape-amber: "#876218"
  light-shape-amber-fill: "#fff6e5"
  document-blue: "#79a9e8"
  document-teal: "#63c8b7"
  document-violet: "#b59bdf"
  document-amber: "#d6ad65"
  document-gray: "#a4adb9"
typography:
  title:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans TC", sans-serif'
    fontSize: "14px"
    fontWeight: 600
  panel-title:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans TC", sans-serif'
    fontSize: "13px"
    fontWeight: 600
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans TC", sans-serif'
    fontSize: "13px"
    fontWeight: 400
  label:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans TC", sans-serif'
    fontSize: "12px"
    fontWeight: 500
  metadata:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans TC", sans-serif'
    fontSize: "11px"
    fontWeight: 400
    lineHeight: "18px"
rounded:
  shell: "12px"
  floating: "10px"
  control: "7px"
  field: "6px"
  compact: "4px"
  diagram-node: "3px"
spacing:
  compact: "4px"
  control-gap: "6px"
  item-gap: "8px"
  group: "12px"
  panel: "16px"
components:
  button-primary:
    backgroundColor: "{colors.action-blue}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "0 12px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.control}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.control-text}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "0 10px"
  button-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.control-text}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "0 12px"
  field:
    backgroundColor: "{colors.field}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.field}"
    height: "38px"
    padding: "10px 16px"
  color-control:
    backgroundColor: "{colors.field}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.field}"
  command-bar:
    backgroundColor: "{colors.chrome}"
    textColor: "{colors.control-text}"
    typography: "{typography.label}"
    height: "49px"
    padding: "2px 8px"
  shape-card:
    backgroundColor: "{colors.shape-blue-fill}"
    textColor: "{colors.control-text}"
    rounded: "{rounded.control}"
    height: "88px"
    padding: "10px 4px"
  saved-document-card:
    backgroundColor: "hsl(240 3% 20%)"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.field}"
    height: "68px"
    padding: "12px"
  selection-chip:
    backgroundColor: "{colors.selection-fill}"
    textColor: "{colors.action-text}"
    rounded: "{rounded.compact}"
    padding: "5px 8px"
---

# Design System: AutoCheck Diagram Editor

## Overview

**Creative North Star: "The Diagram Workbench"**

The default workspace embeds the official draw.io editor and its full shape libraries inside the existing AutoCheck document shell. The retained “快速繪圖” editor pairs the familiar workbench arrangement with Apple-inspired neutral graphite backgrounds and a light variant. Brighter blue identifies host and quick-editor actions, focus, and selection; colored basic shapes and circuit symbols give the quick editor's eight-item library recognizable roles.

This record applies to the host document shell, quick editor, and their menus and dialogs. The official cross-origin DRAWIO frame retains its own interface; its internals are not styled by the host stylesheet. The surrounding AutoCheck website keeps its incumbent design. The record follows the implemented components and stylesheet rather than prescribing a new website identity.

**Key Characteristics:**
- Neutral graphite canvas and tools by default, with a complete light variant.
- Compact system typography and explicit control labels.
- The official full DRAWIO workspace by default, with the existing eight-shape quick editor available separately.
- A persistent, color-coded shape library with contextual editing properties in the quick editor.
- Direct movement, drag-to-draw arrows, visible connection handles, and reversible edits.
- Responsive tools that keep the drawing workspace usable on narrow screens.

## Colors

The host shell and quick editor use the earlier neutral graphite backgrounds, light text, and brighter blue interaction accents. The frontmatter holds the normative values from `diagramEditor.css`, `diagramTheme.ts`, and `diagramPalette.ts`: unsuffixed UI roles describe dark mode, `light-` roles describe the light variant, `document-` roles describe quick-editor new-shape color values, and the canvas text/detail roles retain the portable light-rendering values. The official DRAWIO frame receives the selected dark/light mode through its URL and configuration; these host tokens do not claim control over its complete internal palette.

### Primary

- **Action Blue** and **Primary Hover** supply primary-button backgrounds; **On Primary** supplies their text in both modes.
- **Focus Blue** marks dark-mode focus, resizing, and selected connections; light mode uses Action Blue for these roles.
- **Action Text** supplies selected and highlighted text in the active mode.
- **Selection Fill** identifies active tools, highlighted menu items, and hovered shape cards.

### Secondary

- **Shape Blue** identifies rectangles and resistors, **Shape Teal** identifies ellipses and capacitors, **Shape Violet** identifies diamonds, and **Shape Amber** identifies notes and Net Name tags. Each role has a themed icon color and tile fill, including corresponding light-mode values. Ground uses the neutral control-text/surface roles.
- **Document Blue / Teal / Violet / Amber / Gray** are stored defaults for newly created shapes. Ground uses Document Gray; the other shapes follow their corresponding library color roles. The library's themed presentation colors do not overwrite existing document colors.

### Neutral

- **Chrome** separates toolbars, status controls, and the shape library from the drawing surface.
- **Surface** is the property panel and menu background; **Canvas** is the deeper drawing region and **Field** is the editable control surface. All three become Light Surface in light mode.
- **Text** carries document names and editable field content; **Control Text** carries tool labels.
- **Secondary Text** supports document metadata, hints, and status information.
- **Separator** divides structural regions; **Control Border** defines editable fields and outlined buttons.
- **Canvas Text** and **Canvas Detail** supply light-canvas and export text. The dark canvas uses Text and Dark Canvas Detail. Mode-aware helpers derive shape fills and visible connection strokes from the document's existing colors without changing those stored color values.
- **Destructive** identifies removal actions. It does not replace the confirmation dialog for deleting a saved document.

**The Scoped Color Rule.** Apply the same `data-diagram-theme` to the host shell, quick editor, and their portaled menus and dialogs; preserve the surrounding site's colors.

The header appearance control switches dark/light mode and remembers the choice in this browser's local storage. Missing or unavailable storage defaults to dark; a failed preference write still allows the current toggle to work. Appearance is outside the saved diagram and its undo history. SVG, PNG, and PDF exports always retain the white page and light drawing-color helpers.

Automatic dark node fills blend toward the canvas by 0.72 to retain more of the chosen hue, with further blending when needed to keep relative fill luminance at or below 0.083. Dark strokes are brightened when their relative luminance is below 0.38. The light rendering retains its 0.88 fill blend and 0.25 maximum stroke-luminance threshold. A custom fill preserves the chosen color and selects black or white label/detail text according to the higher contrast; electrical R/C/GND symbols remain unfilled line drawings.

## Typography

**UI Font:** the system stack in the frontmatter uses the platform's Apple or Windows UI family, with Traditional Chinese coverage through Noto Sans TC.

**Character:** compact and readable, with weight distinguishing document identity and panel headings from tools and metadata. Optical sizing is enabled. The editor does not introduce a separate display face.

### Hierarchy

- **Title:** the editable diagram name.
- **Panel title:** shape-library and contextual-property headings.
- **Body:** editable content and regular editor text.
- **Label:** commands and property labels.
- **Metadata:** source revision, saved state, hints, and counts.

Diagram-node names use the panel-title size and weight with a line height of 1.4. Details use the metadata size with a line height of 1.5 and show up to three lines. Symbol captions use 12px names and 10px details with a line height of 1.1; details show up to two lines, and captions remain upright outside circuit strokes during rotation. On screens at or below 700px, title and editable property fields use 16px text. Portable visual exports use their existing Arial / Microsoft JhengHei / Noto Sans CJK TC fallback stack.

## Layout

In the default DRAWIO workspace, the host document header is followed by wrapping file tools, the flexible official editor frame, and a local-storage/network status footer. The frame has a 360px minimum drawing region; loading and connection failure states occupy that same region. At or below 620px the file tools grow to fill their rows. Full-canvas and appearance changes preserve the current contents before remounting the frame. The DRAWIO frame provides its own library, properties, layers, and pages.

In the quick editor, the document header is followed by a grouped command bar, then the workbench, then the count and zoom status bar. The workbench uses a left shape library (176px), a flexible canvas, and a contextual inspector (264px). The inspector appears when an object is selected or the connection tool is active, and is hidden while the arrow drawing tool is active. Clicking the canvas or closing the inspector clears that context.

At or below 1050px, the library narrows to 144px and the inspector to 244px; the command bar can scroll horizontally. At or below 700px, the eight shapes form a four-column grid, and the inspector becomes a pane below the canvas with a maximum height of 48% of the workbench. The document actions wrap beneath the name. The main library hints are hidden to preserve working space. Active drawing settings form a separate wrapping row below the commands and a two-column grid on narrow screens.

The embedded editor is at least 650px high, with a viewport-relative preferred height and an upper limit of 1100px. The narrow layout has a 660px minimum. Full-canvas mode occupies the viewport and restores the embedded layout when closed. The canvas snaps movement to a 20px grid and offers zoom, 100%, and fit controls.

**The Contextual Properties Rule.** In the quick editor, reserve the inspector for the selected object or active connection task so the unselected canvas receives the available width.

## Elevation & Depth

The workbench uses tonal regions and thin separators rather than raised cards. Editor buttons and fields explicitly remove inherited shadows. Menus and dialogs retain the existing floating-surface behavior while receiving the editor's current color scope; no new shadow scale is established by this refactor.

Connection handles fade in over 120ms on hover, selection, or keyboard focus, and remain visible during connection tasks. Controls retain the shared 150ms color transition; pressed feedback is immediate. The editor and menus remove transitions and animations when reduced motion is requested. Drawing movement and arrow previews follow the pointer.

## Shapes

The embedded shell uses the shell radius and menus/dialogs use the floating radius; narrow embedded mode uses the control radius, and full-canvas mode has square outer corners. Buttons use softly rounded controls, property fields and saved-document cards use the field radius, and menu items use compact corners. Thin borders define panels and control boundaries.

The shape library offers four basic shapes (rectangle, ellipse, diamond, note) and four circuit items (resistor, capacitor, ground, Net Name). Drawing rectangles use the diagram-node radius; ellipses are fully rounded, diamonds use a polygon, and notes have a folded-corner silhouette with a dashed border. These are document shapes rather than additional UI container styles.

New rectangles and resistors use Document Blue; ellipses and capacitors use Document Teal, diamonds use Document Violet, notes and Net Name tags use Document Amber, and ground uses Document Gray. The drawing color setting supplies new connection colors. Documents retain their selected colors, including source-graph colors. The interface palette does not recolor stored drawing content.

Resistor and capacitor symbols have two terminals; ground and Net Name tags have one. R/C/GND rotation offers 0°, 90°, 180°, and 270°. Quarter-turns swap width and height about the symbol center and remap attached terminals. Shared native SVG paths and terminal geometry define the library, canvas, and exports.

## Components

### DRAWIO Workspace

The host tools expose “新增圖稿”, “開啟 .drawio”, “本機圖稿”, “下載 .drawio”, and “快速繪圖”. The default full editor is the official `embed.diagrams.net` frame, with general, basic, arrow, flowchart, and electrical libraries enabled. Further libraries, groups, layers, and multiple pages remain native DRAWIO operations. Host loading, save, error, retry, and read-only messages sit outside that frame and follow the existing scoped colors.

DRAWIO documents retain raw XML with a 20 MiB limit, including compressed pages; they use a separate account-local browser store. Opening foreign XML never flattens it into the quick editor's eight-shape format. The host accepts editor messages from the current official frame, and correlates requested XML exports before saving or changing views. Network access is required to load the full editor. A connection failure retains the saved document and offers retry or a return to quick drawing.

New comparison results provide `power_drawio_a`, `power_drawio_b`, `i2c_drawio_a`, and `i2c_drawio_b` source artifacts when that source graph is available. Source navigation opens a separate editable DRAWIO document; older results without these artifacts use the retained quick source path. The quick editor can also export DRAWIO or open a DRAWIO copy, with editable approximate curve paths and portable circuit stencils. Original generated artifacts are included in comparison backups; edited DRAWIO documents require their own `.drawio` download, and quick documents retain their separate JSON backup.

The remaining component descriptions cover the host's shared controls and the retained quick editor. They do not redefine the official frame's internal component design.

### Buttons

Controls are compact and quiet at rest, with a minimum command target height of 44px. Primary buttons use Action Blue and white text; outlined buttons use Surface and Control Border; ghost buttons show Control Text against the current region. Hover adds subtle neutral or blue feedback. Active tools use Selection Fill and Action Text. Disabled command buttons use reduced opacity (0.38).

Focus is visible as the active mode's focus-color outline (2px). Pressed feedback has no transition delay. Icon commands retain accessible names and tooltips, and the same actions remain available in contextual properties where the narrow toolbar hides secondary commands.

### Fields

Fields use the current mode's Field, Text, Control Border, and field radius. The document title is visually transparent at rest, with a boundary on hover and focus. Property editing supports node names, Net Name tags, descriptions, dimensions, electrical-symbol rotation, and arrow text, path, arrowheads, crossings, line style, width, or reversal. Width and height fields are paired; descriptions can expand vertically. The stylesheet explicitly overrides inherited input colors, text fill, and shadows to preserve the selected appearance.

Stroke and optional fill controls pair a native color picker with a six-digit HEX field and the existing swatches. Only a complete `#RRGGBB` value commits; an incomplete draft is marked invalid and resets to the stored color on blur. Basic shapes and Net Name tags can reset custom fills with “使用自動填色”. A connection's editable text can carry a Net Name such as `VCC_3V3`.

### Navigation and Toolbars

The command bar uses Chrome and separators between command groups. File and export menus keep secondary actions out of the canvas. The source menu selects A or B revision before bringing in Power Tree or I²C content. Menus retain 44px item targets, the active mode's surface, and blue highlighted states. Dedicated “箭頭” and “雙箭頭” buttons enter drawing with the corresponding arrowheads. Active drawing settings expose path, arrowhead, crossing, and line-color controls.

### Shape Cards

Library tiles pair a geometric or circuit icon with a text name and its role colors. The R/C/GND icons are line symbols; Net Name uses its tag outline. On desktop they form a two-column grid and support clicking or dragging into the canvas. Hover introduces Selection Fill and the shape role's border color. On narrow screens the eight tiles become compact horizontal controls in a four-column grid.

### Saved Document Cards

The saved-document dialog uses a scrollable list of compact tinted cards, each with a document icon, name, timestamp, and node count. A check marks the current document; hover outlines the row in the scoped semantic primary color. The card is an action that opens the local document.

### Drawing Selection

Selecting a shape exposes connection points and resize controls. Selecting a connection increases its visual weight. The property panel provides the editable details and a visible close control. Undo, redo, duplication, deletion, and JSON import/export remain document operations rather than website navigation.

A compact canvas chip names the active selection or connection task. It uses the mode's blue text, selected fill, selected border, and compact corners; its text accompanies the selected-state visuals.

### Arrow Drawing

The arrow tool (`A`) turns the canvas into a drag-to-draw region with a crosshair, a live route preview, and an instruction hint. Either endpoint can remain free or snap to a shape body within 18 screen pixels; snapping selects the appropriate shape port. Holding Shift constrains the drawing gesture horizontally or vertically. `V` returns to selection; Escape cancels the current draft and exits drawing. Completed arrows remain in the document.

In selection mode, either arrow endpoint can be dragged to a free position or reattached to a shape's available terminals. Properties offer straight, elbow, or curved paths; end-only, both-end, or absent arrowheads; solid/dashed lines; integer widths from 1 through 8; and reversal of the endpoints. Drawing settings initially use a straight path, an end arrowhead, and width 2; the direct double-arrow button sets both ends. Existing connections without the optional fields keep elbow routing, an end arrowhead, and width 2.

New arrows and connections enable arc bridges at crossings by default, with a per-edge option to disable them. Bridges indicate crossing wires without a connection, and shared endpoints do not receive a bridge. The canvas and visual exports use the same routes and bridge geometry. A canvas-colored halo separates the bridge from the crossed wire; that halo is white on the exported page.

If crossing computation exceeds its density limits, the canvas preserves the original routes and displays “連線過於密集，已暫停跨線拱橋；請減少線段或拆成較小的圖表。” SVG/PNG/PDF export stops with the same notice so it does not silently drop bridge geometry. Editable JSON can still be exported.

The version-1 document adds optional node fill/rotation and edge crossing fields alongside the earlier arrow fields. Free endpoints are persisted as edge coordinates; invisible canvas helper nodes are presentation objects and never enter saved JSON. Appearance changes likewise stay outside document data.

## Do's and Don'ts

### Do:

- **Do** preserve the shape-library, canvas, and contextual-inspector arrangement.
- **Do** use blue for actions, focus, and active editor controls while neutral surfaces carry structure.
- **Do** theme portaled editor menus and dialogs alongside the embedded editor.
- **Do** keep both canvas appearances legible with mode-aware drawing-color helpers and preserve the white page for portable exports.
- **Do** retain visible saved-state feedback and separate `.drawio` / editable JSON backup instructions.
- **Do** distinguish network-dependent DRAWIO loading from account-local document persistence.

### Don't:

- **Don't** apply this scoped editor palette to the surrounding AutoCheck website.
- **Don't** make the inspector a permanent empty column when there is no selected object or active connection task.
- **Don't** rely on color alone for selected swatches, current saved documents, or disabled editing capability.
- **Don't** remove the narrow-screen property pane or accessible command names when simplifying the toolbar.
- **Don't** persist appearance preferences or invisible canvas endpoint helpers inside diagram documents.
- **Don't** flatten imported DRAWIO files into quick-editor shapes or imply that edited local documents are included in comparison backups.
