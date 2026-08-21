# Header Control Semantic Colors Design

## Goal

Improve the visual readability of the four right-side header controls without changing their position, size, labels, actions, responsive behavior, or interaction semantics.

## Approved Direction

Keep the existing dark glass surface and use low-saturation semantic accents:

- Online users: emerald/teal to communicate live presence.
- Mobile QR: cyan/blue to communicate device access.
- Account: indigo/violet to separate identity controls from utility actions.
- Logout: rose/red to communicate a destructive action.

Each control keeps a visible border, readable foreground, subtle tinted surface, and a stronger matching hover state. Existing focus rings and touch-target dimensions remain unchanged.

## Scope

Modify only the visual utility classes for the four header controls in `OnlineUsersIndicator.tsx`, `WebsiteQrButton.tsx`, and `MainWorkspaceHeader.tsx`. Do not change grid positioning, component APIs, event handlers, labels, or dropdown contents.

## Validation

- Add source-level regression checks for the four semantic color families.
- Run the focused header and responsive tests, ESLint, and production build.
- Open the rendered local workspace, visually confirm all four controls are distinct and readable, and confirm the right-edge placement remains intact.
- Push the verified commit and wait for the GitHub Pages deployment to succeed.
