> 集中副本；原始路徑：`docs/superpowers/plans/2026-07-23-shared-prompt-hover-position.md`；程式參考基準：`06c686951b17afa920cf325ddfec9114590aeee0`。歷史文件保留當時語意，先以 00_閱讀指南.md 與現行手冊判定適用範圍。

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
