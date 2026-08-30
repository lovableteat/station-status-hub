import { useState, type ReactNode } from "react";
import { Copy, FileUp, Lock, LockOpen, RotateCw, Scissors, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PcbKeepout, PcbMeasurement, PcbModelAssetMetadata, PcbPlacedComponent } from "./types.ts";
import { PCB_MODEL_FILE_ACCEPT } from "./core/modelAssets.ts";
import { createBoardGridCuts } from "./core/boardCuts.ts";
import type { PcbWorkspaceApi } from "./hooks/usePcbWorkspace.ts";

function InspectorField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="pcb-inspector-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function NumberField({
  label,
  value,
  disabled,
  step = "any",
  onCommit,
}: {
  label: string;
  value: number;
  disabled: boolean;
  step?: string;
  onCommit: (value: number) => boolean;
}) {
  return (
    <InspectorField label={label}>
      <input
        key={value}
        type="number"
        step={step}
        defaultValue={value}
        disabled={disabled}
        onBlur={(event) => {
          const next = Number(event.currentTarget.value);
          if (
            !Number.isFinite(next)
            || (next !== value && !onCommit(next))
          ) {
            event.currentTarget.value = String(value);
          }
        }}
      />
    </InspectorField>
  );
}

function SelectionActions({ workspace }: { workspace: PcbWorkspaceApi }) {
  const component = workspace.selection?.kind === "component"
    ? workspace.selectedObject as PcbPlacedComponent
    : null;
  const keepout = workspace.selection?.kind === "keepout"
    ? workspace.selectedObject
    : null;
  const selectionCount = new Set([
    ...workspace.selectedObjects,
    ...(workspace.selection ? [workspace.selection.id] : []),
  ]).size;
  const canDuplicate = workspace.selection?.kind === "keepout"
    || workspace.selection?.kind === "component"
    || workspace.selectedObjects.length > 0;
  return (
    <div className="pcb-inspector-actions">
      <span className="pcb-selection-count">
        Selected {selectionCount || workspace.selectedObjects.length}
      </span>
      {component && (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!workspace.canMutate || component.locked}
            onClick={workspace.rotateSelected}
            aria-label="旋轉選取元件 90 度"
            title="旋轉 90°"
          >
            <RotateCw className="mr-1.5 h-3.5 w-3.5" />旋轉
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!workspace.canMutate}
            onClick={workspace.toggleSelectedLock}
            aria-label={component.locked ? "解除元件鎖定" : "鎖定元件"}
            title={component.locked ? "解除鎖定" : "鎖定"}
          >
            {component.locked
              ? <LockOpen className="mr-1.5 h-3.5 w-3.5" />
              : <Lock className="mr-1.5 h-3.5 w-3.5" />}
            {component.locked ? "解鎖" : "鎖定"}
          </Button>
        </>
      )}
      {keepout && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!workspace.canMutate}
          onClick={workspace.rotateSelected}
          aria-label="旋轉選取禁制區 90 度"
          title="旋轉 90°"
        >
          <RotateCw className="mr-1.5 h-3.5 w-3.5" />旋轉
        </Button>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!workspace.canMutate || !canDuplicate || Boolean(component?.locked)}
        onClick={() => workspace.duplicateSelected()}
        aria-label="複製選取項目"
        title="複製"
      >
        <Copy className="mr-1.5 h-3.5 w-3.5" />複製
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="pcb-danger-action"
        disabled={!workspace.canMutate || Boolean(component?.locked)}
        onClick={workspace.deleteSelected}
        aria-label="刪除選取物件"
        title="刪除"
      >
        <Trash2 className="mr-1.5 h-3.5 w-3.5" />刪除
      </Button>
    </div>
  );
}

function BoardInspector({ workspace }: { workspace: PcbWorkspaceApi }) {
  const board = workspace.activeProject.board;
  const disabled = !workspace.canMutate;
  const [columns, setColumns] = useState("1");
  const [rows, setRows] = useState("1");
  const applyCuts = () => {
    const nextColumns = Number(columns);
    const nextRows = Number(rows);
    if (!Number.isInteger(nextColumns) || !Number.isInteger(nextRows)
      || nextColumns < 1 || nextColumns > 20 || nextRows < 1 || nextRows > 20) return;
    workspace.updateBoard({ cuts: createBoardGridCuts(board, nextColumns, nextRows) });
  };
  return (
    <div className="pcb-inspector-form">
      <h2>板設定</h2>
      <div className="pcb-inspector-field-grid">
        <NumberField label="寬度 (mm)" value={board.width} disabled={disabled} onCommit={(width) => workspace.updateBoard({ width })} />
        <NumberField label="高度 (mm)" value={board.height} disabled={disabled} onCommit={(height) => workspace.updateBoard({ height })} />
        <NumberField label="網格 (mm)" value={board.gridSize} disabled={disabled} onCommit={(gridSize) => workspace.updateBoard({ gridSize })} />
        <InspectorField label="板色">
          <input type="color" value={board.background} disabled={disabled} onChange={(event) => workspace.updateBoard({ background: event.target.value })} />
        </InspectorField>
        <InspectorField label="Top 色">
          <input
            type="color"
            value={board.layerColors.top}
            disabled={disabled}
            onChange={(event) =>
              workspace.updateBoard({
                layerColors: {
                  top: event.target.value,
                  bottom: board.layerColors.bottom,
                },
              })}
          />
        </InspectorField>
        <InspectorField label="Bottom 色">
          <input
            type="color"
            value={board.layerColors.bottom}
            disabled={disabled}
            onChange={(event) =>
              workspace.updateBoard({
                layerColors: {
                  top: board.layerColors.top,
                  bottom: event.target.value,
                },
              })}
          />
        </InspectorField>
      </div>
      <label className="pcb-inspector-check">
        <input type="checkbox" checked={board.showGrid} disabled={disabled} onChange={(event) => workspace.updateBoard({ showGrid: event.target.checked })} />
        顯示網格
      </label>
      <label className="pcb-inspector-check">
        <input type="checkbox" checked={board.snapToGrid} disabled={disabled} onChange={(event) => workspace.updateBoard({ snapToGrid: event.target.checked })} />
        吸附網格
      </label>
      <div className="pcb-inspector-section" data-testid="pcb-board-cuts">
        <div className="flex items-center gap-2">
          <Scissors className="h-4 w-4 text-amber-300" aria-hidden="true" />
          <h3>切板</h3>
          <span className="ml-auto text-xs text-slate-400">{board.cuts?.length ?? 0} 條分板線</span>
        </div>
        <p className="pcb-inspector-note">把板框切成等分面板；不會移除元件，2D 與 3D 會同步顯示切線。</p>
        <div className="pcb-inspector-field-grid">
          <InspectorField label="左右分板數">
            <input type="number" min="1" max="20" step="1" value={columns} disabled={disabled} onChange={(event) => setColumns(event.target.value)} />
          </InspectorField>
          <InspectorField label="上下分板數">
            <input type="number" min="1" max="20" step="1" value={rows} disabled={disabled} onChange={(event) => setRows(event.target.value)} />
          </InspectorField>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={disabled} onClick={applyCuts}>
            <Scissors className="mr-1.5 h-3.5 w-3.5" />套用切板
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={disabled || !board.cuts?.length} onClick={() => workspace.updateBoard({ cuts: [] })}>
            清除切板線
          </Button>
        </div>
      </div>
      <p className="pcb-inspector-note">座標與所有尺寸皆以毫米為單位。Alt 拖曳可暫時略過吸附。</p>
    </div>
  );
}

function ComponentInspector({
  workspace,
  component,
  onImportModel,
}: {
  workspace: PcbWorkspaceApi;
  component: PcbPlacedComponent;
  onImportModel?: (file: File, componentId: string) => Promise<PcbModelAssetMetadata>;
}) {
  const disabled = !workspace.canMutate;
  const componentDisabled = disabled || component.locked;
  const [modelImportState, setModelImportState] = useState<{
    status: "idle" | "loading" | "success" | "error";
    metadata?: PcbModelAssetMetadata;
    error?: string;
  }>({ status: "idle" });

  const handleModelFile = async (file: File) => {
    if (!onImportModel) return;
    setModelImportState({ status: "loading" });
    try {
      const metadata = await onImportModel(file, component.instanceId);
      setModelImportState({ status: "success", metadata });
    } catch (error) {
      setModelImportState({
        status: "error",
        error: error instanceof Error ? error.message : "模型匯入失敗。",
      });
    }
  };

  return (
    <div className="pcb-inspector-form" data-selection-kind="component">
      <h2>{component.reference} · {component.name}</h2>
      <InspectorField label="名稱">
        <input
          key={component.name}
          defaultValue={component.name}
          disabled={componentDisabled}
          onBlur={(event) => workspace.updateComponent(component.instanceId, { name: event.currentTarget.value.trim() || component.name })}
        />
      </InspectorField>
      <InspectorField label="位號">
        <input
          key={component.reference}
          defaultValue={component.reference}
          disabled={componentDisabled}
          onBlur={(event) => workspace.updateComponent(component.instanceId, { reference: event.currentTarget.value.trim() || component.reference })}
        />
      </InspectorField>
      <div className="pcb-inspector-field-grid">
        <NumberField label="長 (mm)" value={component.width} disabled={componentDisabled} onCommit={(width) => workspace.updateComponent(component.instanceId, { width })} />
        <NumberField label="寬 (mm)" value={component.height} disabled={componentDisabled} onCommit={(height) => workspace.updateComponent(component.instanceId, { height })} />
        <NumberField label="高 (mm)" value={component.maxHeight} disabled={componentDisabled} onCommit={(maxHeight) => workspace.updateComponent(component.instanceId, { maxHeight })} />
        <NumberField label="旋轉 (°)" value={component.rotation} disabled={componentDisabled} step="90" onCommit={(rotation) => workspace.updateComponent(component.instanceId, { rotation })} />
      </div>
      <p className="pcb-inspector-note">長、寬、高是元件實體尺寸；位置請直接在畫布拖曳調整。</p>
      <InspectorField label="層">
        <select value={component.layer} disabled={componentDisabled} onChange={(event) => workspace.updateComponent(component.instanceId, { layer: event.target.value as "top" | "bottom" })}>
          <option value="top">Top</option>
          <option value="bottom">Bottom</option>
        </select>
      </InspectorField>
      <div className="pcb-model-import" data-model-import-status={modelImportState.status}>
        <div className="pcb-model-import-heading">
          <span>3D 模型</span>
          {component.modelAssetId && <small>已綁定模型</small>}
        </div>
        <label className={cn("pcb-upload-action", componentDisabled && "pointer-events-none opacity-50")}>
          <FileUp className="mr-1.5 h-3.5 w-3.5" />
          匯入 STP/STEP
          <input
            type="file"
            accept={PCB_MODEL_FILE_ACCEPT}
            className="sr-only"
            disabled={componentDisabled || !onImportModel}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) void handleModelFile(file);
            }}
          />
        </label>
        {modelImportState.status === "loading" && <p className="pcb-model-status">載入 STEP 模型中…</p>}
        {modelImportState.status === "error" && <p className="pcb-model-status is-error">{modelImportState.error}</p>}
        {modelImportState.status === "success" && modelImportState.metadata && (
          <p className="pcb-model-status is-success">
            已載入 {modelImportState.metadata.parts.length} 個零件，尺寸 {modelImportState.metadata.dimensions.widthMm} × {modelImportState.metadata.dimensions.depthMm} × {modelImportState.metadata.dimensions.heightMm} mm
          </p>
        )}
      </div>
      <SelectionActions workspace={workspace} />
    </div>
  );
}

function KeepoutInspector({
  workspace,
  keepout,
}: {
  workspace: PcbWorkspaceApi;
  keepout: PcbKeepout;
}) {
  const disabled = !workspace.canMutate;
  return (
    <div className="pcb-inspector-form" data-selection-kind="keepout">
      <h2>禁制區 · {keepout.name}</h2>
      <p className="pcb-inspector-note">框內拖曳可移動，拖曳四角可縮放；按 Delete 或下方按鈕可刪除。</p>
      <InspectorField label="禁制區名稱">
        <input key={keepout.name} defaultValue={keepout.name} disabled={disabled} onBlur={(event) => workspace.updateKeepout(keepout.id, { name: event.currentTarget.value.trim() || keepout.name })} />
      </InspectorField>
      <div className="pcb-inspector-field-grid">
        <NumberField label="X (mm)" value={keepout.x} disabled={disabled} onCommit={(x) => workspace.updateKeepout(keepout.id, { x })} />
        <NumberField label="Y (mm)" value={keepout.y} disabled={disabled} onCommit={(y) => workspace.updateKeepout(keepout.id, { y })} />
        <NumberField label="寬度 (mm)" value={keepout.width} disabled={disabled} onCommit={(width) => workspace.updateKeepout(keepout.id, { width })} />
        <NumberField label="高度 (mm)" value={keepout.height} disabled={disabled} onCommit={(height) => workspace.updateKeepout(keepout.id, { height })} />
        <NumberField label="旋轉 (°)" value={keepout.rotation ?? 0} disabled={disabled} onCommit={(rotation) => workspace.updateKeepout(keepout.id, { rotation })} />
        <InspectorField label="顏色">
          <input type="color" value={keepout.color} disabled={disabled} onChange={(event) => workspace.updateKeepout(keepout.id, { color: event.target.value })} />
        </InspectorField>
      </div>
      <SelectionActions workspace={workspace} />
    </div>
  );
}

function MeasurementInspector({
  workspace,
  measurement,
}: {
  workspace: PcbWorkspaceApi;
  measurement: PcbMeasurement;
}) {
  const disabled = !workspace.canMutate;
  return (
    <div className="pcb-inspector-form" data-selection-kind="measurement">
      <h2>量測長度</h2>
      <p className="pcb-measurement-value">
        {Math.hypot(measurement.x2 - measurement.x1, measurement.y2 - measurement.y1).toFixed(2)} mm
      </p>
      <div className="pcb-inspector-field-grid">
        <InspectorField label="顏色">
          <input type="color" value={measurement.color} disabled={disabled} onChange={(event) => workspace.updateMeasurement(measurement.id, { color: event.target.value })} />
        </InspectorField>
      </div>
      <SelectionActions workspace={workspace} />
    </div>
  );
}

export function PcbInspector({
  workspace,
  onImportModel,
}: {
  workspace: PcbWorkspaceApi;
  onImportModel?: (file: File, componentId: string) => Promise<PcbModelAssetMetadata>;
}) {
  const selected = workspace.selection && workspace.selectedObject;
  const activeTab = workspace.rightTab === "drc" ? "board" : workspace.rightTab;

  return (
    <aside className="pcb-inspector" data-testid="pcb-inspector" aria-label="PCB 屬性面板">
      <div className="pcb-inspector-tabs" role="tablist" aria-label="PCB 檢查器分頁">
        {(["board", "selection"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            className={cn(
              "pcb-inspector-tab",
              activeTab === tab && "is-active",
            )}
            onClick={() => workspace.setRightTab(tab)}
            aria-selected={activeTab === tab}
          >
            {tab === "board" ? "板設定" : "選取物"}
          </button>
        ))}
      </div>
      <div className="pcb-inspector-body">
        {activeTab === "board" && <BoardInspector workspace={workspace} />}
        {activeTab === "selection" && (
          !selected ? (
            <div className="py-8 text-center text-xs leading-5 text-slate-400">
              尚未選取物件。可在畫布選取元件、禁制區或測量線。
            </div>
          ) : workspace.selection?.kind === "component" ? (
            <ComponentInspector
              workspace={workspace}
              component={workspace.selectedObject as PcbPlacedComponent}
              onImportModel={onImportModel}
            />
          ) : workspace.selection?.kind === "keepout" ? (
            <KeepoutInspector workspace={workspace} keepout={workspace.selectedObject as PcbKeepout} />
          ) : (
            <MeasurementInspector workspace={workspace} measurement={workspace.selectedObject as PcbMeasurement} />
          )
        )}
      </div>
    </aside>
  );
}
