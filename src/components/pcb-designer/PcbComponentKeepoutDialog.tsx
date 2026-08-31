import { useState } from "react";
import { ShieldBan } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_COMPONENT_KEEPOUT, getComponentKeepoutBounds, isValidComponentKeepout, KEEPOUT_SIDES, KEEPOUT_SIDE_LABELS } from "./core/componentKeepout.ts";
import type { PcbWorkspaceApi } from "./hooks/usePcbWorkspace.ts";
import type { PcbComponentKeepout, PcbPlacedComponent } from "./types.ts";

export function PcbComponentKeepoutDialog({ component, workspace, onClose }: {
  component: PcbPlacedComponent;
  workspace: PcbWorkspaceApi;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => Object.fromEntries(
    KEEPOUT_SIDES.map((side) => [side, String((component.keepout ?? DEFAULT_COMPONENT_KEEPOUT)[side])]),
  ) as Record<keyof PcbComponentKeepout, string>);
  const [error, setError] = useState("");
  const margins = Object.fromEntries(KEEPOUT_SIDES.map((side) => [side, draft[side].trim() === "" ? NaN : Number(draft[side])])) as unknown as PcbComponentKeepout;
  const valid = isValidComponentKeepout(margins);
  const bounds = getComponentKeepoutBounds({ ...component, keepout: valid ? margins : DEFAULT_COMPONENT_KEEPOUT })!;
  const padding = Math.max(bounds.width, bounds.height) * 0.12;
  const disabled = !workspace.canMutate || component.locked;
  const apply = (keepout: PcbComponentKeepout | undefined) => {
    if (disabled) return;
    if (JSON.stringify(component.keepout) === JSON.stringify(keepout)) { onClose(); return; }
    if (workspace.updateComponent(component.instanceId, { keepout })) onClose();
    else setError("無法更新，請確認元件未鎖定且仍可編輯。");
  };
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="pcb-component-keepout-dialog" onCloseAutoFocus={(event) => {
        event.preventDefault();
        document.querySelector<SVGElement>(`[data-pcb-object-id="${CSS.escape(component.instanceId)}"]`)?.focus();
      }}>
        <DialogHeader>
          <DialogTitle>設定元件禁制區 · {component.reference}</DialogTitle>
          <DialogDescription>各側從元件邊緣向外延伸，單位 mm。禁制區跟隨元件移動與旋轉，只限制同層的其他元件。</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); if (valid) apply(margins); }}>
          <div className="pcb-component-keepout-preview">
            <svg role="img" aria-label="四側禁制區範圍預覽（元件未旋轉方向）" viewBox={`${bounds.x - padding} ${bounds.y - padding} ${bounds.width + padding * 2} ${bounds.height + padding * 2}`}>
              <rect {...bounds} className="pcb-component-keepout-outline" vectorEffect="non-scaling-stroke" />
              <rect x={-component.width / 2} y={-component.height / 2} width={component.width} height={component.height} fill={component.color} />
              <text x="0" y="0" dominantBaseline="middle" textAnchor="middle" fontSize={Math.min(component.width, component.height) / 3} className="pcb-svg-label">{component.reference}</text>
            </svg>
            <span>元件本身方向 · 旋轉 {component.rotation}° 後會一起轉動</span>
          </div>
          <fieldset className="grid grid-cols-2 gap-3" disabled={disabled}>
            <legend className="sr-only">四側延伸距離</legend>
            {KEEPOUT_SIDES.map((side) => (
              <div className="flex flex-col gap-2" key={side}>
                <Label htmlFor={`component-keepout-${side}`}>{KEEPOUT_SIDE_LABELS[side]} (mm)</Label>
                <Input id={`component-keepout-${side}`} type="number" min="0" step="any" required value={draft[side]}
                  aria-invalid={draft[side].trim() === "" || !Number.isFinite(Number(draft[side])) || Number(draft[side]) < 0}
                  onChange={(event) => { const value = event.target.value; setDraft((current) => ({ ...current, [side]: value })); }} />
              </div>
            ))}
          </fieldset>
          <p className="text-sm text-muted-foreground">設為 0 表示該側不向外延伸。套用後可拖曳畫布上的四側控制點，Ctrl+Z 可復原。</p>
          {!valid && <p role="alert" className="text-sm text-destructive">四側距離必須是大於或等於 0 的有效數值。</p>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="gap-2">
            {component.keepout && <Button type="button" variant="destructive" disabled={disabled} onClick={() => apply(undefined)}>移除禁制區</Button>}
            <Button type="button" variant="outline" onClick={onClose}>取消</Button>
            <Button type="submit" disabled={disabled || !valid}><ShieldBan data-icon="inline-start" />套用禁制區</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
