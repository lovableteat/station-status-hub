# Mobile-first workspaces design

## Objective

Rebuild the authenticated application shell and the six mobile workflows shown in the supplied screenshots so the product is genuinely usable on iOS and Android phones instead of rendering a compressed desktop layout.

The work covers PCB Designer, Data Center Digital Twin, user administration, the maintenance dashboard, material/BOM lookup, AI query, the global header, the workspace dock, and the chat launcher.

## Product decision

Use one shared React application with responsive component variants. Do not create a second mobile application and do not remove desktop capability. Mobile receives a deliberately different information hierarchy while actions and state continue to use the same handlers and data.

## Supported viewport contract

- Handsets: 320–767 CSS pixels wide.
- Compact tablets and narrow desktop windows: 768–1023 CSS pixels wide.
- Desktop: 1024 CSS pixels and wider.
- Validate portrait widths at 320, 360, 390, 412, and 430 pixels.
- Validate one phone landscape viewport at 844 × 390 pixels.
- Support `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)` on iOS.
- Support Android browser viewport resizing when the virtual keyboard appears.
- No page-level horizontal overflow at any supported width.
- Interactive controls are at least 44 × 44 CSS pixels on coarse pointers.
- Text-entry controls use at least 16px text on handsets to prevent iOS auto zoom.

## Shared mobile shell

### Header

The mobile header is a single compact row. It contains the platform logo/name and the account avatar. QR sharing, online status, desktop navigation, subtitles, and secondary account details are hidden from the always-visible row and remain available from existing menus where applicable.

Target height is 52px plus the top safe area. It must never become a two-row toolbar.

### Workspace navigation

The mobile dock is edge-to-edge at the bottom, 56px high plus the bottom safe area, and visually attached to the viewport instead of floating over content. Four primary destinations remain directly available: Home, Maintenance, Material, and Query. A fifth “More” destination opens a bottom sheet for Data Center, PCB Designer, and Administration, filtered by the user’s available workspaces.

Every workspace reserves the dock height. Full-screen canvases are resized above it instead of being covered by it.

### Chat

The closed chat launcher becomes a 44px rectangular button positioned above the dock and safe area. It shows the message icon and unread count without covering core controls. Opening chat still uses the full phone viewport; desktop keeps the detached card.

### Layout tokens

Define shared CSS variables for header height, dock height, safe-area-aware bottom clearance, page gutters, and compact radius. Full-height workspaces use `100dvh` with a `100svh` fallback and internal scroll regions rather than locking the body behind an oversized child.

## Workspace designs

### PCB Designer

- Replace the wrapping project/action header with one compact project row.
- Keep project selection, save state, left panel, right panel, and overflow actions reachable.
- Keep the editing toolbar as one horizontally scrollable 44px row with the primary file actions sticky at the start.
- Remove the mobile “use desktop” advisory from the permanent layout.
- Give the canvas all remaining height and keep the status bar to one compact horizontal line.
- Side panels remain drawers and must fit between the app header and mobile dock.

### Data Center Digital Twin

- Reduce the local title bar to one 48px row on handsets.
- Give the 3D/2D scene all remaining space.
- Use small overlay controls for scene/menu/details instead of a second large floating dock.
- Existing scene and rack controls open as full-height mobile sheets with their own scroll regions.
- Global navigation and chat never cover the scene’s bottom interaction area.

### User administration

- Reduce the hero, metric strip, and filters before the user list.
- Show each user as a compact summary card with avatar, name, role/status, username, and last-login time immediately visible.
- Keep account status, permission, and edit actions in a single compact action row.
- Hide verbose creation/permission metadata on handsets until expanded or opened through the existing permission editor.
- Desktop keeps the richer three-column metadata and permission badge layout.

### Maintenance workspace

- Keep the project selector and only essential project actions in one row.
- Keep module navigation as a single horizontal, scrollable row.
- Change KPI cards from a tall 2 × 2 block to a one-row horizontal snap strip on handsets.
- Compact page headings and action labels; content should begin near the top of the viewport.
- All maintenance pages inherit the shared bottom clearance and 8px handset gutter.

### Material/BOM lookup

- Keep title/current BOM, search, quick filters, and create action above the fold.
- Keep sort, import/export, page progress, help, BOM switching, and destructive actions inside a collapsed tools disclosure.
- Quick filters are one horizontally scrollable row rather than three equal-width large cards.
- Mobile material cards show the primary part, MPN, request state, REF count, and one primary action; alternatives and secondary actions are disclosed on demand.
- Desktop table behavior and per-page BOM loading remain unchanged.

### AI query

- Keep model selection/history/new conversation in one compact control row.
- Reduce the empty-state artwork and remove artificial empty vertical space.
- Keep the composer to one compact row until text grows; attachment, prompt library, text area, and send remain reachable.
- The composer stays above the shared dock and keyboard safe area.
- Conversation/history panels open as mobile sheets and retain independent scrolling.

## Accessibility and interaction

- Preserve visible focus rings and `aria-current` on navigation.
- Do not depend on hover for required actions.
- Respect `prefers-reduced-motion`.
- Bottom sheets and full-screen overlays must be dismissible and must not leave body scrolling disabled after close.
- Truncated labels retain accessible names or titles.

## Verification

Automated source-contract tests cover the shell tokens, safe-area handling, handset input sizing, compact workspace variants, and the absence of the obsolete PCB advisory. Build and focused tests must pass before browser QA.

Browser QA uses the local production build in demo mode at every required width. Each of the six supplied workflows is checked for horizontal overflow, content covered by fixed UI, reachable primary actions, and usable scrolling. After push, GitHub Pages is opened with a fresh cache-busting query and the deployed commit is verified.

