# Clear Direct Conversation Design

## Goal

Allow a signed-in user to remove every visible message with one person from their own Messenger-style inbox without deleting the other participant's copy.

## Chosen behavior

- Each recent-conversation row has a compact destructive action labelled `刪除與 {name} 的所有訊息`.
- The action requires confirmation and explains that the operation affects only the current account, the other participant keeps their history, and the operation cannot be undone.
- While the request is running, the action is disabled and shows progress.
- On success, the conversation disappears from the current user's recent list immediately.
- Starting a chat with the same person again opens an empty conversation. Messages sent after the clear point become visible normally; cleared history never reappears for that user.
- The other participant continues to see the original conversation and messages.

## Data model and security

Add `chat_history_clears(thread_id, user_id, cleared_at)` with a composite primary key. Each participant owns a separate cutoff row, and RLS allows a user to read only their own clear records, so the other participant cannot observe when a conversation was cleared.

Add `clear_direct_chat_history(p_thread_id uuid)` as a `SECURITY DEFINER` RPC. It must require an authenticated active system user, verify that the target is a direct chat and that the caller is a member, then upsert only the caller's cutoff row.

Replace the message-read policy so authenticated users can read only messages created after their own `cleared_at` cutoff. Update `list_direct_chat_threads()` so previews and unread counts use the same cutoff, and hide a cleared thread until a newer message exists. Existing insert and per-message deletion permissions remain unchanged.

## Client flow

`useDirectMessageThreads()` exposes `clearDirectChat(threadId)`. It calls the RPC, reports a user-facing error on failure, removes the cleared thread from local state on success, and emits a local clear event so every open panel purges stale history.

Realtime message broadcasts contain opaque table, thread, and record identifiers only. Clients fetch the referenced row again through RLS before displaying it. Authoritative reloads replace visible sent rows while retaining legitimate optimistic sends, preventing cached or broadcast payloads from bypassing the personal cutoff.

`DirectMessagesPanel` keeps the row's primary open action separate from the destructive icon button to avoid nested interactive elements. The control has an accessible name, visible hover/focus state, confirmation copy, and a `Set`-backed per-thread loading state that safely handles concurrent requests.

## Error handling

- Invalid, inaccessible, group, or unauthenticated thread requests fail in the database.
- Client failures keep the conversation in place and show the existing message-service error surface.
- A successful repeat call is idempotent: it moves the caller's cutoff forward and still returns success.

## Verification

- Tests cover the private cutoff table, membership-only RPC, caller-scoped upsert, RLS cutoff, list filtering, opaque realtime invalidation, cache replacement behavior, hook API, accessible delete control, confirmation copy, and concurrent loading state.
- Run the collaboration test suite, targeted ESLint, production build, and migration checks.
- Push `main`, wait for GitHub Pages, apply the Supabase migration, and verify the production conversation list in a signed-in browser.
