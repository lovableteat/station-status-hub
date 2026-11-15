import { useEffect, useId, useRef, useState } from "react";
import type { PcbPlacedComponent } from "./types.ts";
import type { PcbWorkspaceApi } from "./hooks/usePcbWorkspace.ts";
import { isWithinBoard, roundPosition } from "./core/geometry.ts";

function CoordinateField({ axis, component, workspace }: {
  axis: "x" | "y";
  component: PcbPlacedComponent;
  workspace: PcbWorkspaceApi;
}) {
  const value = component[axis];
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState("");
  const committed = useRef(value);
  const errorId = useId();
  const disabled = !workspace.canMutate || component.locked;
  useEffect(() => {
    committed.current = value;
    setDraft(String(value));
    setError("");
  }, [value, component.instanceId]);

  const commit = () => {
    if (disabled) return;
    if (!draft.trim() || !Number.isFinite(Number(draft))) {
      setError("請輸入有效的毫米座標。");
      return;
    }
    const next = roundPosition(Number(draft));
    if (!Number.isFinite(next)) {
      setError("座標數值過大，請輸入可表示的毫米座標。");
      return;
    }
    if (next !== committed.current) {
      const result = workspace.moveComponent(component.instanceId, { x: component.x, y: component.y, [axis]: next }, true);
      if (result.ok === false) {
        setError(result.reason);
        return;
      }
      // Enter and the following blur share the same committed value before React renders.
      committed.current = next;
    }
    setDraft(String(next));
    setError("");
  };

  return <label className="pcb-inspector-field">
    <span>中心 {axis.toUpperCase()} (mm)</span>
    <input type="number" step="0.0001" value={draft} disabled={disabled}
      title={component.locked ? "元件已鎖定，先解除鎖定才能移動" : !workspace.canMutate ? "目前沒有編輯權限或文件已鎖定" : "輸入元件中心座標，按 Enter 或離開欄位套用，不套用網格吸附"}
      aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined}
      onChange={event => { setDraft(event.currentTarget.value); setError(""); }}
      onBlur={commit}
      onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); commit(); } }} />
    {error && <span id={errorId} className="pcb-field-error" role="alert">{error}</span>}
  </label>;
}

export function PcbComponentCoordinates({ workspace, component }: {
  workspace: PcbWorkspaceApi;
  component: PcbPlacedComponent;
}) {
  return <div>
    <div className="pcb-inspector-field-grid">
      <CoordinateField axis="x" component={component} workspace={workspace} />
      <CoordinateField axis="y" component={component} workspace={workspace} />
    </div>
    {!isWithinBoard(component, workspace.activeProject.board) && <p className="pcb-field-warning" role="status">
      已套用；與畫布拖曳相同，允許超出板框，請依檢查結果調整。
    </p>}
  </div>;
}
