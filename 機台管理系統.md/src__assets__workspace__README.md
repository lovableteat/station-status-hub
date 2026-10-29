> 集中副本；原始路徑：`src/assets/workspace/README.md`；程式參考基準：`22f669036d89108fe73cf4b74d4117f3e332739f`。歷史文件保留當時語意，先以 00_閱讀指南.md 與現行手冊判定適用範圍。

# Workspace illustrations

Eight original illustrations generated with the built-in `imagegen` tool for the work platform. The final WebP assets preserve transparency; each is 768 × 512. The original generation files remain in the Codex generated-images directory.

| Asset | Homepage workspace |
| --- | --- |
| `repair.webp` | 維修中心 |
| `files.webp` | 檔案上傳 |
| `parts-v2.webp` | 料號申請 |
| `racks.webp` | Data-center |
| `pcb-v2.webp` | PCB Designer |
| `analysis.webp` | AI 問答 |
| `performance.webp` | 績效考核系統 |
| `comparison.webp` | AutoCheck |

## Final prompt set

Shared prompt used for each image:

> Use case: stylized-concept. Asset type: a small decorative preview illustration in a premium dark engineering web application. Create a sophisticated miniature industrial product render, expertly art directed, restrained and elegant. Orthographic three-quarter view looking slightly down. Physically plausible machined graphite aluminum, fine bevels, matte ceramic, pale silver edges, restrained soft jade-green accents. All objects arranged as one coherent compact composition, not a spread of unrelated icons. Soft studio lighting from upper left, delicate ambient occlusion, believable contact shadows, impeccable craftsmanship, clear silhouette at small thumbnail sizes. Composition: landscape image, objects occupy the middle 65% width and middle 75% height, generously padded outer edges, entire object fully visible. Transparent background, no floor, no horizon, no rectangular plinth. Color palette: charcoal, graphite, silver, soft desaturated jade. No neon, no glossy plastic, no cartoon, no typography, no letters, no numbers, no logos, no UI mockup, no infographic arrows, no border, no watermark.

The subject prompt appended for each asset:

- **repair.webp:** Subject: an engineering repair and test station. One compact open 2U server chassis with a precise exposed electronics board and two cooling fans, a small angled diagnostic monitor with simple jade oscilloscope waveform (no text), and a slim machined precision screwdriver alongside. The server is the main subject. Premium technical product visualization.
- **files.webp:** Subject: a refined physical metaphor for an engineering file library. One open sculptural graphite folder with three layered pale silver document sheets fanning out elegantly: one with a subtle spreadsheet grid, one with a fine mechanical line drawing, one with a small restrained landscape thumbnail. Tiny jade tab accents. The layered papers and folder feel tangible, precision crafted and architectural; no floating UI badges.
- **parts.webp:** Subject: an engineering components collection for managing BOM parts and alternate components. One small graphite circuit board with jade traces, a square dark microprocessor with silver pin edges, two machined connector blocks and a pair of small cylindrical capacitors arranged deliberately together. Tangible precision electronics, beautiful individual component detail and clean sculptural composition. No boxes, no packaging, no labels.
- **racks.webp:** Subject: a premium miniature data center installation. Three tall narrow dark graphite server racks in a single ordered row viewed at three-quarter angle, stepped depth revealing side panels and tiny vent perforations, refined silver rack rails, a few restrained jade status lights. A delicate flat translucent jade cold-aisle strip near their feet. Clear realistic server architecture, no surrounding room, no cables spreading outside composition.

These images are feature illustrations, not representations of current equipment, inventory, file counts, or connection status.

## Matching additions

The four additions use `repair.webp` as a style reference only, preserving the same orthographic graphite/silver materials, jade accents, upper-left lighting, transparent landscape composition and no typography. The built-in tool generated each separately; originals remain untouched. Final assets are downscaled to 768 × 512 and encoded as WebP with alpha (quality 88).

- **pcb.webp:** A precision circuit board with fine silver traces, processor and connectors, a separated translucent circuit layer and a silver design stylus.
- **analysis.webp:** A machined graphite document tray with silver engineering/spreadsheet/image sheets and an inspection magnifying glass.
- **performance.webp:** A graphite clipboard with embossed checklist and jade check marks, alongside three physical ascending machined columns; no scores or numbers.
- **comparison.webp:** Two tangible circuit boards, one changed connector and a restrained amber component under an inspection lens; no A/B labels or arrows.

## Content corrections (2026-10-13)

The built-in `imagegen` tool regenerated the two requested subjects using `repair.webp` as a style reference only. Originals are preserved. Saved assets: `src/assets/workspace/parts-v2.webp` and `src/assets/workspace/pcb-v2.webp`, 768 × 512 WebP with alpha, quality 88.

Final prompts retain the graphite/silver industrial materials, jade accents, three-quarter downward orthographic camera, soft upper-left lighting, coherent composition, transparent margins, no typography/logos/neon/UI mockup.

- **parts-v2.webp:** Electronic BOM part request and alternate-part approval: a dark graphite clipboard holding a specification sheet with an ordered six-row bill-of-materials table, neutral bars and item markers, one green approved check; two matching IC packages in a divided machined tray, main and alternate linked by an embossed jade swap symbol. The BOM document is the main object; no populated circuit board or component pile.
- **pcb-v2.webp:** PCB design, not assembled PCBA: bare notched dark-jade board, real drilled mounting holes, copper traces, plated vias and unpopulated IC/connector footprint pads. A thin translucent drafting layer above it shows the same outline/trace plan and corner edit handles; a precision stylus rests beside it. No mounted chips, heatsink, server motherboard or monitor.
