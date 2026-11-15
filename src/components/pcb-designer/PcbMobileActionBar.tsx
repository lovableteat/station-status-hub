import { useState } from "react";
import { Box, Boxes, Ban, ClipboardCheck, Ellipsis, Hand, Layers3, MousePointer2, RotateCw, Ruler, SlidersHorizontal, Square, Trash2, X } from "lucide-react";
import { MobileToolsSheet, type MobileToolsSection } from "@/components/layout/mobile";
import type { PcbComponentArrangement } from "./types.ts";
import type { PcbViewMode } from "./hooks/usePcbProjectPresence.ts";
import type { PcbWorkspaceApi } from "./hooks/usePcbWorkspace.ts";

interface PcbMobileActionBarProps {
  workspace: PcbWorkspaceApi;
  viewMode: PcbViewMode;
  placing: boolean;
  onViewModeChange: (mode: PcbViewMode) => void;
  onCancelPlacement: () => void;
  onOpenBoards: () => void;
  onOpenLibrary: () => void;
  onOpenPanel: (tab: "board" | "objects" | "checks") => void;
  onImportProject: () => void;
  onExportProject: () => void;
  onExportBomCsv: () => void;
  onExportBomXlsx: () => void;
  onExportPng: () => void;
  onArrange: (arrangement: PcbComponentArrangement) => void;
}

type Action = { key: string; label: string; title: string; icon: typeof Box; onClick: () => void; disabled?: boolean; pressed?: boolean; tone?: "danger" | "primary" };

/**
 * Phone (≤1023 px) actions: one row of worded buttons at the bottom that changes with what the hand is doing
 * (placing, something selected, 3D, otherwise drawing tools). Everything else is in 「更多」. Desktop never shows it.
 */
export function PcbMobileActionBar({
  workspace, viewMode, placing, onViewModeChange, onCancelPlacement, onOpenBoards, onOpenLibrary, onOpenPanel,
  onImportProject, onExportProject, onExportBomCsv, onExportBomXlsx, onExportPng, onArrange,
}: PcbMobileActionBarProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const selectionCount = new Set([...workspace.selectedObjects, ...(workspace.selection ? [workspace.selection.id] : [])]).size;
  const canEdit = workspace.canEditBoard;
  const more: Action = { key: "more", label: "更多", title: "檢視、復原、對齊、縮放與檔案動作", icon: Ellipsis, onClick: () => setMoreOpen(true) };

  const actions: Action[] = placing
    ? [
      { key: "cancel", label: "取消放置", title: "結束放置，回到選取；旋轉請按畫面上方的「旋轉 90°」", icon: X, onClick: onCancelPlacement },
      { key: "library", label: "換元件", title: "回元件庫選別的元件", icon: Boxes, onClick: onOpenLibrary },
    ]
    : viewMode === "3d"
      ? [
        { key: "2d", label: "回 2D", title: "回到平面編輯", icon: Square, onClick: () => onViewModeChange("2d"), tone: "primary" },
        { key: "boards", label: "板子", title: "打開板子清單", icon: Layers3, onClick: onOpenBoards },
        { key: "panel", label: "屬性", title: "打開板設定、物件與檢查", icon: SlidersHorizontal, onClick: () => onOpenPanel("objects") },
        more,
      ]
      : selectionCount > 0
        ? [
          { key: "props", label: "屬性", title: "看選取物的尺寸、座標與設定", icon: SlidersHorizontal, onClick: () => onOpenPanel("objects") },
          { key: "rotate", label: "旋轉", title: "把選取的元件或禁制區轉 90°", icon: RotateCw, onClick: () => workspace.rotateSelected(), disabled: !canEdit },
          { key: "delete", label: "刪除", title: "刪除選取項目（可按「更多 › 復原」還原）", icon: Trash2, onClick: () => workspace.deleteSelected(), disabled: !canEdit, tone: "danger" },
          { key: "clear", label: "取消選取", title: "取消目前的選取", icon: X, onClick: () => workspace.selectObject(null) },
        ]
        : [
          { key: "library", label: "元件庫", title: "選一個元件，再點板子放置", icon: Boxes, onClick: onOpenLibrary, disabled: !canEdit },
          { key: "select", label: "選取", title: "點選元件、禁制區或量測線", icon: MousePointer2, onClick: () => workspace.setTool("select"), pressed: workspace.tool === "select" },
          { key: "pan", label: "拖曳", title: "拖曳移動畫面，不會改到板子", icon: Hand, onClick: () => workspace.setTool("pan"), pressed: workspace.tool === "pan" },
          { key: "measure", label: "量測", title: "在板上拉一條量測線", icon: Ruler, onClick: () => workspace.setTool("measure"), pressed: workspace.tool === "measure", disabled: !canEdit },
          more,
        ];

  const sections: MobileToolsSection[] = [
    { key: "view", title: "檢視", items: [
      { key: "mode", label: viewMode === "2d" ? "切換到 3D" : "切換到 2D", description: viewMode === "2d" ? "看高度、上下兩面與安裝" : "回到平面編輯", icon: viewMode === "2d" ? Box : Square, onSelect: () => onViewModeChange(viewMode === "2d" ? "3d" : "2d") },
      { key: "layer", label: `放置層：${workspace.activeLayer === "top" ? "Top" : "Bottom"}`, description: "新放的元件放在哪一面；點一下切換", icon: Layers3, keepOpen: true, disabled: !canEdit, onSelect: () => workspace.setActiveLayer(workspace.activeLayer === "top" ? "bottom" : "top") },
      { key: "visible", label: `顯示：${workspace.visibleLayer === "all" ? "全部" : workspace.visibleLayer === "top" ? "只顯示 Top" : "只顯示 Bottom"}`, description: "依序切換 全部 → Top → Bottom", keepOpen: true, onSelect: () => workspace.setVisibleLayer(workspace.visibleLayer === "all" ? "top" : workspace.visibleLayer === "top" ? "bottom" : "all") },
      { key: "fit", label: "符合板框", description: "把整塊板放進畫面", onSelect: () => workspace.resetView(), disabled: viewMode !== "2d" },
    ] },
    { key: "edit", title: "編輯", items: [
      { key: "undo", label: "復原", description: "退回上一步修改", disabled: !canEdit || !workspace.canUndo, keepOpen: true, onSelect: () => workspace.undo() },
      { key: "redo", label: "重做", description: "重新套用剛復原的修改", disabled: !canEdit || !workspace.canRedo, keepOpen: true, onSelect: () => workspace.redo() },
      { key: "keepout", label: "畫禁制區", description: "在板上拖曳畫出不能放元件的區域", icon: Ban, disabled: !canEdit || viewMode !== "2d", onSelect: () => workspace.setTool("keepout") },
      { key: "align-left", label: "選取元件靠左對齊", description: "至少選 2 個元件", disabled: !canEdit, onSelect: () => onArrange("align-left") },
      { key: "align-top", label: "選取元件靠上對齊", description: "至少選 2 個元件", disabled: !canEdit, onSelect: () => onArrange("align-top") },
      { key: "lock", label: workspace.documentLocked ? "解除文件鎖定" : "鎖定文件", description: "鎖定後暫時不能修改，避免誤動", keepOpen: true, disabled: !workspace.canMutate && !workspace.documentLocked, onSelect: () => workspace.toggleDocumentLock() },
    ] },
    { key: "panels", title: "面板", items: [
      { key: "board", label: "板設定", description: "板形、尺寸、網格與顏色", onSelect: () => onOpenPanel("board") },
      { key: "objects", label: "物件", description: "板上所有元件、禁制區與量測線", onSelect: () => onOpenPanel("objects") },
      { key: "checks", label: "檢查", description: workspace.drcIssues.length ? `${workspace.drcIssues.length} 個問題` : "沒有問題", icon: ClipboardCheck, onSelect: () => onOpenPanel("checks") },
    ] },
    { key: "file", title: "檔案", items: [
      { key: "import", label: "匯入板子 JSON", description: "建立成新的板子（草稿）", disabled: !workspace.canMutate, onSelect: onImportProject },
      { key: "export-json", label: "匯出板子 JSON", onSelect: onExportProject },
      { key: "export-csv", label: "匯出 BOM CSV", onSelect: onExportBomCsv },
      { key: "export-xlsx", label: "匯出 BOM XLSX", onSelect: onExportBomXlsx },
      { key: "export-png", label: "匯出 PNG", description: viewMode === "2d" ? "目前 2D 畫面" : "切回 2D 才能匯出", disabled: viewMode !== "2d", onSelect: onExportPng },
    ] },
  ];

  return (
    <>
      <nav className="pcb-mobile-action-bar" aria-label="PCB 動作" data-testid="pcb-mobile-action-bar">
        {actions.map(({ key, label, title, icon: Icon, onClick, disabled, pressed, tone }) => (
          <button key={key} type="button" className="pcb-mobile-action" data-tone={tone} title={title}
            aria-pressed={pressed} disabled={disabled} onClick={onClick}>
            <Icon aria-hidden="true" className="h-5 w-5" />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <MobileToolsSheet open={moreOpen} onOpenChange={setMoreOpen} title="PCB 更多動作" sections={sections} testId="pcb-mobile-tools" />
    </>
  );
}
