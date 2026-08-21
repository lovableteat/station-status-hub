# 工作整合平台 Logo 左上定位設計

## 目標

將共用頂部 Header 的「工作整合平台」Logo 與品牌名稱固定在 Header 左上側，符合使用者提供的視覺參考；保留既有導覽、帳號、在線狀態、QR、登出、路由與品牌點擊行為。

## 現況與選擇方案

品牌內容目前由 `src/components/layout/MainWorkspaceHeader.tsx` 組成，Logo SVG 由 `PlatformLogoMark` 共用。這次採用「品牌區絕對定位」方案：品牌區從 Header Grid 的正常排版流中脫離，以 Header 內層作為定位上下文，固定於左側並垂直置中。中間導覽與右側操作維持原本 Grid 配置。

這個方案比單純調整 Grid 對齊更能確保品牌區在不同桌面寬度都貼近左上側；比整個 Header 改成 Flex＋中央絕對定位導覽更小幅，能降低對既有導覽與手機排版的影響。

## 版面行為

- Header 內層改為相對定位；品牌可點擊按鈕或非互動品牌容器改為絕對定位。
- 品牌區保留目前 Logo、主標題、副標題、字級與 hover 行為，只改變定位方式。
- 左側定位保留小幅內距；若裝置提供左側 safe-area，定位不得侵入 safe-area。
- 桌面版中間導覽仍由現有 Grid 控制，右側在線狀態、QR、帳號與登出不移動、不改行為。
- 手機與 compact 版仍隱藏桌面導覽，品牌區與右側帳號控制在同一個 Header 高度內；Logo 不得覆蓋或推擠右側控制。
- 不修改 `PlatformLogoMark` 的 SVG、登入頁 Logo、工作區路由、權限判斷或資料流程。

## 實作範圍

主要修改 `src/components/layout/MainWorkspaceHeader.tsx`：

1. 對 Header 內層建立定位上下文。
2. 將品牌容器從 Grid 位置改為左上側絕對定位。
3. 保留品牌按鈕的語意、鍵盤操作與 `onBrandClick` 行為。
4. 以現有 Tailwind responsive class 與必要的 safe-area 偏移處理桌面、手機直向與手機橫向。

若測試需要補充，僅調整與 Header／Logo 定位契約直接相關的測試，不做無關重構。

## 驗證方式

- 執行共用 Logo 與 Header 相關測試：`tests/platformLogo.test.mjs`、`tests/mobileFirstAdaptiveShell.test.mjs`、`tests/mobileCoreWorkspaces.test.mjs`。
- 對修改後的 Header 執行 ESLint。
- 執行 `npm run build` 確認 production bundle 可產出。
- 啟動本機 preview，檢查桌面寬度與至少一個手機尺寸：Logo 位於左上、右側帳號按鈕仍可見、導覽列未被覆蓋、頁面沒有 runtime error。

## 驗收條件

1. 已登入工作區 Header 的 Logo／品牌名稱在左上側，不再被主要 Header 內容置中推移。
2. 點擊 Logo 仍回到工作區首頁。
3. 桌面導覽列、在線狀態、QR、帳號選單與登出功能仍可操作。
4. 手機版不發生品牌區與右側操作重疊或水平溢出。
5. 登入頁與其他使用 `PlatformLogoMark` 的畫面不受影響。
6. 相關測試、lint 與 production build 通過。
