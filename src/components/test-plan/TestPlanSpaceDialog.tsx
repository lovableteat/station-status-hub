import { type FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import type { TestPlanSpace } from "./types";

const SPACE_COLORS = [
  "#4c8dff",
  "#22d3ee",
  "#34d399",
  "#fbbf24",
  "#fb7185",
  "#a78bfa",
] as const;

export interface TestPlanSpaceInput {
  color: string;
  description: string;
  name: string;
}

interface TestPlanSpaceDialogProps {
  busy: boolean;
  error?: string | null;
  mode: "create" | "edit";
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: TestPlanSpaceInput) => Promise<void>;
  open: boolean;
  space?: TestPlanSpace | null;
}

export function TestPlanSpaceDialog({
  busy,
  error,
  mode,
  onOpenChange,
  onSubmit,
  open,
  space,
}: TestPlanSpaceDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<string>(SPACE_COLORS[0]);

  useEffect(() => {
    if (!open) return;
    setName(mode === "edit" ? space?.name ?? "" : "");
    setDescription(mode === "edit" ? space?.description ?? "" : "");
    setColor(mode === "edit" ? space?.color ?? SPACE_COLORS[0] : SPACE_COLORS[0]);
  }, [mode, open, space]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    await onSubmit({
      name: name.trim(),
      description: description.trim(),
      color,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-[#2a526f] bg-[#0b1e30] text-[#f3f8fc] sm:max-w-lg">
        <form className="space-y-5" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{mode === "create" ? "建立資料空間" : "編輯資料空間"}</DialogTitle>
            <DialogDescription>
              用空間區分板版、專案或測試階段，之後仍可修改。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="test-plan-space-name">空間名稱</Label>
            <Input
              id="test-plan-space-name"
              autoFocus
              maxLength={120}
              value={name}
              placeholder="例如：VR NLV72 EVT"
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="test-plan-space-description">空間說明</Label>
            <Textarea
              id="test-plan-space-description"
              maxLength={300}
              rows={3}
              value={description}
              placeholder="記錄板版、用途、負責團隊或交付階段（選填）"
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">識別色</legend>
            <div className="flex flex-wrap gap-2">
              {SPACE_COLORS.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-label={`選擇識別色 ${option}`}
                  aria-pressed={color === option}
                  className={cn(
                    "h-9 w-9 rounded-lg border-2 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300",
                    color === option
                      ? "scale-105 border-white"
                      : "border-transparent hover:scale-105",
                  )}
                  style={{ backgroundColor: option }}
                  onClick={() => setColor(option)}
                />
              ))}
            </div>
          </fieldset>

          {error ? (
            <div
              role="alert"
              className="rounded-xl border border-rose-400/35 bg-rose-500/10 px-4 py-3 text-sm leading-6 text-rose-100"
            >
              <strong className="block font-semibold">資料空間未儲存</strong>
              <span>{error}</span>
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? "儲存中…" : mode === "create" ? "建立空間" : "儲存空間"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
