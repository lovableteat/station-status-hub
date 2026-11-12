# Exact current68 → security candidate study

Research only, not a deploy step or permission to revoke backend access.

- Published source: `68a06547fda6c66dd3eb9a89b4579fc870e1b062`, Pages run `43254900838`, artifact `13961468119`.
- Immutable candidate: `149184847764466db200250aff8c716dde46720a`, tree `3a01a407ab4ad6b3e1d31a6bcf8c83cbc46489f9`.
- All 334 source output files were rebuilt from the pinned source with the exact dependency lock and public build configuration. Every path and SHA-256 matched the existing artifact.
- The old boot allowlist is the union of six explicit dynamic roots and their recursive static imports, referenced files, CSS and assets, plus index/favicon/QR. Empty CSS-only intermediate chunks not emitted by Vite are not included. Other dynamic features are not included. 52 exact original files are selected by the checked extractor.
- Candidate output pins all 334 paths/hashes and 61,784,693 bytes. Neither original source bundles nor candidate bytes are uploaded in this research job.
- The warm dashboard study needs two genuinely nonresident JS files and seven resident dependencies. It is not a complete retained closure, cold-start support or repair of resident vulnerable code.

The independent pair copies the previously reviewed 16-case browser runner to avoid changing historical evidence. It keeps the same network deny proxy, DNS deny, synthetic HTTP/Realtime allowlist, native File identity/bytes, exact seven PCB form strings, same Document checks, and the explicit negative result when the old client's raw permissions are revoked. Shared fixtures and transport are reused; `server.cjs` supplies this pair's blocked old paths.

Local verification:

```sh
AUDIT_QA_DIR=/path/to/isolated-qa node --test tests/exact68pair/research.test.cjs tests/exact80/exact80-server.test.cjs tests/exact80/exact80-fixtures.test.cjs
python tests/exact80/extract-exact80.py SOURCE.zip SELECTED tests/exact68pair/manifest.json
# Run the build helper from a clean checkout of the pinned candidate, with identical installed dependencies:
EXACT68_PAIR_DIST=SELECTED node /path/to/test-checkout/tests/exact68pair/build-candidate.mjs
EXACT68_PAIR_BUILD_ONLY=1 EXACT68_PAIR_DIST=SELECTED EXACT68_PAIR_CANDIDATE_DIST=CANDIDATE/dist node tests/exact68pair/crossrelease.browser.cjs
```

Only the genuine same-repository PR49 workflow may launch Chromium. Do not spoof CI variables locally. The build-only output is not browser evidence. Browser results are recorded as synthetic JSON/PNG only, with private endpoint identities and tokens redacted. A passing raw-denial characterization means observed draft loss, not safe permission revocation. Positive recovery protects same-Document memory, not reload/restart, CAD persistence, every physical mobile device, or actual hosted Auth/PostgREST/Realtime. Real users' unsaved drafts remain unknown.

Historical exact96/exact80/exact80cf614 files are unchanged. Their results do not transfer to this pair. The new workflow is PR-only, read-only, has no production credentials, no Pages deployment, and no database operations.
