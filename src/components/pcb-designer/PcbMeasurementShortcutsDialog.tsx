import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_MEASUREMENT_SHORTCUTS,
  validMeasurementShortcuts,
  MEASUREMENT_SHORTCUT_OPTIONS,
  measurementShortcutLabel,
} from "./core/measurementShortcuts.ts";
import type { PcbWorkspaceApi } from "./hooks/usePcbWorkspace.ts";

export function PcbMeasurementShortcutsDialog({
  workspace,
  onClose,
}: {
  workspace: PcbWorkspaceApi;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState({ ...workspace.measurementShortcuts });
  const valid = validMeasurementShortcuts(draft);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const id = workspace.selection?.id;
          if (id)
            document
              .querySelector<SVGElement>(
                `[data-pcb-object-id="${CSS.escape(id)}"]`,
              )
              ?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>量測線快捷鍵</DialogTitle>
          <DialogDescription>
            選取量測線後，按設定的快捷鍵即可旋轉 90°。預設 R 順時針、Shift+R
            逆時針。設定保留在此瀏覽器。
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (workspace.configureMeasurementShortcuts(draft)) onClose();
          }}
        >
          {(["clockwise", "counterclockwise"] as const).map((direction) => (
            <div key={direction} className="grid gap-2">
              <Label htmlFor={`measurement-shortcut-${direction}`}>
                {direction === "clockwise"
                  ? "順時針旋轉 90°"
                  : "逆時針旋轉 90°"}
              </Label>
              <select
                id={`measurement-shortcut-${direction}`}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={draft[direction]}
                onChange={(event) =>
                  setDraft({ ...draft, [direction]: event.target.value })
                }
              >
                {MEASUREMENT_SHORTCUT_OPTIONS.map((key) => (
                  <option key={key} value={key}>
                    {measurementShortcutLabel(key)}
                  </option>
                ))}
              </select>
            </div>
          ))}
          {!valid && (
            <p role="alert" className="text-sm text-destructive">
              順時針與逆時針旋轉請使用不同快捷鍵。
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            方向鍵可移動整條線；Shift＋方向鍵微調 0.1 mm。每次以線段中心旋轉
            90°，長度保持不變。
          </p>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDraft({ ...DEFAULT_MEASUREMENT_SHORTCUTS })}
            >
              恢復預設
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button type="submit" disabled={!valid}>
              儲存快捷鍵
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
