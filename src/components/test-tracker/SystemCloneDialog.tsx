import { useEffect, useMemo, useState } from "react";
import { Copy, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
import { useToast } from "@/hooks/use-toast";

import { cloneSystemSeries } from "./cloneSystemSeries";
import {
  buildSystemSeriesNames,
  parseSystemSequence,
  SYSTEM_CLONE_LIMIT,
} from "./systemClone.mjs";

interface CloneSourceSystem {
  id: string;
  system_name: string;
}

interface SystemCloneDialogProps {
  onCloned: () => Promise<void> | void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  sourceSystem: CloneSourceSystem | null;
}

function getCloneErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "無法建立連號機台，請稍後再試。";

  const message = error.message.toLowerCase();
  if (message.includes("23505") || message.includes("duplicate") || message.includes("unique")) {
    return "其中一個機台名稱已存在，請調整起始號碼或名稱前綴。";
  }
  return error.message;
}

export function SystemCloneDialog({
  onCloned,
  onOpenChange,
  open,
  sourceSystem,
}: SystemCloneDialogProps) {
  const [prefix, setPrefix] = useState("");
  const [startNumber, setStartNumber] = useState(1);
  const [count, setCount] = useState(5);
  const [padding, setPadding] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open || !sourceSystem) return;
    const sequence = parseSystemSequence(sourceSystem.system_name);
    setPrefix(sequence.prefix);
    setStartNumber(sequence.startNumber);
    setCount(sequence.count);
    setPadding(sequence.padding);
  }, [open, sourceSystem]);

  const preview = useMemo(() => {
    try {
      return {
        error: "",
        names: buildSystemSeriesNames({ count, padding, prefix, startNumber }),
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "請確認連號設定。",
        names: [] as string[],
      };
    }
  }, [count, padding, prefix, startNumber]);

  const handleSubmit = async () => {
    if (!sourceSystem || !preview.names.length || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const createdSystems = await cloneSystemSeries({
        sourceSystemId: sourceSystem.id,
        systemNames: preview.names,
      });
      await onCloned();
      toast({
        title: `已建立 ${createdSystems.length} 台連號機台`,
        description: `${createdSystems[0].system_name} ～ ${createdSystems.at(-1)?.system_name}`,
      });
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to clone sequential machines", error);
      toast({
        title: "連號機台建立失敗",
        description: getCloneErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !isSubmitting && onOpenChange(nextOpen)}>
      <DialogContent className="max-w-xl overflow-hidden border-[#2f5d7c] bg-[#081a2a] p-0 text-[#f3f8fc]">
        <DialogHeader className="border-b border-[#24465f] bg-gradient-to-r from-[#102d46] to-[#0a2033] px-6 py-5 text-left">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-300/30 bg-cyan-300/10 text-cyan-200">
              <Copy className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <DialogTitle className="text-xl">批次複製連號機台</DialogTitle>
              <DialogDescription className="mt-1 text-[#a8c0d1]">
                以 {sourceSystem?.system_name || "目前機台"} 為範本，連續建立下一批機台。
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 px-6 py-5">
          <div className="grid gap-4 sm:grid-cols-[1fr_132px_132px]">
            <div className="space-y-2">
              <Label htmlFor="clone-prefix">名稱前綴</Label>
              <Input
                id="clone-prefix"
                value={prefix}
                onChange={(event) => setPrefix(event.target.value)}
                disabled={isSubmitting}
                className="border-[#315b78] bg-[#10263a] text-[#f3f8fc]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clone-start">起始號碼</Label>
              <Input
                id="clone-start"
                type="number"
                min={0}
                step={1}
                value={startNumber}
                onChange={(event) => setStartNumber(Number(event.target.value))}
                disabled={isSubmitting}
                className="border-[#315b78] bg-[#10263a] text-[#f3f8fc]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clone-count">建立數量</Label>
              <Input
                id="clone-count"
                type="number"
                min={1}
                max={SYSTEM_CLONE_LIMIT}
                step={1}
                value={count}
                onChange={(event) => setCount(Number(event.target.value))}
                disabled={isSubmitting}
                className="border-[#315b78] bg-[#10263a] text-[#f3f8fc]"
              />
            </div>
          </div>

          <section className="rounded-xl border border-[#315b78] bg-[#061522] p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-cyan-100">名稱預覽</h3>
              <Badge variant="outline" className="border-cyan-300/30 bg-cyan-300/10 text-cyan-100">
                {preview.names.length} 台
              </Badge>
            </div>
            {preview.error ? (
              <p className="text-sm text-rose-300">{preview.error}</p>
            ) : (
              <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto pr-1">
                {preview.names.map((name) => (
                  <span
                    key={name}
                    className="rounded-lg border border-[#326487] bg-[#102b43] px-2.5 py-1.5 font-mono text-xs text-[#e9f7ff]"
                  >
                    {name}
                  </span>
                ))}
              </div>
            )}
          </section>

          <div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.07] px-4 py-3 text-xs leading-5 text-[#c9d8e3]">
            會複製流程版本、工程師、進度、狀態與備註；不複製序號、硬體位址、問題附件、實際計時及完成時間。
          </div>
        </div>

        <DialogFooter className="border-t border-[#24465f] bg-[#071624] px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="border-[#315b78] bg-transparent text-[#c9d8e3]"
          >
            取消
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || Boolean(preview.error) || preview.names.length === 0}
            className="bg-cyan-400 font-semibold text-[#032031] hover:bg-cyan-300"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                正在建立
              </>
            ) : (
              <>
                <Copy className="mr-2 h-4 w-4" />
                複製進度並建立
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
