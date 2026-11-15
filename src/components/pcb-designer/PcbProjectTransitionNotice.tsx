import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PcbWorkspaceApi } from "./hooks/usePcbWorkspace.ts";

export function PcbProjectTransitionNotice({ workspace }: { workspace: PcbWorkspaceApi }) {
  const transition = workspace.projectTransition;
  const otherDrafts = workspace.data.projects.filter(project => project.id !== workspace.activeProject.id
    && workspace.dirtyProjectIds.includes(project.id));
  return <>
    {transition?.status === "saving" && <div role="status" className="pcb-transition-notice">
      正在儲存 {transition.projectName}…
    </div>}
    {otherDrafts.length > 0 && <div className="pcb-transition-notice" aria-label="尚未儲存的板子">
      <span>以下板子的修改仍在此瀏覽器，請逐一開啟並儲存：</span>
      {otherDrafts.map(project => <Button key={project.id} variant="outline" size="sm"
        disabled={workspace.transitionBusy} onClick={() => void workspace.openProject(project.id)}>{project.name}</Button>)}
    </div>}
    <Dialog open={transition?.status === "failed"} onOpenChange={open => { if (!open) workspace.cancelProjectTransition(); }}>
      <DialogContent className="max-w-lg" onPointerDownOutside={event => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{transition?.projectName} 還沒存到雲端</DialogTitle>
          <DialogDescription>{transition?.error}</DialogDescription>
        </DialogHeader>
        {!workspace.canDiscardProjectTransition && <p className="text-sm text-amber-300">尚未取得這塊板子的已儲存版本，暫時無法放棄修改。請重試儲存或取消。</p>}
        <DialogFooter className="gap-2 sm:flex-wrap">
          <Button variant="outline" onClick={workspace.cancelProjectTransition}>取消</Button>
          <Button variant="destructive" disabled={!workspace.canDiscardProjectTransition}
            onClick={workspace.discardProjectTransition}>不儲存，直接換板</Button>
          <Button onClick={() => void workspace.retryProjectTransition()}>重試儲存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
