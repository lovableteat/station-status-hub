# Shared Prompt Hover Position

## Goal

Keep the shared prompt preview at the upper-right of the prompt row without covering the prompt library or composer.

## Scope

- Update only the shared prompt hover preview in `ApiChatConsole.tsx`.
- Keep prompt application, search, scrolling, and persistence behavior unchanged.
- Use right-side, top-aligned placement with viewport collision padding.
- Keep the preview above nearby panels with a stable stacking level.

## Verification

- Run the focused prompt layout test.
- Run targeted ESLint for `ApiChatConsole.tsx`.
- Run the production build.
