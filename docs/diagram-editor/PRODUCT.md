# AutoCheck Diagram Editor

<!-- impeccable:product-schema 1 -->

This product record applies only to the AutoCheck diagram editor. It does not define the surrounding website.

## Platform

web

## Users

Existing AutoCheck comparison users who need to draw or edit diagrams while working with comparison results.

## Product Purpose

Provide an editable drawing workspace for Block Diagrams, flowcharts, Power Tree diagrams, and I²C maps. Users can begin with a blank document or bring a Power Tree or I²C graph from a comparison result into a separate editable document.

## Operating Context

The editor is part of the existing AutoCheck comparison workspace. Its operation follows the familiar draw.io arrangement of a shape library, drawing canvas, tools, and contextual properties. The surrounding website remains in its existing design.

## Capabilities and Constraints

- Draw freeform Block Diagrams and flowcharts with shapes and connections.
- Draw arrows directly by dragging on the canvas, with free or shape-attached endpoints. Edit routing, arrowheads, line style, width, and direction, and reconnect either endpoint.
- Bring Power Tree or I²C source graphs into an editable diagram without changing the original comparison result.
- Use dark mode by default, with a header control for switching to light mode. The appearance preference belongs to the current browser rather than an account or diagram document.
- Save diagram documents automatically in the current browser, scoped to the signed-in account.
- Export a separate editable JSON document for backup, sharing, or use on another computer, and open that JSON document again.
- Export SVG, PNG, and PDF presentations on a white page, independently of editor appearance.
- Diagram documents have no cloud copy and are not included in the comparison workspace's `.autocheck.zip` backup.
- Editable JSON retains document version 1; the additional arrow fields are optional so earlier version-1 documents remain readable.

Audience details beyond existing AutoCheck comparison users, formal success measures, collaboration requirements, and additional accessibility requirements have not been confirmed.

## Brand Commitments

The user explicitly requested Apple design colors and then dark mode for the editor. The implemented default is Apple-inspired graphite with a light-mode option. This is a scoped editor change; the existing site's exterior design is preserved. The actual editor palette and reusable visual rules are recorded in the adjacent `DESIGN.md`.

## Evidence on Hand

- `src/components/comparison/ComparisonDiagramEditor.tsx`: document tools, shape library, canvas, properties, and import/export actions.
- `src/components/comparison/diagramStorage.ts`: browser-local documents indexed by account.
- `src/components/comparison/diagramExport.ts`: JSON, SVG, PNG, and PDF exports.
- `src/components/comparison/diagramTheme.ts`, `diagramInteractions.ts`, and `diagramGeometry.ts`: browser-local appearance, arrow targeting, and shared arrow routing.
- `src/components/comparison/ComparisonWorkspace.tsx` and `ComparisonCharts.tsx`: blank-editor and source-diagram entry points.
- `src/components/comparison/ComparisonGuide.tsx`: user-facing instructions and backup limitations.

## Product Principles

- Keep freeform drawing and editing of comparison graphs available in the same workspace.
- Preserve the original comparison data when editing a diagram.
- Make local storage and the separate editable backup clear to users.
- Preserve the surrounding site's established design while improving the editor.
