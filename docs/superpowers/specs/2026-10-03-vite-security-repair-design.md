# Vite and Rollup Security Repair Design

## Context

The application currently locks Vite 5.4.10 and Rollup 4.24.0. The configured Vite development server is intentionally reachable on `server.host: "::"`, which makes the Windows path-disclosure advisory relevant rather than theoretical. `GHSA-fx2h-pf6j-xcff` affects Vite through 6.4.2, while `GHSA-mw96-cpmx-2vgc` affects Rollup 4 before 4.59.0.

The repository builds on Node 24 in GitHub Actions and on Node 24.14.0 on the backup computer. It uses React 18.3.1, `@vitejs/plugin-react-swc`, and the development-only `lovable-tagger` plugin.

## Considered Approaches

### 1. Upgrade to Vite 6.4.3 with minimal compatible plugins

Pin Vite 6.4.3, `@vitejs/plugin-react-swc` 3.7.2, and `lovable-tagger` 1.1.10. Pin Rollup 4.59.0 through npm `overrides` because Vite's declared `^4.34.9` range otherwise includes vulnerable releases.

This is the selected approach. Vite 6.4 is still an official security-supported line, supports Node 24 through its `>=22.0.0` engine branch, retains the Rollup build pipeline, and requires no intentional application or server configuration changes.

### 2. Upgrade directly to Vite 7.3.5

This would also fix the advisory but crosses two major versions from Vite 5. It raises the migration surface and plugin requirements without providing a security benefit needed by this repair.

### 3. Upgrade directly to Vite 8.0.16

This moves the build pipeline from Rollup and esbuild to Rolldown and Oxc. It would remove the affected Rollup path but creates a substantially larger compatibility and output-difference review. It is outside the narrow repair scope.

## Dependency Contract

The root package manifest will contain these exact versions:

- `vite`: `6.4.3`
- `@vitejs/plugin-react-swc`: `3.7.2`
- `lovable-tagger`: `1.1.10`
- `picomatch`: `4.0.7`
- `overrides.rollup`: `4.59.0`

The npm lockfile must resolve the same versions and record SHA-512 integrity for each installed package. The root `picomatch` pin ensures `fdir` resolves its compatible optional peer while npm keeps picomatch 2 nested for Tailwind's existing consumers. A full-depth `npm ls fdir picomatch --all` must report a valid graph. The existing official SheetJS 0.20.3 tarball pin must remain unchanged.

## Configuration Compatibility

`vite.config.ts` remains unchanged:

- GitHub Pages base remains `/station-status-hub/`.
- Development host remains `::` and port remains `8080`.
- The worker output format remains `es`.
- `occt-wasm` remains excluded from dependency optimization.
- Production target remains `es2020`.
- React SWC remains active in all modes.
- `lovable-tagger` remains development-only.

The repository does not configure the Vite 6 migration edge cases for custom resolution conditions, JSON stringify behavior, Sass APIs, library-mode CSS naming, or SSR. No compatibility shim is required.

## Verification

A focused Node test will first fail against the vulnerable dependency graph, then pass only when the exact manifest, lockfile versions, SHA-512 integrity values, peer-compatible plugins, and unchanged Vite configuration are present.

After the dependency update:

- `npm audit --json` must not contain `GHSA-fx2h-pf6j-xcff` or `GHSA-mw96-cpmx-2vgc`.
- Focused Vite security tests, all 1028 unit tests, app/node TypeScript checks, and a production build must pass.
- Existing isolated browser regressions must pass against the Vite 6 development server.
- Lint remains a separately reported repository baseline rather than triggering unrelated cleanup.

## Delivery Boundaries

The repair will not change network host behavior, firewall settings, production security settings, SQL, database migrations, application realtime behavior, or production data. It will be committed and published on the isolated `repair/vite-security-20261003` branch as a separate draft pull request. Merge and deployment require an independent exact-head review.
