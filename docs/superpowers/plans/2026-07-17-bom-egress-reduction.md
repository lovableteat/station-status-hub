# BOM Egress Reduction Implementation Plan

1. Add a pure cache-freshness policy with tests for workspace id, database timestamp, loaded state, and record count.
2. Make the BOM storage loader accept cached data and a force-refresh option.
3. Reuse complete cached records only after a lightweight remote manifest check.
4. Save database-returned workspace timestamps into the render cache after full and single-record writes.
5. Render cached BOM data before remote verification during page startup.
6. Remove the full remote reload from search while retaining explicit latest-data refresh.
7. Verify targeted tests, the full functional test suite, changed-file lint, production build, and Git diff.
8. Fetch the latest remote branch immediately before commit and push to avoid overwriting work from another computer.
