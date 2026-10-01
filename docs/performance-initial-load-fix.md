# Performance initial and repeat loading fix (2026-10-01)

The first appraisal page read previously waited on the entire authorized assessment payload, organization roster and self context. Stored evidence is embedded in feedback strings. The existing refresh optimization only helped later unchanged polls, so staff and supervisors still waited on large payloads on entry. A profile object refresh could also invalidate a pending read without starting a replacement; manager-only privacy checks ran for candidate flags even when the employee was not an assigned supervisor.

Changes:
- Maintain a database-owned `review_index` projection with employee number, grade and self-score inputs. Initial and background lists select metadata and this projection through the original RLS table, without feedback or attachments.
- Read full content only for the opened assessment/detail or explicit Excel, HTML or CSV export. A summary cannot be submitted as a complete assessment. Preserve export feedback and work instructions.
- Separate roster loading from list/self-context loading. Confirm organizational supervisor assignment before enabling the manager privacy hook. Coalesce duplicate reads, cancel superseded requests, and show a retryable error for reads exceeding 15 seconds.
- Keep the editor visible on an unchanged background refresh. Compare semantic profile identity, rather than cancelling on every new user object.
- Bound an in-memory content cache to an estimated 16 MB. Re-entry must read a fresh RLS manifest and match account, record identity and version before reusing content. Privacy changes clear it. No cloud content is restored from local storage.
- Section report polls read only ID, version and names when unchanged; repeated polls preserve row and roster identities and do not blank the existing view.

Production verification on `rfppeuzuoxtqkpbwehbq`:
- Migration `20261001203000_add_lightweight_assessment_index` applied and recorded in `supabase_migrations.schema_migrations`.
- 12 records. Original feedback byte count before/after: 21,747,345. Content-version aggregate before/after: `f4af67ed5fd957391ca82f2e70f6bff1`.
- Combined review indexes: 3,186 bytes; indexes containing embedded file data: 0.
- Serialized list projection: 7,988 bytes. This is a payload measurement, not a claimed end-to-end latency.

Validation:
- Production build succeeded.
- 50 targeted Node tests passed (loading, complete exports, access boundaries, notifications, submission receipts, drafts and permission refresh).
- 53 isolated PostgreSQL workflow checks passed, including index backfill/version preservation, attachment integrity, index forgery prevention and employee RLS.
- React test-renderer exercised the actual page and privacy hook, with child UI components stubbed: employee candidate flag mismatch, profile replacement during a pending content read, full own content, background refresh, route re-entry, chief/director lists while roster remains pending.
  Run: `node tests/performancePageLoading.integration.cjs <isolated-react-test-renderer-18.3.1-directory>`.
  SQL checks: `node tests/performanceSubmission.integration.mjs <pglite-package-directory>`.
- Existing unrelated TypeScript diagnostics remain (including page lines 306/323); no new diagnostics in the modified loading/privacy code. This is not a full-suite or global type-check pass.

The real production administrator can verify organization/self navigation, but is not assigned an appraisal role. Chief/director/staff workflows were tested with isolated fixtures, without submitting or changing real employee assessments. Very large full-detail reads still transfer that assessment's evidence; first-time attachment download and external network latency remain possible.
