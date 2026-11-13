> 集中副本；原始路徑：`tests/pcb-designer/PROJECT-SETTINGS-RECOVERY.md`；程式參考基準：`2c5dd8829effc42acd60f64089701abb57e481c2`。歷史文件保留當時語意，先以 00_閱讀指南.md 與現行手冊判定適用範圍。

# PCB project-settings same-document recovery

This narrow change retains only the `project-settings` form's unparsed string values,
validation error, project ID/kind, and exact baseline revision in the shared actor/epoch
RAM registry. It does not add localStorage, sessionStorage, IndexedDB, remote writes,
autosave, or recovery for other PCB dialogs/CAD operations.

- Input/error handlers checkpoint synchronously, including the last keystroke immediately
  before a permission gate unmounts. Merely opening a dialog does not create a dirty entry.
- A newly authorized mount can restore the same actor/project form. Registry contents never
  grant access: the form is hidden and its handlers fail closed without current authorization.
- Explicit Cancel/close discards its own draft. A failed apply retains it. Only an acknowledged
  local reducer application with the exact request token clears the submitted generation; delayed results cannot clear a
  newer form or a different actor's entry. This acknowledgement is not a cloud save.
- Stale input/cancel/submit handlers are fenced by mount/dialog identity; memory writes and clears use the captured generation. Width/height use text controls with decimal input mode only in this dialog so incomplete strings are retained, not sanitized by native number inputs.
- Deleted projects or any baseline content drift leave the inputs intact and show a conflict.
  The new settings action validates the baseline again in the reducer and changes settings on
  the current project. Render-time conflict calculation is memoized by the current project reference and baseline, while submit/reducer still validate the complete revision. Rejected receipt metadata is ephemeral and preserves the exact data/history references. If queued hydration supersedes a settings action before observation, the same token resolves false and the raw checkpoint remains. It never copies the stale `dialog.project` over newer CAD content.
- Account switch/signout invalidates old scopes through the shared identity owner. Token
  refresh for the same actor retains them. A full browser reload/close still loses RAM; the
  shared gate-external dirty warning is advisory, not durable storage or cutover permission.

Synthetic Node tests cover raw/error recovery, immediate unmount, project/actor isolation,
Cancel, rejected/successful/late apply, stale queued CAD changes, deletion, and permission
loss. React rendering tests use the existing test-renderer harness, not a browser.

```sh
AUDIT_QA_DIR=/tmp/station-ledger-qa node --test tests/pcb-designer/*.test.ts tests/pcb-designer/project-settings-dialog.test.mjs
npm run typecheck
```

The existing browser fixtures initialize/change the synthetic registry actor at their mocked
identity boundary. Production editors never set their own actor. No local Chromium or
production operation was performed. Desktop/mobile interaction and the real protected-403
unmount/remount path still require the authorized isolated CI browser run; Node/build results
alone do not prove that cutover is safe.
