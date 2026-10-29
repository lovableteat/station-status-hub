> 集中副本；原始路徑：`server/README.md`；程式參考基準：`22f669036d89108fe73cf4b74d4117f3e332739f`。歷史文件保留當時語意，先以 00_閱讀指南.md 與現行手冊判定適用範圍。

# AutoCheck 比對伺服器

讓「比對系統」把比對工作送到伺服器處理：網頁只負責上傳檔案與顯示結果，不必在瀏覽器下載 Python 執行套件。伺服器用的引擎檔案與網站完全相同（`public/comparison/engine`，啟動時以 `manifest.json` 的雜湊驗證）、同一份橋接程式（`browser_bridge.py`）、同一個 `autocheck_dispatch` 契約，所以結果和瀏覽器模式一致。

## 資料怎麼流

1. 使用者在網頁選檔、按「開始比對」。
2. 瀏覽器把 A／B 檔案（Netlist、BOM、PDF、選用設定）以 multipart 上傳到 `POST /api/autocheck/run`。
3. 伺服器在一個私有暫存資料夾裡跑引擎，回傳 JSON（追蹤列、報表檔案以 base64 夾帶），**處理完立刻刪除暫存資料夾**，不保存任何工程檔案或結果。
4. 結果仍只存在使用者瀏覽器的本機儲存，和瀏覽器模式相同。

## 在公司內部的 Windows 電腦啟動（最簡單）

需求：Python 3.12（引擎相依套件鎖在 3.12，不要用其他版本）。

```powershell
cd server
py -3.12 -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
$env:AUTOCHECK_API_TOKEN = "自己設一組長密碼"
$env:PYTHONIOENCODING = "utf-8"
.\.venv\Scripts\python -m autocheck_api --host 0.0.0.0 --port 8000
```

瀏覽器開 `http://<這台電腦的 IP>:8000/api/autocheck/health` 看到 `"ok": true` 就是啟動成功。要常駐可用「工作排程器」在開機時執行上面最後一行，或用 NSSM 註冊成 Windows 服務。

## Docker（Linux 伺服器或雲端）

在 repo 根目錄執行（Dockerfile 需要 `public/comparison` 一起進映像）：

```bash
docker build -f server/Dockerfile -t autocheck-api .
docker run -d --name autocheck-api -p 8000:8000 -e AUTOCHECK_API_TOKEN=change-me autocheck-api
```

Google Cloud Run、Azure Container Apps、Fly.io、Render 等容器服務都能直接跑這個映像；請開 HTTPS 並設定 token。注意：放到公有雲代表公司的 BOM／netlist／電路圖會上傳到那台主機處理。

## 環境變數

| 變數 | 說明 |
| --- | --- |
| `AUTOCHECK_API_TOKEN` | 設定後，所有比對請求都要帶 `Authorization: Bearer <token>`；網頁設定裡填同一組。強烈建議設定。 |
| `AUTOCHECK_ALLOWED_ORIGINS` | 允許呼叫的網站來源，逗號分隔；預設 `*`。正式使用可填 `https://lovableteat.github.io`。 |
| `AUTOCHECK_ENGINE_DIR` | 引擎資料夾，預設是 repo 的 `public/comparison`。 |
| `PYTHONIOENCODING` | Windows 主控台請設 `utf-8`；引擎會印出 ⚠ 等字元。 |

## 網站這邊怎麼接

比對系統右上角「本機處理」→ 選「送到比對伺服器處理」→ 填位址（例如 `http://autocheck.company.local:8000`）與 token →「測試連線」→「儲存設定」。設定只存在那台電腦的瀏覽器。要讓全站預設走伺服器，建置時設定 `VITE_AUTOCHECK_API=<位址>`（GitHub Actions 的 repository variable，並加進 `.github/workflows/main.yml` 的 `env`）；使用者仍可在自己的瀏覽器改回本機處理。

## 正式網站是 https，伺服器也要讓 https 頁面連得到

GitHub Pages 的正式站是 `https://…`，瀏覽器不允許 https 頁面連到 `http://` 的伺服器（mixed content），只有 `http://localhost` 例外；網頁的「測試連線」會直接指出這種位址。三種做法：

1. 伺服器裝在自己的電腦上，網頁填 `http://localhost:8000`（最簡單，但只有這台電腦能用）。
2. 內部伺服器前面加反向代理與憑證（Caddy、nginx、IIS 都可以），網頁填 `https://autocheck.company.local`；憑證可用公司內部 CA 簽發並派發到使用者電腦。
3. 雲端容器服務通常自帶 https 網址，直接填即可。

## 限制與行為

- 與瀏覽器模式相同：最多 1000 個檔案、單檔 64 MiB、總計 128 MiB；超過回 400。
- 一個程序一次處理一件比對（引擎有程序層級狀態）；多人同時用可加 `--workers N`。
- 處理超過 10 分鐘網頁會放棄等待。
- 更新引擎：`public/comparison` 更新後重新部署伺服器（Docker 重新 build；Windows 拉新版 repo 後重啟）。網頁「測試連線」會顯示伺服器的引擎版次，可對照 `public/comparison/engine/manifest.json`。

## API

- `GET /api/autocheck/health` → `{ ok, service: "autocheck-api", engine: { revision, version, files }, limits, auth }`
- `POST /api/autocheck/{run|tracker|library|datasheet}`：multipart；`request` 欄位是 JSON，其中檔案以 `{ "path": "EVT/pstxnet.dat", "part": "f0" }` 參照，實際內容放在同名的 part；回應是 JSON，報表檔案以 base64 放在 `bytes`。錯誤回 `{ "error": "訊息" }`，狀態碼 400／401／404／500。

## 測試

```bash
pip install -r server/requirements-dev.txt
cd server && python -m pytest tests -q
```

測試用 `tests/comparison/fixtures` 的合成資料跑完整的 run → tracker 流程，並檢查 token、CORS、路徑穿越與大小限制。
