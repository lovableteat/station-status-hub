# BOM Egress Reduction Design

## Problem

The material request page stores 10,000+ BOM records in Supabase. Opening the page downloaded every record in the active BOM, and each search repeated the same full download. A single active BOM response is several megabytes, so normal page use could consume gigabytes of egress without any data growth.

## Design

- Keep the current UI, data schema, filters, exports, and collaborative editing behavior.
- Keep a complete rendered workspace in IndexedDB after a successful remote load.
- On page open, render the complete local cache immediately.
- Fetch only workspace metadata and small preference rows from Supabase.
- Reuse cached records only when workspace id, database `updated_at`, and record count all match.
- Download all active records when the cache is missing, incomplete, stale, or explicitly bypassed.
- Search and filters operate on the already loaded active workspace and never trigger a remote reload.
- Realtime changes continue to show the existing pending-update notice. The user can explicitly load the latest data without losing search, filter, or pagination state.
- Persist the server-returned workspace timestamp after writes so cache freshness comparisons use the database version rather than the client clock.

## Safety

- No existing BOM rows, columns, images, tracking history, or export formats are changed.
- A cache mismatch always falls back to a full remote read.
- IndexedDB remains optional. Cache quota or browser failures fall back to the existing remote path.
- Manual latest-data refresh always bypasses the cache.
- Existing conflict detection for individual record writes remains active.

## Expected Effect

- First use on a browser: one full active-BOM download.
- Unchanged subsequent page opens: metadata-only verification.
- Search and filter operations: no BOM network download.
- Remote update or manual refresh: one full active-BOM download.
