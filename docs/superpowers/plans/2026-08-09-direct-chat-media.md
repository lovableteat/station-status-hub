# Direct Chat Photo and Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure multi-photo and video messages to member-only direct chats.

**Architecture:** Media objects live in a private `chat-media` bucket and immutable attachment metadata lives beside chat messages. One membership-checked RPC creates text and media messages atomically after upload; React validates and previews files locally, then resolves temporary signed URLs for rendered messages.

**Tech Stack:** PostgreSQL/Supabase RLS, Supabase Storage, React 18, TypeScript, Node test runner, Tailwind/shadcn, Lucide icons.

## Global Constraints

- Maximum four attachments per message.
- Image MIME types: `image/jpeg`, `image/png`, `image/webp`, `image/gif`; maximum 12 MiB each.
- Video MIME types: `video/mp4`, `video/webm`, `video/quicktime`; maximum 50 MiB each.
- The `chat-media` bucket stays private; never persist or render a public URL.
- A message requires non-empty text, at least one valid attachment, or both.
- Only visible direct-chat members can read media; clearing a conversation removes the clearing member's access without deleting the other member's copy.
- All new user-facing copy is Traditional Chinese.

---

### Task 1: Define and enforce chat media storage

**Files:**
- Create: `supabase/migrations/20260809170000_direct_chat_media.sql`
- Modify: `tests/realtimeCollaborationV2.test.mjs`

**Interfaces:**
- Produces: `public.chat_message_attachments`
- Produces: private bucket `chat-media`
- Produces: `public.send_direct_chat_message(uuid, uuid, text, jsonb) RETURNS uuid`
- Produces: `public.can_read_chat_media_object(text) RETURNS boolean`
- Changes: `public.delete_direct_chat_message(uuid)` returns attachment paths as JSON

- [ ] **Step 1: Write failing migration contract tests** requiring the table, exact bucket limits, storage policies, membership helpers, body-or-media RPC validation, storage-object verification, revoked direct message inserts, and attachment paths from deletion.
- [ ] **Step 2: Run `node --test tests/realtimeCollaborationV2.test.mjs`** and verify it fails because the migration is missing.
- [ ] **Step 3: Implement the migration** with idempotent DDL, RLS, immutable metadata grants, exact path validation, and the security-definer RPCs from the design.
- [ ] **Step 4: Re-run the test** and verify the migration contract is green.
- [ ] **Step 5: Commit** with `git commit -m "feat: secure direct chat media storage"`.

### Task 2: Add testable client media rules

**Files:**
- Create: `src/components/collaboration/directMessageMedia.mjs`
- Modify: `tests/realtimeCollaborationV2.test.mjs`

**Interfaces:**
- Produces: `validateDirectMessageFiles(files)`
- Produces: `createDirectMessageMediaPath(threadId, userId, clientId, file, index)`
- Produces: `getDirectMessagePreviewLabel(body, attachments)`
- Produces: exported MIME, count, and byte limits

- [ ] **Step 1: Write behavior tests** for accepted image/video files, unsupported types, image/video limits, five-file rejection, deterministic safe paths, and photo/video/count labels.
- [ ] **Step 2: Run the test** and verify RED because the module is absent.
- [ ] **Step 3: Implement the smallest pure helper module** that satisfies the tested rules without browser APIs.
- [ ] **Step 4: Re-run the test** and verify GREEN.
- [ ] **Step 5: Commit** with `git commit -m "feat: validate direct chat media"`.

### Task 3: Upload and resolve media in the direct-message hook

**Files:**
- Modify: `src/hooks/useDirectMessages.ts`
- Modify: `tests/realtimeCollaborationV2.test.mjs`

**Interfaces:**
- Changes: `DirectMessage` gains `attachments: DirectMessageAttachment[]`
- Changes: `sendMessage(body: string, files?: File[])`
- Consumes: `send_direct_chat_message` and private `chat-media` bucket

- [ ] **Step 1: Write failing hook contracts** requiring nested attachment reads, batch signed URLs, private uploads, rollback removal, the atomic send RPC, and text/media acceptance.
- [ ] **Step 2: Run the test** and verify RED against the current text-only hook.
- [ ] **Step 3: Add attachment mapping and signed URL resolution**, using one batch per loaded message page and an unavailable state when signing fails.
- [ ] **Step 4: Replace direct inserts with the idempotent RPC**, upload independent files in parallel, remove attempt objects on failure, and preserve the existing text retry behavior.
- [ ] **Step 5: Update delete cleanup** to remove returned private storage paths after the tombstone succeeds.
- [ ] **Step 6: Re-run focused tests** and verify GREEN.
- [ ] **Step 7: Commit** with `git commit -m "feat: send direct chat media"`.

### Task 4: Build the Messenger-style media composer and bubbles

**Files:**
- Modify: `src/components/collaboration/DirectMessagesPanel.tsx`
- Modify: `tests/realtimeCollaborationV2.test.mjs`

**Interfaces:**
- Consumes: `sendMessage(body, files)` and `DirectMessage.attachments`
- Produces: labelled photo/video picker, removable preview strip, image bubbles, and video controls

- [ ] **Step 1: Write failing UI contracts** for `accept`, `multiple`, accessible labels, preview removal, composer lock, image links, video controls, and media-only submit.
- [ ] **Step 2: Run the test** and verify RED against the current text-only form.
- [ ] **Step 3: Add file selection state** with object-URL creation/revocation, validation feedback, maximum-count enforcement, and selection reset only after successful send.
- [ ] **Step 4: Add the compact preview strip and composer controls** using existing dark surfaces, 44 px touch targets, visible focus states, and no nested interactive elements.
- [ ] **Step 5: Render signed image and video attachments** before optional message text, including unavailable-media fallback and useful alt/ARIA labels.
- [ ] **Step 6: Re-run focused tests, targeted ESLint, and `npm run build`**; fix only feature-related findings.
- [ ] **Step 7: Commit** with `git commit -m "feat: add media to direct message composer"`.

### Task 5: Deploy and verify

**Files:** No additional product changes expected.

**Interfaces:**
- Produces: matching database and GitHub Pages deployment on remote `main`

- [ ] **Step 1: Run fresh focused tests, targeted ESLint, build, and `git diff --check`.**
- [ ] **Step 2: Apply `20260809170000_direct_chat_media.sql` to the production Supabase project** and query the bucket, RPC, attachment table, and policies to verify them.
- [ ] **Step 3: Push `main` and verify local HEAD equals `refs/heads/main`.**
- [ ] **Step 4: Wait for the matching GitHub Pages workflow to succeed.**
- [ ] **Step 5: Sign in to production and verify the picker, validation, preview, cancellation, and existing text messages.** Use a tiny disposable image only if a full upload test is necessary, then delete that test message and verify its storage object is gone.
