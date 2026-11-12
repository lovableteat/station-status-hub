# Same-document maintenance composer recovery (isolated candidate)

Base: 5f47f303fa40cc7e7b60db04dfd1648983dba3ef. This is not a deployment or hosted-service proof.

## Scope and identity

Only the existing issue note composer and its pending attachments are checkpointed. Other maintenance dialogs and report creation are unchanged. The shared registry uses a WeakMap keyed by the current window, an opaque document token, actor/epoch, client, surface and project/issue identity. Values remain in RAM; original File references are retained without serialization. No storage, browser persistence, network or server data is added by checkpointing. It is not an authorization source.

UserContext owns actor transitions. Its existing storeUser path invalidates drafts on explicit logout, terminal clearIdentity, or a changed actor; initial provider construction establishes the actor. Same-actor refresh does not invalidate. recoverLater/sessionRecoveryNeeded and resetPermissions do not clear drafts. Existing INITIAL_SESSION(null) ignore behavior is retained. A confirmed getSession null still follows the existing clearIdentity path. Full logout and re-login cannot recover the old epoch, even with the same account ID.

The existing openIssue URL selection is retained. A recovered note is only mounted if that issue is present in current authorized data. Actor/project/issue are in the Detail React key and registry scope. Changing any of them cannot populate another editor. Permission denial still unmounts the editor; no cached permission is used.

## File and send lifecycle

The mounted preview hook owns object URLs. It revokes them on source replacement/removal/unmount, and creates new URLs from the original Files after remount. No URL is kept in the registry. Successful attachment receipts remove only the completed file from the checkpoint.

Send uses an operation ID, draft ID and actor epoch. It records the successful note receipt before starting attachments and retains the exact message ID, savedNote and remaining File objects after partial completion. Before each next write it checks the current mounted view, permission, scope and operation. A permission loss/unmount/issue switch stops later writes, but cannot cancel an already issued request. An old successful response may update only its original transaction; it cannot clear a replacement draft or recreate a cleared actor epoch. Full success compare-and-clears that draft and the next draft gets a new message ID.

Explicit authorization errors leave the remaining transaction manually retryable. Known SQL validation errors (22023) are editable only when no earlier attempt has an unknown outcome. PT409 is a receipt conflict, not ordinary validation. Unknown attempts retain a sticky immutable-payload flag across absent/partial reads, later rejected retries and pauses: same message/file IDs, original text and original File objects cannot be changed until full confirmed completion. Later rejection does not prove an earlier request never committed. Explicit retries remain possible, but are never automatic. Other failures are conservatively marked uncertain, retain their contents, and disable resubmission until the operator presses “核對送出結果”. This calls only the existing read-only maintenance_thread RPC and validates exact note actor/issue/message/body and attachment message/path/name/size/type receipts. Confirmed completed items are removed; partial or absent receipts enable only a later explicit same-ID retry under the existing SQL idempotence contract. Absence does not prove the previous request never ran. A conflicting, malformed or denied read retains uncertainty. No automatic reconciliation or resubmission is implemented. This is deliberately safer than blindly replaying an ambiguous note or attachment write. After an attachment failure, remaining writes stop rather than continuing under potentially invalid authorization.

Navigation confirmation now accurately says the unsent note remains only in this document's memory rather than claiming it is discarded. It may be revisited under the same actor/issue. This does not preserve it across refresh, tab close, browser crash, or signout. Files still use the existing 50 MB per-file admission limit. There is no silent eviction; multiple large retained drafts can consume memory. No background draft telemetry is added. The registry also owns a document-level beforeunload warning that survives permission-gate unmounts; the warning stops when the last draft is cleared or actor changes. Empty idle maintenance entries are not retained. Browser/platform restrictions may still prevent an unload prompt; this is not crash persistence.

## Required acceptance before integration/deployment

- Unit/React tests cover native bytes/object identity, namespace/epoch isolation, late success, partial receipts, unknown outcome, file URL lifecycle, actual PermissionGuard + MaintenanceDetail remount, and existing Auth recovery.
- Exact old-to-new real browser cases must be rerun on the integrated candidate. A fixture that mocks UserContext must initialize the synthetic registry identity at that boundary, not make editors assign their own identity.
- No local Chromium, production API, upload, migration or deployment was executed by this implementation worker.
- Read-only reconciliation is explicit and actor/scope/operation fenced. It never writes a note, uploads a file or runs a migration. If the read is denied or receipts conflict, the draft remains blocked and retained rather than being silently lost or replayed.
- This patch does not fix already-running old clients, non-composer dialogs, or persistence through full document destruction.
