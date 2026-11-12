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


## Verified research baseline and next-client acceptance

The frozen exact80 study at PR head `5f47f303fa40cc7e7b60db04dfd1648983dba3ef`
ran against original source `80f2c4c071c3c88a85d247b7c3d48b303ccdd57c`
and candidate `f6fadefcf503d9326af88757a2d2d42a8dd45ad1`. Audit run
`43205261335` and Quality run `43205260364` completed successfully. This is
successful execution of observations, **not** sixteen safe-cutover approvals:

- Ten positive desktop/phone observations covered mounted old maintenance/PCB inputs,
  limited warm Dashboard imports, and new-client healthy protected-profile reads.
- Two old-client raw-denial observations lost the unsent maintenance input.
- Four new-client protected-denial observations lost the maintenance note/File selection
  or unapplied PCB project-settings values after the fail-closed gate unmounted them.
- Each observation retained the document and blocked unapproved HTTP/Realtime traffic.
  Synthetic interception does not establish hosted-service authorization behavior.

The frozen study must retain these negative results. It must not be silently edited to
certify later application code. The next client requires a separate current-source full
bundle browser run and then a newly identified exact candidate for cross-release review.

The narrow repair under review checkpoints maintenance note/File transactions and the
seven raw PCB project-settings fields in actor/epoch-scoped, same-document RAM. It must
remain fail-closed, never read raw permissions as a fallback, never autosend, and never
persist this recovery state to browser/server storage. A global dirty warning must survive
permission-induced editor unmounts. Original File objects and exact attempted message/file
IDs must survive ambiguous responses; a read-only reconciliation is not proof that an
absent request never executed. Only a verified receipt may clear the relevant generation.
PCB settings require a true accepted local reducer receipt, not a cloud-save claim or an
inference from equal content. Other dialogs, full reload, logout and crashes are outside
this narrow recovery scope.

Even after those acceptance tests pass, a client-only deployment can leave an old page
unable to open a previously unloaded feature until its operator saves and refreshes.
The earlier three-file warm Dashboard experiment is not a general asset-retention plan.
Never publish an old entry point, vulnerable HTML preview, old Auth/Admin bundle or BOM
seed to hide this limitation. Keep the existing raw grants and bucket behavior unchanged
until the separate backend/session/Realtime transition gates are met.

The version-observation proposal remains independent of this draft-repair change. Its
bounded source-tree marker, if later adopted and tested, is private-channel self-report,
not a server attestation or a saved-draft signal. Unknown, stale, editing, offline and
unobserved clients must never count as upgraded; no aggregate can authorize revocation.
