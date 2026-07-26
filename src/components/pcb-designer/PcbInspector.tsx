import { cn } from "@/lib/utils";
import type { PcbWorkspaceApi } from "./hooks/usePcbWorkspace.ts";

export function PcbInspector({
  workspace,
}: {
  workspace: PcbWorkspaceApi;
}) {
  return (
    <aside
      className="pcb-inspector"
      data-testid="pcb-inspector"
      aria-label="PCB 屬性與 DRC"
    >
      <div className="grid grid-cols-3 border-b border-[#2a526f]">
        {(["board", "selection", "drc"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            className={cn(
              "h-9 border-b-2 border-transparent text-xs text-slate-400",
              workspace.rightTab === tab
              && "border-[#39c6e8] bg-[#10263a] text-[#a8edf6]",
            )}
            onClick={() => workspace.setRightTab(tab)}
            aria-pressed={workspace.rightTab === tab}
          >
            {tab === "board"
              ? "板設定"
              : tab === "selection"
                ? "選取物"
                : `DRC ${workspace.drcIssues.length}`}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {workspace.rightTab === "board" && (
          <dl className="pcb-property-list">
            <div>
              <dt>板尺寸</dt>
              <dd>{workspace.activeProject.board.width} × {workspace.activeProject.board.height} mm</dd>
            </div>
            <div><dt>網格</dt><dd>{workspace.activeProject.board.gridSize} mm</dd></div>
            <div><dt>顯示網格</dt><dd>{workspace.activeProject.board.showGrid ? "是" : "否"}</dd></div>
            <div><dt>吸附網格</dt><dd>{workspace.activeProject.board.snapToGrid ? "是" : "否"}</dd></div>
            <div><dt>板色</dt><dd className="font-mono">{workspace.activeProject.board.background}</dd></div>
          </dl>
        )}
        {workspace.rightTab === "selection" && (
          <div className="py-8 text-center text-xs leading-5 text-slate-400">
            尚未選取物件。畫布接入後會在此顯示元件、禁制區或測量屬性。
          </div>
        )}
        {workspace.rightTab === "drc" && (
          workspace.drcIssues.length ? (
            <ul className="space-y-2">
              {workspace.drcIssues.map((issue) => (
                <li
                  key={issue.id}
                  className="rounded-lg border border-rose-300/20 bg-rose-950/15 p-2"
                >
                  <p className="font-mono text-[10px] text-rose-200">{issue.code}</p>
                  <p className="mt-1 text-xs text-slate-200">{issue.message}</p>
                  <p className="mt-1 text-[10px] text-slate-400">{issue.objectIds.join(", ")}</p>
                </li>
              ))}
            </ul>
          ) : (
            <div className="py-8 text-center text-xs text-emerald-200">
              目前沒有 DRC 問題。
            </div>
          )
        )}
      </div>
    </aside>
  );
}
