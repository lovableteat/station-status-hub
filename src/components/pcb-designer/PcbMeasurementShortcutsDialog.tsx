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
            選取量測線後，按 Shift 加上設定的字母即可翻轉。設定保留在此瀏覽器。
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (workspace.configureMeasurementShortcuts(draft)) onClose();
          }}
        >
          {(["horizontal", "vertical"] as const).map((axis) => (
            <div key={axis} className="grid gap-2">
              <Label htmlFor={`measurement-shortcut-${axis}`}>
                {axis === "horizontal" ? "左右翻轉" : "上下翻轉"}
              </Label>
              <select
                id={`measurement-shortcut-${axis}`}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={draft[axis]}
                onChange={(event) =>
                  setDraft({ ...draft, [axis]: event.target.value })
                }
              >
                {"abcdefghijklmnopqrstuvwxyz".split("").map((key) => (
                  <option key={key} value={key}>
                    Shift+{key.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          ))}
          {!valid && (
            <p role="alert" className="text-sm text-destructive">
              上下與左右翻轉請使用不同快捷鍵。
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            方向鍵可移動整條線；Shift＋方向鍵微調 0.1
            mm。翻轉以線段中心為軸，水平或垂直線的外觀可能相同。
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
