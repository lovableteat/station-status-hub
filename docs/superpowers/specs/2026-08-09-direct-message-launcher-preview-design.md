# Direct message launcher preview design

## Goal

Replace the compact floating message button with a rectangular launcher that exposes useful message context before the chat panel is opened.

## Interaction

- Keep the launcher fixed at the lower-right corner and preserve the existing click action.
- Use a 320px-wide, 64px-tall rectangular card with modest corner rounding.
- Show the newest conversation name and latest message body in one truncated preview line.
- Show the aggregate unread count when it is greater than zero.
- When there are no conversations, show a clear empty-state prompt instead of a blank preview.
- Opening the launcher swaps it for the existing full direct-message panel, avoiding duplicate controls.

## Data and performance

The closed launcher reads the existing direct-message thread summary hook. Once opened, the launcher unmounts and the existing panel owns the message subscription, so the closed and open states do not maintain duplicate thread subscriptions.

## Responsive behavior

The launcher uses the smaller of 320px and the viewport width minus 32px. Message text truncates instead of expanding the card.

## Verification

- Source regression test confirms the rectangular dimensions, latest-message preview, empty state, and unread badge.
- Browser verification confirms the launcher renders at the lower-right, opens the existing panel, and has no console errors.
