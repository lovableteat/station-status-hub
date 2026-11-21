# Real Storage service rehearsal (isolated only)

This adds missing **real HTTP + real PostgreSQL RLS** evidence. It does not repeat
the existing 36 URL/HTML/sign-out mocks or authorize a hosted cutover.

Run in the PR-only `Storage compatibility (isolated)` workflow, or explicitly on
a disposable local Docker machine:

```sh
STORAGE_COMPAT_LOCAL=1 node --test tests/storageService.integration.cjs
```

No npm installation is needed. The test pulls two official, digest-pinned images,
creates a uniquely named internal Docker network, and publishes no host port.
Real HTTP requests execute against localhost inside the exact disposable Storage
container. Database and file bytes live in disposable container tmpfs.
It accepts no production URL, database URL or key. Ephemeral test JWTs are minted
only for this local service and redacted from failures. Cleanup addresses only the
two exact generated container names and their generated network.

The current official self-hosting compose pins Storage v1.89.12. The registry
digests were resolved for that version and PostgreSQL 17.4-alpine. This test does
not assert that hosted Supabase runs the same Storage release or CDN behavior.

## Permission matrix after the exact stage03 proposal

| Synthetic actor | Read original | Mint signed URL | Upload/replace/delete |
| --- | --- | --- | --- |
| No token / anon | Denied | Denied | Denied |
| Active station viewer | Allowed | Allowed | Denied |
| Active station editor | Allowed | Allowed | Allowed |
| Inactive admin | Denied | Denied | Denied |
| Other workspace only | Denied | Denied | Denied |
| Unmapped / missing subject / expired | Denied | Denied | Denied |
| Service-role fixture setup | Allowed | Allowed | Setup/cleanup only |

Both reviewed buckets are tested against a deliberately broad pre-existing policy.
An unrelated public bucket remains public. The application authorization helper is
the existing exact fixture snapshot, not an abbreviated always-true stub.

The test applies the **unchanged** `03-private-attachments.sql` in the disposable
database. It compares full original object metadata, account and historical HTML
rows immediately across the transaction, checks unchanged original bytes by SHA256,
and exercises writes only on separate synthetic mutation targets. Unauthorized
deletes returning HTTP 200 with an empty list are checked for retained original
bytes; HTTP status alone is not treated as authorization success.

It records that old unauthenticated public URLs stop working, new authenticated
downloads work, signed URLs expire, and already-issued signed URLs remain bearer
capabilities until expiry even after the account loses access. A new signature
must be denied after that revocation.

Real v1.89.12 rejects a new object key containing a literal percent sign. That is
an explicit negative case; lossless client URL parsing is not proof the service
accepts every historical path. The positive fixture uses an encoded space.

## Not covered

Hosted Auth/session restoration, Realtime OLD/NEW filtering, production Storage
version/CDN caches, real-file restoration, old browser drafts, and external email
or bookmark public links remain separate checks. No fixture pass proves all real
users saved. No automatic migration, main merge or production deployment is added.
