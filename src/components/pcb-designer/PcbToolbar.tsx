import type { ComponentType } from "react";
import {
  Download,
  Hand,
  Lock,
  LockOpen,
  Maximize2,
  MousePointer2,
  Plus,
  Redo2,
  Ruler,
  Save,
  ScanSearch,
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
import type { PcbTool } from "./types.ts";

interface ToolButtonProps {
  label: string;
  icon: ComponentType<{ className?: string }>;
  disabled?: boolean;
  active?: boolean;
  onClick: () => void;
}

function ToolButton({
  label,
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
              active && "is-active",
            )}
            disabled={disabled}
            onClick={onClick}
            aria-label={label}
          >
            <Icon className="h-4 w-4" />
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent className="text-xs">{label}</TooltipContent>
    </Tooltip>
  );
}

export interface PcbToolbarProps {
  canMutate: boolean;
  documentLocked: boolean;
  tool: PcbTool;
  zoom: number;
  canUndo: boolean;
  canRedo: boolean;
  exportPngAvailable: boolean;
  exportIncludesGrid: boolean;
  onNew: () => void;
  onSave: () => void;
  onExportProject: () => void;
  onExportBomCsv: () => void;
  onExportBomXlsx: () => void;
  onExportPng: () => void;
  onExportIncludesGridChange: (checked: boolean) => void;
  onUndo: () => void;
  onRedo: () => void;
  onToolChange: (tool: PcbTool) => void;
  onToggleLock: () => void;
  onZoomChange: (zoom: number) => void;
  onResetView: () => void;
  onRunDrc: () => void;
}

export function PcbToolbar({
  canMutate,
  documentLocked,
  tool,
  zoom,
  canUndo,
  canRedo,
  exportPngAvailable,
  exportIncludesGrid,
  onNew,
  onSave,
  onExportProject,
  onExportBomCsv,
  onExportBomXlsx,
  onExportPng,
  onExportIncludesGridChange,
  onUndo,
  onRedo,
  onToolChange,
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
        <ToolButton label="立即儲存" icon={Save} onClick={onSave} />

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

        <span className="pcb-tool-separator" aria-hidden="true" />
        <ToolButton label="復原" icon={Undo2} disabled={!canMutate || !canUndo} onClick={onUndo} />
        <ToolButton label="重做" icon={Redo2} disabled={!canMutate || !canRedo} onClick={onRedo} />

        <span className="pcb-tool-separator" aria-hidden="true" />
        <ToolButton label="選取工具" icon={MousePointer2} active={tool === "select"} onClick={() => onToolChange("select")} />
        <ToolButton label="拖曳畫布" icon={Hand} active={tool === "pan"} onClick={() => onToolChange("pan")} />
        <ToolButton label="測量工具" icon={Ruler} disabled={!canMutate} active={tool === "measure"} onClick={() => onToolChange("measure")} />
        <ToolButton label="禁制區工具" icon={ScanSearch} disabled={!canMutate} active={tool === "keepout"} onClick={() => onToolChange("keepout")} />
        <ToolButton
          label={documentLocked ? "解除文件鎖定" : "鎖定文件"}
          icon={documentLocked ? Lock : LockOpen}
          disabled={!canMutate && !documentLocked}
          active={documentLocked}
          onClick={onToggleLock}
        />

        <span className="pcb-tool-separator" aria-hidden="true" />
        <ToolButton label="縮小" icon={ZoomOut} disabled={zoom <= 25} onClick={() => onZoomChange(zoom - 25)} />
        <span className="pcb-zoom-readout">{zoom}%</span>
        <ToolButton label="放大" icon={ZoomIn} disabled={zoom >= 400} onClick={() => onZoomChange(zoom + 25)} />
        <ToolButton label="符合板框" icon={Maximize2} onClick={onResetView} />

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
