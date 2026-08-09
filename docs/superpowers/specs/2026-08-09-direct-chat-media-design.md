# Direct Chat Photo and Video Design

## Goal

Add Messenger-style photo and video messages to private direct chats without exposing media through public URLs or weakening the existing member-only message model.

## Interaction

- The composer adds one labelled photo/video button before the text field and keeps the existing send action.
- Users may select up to four files per message. Supported images are JPEG, PNG, WebP, and GIF up to 12 MiB each. Supported videos are MP4, WebM, and QuickTime/MOV up to 50 MiB each.
- Selected files appear in a compact preview strip above the composer. Every item shows its media preview or type, name, size, and a remove action.
- A message may contain text, media, or both. Empty text without media remains invalid.
- While uploading, the composer is locked and shows `上傳並傳送中`; on failure, text and selected files remain available for retry.
- Sent images render as bounded thumbnails that open the signed media URL in a new tab. Videos render with native controls, metadata preload, and no autoplay.
- Media-only thread previews read `傳送了照片`, `傳送了影片`, or `傳送了 4 個附件`.

## Data and storage

Create `chat_message_attachments` with immutable message, thread, uploader, object path, file name, MIME type, byte size, and media kind fields. The message foreign key cascades attachment metadata when a message is physically removed.

Create a private Supabase Storage bucket named `chat-media`. Object paths use:

```text
{thread_id}/{uploader_system_user_id}/{client_message_id}/{index}.{safe_extension}
```

The bucket enforces a 50 MiB object limit and the exact allowed MIME list. Storage SELECT policy calls a security-definer helper that verifies the object is linked to an undeleted message visible to the current member after their personal clear cutoff. INSERT requires the first path segment to be a joined thread and the second segment to equal the current system user. DELETE is limited to the uploader or a joined administrator.

## Atomic send flow

Revoke direct authenticated inserts on `chat_messages` and add `send_direct_chat_message(p_thread_id, p_client_id, p_body, p_attachments)`. The RPC:

1. requires an active authenticated member;
2. validates body length and attachment count;
3. validates every attachment path, MIME type, media kind, byte limit, and matching object in `storage.objects`;
4. inserts or reuses the idempotent message identified by `(sender_id, client_id)`;
5. inserts attachment metadata in the same transaction; and
6. returns the message ID.

The browser uploads selected objects first, invokes the RPC only after all uploads succeed, and removes uploaded objects if the RPC fails. Text-only messages use the same RPC, preserving one authorization path and existing retry idempotence.

## Client data flow

Message reads include attachment metadata. The hook batches paths into `createSignedUrls` calls and stores only temporary signed URLs in render state. Optimistic text messages remain unchanged; media messages remain in the composer during upload so browser `File` objects and retry state do not leak into durable chat state.

The existing opaque realtime invalidation continues to send only record identifiers. Receivers re-fetch the message and attachment metadata through RLS before requesting signed media URLs.

## Deletion and cleanup

The message deletion RPC continues to enforce sender-or-admin authorization and returns attachment storage paths along with success. The client removes those paths from the private bucket after the message is tombstoned. Conversation clearing does not remove objects because the other participant must retain their copy; the clearing member immediately loses signed-URL access through the storage read helper.

## Error handling

- Reject unsupported, oversized, or excess files before upload with one Traditional Chinese explanation.
- If one upload fails, remove objects uploaded by the same attempt and keep the composer selection.
- If message creation fails, remove all objects uploaded by that attempt and keep the composer selection.
- If signed-URL creation fails, render an unavailable-media tile without exposing the storage path.
- Object cleanup failure never rolls back a successful message tombstone; it is reported through the existing message error surface and remains inaccessible through RLS.

## Verification

- Pure behavior tests cover MIME classification, limits, safe path creation, and media-only preview labels.
- Migration contract tests cover the private bucket, attachment RLS, storage policies, member-scoped helpers, atomic send RPC, direct-insert revocation, and delete cleanup return value.
- UI and hook contract tests cover the labelled picker, hidden multiple input, previews, removal, upload locking, signed URLs, image/video rendering, and media-aware send path.
- Run focused collaboration tests, targeted ESLint, production build, apply the migration, push `main`, wait for Pages, and verify the signed-in production composer without uploading a meaningful user file.
