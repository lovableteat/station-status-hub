> 集中副本；原始路徑：`server/pcb_research/README.md`；程式參考基準：`ff3d6fbc9144e7d039cf2710a9fa37545e14117d`。歷史文件保留當時語意，先以 00_閱讀指南.md 與現行手冊判定適用範圍。

# PCB Designer 本機板檔工具

這個工具只在 `127.0.0.1:8766` 等待 PCB Designer 匯入。它用已安裝的 KiCad 10 讀取 Cadence Allegro 的二進位 `.brd`，輸出網站試排所需的元件、焊盤、Net、銅層、走線和導通孔。原檔、轉換結果與轉換報告使用每次匯入的本機暫存資料夾，匯入完成或失敗後清理。

在可執行 Python 3 與 KiCad 10 的公司核准電腦上，從專案資料夾開啟終端機。Windows 執行下例，如有需要，將 KiCad 路徑改成公司的實際安裝路徑：

```powershell
py -m server.pcb_research.bridge --origin https://lovableteat.github.io --kicad-cli "C:\Program Files\KiCad\10.0\bin\kicad-cli.exe"
```

將終端機顯示的配對碼貼入 PCB Designer 的研發試排視窗，再選擇 `.brd`。每次重新啟動工具會建立新的配對碼。測試自架網站時，`--origin` 使用該網站的確切來源。工具最多一次處理一份板檔。

匯入上限是 512 MiB。轉換超時或輸出超出可處理範圍時會顯示錯誤。KiCad 僅部分轉換 Allegro 的規則與物件，研發試排結果需由設計者核對。

本機模型測試：`py -m unittest server.pcb_research.test_bridge`。
