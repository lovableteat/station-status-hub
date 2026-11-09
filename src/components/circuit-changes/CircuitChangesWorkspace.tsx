import { useEffect, useState } from "react";
import { CircuitChangesDialog } from "./CircuitChangesDialog";
import { CircuitPdfAiReviewSession } from "./CircuitPdfAiReviewSession";
import { useCircuitChanges } from "./useCircuitChanges";
import { useCircuitPdfs } from "./useCircuitPdfs";
import type { CircuitChangeContext } from "./types";

export default function CircuitChangesWorkspace({ open, onOpenChange, context, canEdit, userId, userName }: {
  open: boolean; onOpenChange: (open: boolean) => void; context: CircuitChangeContext;
  canEdit: boolean; userId: string; userName: string;
}) {
  const model = useCircuitChanges({ open, context, canEdit, userId, userName });
  const pdfs = useCircuitPdfs({ open, seriesId: context.seriesId, canEdit, userId, userName });
  const [aiOpen, setAiOpen] = useState(false);
  useEffect(() => { setAiOpen(false); }, [open, context.seriesId, userId]);
  return <><CircuitChangesDialog open={open} onOpenChange={onOpenChange} context={context} canEdit={canEdit} model={model} pdfs={pdfs} onAiReview={() => setAiOpen(true)} />
    <CircuitPdfAiReviewSession open={open && aiOpen} onOpenChange={setAiOpen} seriesId={context.seriesId} userId={userId} userName={userName} canEdit={canEdit} pdfs={pdfs} /></>;
}
