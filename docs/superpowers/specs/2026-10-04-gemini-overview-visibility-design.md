# Gemini Overview Visibility Design

## Problem

PR #43 added the approved Gemini model policy to the key editor and chat console, but the API key management overview does not render that policy. A user viewing **Backend management → API management → Key management** sees the existing key name, masked key, saved model, and cumulative usage count, but cannot see the three approved models, their screenshot limits, or the unsynced remaining-quota state.

The displayed usage count is cumulative application activity. It must not be interpreted as daily Google usage or deducted from RPD.

## Approved design

Add one Gemini policy panel between the four status cards and the existing key table.

- Render all entries from `GEMINI_FREE_MODEL_PROFILES` in policy order.
- Show each model ID, RPM, input TPM, and RPD with `formatGeminiQuotaSummary`.
- Label `gemini-3.5-flash-lite` as the daily default and the other two models as manual choices.
- Show **Remaining quota: not synced with Google** for every model.
- For each model, list the names of existing Gemini keys whose saved `metadata.model` matches it and label those assignments **Currently saved model**.
- State that limits are project-scoped screenshot values dated 2026-10-04 and that different keys can share a project.

The existing key table remains the only place that renders secret values. Its current masking, eye reveal, copy, test, edit, disable, and delete controls are reused without changing their permission checks.

Enhance the table's model cell for Gemini rows with the saved-model label, matched quota summary, and unsynced-remaining notice. This makes the key name, masked key, saved model, and quota visible in one row while preserving the existing secret boundary.

Change the Usage Count help text to: **Cumulative call count; not daily usage or remaining quota.** The numeric value is not used in any quota calculation.

## Data flow and security

The overview derives data exclusively from already-loaded `apiKeys` and the static approved catalog. It performs no new database query, Google API request, credential duplication, key creation, IAM change, or billing action.

Unknown or legacy Gemini models remain visible as their saved model in the table, but receive no invented quota. Existing records are never migrated or rewritten.

## Verification

- A source-contract regression test must fail before implementation and prove the overview, saved-model association, honest quota copy, and existing mask/reveal/copy controls.
- Run the focused regression test, the complete unit suite, typecheck, scoped ESLint, and production build.
- After merge, require the existing GitHub regression and Pages workflows to succeed.
- Verify the live hashed assets contain the overview marker, model IDs, cumulative-usage clarification, and unsynced-quota copy.

