import { useEffect, useState } from "react";
import { CircuitChangesDialog } from "./CircuitChangesDialog";
import { CircuitPdfAiReviewSession } from "./CircuitPdfAiReviewSession";
import { useCircuitChanges } from "./useCircuitChanges";
import { useCircuitPdfs } from "./useCircuitPdfs";
import { useCircuitPdfInk } from "./useCircuitPdfInk";
import { readCircuitTask, writeCircuitTask, type CircuitChangeContext, type CircuitTask } from "./types";

export default function CircuitChangesWorkspace({ open, onOpenChange, context, canEdit, userId, userName }: {
  open: boolean; onOpenChange: (open: boolean) => void; context: CircuitChangeContext;
  canEdit: boolean; userId: string; userName: string;
}) {
  // The four jobs people open this window for; the last one used comes back next time on this browser.
  const [task, setTask] = useState<CircuitTask>(readCircuitTask);
  const model = useCircuitChanges({ open, context, canEdit, userId, userName });
  const pdfs = useCircuitPdfs({ open, seriesId: context.seriesId, canEdit, userId, userName, autoCompareOfficial: task === "ai" });
  const pdfInk = useCircuitPdfInk({ open, seriesId: context.seriesId, canEdit, userId, userName });
  const [aiOpen, setAiOpen] = useState(false);
  useEffect(() => { setAiOpen(false); }, [open, context.seriesId, userId]);
  const changeTask = (next: CircuitTask) => { setTask(next); writeCircuitTask(next); };
  return <><CircuitChangesDialog open={open} onOpenChange={onOpenChange} context={context} canEdit={canEdit} model={model} pdfs={pdfs} pdfInk={pdfInk}
    task={task} onTaskChange={changeTask} onAiReview={() => setAiOpen(true)} />
    <CircuitPdfAiReviewSession open={open && aiOpen} onOpenChange={setAiOpen} seriesId={context.seriesId} userId={userId} userName={userName} canEdit={canEdit} pdfs={pdfs} /></>;
}
