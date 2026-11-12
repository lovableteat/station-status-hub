# Isolated legacy PCB HTTP contract

Run in the authorized pull-request CI only:

`node --test tests/legacyPcbPostgrest.integration.cjs`

The runner requires `GITHUB_ACTIONS=true` and `GITHUB_EVENT_NAME=pull_request`. It creates disposable PostgreSQL and PostgREST containers, reuses the repository's synthetic database fixture and pending API proposals, and exposes only a random HTTP port on host `127.0.0.1`. PostgreSQL has no host port. Container names are unique to the process and cleanup removes only those containers.

Images are official and fixed:

- `postgres:17.4-alpine`, matching the existing isolated PostgreSQL test.
- `postgrest/postgrest:v12.2.12@sha256:5f4ce744539bbba786b4e24dbbd95bdb2a956dcf568c5374995a0ff4a68f5bd2`. The multi-platform manifest digest was obtained directly from Docker's official registry metadata. Upstream release: https://github.com/PostgREST/postgrest/releases/tag/v12.2.12 . Official image reference: https://docs.postgrest.org/en/v12/explanations/install.html .

The success summary records actual image RepoDigests. It does not claim these versions equal the deployed production services.

Database passwords and JWT signing secrets are randomly generated solely for this throwaway stack. JWTs name distinct synthetic Auth and application accounts; no production token, key, URL, session or account is used. The SDK's fetch adapter only removes the `/rest/v1` prefix from requests addressed to the exact loopback origin. PostgREST receives and executes every request. No response is mocked. Requests to Auth or another service are rejected by the adapter.

The production TypeScript profile reader is executed with the actual Supabase SDK. Tests cover POST RPC filter/order/maybeSingle behavior, the 16-column/null/JSON contract, raw column/path/filter/whole-row rejection, an actual FK embedded-read positive control and permissions rejection, legacy actor/role/expiry denial, private/shared output separation, and the existing permission setter preserving source snapshots.

The raw-permissions enforcement file remains release-blocked in the repository. Only its exact hash-pinned release gate is removed in memory by the shared test-only helper, and only for this disposable rehearsal. This does not bypass a production approval or verify old clients, hosted Auth, Realtime OLD/NEW filtering, private dynamic return paths, data restoration or operational continuity.

Local preparation without Docker consists of syntax and source-contract tests only:

`node --check tests/legacyPcbPostgrest.integration.cjs`

`node --test tests/legacyPcbPostgrestSource.test.mjs`

Those checks are not an HTTP or container test pass. Actual execution results must come from the specific PR head's CI.
