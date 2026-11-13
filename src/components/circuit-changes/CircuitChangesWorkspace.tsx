import { useEffect, useState } from "react";
import { CircuitChangesDialog } from "./CircuitChangesDialog";
import { CircuitPdfAiReviewSession } from "./CircuitPdfAiReviewSession";
import { useCircuitChanges } from "./useCircuitChanges";
import { useCircuitPdfs } from "./useCircuitPdfs";
import { useCircuitPdfInk } from "./useCircuitPdfInk";
import { useCircuitPdfAiResults } from "./useCircuitPdfAiResults";
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
  // A mark clicked on the drawing opens the review with that finding unfolded; closing the review reads the results again.
  const [aiFocus, setAiFocus] = useState("");
  const [aiRound, setAiRound] = useState(0);
  useEffect(() => { setAiOpen(false); setAiFocus(""); }, [open, context.seriesId, userId]);
  const aiResults = useCircuitPdfAiResults({ open: open && task === "ai", seriesId: context.seriesId, baselineId: pdfs.compare?.id, workingId: pdfs.active?.id,
    workingPages: pdfs.active?.pages || 0, comparePageFor: pdfs.comparePageFor, alignmentKey: pdfs.alignmentKey, refresh: aiRound });
  const changeTask = (next: CircuitTask) => { setTask(next); writeCircuitTask(next); };
  const changeAiOpen = (next: boolean) => { setAiOpen(next); if (!next) { setAiFocus(""); setAiRound(value => value + 1); } };
  return <><CircuitChangesDialog open={open} onOpenChange={onOpenChange} context={context} canEdit={canEdit} model={model} pdfs={pdfs} pdfInk={pdfInk}
    task={task} onTaskChange={changeTask} onAiReview={findingId => { setAiFocus(findingId || ""); setAiOpen(true); }} aiResults={aiResults} />
    <CircuitPdfAiReviewSession open={open && aiOpen} onOpenChange={changeAiOpen} seriesId={context.seriesId} userId={userId} userName={userName} canEdit={canEdit} pdfs={pdfs} focusFinding={aiFocus || undefined} /></>;
}
