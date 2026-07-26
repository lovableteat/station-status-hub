# Data Center Lighting Design

## Goal

讓 Data Center 在使用者截圖中的 2D 規劃模式與既有 3D 模式都具備清楚、可辨識、符合工作整合平台風格的照明，同時保留狀態色、文字對比與行動裝置效能。

## Considered Approaches

1. **只提高 3D 燈光強度**：改動最小，但無法修正使用者實際截圖中的 2D 黑暗畫面，因此不採用。
2. **整個畫布直接改成淺色**：能快速變亮，但會沖淡冷熱通道、電力線與狀態色，也不符合平台深色風格，因此不採用。
3. **2D 與 3D 分層照明**：3D 保留實體燈光與曝光；2D 使用機房頂燈光池、發光地坪、機櫃狀態光暈與較清楚的格線。此方案能解決截圖問題且保留資訊層次，為採用方案。

## Design

- `DataCenter2DPlanner.tsx` 在 SVG `defs` 建立地坪漸層、頂燈 radial gradient、格線 glow 與健康狀態 glow。
- 地坪維持深色，但中心亮度、邊界、格線與通道顏色必須在一般螢幕亮度下清楚可見。
- 每個機櫃依 `RackPlan.status`、溫度與設備健康狀態顯示綠、琥珀、紅或灰藍光暈；選取狀態仍以青色外框優先。
- 2D 畫布加入可見但不干擾點擊的頂燈光池，不新增動畫，避免造成暈眩或持續重繪。
- `DataCenter3DPlanner.tsx` 保留最新 `main` 已加入的光照，只校正過曝風險與行動裝置成本，不回退別台電腦的修改。
- `DataCenterModelViewer.tsx` 與主場景使用相近色溫，避免詳細模型視窗明暗落差過大。

## Error Handling and Compatibility

- SVG filter 不支援時，機櫃仍有實色填滿與高對比邊框。
- 行動裝置不增加 3D 陰影數量；2D 光照全部由 SVG paint/filter 完成。
- 不改變座標、拖曳、縮放、選取、刪除或 2D/3D 共用資料。

## Verification

- 新增來源契約測試，確認 2D 具備地坪照明、頂燈與狀態光暈。
- 執行 Data Center 既有測試、ESLint 與 production build。
- 在桌面與行動尺寸實際開啟 2D、3D，確認文字、機櫃、冷熱通道與控制列都可讀。

