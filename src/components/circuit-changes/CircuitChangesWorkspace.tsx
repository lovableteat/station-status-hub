import { CircuitChangesDialog } from "./CircuitChangesDialog";
import { useCircuitChanges } from "./useCircuitChanges";
import type { CircuitChangeContext } from "./types";

export default function CircuitChangesWorkspace({ open, onOpenChange, context, canEdit, userId, userName }: {
  open: boolean; onOpenChange: (open: boolean) => void; context: CircuitChangeContext;
  canEdit: boolean; userId: string; userName: string;
}) {
  const model = useCircuitChanges({ open, context, canEdit, userId, userName });
  return <CircuitChangesDialog open={open} onOpenChange={onOpenChange} context={context} canEdit={canEdit} model={model} />;
}
