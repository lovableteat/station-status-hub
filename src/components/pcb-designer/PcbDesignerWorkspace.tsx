import { CircuitBoard } from "lucide-react";

export function PcbDesignerWorkspace() {
  return (
    <section
      className="pcb-designer-workspace flex h-full min-h-0 w-full items-center justify-center overflow-hidden bg-[#06111f] p-6 text-slate-100"
      data-testid="pcb-designer-workspace"
      aria-labelledby="pcb-designer-title"
    >
      <div className="max-w-md text-center">
        <CircuitBoard
          className="mx-auto h-12 w-12 text-emerald-300"
          aria-hidden="true"
        />
        <h1 id="pcb-designer-title" className="mt-4 text-2xl font-bold">
          PCB Designer
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          PCB 編輯工作區正在載入。
        </p>
      </div>
    </section>
  );
}
