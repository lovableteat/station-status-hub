> 集中副本；原始路徑：`docs/security/deployment-draft-protection.md`；程式參考基準：`2c5dd8829effc42acd60f64089701abb57e481c2`。歷史文件保留當時語意，先以 00_閱讀指南.md 與現行手冊判定適用範圍。

# Deployment changes and unsaved work

This is an isolated compatibility change. It does not deploy a release, preserve a live user's browser state remotely, or make previously opened production tabs safe automatically.

## Why deployment is still gated

The current public baseline `a30615e` uses automatic `location.replace` recovery in both its inline `vite:preloadError` handler and application error boundary. Pages replaces its asset tree on release. An older open tab can therefore lose a lazy chunk and reload, losing work held only in memory. A new HTML response cannot replace JavaScript already running in that tab.

Keeping the whole old build would preserve the published BOM seed. Providing an empty seed is also unsafe: the old BOM importer can automatically save a fallback. Neither is an acceptable compatibility mechanism. The [asset retention planner](./docs__security__safe-asset-retention.md) is opt-in preparation only, not an enabled deployment step. Exact old artifact inspection, approved dependency inventories and per-file review are still required. The attempt to obtain the exact old Pages artifact timed out; a local rebuild is not a substitute for its actual bytes and URLs.

## Behavior in the new client

- The boot fallback can recover only before the application is ready. It never replaces an active application's root or reloads an active document after a module failure.
- Recoverable lazy imports contain an import failure at the requested module. They do not send a nested import rejection to an error boundary around an already mounted editor. Retrying does not clear login, local storage or the existing parent state. A browser may negatively cache a failed module URL, so a retry is not a promise of recovery.
- Workspace navigation loads the destination module before committing the new selection. A failed load leaves the current editor mounted; cancellation and newer navigation invalidate older requests.
- Prepared history navigation defers acceptance by Router and editor listeners until the target module loads. Its cursor restoration is part of the data-preservation contract, not an excuse to erase history entries. The central popstate listener is installed by the first entrypoint import, before Router/editor listeners; capture alone does not guarantee priority for a window-target event. Watcher remounts retain that listener order, and both registration-order and real-browser regressions cover this requirement.
- Updating the whole page is an explicit action with a warning about memory-only drafts and the existing cancelable navigation guard. Canceling does not reload or clear storage. This does not assert that every editor has an export feature or that all unsaved state can be recovered after an unrelated render crash.
- TestTracker error handling no longer deletes local entries just because their bytes are not valid JSON. Raw text, incomplete JSON and valid values are retained.

No changes here automatically save a draft to the cloud, change a business record, rotate credentials, or modify backend permissions.

## Verification and limits

The focused VM and React tests execute the boot policy, actual recovery components, navigation hook, history helper and actual Index entry points against synthetic data. The browser fixture `tests/auditDeploymentRecovery.browser.cjs` uses a loopback-only server that changes from synthetic release v1 to v2 while its original document stays open. It exercises a real missing module, repeated failure, a retained safe module, memory-only drafts, canceled updates, dirty-work vetoes, racing navigation, and the real HashRouter. It asserts that the synthetic seed and unsafe old importer are not served. Screenshots and results are retained by isolated CI.

These tests do not replace checks on the exact deployed old artifact, live open tabs, real Auth/Storage/CDN behavior, or physical devices. The older baseline still needs a user-safe checkpoint: preserve active work and coordinate a verified safe reload before relying on the new handler. Do not force-refresh existing tabs or delete localStorage/IndexedDB to satisfy a rollout test. Do not claim zero interruption from a passing synthetic cross-release test.

The exact-commit CI result is recorded in the draft PR. No production rollout is enabled by this document or by the planner's unit tests.

Prepared navigation checks the current dirty-work guard at the actual commit, after the import has resolved, so edits made during a slow load are not silently discarded. Browser history has no cancellation API; obsolete queued traversals are ignored and restored to the latest accepted cursor. A rapid repeated Back/Forward gesture may need to be repeated rather than accepting a stale destination.

An entry created outside the workspace history helper may have no trustworthy cursor index. The new client never guesses a Back/Forward distance for such entries. A hash-only route change with the same path and query is delegated to HashRouter. Other unknown or discontinuous entries restore the mounted editor’s accepted URL and offer an explicit retry; that retry preloads and rechecks dirty state before pushing the destination. This conservative fallback can replace the current unmanaged navigation entry and cannot reconstruct arbitrary third-party browser history. It does not delete operating records or stored drafts. Normal contiguous managed entries retain their Back/Forward destinations.
