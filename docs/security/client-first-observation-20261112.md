# Client-first transition: evidence gates, not an enforcement migration

## Scope

Deploying a compatible client and revoking raw access are separate operations. This plan does not change production permissions, existing data, attachment access, historical migrations or Realtime policies. It is not a claim that existing data has a complete restorable backup.

The current compatible client reads sanitized profiles through the additive zero-argument API and uses protected PCB recovery only for an exactly missing modern entry point. Missing protected APIs, 401/42501 and network failures must never become raw-table fallbacks or successful empty data. Leaving old grants in place keeps old pages working during observation, but direct callers still have the old exposure; client-first is risk reduction, not complete containment.

## Ordered gates

1. **Freeze and identify:** verify main, PR head, exact merge tree, successful Quality/regression jobs, public build configuration and candidate artifact hashes. Preserve later user changes. Old96-to-fixed344 research cannot certify an old80 page or a later candidate.
2. **Read-only API prerequisite:** verify the already-added APIs, schema cache, role boundaries and response shapes without reading private PCB payloads or changing accounts. Record existing ledger versions; never replay a migration directory or undo earlier anonymous restrictions.
3. **Exact cross-release rehearsal:** use the pinned actual old Pages artifact only inside an isolated runner, with synthetic Auth/API/Realtime, no external forwarding and hash checks. Exercise already-open maintenance notes/files and PCB dialogs, never-loaded navigation, retry/cancel and same-actor refresh. New-client cold boots must use protected APIs while the old raw-read fixture remains available.
4. **Client-only rollout gate:** a rollout, if later authorized on the exact tested tree, changes frontend code only. No automatic refresh, forced logout, bulk save, permissions revocation, SQL, bucket change or republishing old vulnerable assets. Do not deploy an old-artifact archive as a compatibility solution. A rollback must also be a reviewed safe frontend, not the old unsafe dist or a grant-restoration SQL script.
5. **Observe, do not infer:** currently the deployed presence protocol has no build field. Existing presence payloads contain account/module/editing information and are not a privacy-free version census. A proposed version-only projection must discard all such fields, distinguish current/other/unknown and label observations as client self-report. Missing/invalid metadata, unsynchronized/hidden/stale observers, absent users and sleeping/offline tabs are not evidence of upgrade. The result must never automatically approve raw revocation.
6. **Draft and session transition:** a connected version marker does not prove an editor is saved. Preserve draft contents locally in the correct owner scope; never transmit them as version telemetry. Treat permission-induced unmount separately from a healthy refresh. Old96 experiments already demonstrate lost unsent maintenance text after raw denial; every later client needs its own tested behavior. A past save acknowledgment is not evidence that no new unsaved work exists now.
7. **Backend enforcement remains gated:** raw permissions, PCB12 RPC changes, stage01/02/03, private attachments and hosted Realtime require their own exact privacy/authorization/session/data-preservation evidence. Client-only observations cannot remove those gates. Never interpret a successful negative-characterization test as a safe enforcement result.

## Evidence limitations

The isolated network mocks prove application behavior against the modeled responses, not hosted authorization or real-service Realtime payload filtering. Desktop/mobile emulation is not proof for every device, file type, board, sleeping tab or browser cache. Known seed-name/hash scans are not exhaustive secret or business-data scans. Progress reports must separate tests completed, observed unsafe outcomes, unknown active clients and actions not performed.
