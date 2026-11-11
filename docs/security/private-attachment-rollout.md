# Private attachment compatibility preparation

This change is prepared in isolation. It does not change a production bucket, database row, object, permission, or deployment. There is no data or history deletion in this patch.

## Preserved data contract

- Keep all existing `issue_attachments.file_path`, `tools_management.file_path`, rich-text HTML and Storage objects unchanged.
- Existing public Storage URLs are durable references, not fetched as public URLs by the updated renderers. The resolver accepts only the configured project's recognized `issue-attachments` and `task-attachments` routes.
- Do not save short-lived signed URLs to records. Tiptap uses a display-only NodeView while save, undo and redo retain the original source URL.
- Uploads keep their existing paths and content. All existing collaboration permissions are enforced by Storage policies, not by client-side owner checks.
- Images and previews use five-minute signed URLs, refreshed after four minutes. Downloads use authenticated Storage download. Authorization failures have no public URL fallback.
- Sign-out clears displayed signed URLs. An already copied signed URL remains a bearer capability until expiry. An already downloaded or externally cached file cannot be recalled by this change.
- The integrated repair also routes the editor lightbox through the signing hook. Timers, source changes and NodeView updates remain suspended after sign-out until an Auth event supplies a real session. Display-only durable-reference metadata is never serialized into saved editor HTML.

## Safe future rollout gates

1. Integrate with the backend Storage policy patch and test active users with station-status view/edit, another allowed account, denied/disabled accounts and anonymous requests in an isolated Supabase environment. Required operations: SELECT/sign/download for viewers; upload/replace/remove only for editors.
2. Deploy compatible frontend before making either bucket private. Verify old attachments, inline issue images, histories, SOP content, new uploads, previews and original-file downloads with real authorized sessions. Do not modify existing records to perform these checks.
3. Account for already open old-version tabs and unsaved drafts. Those tabs still use public URLs. Do not switch buckets while users are actively depending on the old client. Agree a safe cutover and have users save and reload; a silent forced reload could lose drafts.
4. Only after the separate production-change authorization and verification gates, switch the two buckets to private and verify anonymous rejection and authorized operation. Do not automatically revert to public access on a frontend error.

Historical public URLs copied outside the application will no longer work anonymously. The original files remain intact and can be opened through the signed-in application. Keeping those external links anonymously usable would conflict with closing the exposure.

## Local evidence

- `tests/privateAttachmentAccess.test.mjs`: URL parsing and bucket/host boundaries, failed signing, authentication transitions and late responses, display-only HTML rendering, actual Tiptap save/undo/redo, durable upload references.
- Relevant existing issue and maintenance tests run against synthetic data.
- Build and typecheck use the isolated test Supabase configuration.
- A real browser smoke test and integrated Storage policy tests remain rollout gates; unit tests do not prove live Storage RLS compatibility.
- See [the integration report](integrated-repair-20261112.md) for combined checks and remaining release restrictions.
