> 集中副本；原始路徑：`docs/autocheck-server-mode.md`；程式參考基準：`0b0dee080f02ceb8d58b38744fabe3b5d5f4bcfd`。歷史文件保留當時語意，先以 00_閱讀指南.md 與現行手冊判定適用範圍。

# AutoCheck server mode

The 比對系統 page runs the AutoCheck engine in the browser (Pyodide worker) by default. Since 2026-10-29 it can instead send each job to `server/autocheck_api`, a small FastAPI service that hosts the same engine. The user asked for this after questioning why the browser downloads a runtime (「應該雲端完成我網頁看結果」); the browser mode stays the default so nothing changes for anyone who does not opt in.

## One engine, two hosts

- The server loads `public/comparison/engine` (verified against `manifest.json`), executes the same adapters (`browser_compat.py`, `power_tree_compat.py`, `browser_bridge.py`) in one namespace and calls `autocheck_dispatch(request_json, progress)` — exactly what `autocheck.worker.js` does in Pyodide. `server/autocheck_api/engine.py` mirrors the worker's `validateRequest` / `writeInputs` (path rules, 1000 files / 64 MiB / 128 MiB) and writes each request into a private temporary folder that is deleted afterwards.
- The page side is `RemoteRuntime` in `src/components/comparison/runtime.ts`: the same `request(type, payload, progress)` / `cancel()` surface as the worker wrapper, so `ComparisonWorkspace` and `ComparisonLibrary` are unchanged. `encodeRequest` turns `InputFile` buffers into multipart parts with `{path, part}` references; `decodeResult` restores the worker's `ArrayBuffer` artifacts from base64.
- `src/components/comparison/engineSettings.ts` stores the choice per browser (`localStorage` key `comparison.engine.v1`); `VITE_AUTOCHECK_API` can preset a server for a build. `EngineSettingsControl.tsx` is the badge beside the tabs (「本機處理」 / 「伺服器處理 · host」) with the dialog that switches mode, tests the connection (`GET /api/autocheck/health`) and saves.
- The busy hint and the notice after switching say where the files go, because server mode is the one case where engineering files leave the computer.

## Operating it

`server/README.md` (繁體中文) covers running on an internal Windows machine (`python -m autocheck_api`), Docker / cloud containers, `AUTOCHECK_API_TOKEN`, `AUTOCHECK_ALLOWED_ORIGINS`, limits and how to connect the site. The container must be rebuilt when `public/comparison` changes; the health endpoint reports the engine revision so the page's 測試連線 shows what the server runs.

## Verification

- `server/tests/test_api.py` (pytest, also run by `.github/workflows/autocheck-server.yml`): health, token, CORS, path traversal, limits, a full run on `tests/comparison/fixtures` (rows, unique artifact keys, 父項 column, PDF formulas), tracker replies, library and datasheet jobs, temporary-folder cleanup.
- `tests/comparison/engineSettings.test.ts` and `tests/comparison/remoteRuntime.test.ts` (node --test): settings persistence and the multipart / base64 contract, error mapping and cancellation with a stubbed `fetch`.
- The headless-Edge run used for the 1027 integration was repeated with the page pointed at a local server (`ENGINE_URL`), producing the same 14 rows, root-cause links and verified downloads as the browser mode.
