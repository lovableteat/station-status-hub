# PCB session and draft protection

## Scope

This preparation belongs to the isolated security PR. No production PCB payload or model file is needed to build or test it. The pending SQL proposals are not automatic migrations, and this frontend change does not itself revoke an RPC grant or protect historical snapshots in raw account permissions.

The application account ID and Supabase Auth user ID are different identity domains. PCB requests retain the application account ID; the server must independently bind it to the verified session through current_system_user_id(). A UUID-shaped application identity alone is not a valid cloud session.

## Required client behavior

- Keep the remote client present when the session is missing, expired or denied. Losing authorization must not silently become local/unlocked editing.
- Distinguish a successful empty cloud workspace from a failed load. A denied or malformed response cannot hydrate an empty workspace, mark a draft clean or declare cloud readiness.
- Preserve unsaved data and its recovery owner across rejected loads/saves, session changes, delayed responses and retries. A different account must not receive or upload the mounted previous account's draft.
- Permit legacy compatibility only when the required RPC is genuinely missing. HTTP 401/403, SQLSTATE 42501, invalid sessions, transport failures and malformed responses must never fall through to a legacy permissions snapshot or an unlocked save.
- Retry is a request to check the existing session and cloud access again, not a successful login. The PCB module must not force reload, sign the user out, rotate credentials, revoke sessions or discard recovery data.
- Preserve legitimate view/edit roles and own-client lock acquire, heartbeat, save and release. A rejected save stays unsaved. Queued and late requests must respect the current session/client/gate, without letting an old result clear a newer draft.

A locally preserved recovery copy is not a verified cloud save or a complete backup. Browser storage can be unavailable. Navigation warnings and recovery failures must remain visible rather than claiming the draft is durable everywhere.

## Legacy snapshot boundary

Aggregate assessment found five legacy pcbDesignerWorkspace values inside system_users.permissions. Their contents were not read. Those rows are not deleted, rewritten, moved or reset by this frontend or the narrow twelve-RPC proposal. Synthetic database tests must preserve five equivalent synthetic snapshots and all other account permissions exactly.

The existing authenticated permissions read path is a separate exposure. Denial-aware clients and identity-bound PCB RPCs do not close it. Removing SELECT on the whole permissions column before its non-PCB consumers are compatible can interrupt machine permissions and account management. The existing usePermissions, AdminPanel and UserPermissionsDialog consumers still need a separate compatible read-contract change. An already-open old page can clear access after a focus event or its periodic permissions refresh fails, which can unmount an unsaved editor. Deploying a new bundle does not retroactively update those pages. Do not revoke the raw column as part of this PCB-only frontend release. A separately reviewed sanitized profile/permissions read contract and protected legacy PCB retrieval are required before that access change. Do not use UI filtering as a database access-control substitute.

## Verification and cutover gates

Repository tests use synthetic accounts, boards, locks, models and recovery storage. Browser fixtures mount the actual PCB workspace, persistence/lock hooks and account adapter with loopback service boundaries; CAD/3D rendering and production Auth/PostgREST are not live acceptance targets. Local fixture bundling is not a browser pass. Actual Chromium results must come from the new PR head's isolated CI, including desktop and phone screenshots and rejection/recovery evidence.

Before any separately authorized deployment, preserve active users' drafts and verify the real session configuration, including legacy app identities without Supabase Auth sessions. Already-loaded old pages cannot receive new error handlers retroactively. Anonymous browser-class requests were observed historically; a lack of recent writes is not proof that no old client remains.

Follow the current proposal sequencing in [migration promotion](../security-proposals/migration-promotion.md). The twelve-RPC candidate requires its exact captured preflight; the older broad stage 02 cannot overwrite its guarded functions. Recheck metadata and authorization immediately before a future cutover, and do not apply the entire proposal directory or historical migration chain.

The full historical migration replay, hosted positive-path login/save, complete database/PITR and independent Storage-object restoration remain outside this isolated proof. Never automatically restore anonymous grants, old data, or an older permissions snapshot to recover from a client error.
