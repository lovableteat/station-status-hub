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

Add nullable `cleared_at timestamptz` to `chat_members`. This stores an independent history cutoff for each participant.

Add `clear_direct_chat_history(p_thread_id uuid)` as a `SECURITY DEFINER` RPC. It must require an authenticated active system user, verify that the target is a direct chat and that the caller is a member, then update only the caller's membership row.

Replace the message-read policy so authenticated users can read only messages created after their own `cleared_at` cutoff. Update `list_direct_chat_threads()` so previews and unread counts use the same cutoff, and hide a cleared thread until a newer message exists. Existing insert and per-message deletion permissions remain unchanged.

## Client flow

`useDirectMessageThreads()` exposes `clearDirectChat(threadId)`. It calls the RPC, reports a user-facing error on failure, and removes the cleared thread from local state on success.

`DirectMessagesPanel` keeps the row's primary open action separate from the destructive icon button to avoid nested interactive elements. The control has an accessible name, visible hover/focus state, confirmation copy, and a per-thread loading state.

## Error handling

- Invalid, inaccessible, group, or unauthenticated thread requests fail in the database.
- Client failures keep the conversation in place and show the existing message-service error surface.
- A successful repeat call is idempotent: it moves the caller's cutoff forward and still returns success.

## Verification

- Source tests cover the cutoff column, membership-only RPC, caller-scoped update, RLS cutoff, list filtering, hook API, accessible delete control, confirmation copy, and loading state.
- Run the collaboration test suite, targeted ESLint, production build, and migration checks.
- Push `main`, wait for GitHub Pages, apply the Supabase migration, and verify the production conversation list in a signed-in browser.
