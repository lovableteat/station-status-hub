import { useState, type ReactNode } from "react";
import { Copy, Crosshair, FileUp, Lock, LockOpen, RotateCw, ScanSearch, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PcbKeepout, PcbMeasurement, PcbModelAssetMetadata, PcbPlacedComponent } from "./types.ts";
import { PCB_MODEL_FILE_ACCEPT } from "./core/modelAssets.ts";
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
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!workspace.canMutate || !canDuplicate || Boolean(component?.locked)}
        onClick={workspace.duplicateSelected}
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
      </div>
      <label className="pcb-inspector-check">
        <input type="checkbox" checked={board.showGrid} disabled={disabled} onChange={(event) => workspace.updateBoard({ showGrid: event.target.checked })} />
        顯示網格
      </label>
      <label className="pcb-inspector-check">
        <input type="checkbox" checked={board.snapToGrid} disabled={disabled} onChange={(event) => workspace.updateBoard({ snapToGrid: event.target.checked })} />
        吸附網格
      </label>
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
        <NumberField label="X (mm)" value={component.x} disabled={componentDisabled} onCommit={(x) => workspace.updateComponent(component.instanceId, { x })} />
        <NumberField label="Y (mm)" value={component.y} disabled={componentDisabled} onCommit={(y) => workspace.updateComponent(component.instanceId, { y })} />
        <NumberField label="寬 (mm)" value={component.width} disabled={componentDisabled} onCommit={(width) => workspace.updateComponent(component.instanceId, { width })} />
        <NumberField label="高 (mm)" value={component.height} disabled={componentDisabled} onCommit={(height) => workspace.updateComponent(component.instanceId, { height })} />
        <NumberField label="最大高度" value={component.maxHeight} disabled={componentDisabled} onCommit={(maxHeight) => workspace.updateComponent(component.instanceId, { maxHeight })} />
        <NumberField label="旋轉 (°)" value={component.rotation} disabled={componentDisabled} step="90" onCommit={(rotation) => workspace.updateComponent(component.instanceId, { rotation })} />
      </div>
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
      <h2>測量</h2>
      <p className="pcb-measurement-value">
        {Math.hypot(measurement.x2 - measurement.x1, measurement.y2 - measurement.y1).toFixed(2)} mm
      </p>
      <div className="pcb-inspector-field-grid">
        <NumberField label="X1" value={measurement.x1} disabled={disabled} onCommit={(x1) => workspace.updateMeasurement(measurement.id, { x1 })} />
        <NumberField label="Y1" value={measurement.y1} disabled={disabled} onCommit={(y1) => workspace.updateMeasurement(measurement.id, { y1 })} />
        <NumberField label="X2" value={measurement.x2} disabled={disabled} onCommit={(x2) => workspace.updateMeasurement(measurement.id, { x2 })} />
        <NumberField label="Y2" value={measurement.y2} disabled={disabled} onCommit={(y2) => workspace.updateMeasurement(measurement.id, { y2 })} />
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
  const [severity, setSeverity] = useState<"all" | "error" | "warning">("all");
  const issues = workspace.drcIssues.filter((issue) => severity === "all" || issue.severity === severity);
  const selected = workspace.selection && workspace.selectedObject;

  return (
    <aside className="pcb-inspector" data-testid="pcb-inspector" aria-label="PCB 屬性與 DRC">
      <div className="pcb-inspector-tabs" role="tablist" aria-label="PCB 檢查器分頁">
        {(["board", "selection", "drc"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            className={cn(
              "pcb-inspector-tab",
              workspace.rightTab === tab && "is-active",
            )}
            onClick={() => workspace.setRightTab(tab)}
            aria-selected={workspace.rightTab === tab}
          >
            {tab === "board" ? "板設定" : tab === "selection" ? "選取物" : `DRC ${workspace.drcIssues.length}`}
          </button>
        ))}
      </div>
      <div className="pcb-inspector-body">
        {workspace.rightTab === "board" && <BoardInspector workspace={workspace} />}
        {workspace.rightTab === "selection" && (
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
        {workspace.rightTab === "drc" && (
          <div className="pcb-drc-panel">
            <div className="pcb-drc-controls">
              <select value={severity} onChange={(event) => setSeverity(event.target.value as typeof severity)} aria-label="篩選 DRC 嚴重度">
                <option value="all">全部嚴重度</option>
                <option value="error">錯誤</option>
                <option value="warning">警告</option>
              </select>
              <Button type="button" variant="outline" size="sm" onClick={workspace.runDrc}>
                <ScanSearch className="mr-1.5 h-3.5 w-3.5" />重新計算
              </Button>
            </div>
            {issues.length ? (
              <ul className="pcb-drc-list">
                {issues.map((issue) => (
                  <li key={issue.id}>
                    <button
                      type="button"
                      onClick={() => workspace.centerDrcIssue(issue.id)}
                      aria-label={`選取並置中 ${issue.code}`}
                    >
                      <span className="pcb-drc-row-heading">
                        <span>{issue.code}</span>
                        <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                      <span>{issue.message}</span>
                      <small>{issue.objectIds.join(", ")}</small>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="py-8 text-center text-xs text-emerald-200">
                {workspace.drcIssues.length ? "此篩選條件沒有問題。" : "目前沒有 DRC 問題。"}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
