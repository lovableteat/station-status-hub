import type { ComponentType } from "react";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceBetween,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceBetween,
  Ban,
  Box,
  ChevronDown,

  Eye,
  FileJson,
  FolderOpen,
  Hand,
  Image,
  Layers3,
  Lock,
  LockOpen,
  Maximize2,
  MousePointer2,
  Redo2,
  Ruler,
  Save,
  Sheet,
  Square,
  Trash2,
  Undo2,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { PcbComponentArrangement, PcbTool, PcbVisibleLayer } from "./types.ts";
import type { PcbViewMode } from "./hooks/usePcbProjectPresence.ts";

interface ToolButtonProps {
  label: string;
  /** What the button does, shown on hover (not the label again). */
  hint: string;
  shortcut?: string;
  showLabel?: boolean;
  icon: ComponentType<{ className?: string }>;
  disabled?: boolean;
  pending?: boolean;
  /** Toggle tools report their state with aria-pressed; plain actions leave it undefined. */
  active?: boolean;
  onClick: () => void;
  tone?: "save" | "import" | "danger";
  badge?: number;
  className?: string;
}

const ARRANGEMENT_ITEMS: readonly {
  value: PcbComponentArrangement;
  label: string;
  shortcut: string;
  icon: ComponentType<{ className?: string }>;
  minimum: 2 | 3;
}[] = [
  { value: "align-left", label: "靠左對齊", shortcut: "Alt+L", icon: AlignStartVertical, minimum: 2 },
  { value: "align-horizontal-center", label: "水平置中", shortcut: "Alt+C", icon: AlignCenterVertical, minimum: 2 },
  { value: "align-right", label: "靠右對齊", shortcut: "Alt+R", icon: AlignEndVertical, minimum: 2 },
  { value: "align-top", label: "靠上對齊", shortcut: "Alt+T", icon: AlignStartHorizontal, minimum: 2 },
  { value: "align-vertical-center", label: "垂直置中", shortcut: "Alt+M", icon: AlignCenterHorizontal, minimum: 2 },
  { value: "align-bottom", label: "靠下對齊", shortcut: "Alt+B", icon: AlignEndHorizontal, minimum: 2 },
  { value: "distribute-horizontal", label: "水平均分", shortcut: "Alt+H", icon: AlignHorizontalSpaceBetween, minimum: 3 },
  { value: "distribute-vertical", label: "垂直均分", shortcut: "Alt+V", icon: AlignVerticalSpaceBetween, minimum: 3 },
];

function ToolButton({
  label,
  hint,
  shortcut,
  showLabel,
  icon: Icon,
  disabled,
  pending,
  active,
  onClick,
  tone,
  badge,
  className,
}: ToolButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              "pcb-tool-button",
              showLabel && "is-labeled",
              active && "is-active",
              tone && `is-${tone}`,
              className,
            )}
            disabled={disabled}
            pending={pending}
            onClick={onClick}
            aria-label={label}
            aria-pressed={active}
            aria-keyshortcuts={shortcut}
          >
            {!pending && <Icon className="h-4 w-4" />}
            {showLabel && <span>{label}</span>}
            {showLabel && shortcut && <kbd>{shortcut}</kbd>}
            {badge ? <span className="pcb-tool-badge" aria-hidden="true">{badge}</span> : null}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent className="pcb-tool-tooltip text-xs">
        <span>{hint}</span>
        {shortcut && <kbd>{shortcut}</kbd>}
      </TooltipContent>
    </Tooltip>
  );
}

export interface PcbToolbarProps {
  /** Board content can change (edit rights, not locked, not 已核准). */
  canMutate: boolean;
  /** A new board can be imported (edit rights), even when the open board is 已核准. */
  canImport?: boolean;
  canSave: boolean;
  /** The open board has changes that are not in the cloud yet. */
  isDirty?: boolean;
  documentLocked: boolean;
  tool: PcbTool;
  activeLayer: "top" | "bottom";
  visibleLayer: PcbVisibleLayer;
  zoom: number;
  canUndo: boolean;
  canRedo: boolean;
  selectedComponentCount: number;
  selectedObjectCount: number;
  isSaving: boolean;
  viewMode: PcbViewMode;
  exportPngAvailable: boolean;
  exportIncludesGrid: boolean;
  onSave: () => void | Promise<void>;
  onImportProject: () => void;
  onViewModeChange: (mode: PcbViewMode) => void;
  onExportProject: () => void;
  onExportBomCsv: () => void;
  onExportBomXlsx: () => void;
  onExportPng: () => void;
  onExportIncludesGridChange: (checked: boolean) => void;
  onUndo: () => void;
  onRedo: () => void;
  onArrangeSelection: (arrangement: PcbComponentArrangement) => void;
  onDeleteSelection: () => void;
  onToolChange: (tool: PcbTool) => void;
  onActiveLayerChange: (layer: "top" | "bottom") => void;
  onVisibleLayerChange: (layer: PcbVisibleLayer) => void;
  onToggleLock: () => void;
  onZoomChange: (zoom: number) => void;
  onResetView: () => void;
}

export function PcbToolbar({
  canMutate,
  canImport = canMutate,
  canSave,
  isDirty = false,
  documentLocked,
  tool,
  activeLayer,
  visibleLayer,
  zoom,
  canUndo,
  canRedo,
  selectedComponentCount,
  selectedObjectCount,
  isSaving,
  viewMode,
  exportPngAvailable,
  exportIncludesGrid,
  onSave,
  onImportProject,
  onViewModeChange,
  onExportProject,
  onExportBomCsv,
  onExportBomXlsx,
  onExportPng,
  onExportIncludesGridChange,
  onUndo,
  onRedo,
  onArrangeSelection,
  onDeleteSelection,
  onToolChange,
  onActiveLayerChange,
  onVisibleLayerChange,
  onToggleLock,
  onZoomChange,
  onResetView,
}: PcbToolbarProps) {
  const is2d = viewMode === "2d";
  const visibleLayerLabel = visibleLayer === "all"
    ? "全部顯示"
    : visibleLayer === "top"
      ? "只顯示 Top"
      : "只顯示 Bottom";

  const changeActiveLayer = (layer: "top" | "bottom") => {
    onActiveLayerChange(layer);
    if (visibleLayer !== "all" && visibleLayer !== layer) {
      onVisibleLayerChange(layer);
    }
  };

  return (
    <TooltipProvider delayDuration={250}>
      <div
        className="pcb-toolbar"
        data-testid="pcb-toolbar"
        data-view={viewMode}
        aria-label="PCB 工具列"
        role="toolbar"
      >
        <div className="pcb-file-actions" role="group" aria-label="檔案作業">
          <ToolButton
            label={isSaving ? "正在同步" : "儲存"}
            hint={isSaving ? "正在把這塊板寫進雲端" : isDirty ? "有未儲存的修改，按 Ctrl+S 儲存" : "把這塊板寫進雲端；目前沒有未儲存的修改"}
            shortcut="Ctrl+S"
            showLabel
            tone="save"
            className={cn(isDirty && !isSaving && "is-dirty")}
            icon={Save}
            disabled={!canSave || isSaving}
            pending={isSaving}
            onClick={() => void onSave()}
          />

          {/* Import and every export in one menu: they are occasional file actions, not editing tools. */}
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="pcb-tool-button is-labeled is-export"
                    aria-label="檔案"
                  >
                    <FolderOpen className="h-4 w-4" />
                    <span>檔案</span>
                    <ChevronDown className="h-3 w-3" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent className="text-xs">匯入板子 JSON，或匯出 JSON、BOM、PNG</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="start" className="pcb-dropdown-menu w-60">
              <DropdownMenuLabel>匯入</DropdownMenuLabel>
              <DropdownMenuItem disabled={!canImport} onSelect={onImportProject}
                title={canImport ? "選一個板子 JSON，建立成新的板子（草稿）" : "目前沒有建立板子的編輯權"}>
                <Upload className="mr-2 h-4 w-4" />匯入板子 JSON
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>匯出這塊板</DropdownMenuLabel>
              <DropdownMenuItem onSelect={onExportProject} title="下載這塊板的完整資料，可在別處匯入">
                <FileJson className="mr-2 h-4 w-4" />板子 JSON
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onExportBomCsv} title="下載元件清單（CSV）">
                <Sheet className="mr-2 h-4 w-4" />BOM CSV
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void onExportBomXlsx()} title="下載元件清單（Excel）">
                <Sheet className="mr-2 h-4 w-4" />BOM XLSX
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!exportPngAvailable}
                onSelect={onExportPng}
                title={exportPngAvailable ? "下載目前 2D 畫面的圖片" : "切回 2D 才能匯出 PNG"}
              >
                <Image className="mr-2 h-4 w-4" />PNG
                {!exportPngAvailable && (
                  <span className="ml-2 text-xs text-slate-400">切回 2D</span>
                )}
              </DropdownMenuItem>
              <DropdownMenuCheckboxItem
                checked={exportIncludesGrid}
                onCheckedChange={onExportIncludesGridChange}
                onSelect={(event) => event.preventDefault()}
                title="匯出的 PNG 是否畫出網格"
              >
                PNG 包含網格
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <span className="pcb-tool-separator" aria-hidden="true" />

        <div className="pcb-view-switch" role="group" aria-label="畫布檢視模式">
          <button
            type="button"
            className={cn(viewMode === "2d" && "is-active")}
            aria-pressed={viewMode === "2d"}
            title="平面編輯：擺放、對齊、量測與禁制區"
            onClick={() => onViewModeChange("2d")}
          >
            <Square aria-hidden="true" />
            2D
          </button>
          <button
            type="button"
            className={cn(viewMode === "3d" && "is-active")}
            aria-pressed={viewMode === "3d"}
            title="立體檢視：看高度、上下兩面與安裝"
            onClick={() => onViewModeChange("3d")}
          >
            <Box aria-hidden="true" />
            3D
          </button>
        </div>

        <div className="pcb-layer-control" role="group" aria-label="PCB 圖層控制">
          <Layers3 className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="pcb-layer-switch-label">圖層</span>
          {(["top", "bottom"] as const).map((layer) => (
            <button
              key={layer}
              type="button"
              className={cn("pcb-active-layer-button", activeLayer === layer && "is-active")}
              disabled={!canMutate}
              aria-label={`放置層 ${layer === "top" ? "Top" : "Bottom"}`}
              aria-pressed={activeLayer === layer}
              title={layer === "top" ? "新放的元件放在頂面 Top（鍵盤 T）" : "新放的元件放在底面 Bottom（鍵盤 B）"}
              onClick={() => changeActiveLayer(layer)}
            >
              {layer === "top" ? "Top" : "Bottom"}
            </button>
          ))}

          <span className="pcb-layer-control-divider" aria-hidden="true" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="pcb-layer-visibility-trigger"
                aria-label={`顯示範圍：${visibleLayerLabel}`}
                title="畫面要顯示哪一面的元件"
              >
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{visibleLayerLabel}</span>
                <ChevronDown className="h-3 w-3" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="pcb-dropdown-menu pcb-layer-visibility-menu">
              <DropdownMenuRadioGroup
                value={visibleLayer}
                onValueChange={(layer) => onVisibleLayerChange(layer as PcbVisibleLayer)}
              >
                <DropdownMenuRadioItem value="all">全部顯示</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="top">只顯示 Top</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="bottom">只顯示 Bottom</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <span className="pcb-tool-separator" aria-hidden="true" />
        <ToolButton label="復原" hint="退回上一步修改" shortcut="Ctrl+Z" icon={Undo2} disabled={!canMutate || !canUndo} onClick={onUndo} />
        <ToolButton label="重做" hint="重新套用剛復原的修改" shortcut="Ctrl+Shift+Z" icon={Redo2} disabled={!canMutate || !canRedo} onClick={onRedo} />

        {/* 2D-only editing tools: not shown in 3D, where they would do nothing. */}
        {is2d && (
          <>
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      className="pcb-tool-button is-labeled pcb-arrange-trigger"
                      aria-label={`元件對齊與均分，已選取 ${selectedComponentCount} 個元件`}
                    >
                      <AlignHorizontalSpaceBetween className="h-4 w-4" />
                      <span>對齊</span>
                      {selectedComponentCount > 0 && (
                        <span className="pcb-arrange-count" aria-hidden="true">{selectedComponentCount}</span>
                      )}
                      <ChevronDown className="h-3 w-3" aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent className="pcb-tool-tooltip text-xs">
                  {selectedComponentCount >= 2
                    ? `調整 ${selectedComponentCount} 個選取元件的對齊或間距`
                    : "先選取至少 2 個元件，再對齊或均分"}
                </TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="start" className="pcb-dropdown-menu pcb-arrange-menu w-60">
                <DropdownMenuLabel>對齊元件</DropdownMenuLabel>
                {ARRANGEMENT_ITEMS.slice(0, 3).map((item) => (
                  <DropdownMenuItem
                    key={item.value}
                    disabled={!canMutate || selectedComponentCount < item.minimum}
                    onSelect={() => onArrangeSelection(item.value)}
                  >
                    <item.icon className="mr-2 h-4 w-4" />
                    <span>{item.label}</span>
                    <kbd>{item.shortcut}</kbd>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                {ARRANGEMENT_ITEMS.slice(3, 6).map((item) => (
                  <DropdownMenuItem
                    key={item.value}
                    disabled={!canMutate || selectedComponentCount < item.minimum}
                    onSelect={() => onArrangeSelection(item.value)}
                  >
                    <item.icon className="mr-2 h-4 w-4" />
                    <span>{item.label}</span>
                    <kbd>{item.shortcut}</kbd>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel>均分間距</DropdownMenuLabel>
                {ARRANGEMENT_ITEMS.slice(6).map((item) => (
                  <DropdownMenuItem
                    key={item.value}
                    disabled={!canMutate || selectedComponentCount < item.minimum}
                    onSelect={() => onArrangeSelection(item.value)}
                  >
                    <item.icon className="mr-2 h-4 w-4" />
                    <span>{item.label}</span>
                    <kbd>{item.shortcut}</kbd>
                  </DropdownMenuItem>
                ))}
                <p className="pcb-arrange-hint">
                  對齊需 2 個；均分需 3 個元件
                </p>
              </DropdownMenuContent>
            </DropdownMenu>

            <span className="pcb-tool-separator" aria-hidden="true" />
            <div className="pcb-tool-group" role="group" aria-label="畫布工具">
              <ToolButton label="選取工具" hint="點選或框選元件、禁制區與量測線" shortcut="V" icon={MousePointer2} active={tool === "select"} onClick={() => onToolChange("select")} />
              <ToolButton label="拖曳畫布" hint="拖曳移動畫面，不會改到板子" shortcut="H / Space" icon={Hand} active={tool === "pan"} onClick={() => onToolChange("pan")} />
              <ToolButton label="測量工具" hint="在板上拉一條量測線" shortcut="M" icon={Ruler} disabled={!canMutate} active={tool === "measure"} onClick={() => onToolChange("measure")} />
              <ToolButton
                label="禁制區"
                hint="在板上拖曳畫出不能放元件的區域"
                shortcut="K"
                showLabel
                icon={Ban}
                disabled={!canMutate}
                active={tool === "keepout"}
                onClick={() => onToolChange("keepout")}
              />
            </div>
            <ToolButton
              label="刪除選取"
              hint="拖曳框選或 Ctrl / Shift 點選多個項目，再按 Delete；Ctrl+Z 可復原"
              shortcut="Delete"
              icon={Trash2}
              tone="danger"
              badge={selectedObjectCount}
              disabled={!canMutate || selectedObjectCount === 0}
              onClick={onDeleteSelection}
            />
            <ToolButton
              label={documentLocked ? "解除文件鎖定" : "鎖定文件"}
              hint={documentLocked ? "解除鎖定後才能修改這塊板" : "鎖定後這塊板暫時不能修改，避免誤動"}
              icon={documentLocked ? Lock : LockOpen}
              disabled={!canMutate && !documentLocked}
              active={documentLocked}
              shortcut="L"
              onClick={onToggleLock}
            />

            <span className="pcb-tool-separator" aria-hidden="true" />
            <div className="pcb-zoom-group" role="group" aria-label="縮放">
              <ToolButton label="縮小" hint="縮小畫面" shortcut="-" icon={ZoomOut} disabled={zoom <= 25} onClick={() => onZoomChange(zoom - 25)} />
              <span className="pcb-zoom-readout" title="目前縮放比例">{zoom}%</span>
              <ToolButton label="放大" hint="放大畫面" shortcut="+" icon={ZoomIn} disabled={zoom >= 400} onClick={() => onZoomChange(zoom + 25)} />
              <ToolButton label="符合板框" hint="把整塊板放進畫面" shortcut="F" icon={Maximize2} onClick={onResetView} />
            </div>
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
