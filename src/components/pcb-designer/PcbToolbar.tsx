import type { ComponentType } from "react";
import {
  Ban,
  Box,
  Download,
  Hand,
  Layers3,
  Lock,
  LockOpen,
  Maximize2,
  MousePointer2,
  Plus,
  Redo2,
  Ruler,
  Save,
  ScanSearch,
  Square,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { PcbTool, PcbVisibleLayer } from "./types.ts";
import type { PcbViewMode } from "./hooks/usePcbProjectPresence.ts";

interface ToolButtonProps {
  label: string;
  shortcut?: string;
  showLabel?: boolean;
  icon: ComponentType<{ className?: string }>;
  disabled?: boolean;
  active?: boolean;
  onClick: () => void;
}

function ToolButton({
  label,
  shortcut,
  showLabel,
  icon: Icon,
  disabled,
  active,
  onClick,
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
            )}
            disabled={disabled}
            onClick={onClick}
            aria-label={label}
            aria-keyshortcuts={shortcut}
          >
            <Icon className="h-4 w-4" />
            {showLabel && <span>{label}</span>}
            {showLabel && shortcut && <kbd>{shortcut}</kbd>}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent className="pcb-tool-tooltip text-xs">
        <span>{label}</span>
        {shortcut && <kbd>{shortcut}</kbd>}
      </TooltipContent>
    </Tooltip>
  );
}

export interface PcbToolbarProps {
  canMutate: boolean;
  canSave: boolean;
  documentLocked: boolean;
  tool: PcbTool;
  activeLayer: "top" | "bottom";
  visibleLayer: PcbVisibleLayer;
  zoom: number;
  canUndo: boolean;
  canRedo: boolean;
  isSaving: boolean;
  viewMode: PcbViewMode;
  exportPngAvailable: boolean;
  exportIncludesGrid: boolean;
  onNew: () => void;
  onSave: () => void | Promise<void>;
  onViewModeChange: (mode: PcbViewMode) => void;
  onExportProject: () => void;
  onExportBomCsv: () => void;
  onExportBomXlsx: () => void;
  onExportPng: () => void;
  onExportIncludesGridChange: (checked: boolean) => void;
  onUndo: () => void;
  onRedo: () => void;
  onToolChange: (tool: PcbTool) => void;
  onActiveLayerChange: (layer: "top" | "bottom") => void;
  onVisibleLayerChange: (layer: PcbVisibleLayer) => void;
  onToggleLock: () => void;
  onZoomChange: (zoom: number) => void;
  onResetView: () => void;
  onRunDrc: () => void;
}

export function PcbToolbar({
  canMutate,
  canSave,
  documentLocked,
  tool,
  activeLayer,
  visibleLayer,
  zoom,
  canUndo,
  canRedo,
  isSaving,
  viewMode,
  exportPngAvailable,
  exportIncludesGrid,
  onNew,
  onSave,
  onViewModeChange,
  onExportProject,
  onExportBomCsv,
  onExportBomXlsx,
  onExportPng,
  onExportIncludesGridChange,
  onUndo,
  onRedo,
  onToolChange,
  onActiveLayerChange,
  onVisibleLayerChange,
  onToggleLock,
  onZoomChange,
  onResetView,
  onRunDrc,
}: PcbToolbarProps) {
  return (
    <TooltipProvider delayDuration={250}>
      <div
        className="pcb-toolbar"
        data-testid="pcb-toolbar"
        aria-label="PCB 工具列"
        role="toolbar"
      >
        <ToolButton label="新增專案" icon={Plus} disabled={!canMutate} onClick={onNew} />
        <ToolButton
          label={isSaving ? "正在同步" : "儲存並同步"}
          shortcut="Ctrl+S"
          icon={Save}
          disabled={!canSave || isSaving}
          onClick={() => void onSave()}
        />

        <div className="pcb-view-switch" role="group" aria-label="畫布檢視模式">
          <button
            type="button"
            className={cn(viewMode === "2d" && "is-active")}
            aria-pressed={viewMode === "2d"}
            onClick={() => onViewModeChange("2d")}
          >
            <Square aria-hidden="true" />
            2D
          </button>
          <button
            type="button"
            className={cn(viewMode === "3d" && "is-active")}
            aria-pressed={viewMode === "3d"}
            onClick={() => onViewModeChange("3d")}
          >
            <Box aria-hidden="true" />
            3D
          </button>
        </div>

        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="pcb-tool-button"
                  aria-label="匯出檔案"
                >
                  <Download className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent className="text-xs">匯出檔案</TooltipContent>
          </Tooltip>
          <DropdownMenuContent
            align="start"
            className="pcb-dropdown-menu"
          >
            <DropdownMenuItem onSelect={onExportProject}>專案 JSON</DropdownMenuItem>
            <DropdownMenuItem onSelect={onExportBomCsv}>BOM CSV</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void onExportBomXlsx()}>BOM XLSX</DropdownMenuItem>
            <DropdownMenuCheckboxItem
              checked={exportIncludesGrid}
              onCheckedChange={onExportIncludesGridChange}
              onSelect={(event) => event.preventDefault()}
            >
              PNG 包含網格
            </DropdownMenuCheckboxItem>
            <DropdownMenuItem
              disabled={!exportPngAvailable}
              onSelect={onExportPng}
              title={exportPngAvailable ? "匯出 PNG" : "畫布尚未連接，暫時無法匯出 PNG"}
            >
              PNG
              {!exportPngAvailable && (
                <span className="ml-2 text-xs text-slate-400">畫布未連接</span>
              )}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="pcb-visible-layer-switch" role="group" aria-label="Visible layer">
          <Layers3 className="h-3.5 w-3.5" aria-hidden="true" />
          {([
            { layer: "all", label: "All" },
            { layer: "top", label: "Top" },
            { layer: "bottom", label: "Bottom" },
          ] as const).map(({ layer, label }) => (
            <button
              key={layer}
              type="button"
              className={cn(visibleLayer === layer && "is-active")}
              aria-pressed={visibleLayer === layer}
              onClick={() => onVisibleLayerChange(layer)}
            >
              {label}
            </button>
          ))}
        </div>

        <span className="pcb-tool-separator" aria-hidden="true" />
        <ToolButton label="復原" shortcut="Ctrl+Z" icon={Undo2} disabled={!canMutate || !canUndo} onClick={onUndo} />
        <ToolButton label="重做" shortcut="Ctrl+Shift+Z" icon={Redo2} disabled={!canMutate || !canRedo} onClick={onRedo} />

        <span className="pcb-tool-separator" aria-hidden="true" />
        <ToolButton label="選取工具" shortcut="V" icon={MousePointer2} active={tool === "select"} onClick={() => onToolChange("select")} />
        <ToolButton label="拖曳畫布" shortcut="H / Space" icon={Hand} active={tool === "pan"} onClick={() => onToolChange("pan")} />
        <ToolButton label="測量工具" shortcut="M" icon={Ruler} disabled={!canMutate} active={tool === "measure"} onClick={() => onToolChange("measure")} />
        <ToolButton
          label="禁制區"
          shortcut="K"
          showLabel
          icon={Ban}
          disabled={!canMutate}
          active={tool === "keepout"}
          onClick={() => onToolChange("keepout")}
        />
        <ToolButton
          label={documentLocked ? "解除文件鎖定" : "鎖定文件"}
          icon={documentLocked ? Lock : LockOpen}
          disabled={!canMutate && !documentLocked}
          active={documentLocked}
          shortcut="L"
          onClick={onToggleLock}
        />

        <div className="pcb-layer-switch" role="group" aria-label="新元件放置層">
          <Layers3 className="h-3.5 w-3.5" aria-hidden="true" />
          {(["top", "bottom"] as const).map((layer) => (
            <button
              key={layer}
              type="button"
              className={cn(activeLayer === layer && "is-active")}
              disabled={!canMutate}
              aria-pressed={activeLayer === layer}
              onClick={() => onActiveLayerChange(layer)}
            >
              {layer === "top" ? "Top" : "Bottom"}
            </button>
          ))}
        </div>

        <span className="pcb-tool-separator" aria-hidden="true" />
        <ToolButton label="縮小" shortcut="-" icon={ZoomOut} disabled={viewMode === "3d" || zoom <= 25} onClick={() => onZoomChange(zoom - 25)} />
        <span className="pcb-zoom-readout">{zoom}%</span>
        <ToolButton label="放大" shortcut="+" icon={ZoomIn} disabled={viewMode === "3d" || zoom >= 400} onClick={() => onZoomChange(zoom + 25)} />
        <ToolButton label="符合板框" shortcut="F" icon={Maximize2} disabled={viewMode === "3d"} onClick={onResetView} />

        <div className="ml-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="pcb-drc-button"
            onClick={onRunDrc}
          >
            <ScanSearch className="mr-1.5 h-3.5 w-3.5" />
            DRC
          </Button>
        </div>
      </div>
    </TooltipProvider>
  );
}
