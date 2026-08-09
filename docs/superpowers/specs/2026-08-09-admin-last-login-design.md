# Admin last-login visibility design

## Goal

Show every system user's actual last successful login time in the admin user roster without confusing it with account creation or online-presence data.

## Data source

- Use `system_users.last_seen_at`, which the `account-login` edge function updates only after credentials are accepted and an authenticated Supabase session is created.
- Do not derive login time from current presence, `updated_at`, or account creation time.
- Display `尚未登入` when `last_seen_at` is null.

## Interface

- Keep the existing account cards and restrained dark control-room visual system.
- Use a three-column metadata row: `登入帳號`, `最後登入`, and `建立時間`.
- Format both timestamps with the existing `zh-TW` full date-and-time convention.
- Use the clock icon on `最後登入`; keep absent-login copy readable and visually secondary.
- Move creator information into the existing lower permissions strip so no information is lost and the card does not grow taller.

## Responsive behavior

- Desktop keeps three equal metadata columns.
- Small screens stack the fields using the existing responsive grid behavior.

## Verification

- Regression tests require the `last_seen_at` type, full timestamp formatting, and `尚未登入` fallback.
- Targeted lint and production build must pass.
- Production browser verification confirms every rendered user card contains `最後登入` and the page remains readable.
