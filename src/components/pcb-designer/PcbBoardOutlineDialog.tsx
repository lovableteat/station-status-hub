import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { boardNodesPath, outlineError, sampleBoardNodes } from "./core/boardOutline.ts";
import { snapPoint } from "./core/geometry.ts";
import type { PcbOutlineNode, PcbPoint } from "./types.ts";
import type { PcbWorkspaceApi } from "./hooks/usePcbWorkspace.ts";

type Draft = { nodes: PcbOutlineNode[]; closed: boolean };
export function PcbBoardOutlineDialog({ workspace, onClose }: { workspace: PcbWorkspaceApi; onClose: () => void }) {
  const board = workspace.activeProject.board;
  const [draft, setDraft] = useState<Draft>(() => ({ nodes: structuredClone(board.outlineNodes ?? []), closed: Boolean(board.outlineNodes?.length) }));
  const [past, setPast] = useState<Draft[]>([]), [future, setFuture] = useState<Draft[]>([]);
  const [selected, setSelected] = useState<number | null>(null), [error, setError] = useState("");
  const [x, setX] = useState("0"), [y, setY] = useState("0");
  useEffect(() => {
    if (selected !== null && draft.nodes[selected]) { setX(String(draft.nodes[selected].x)); setY(String(draft.nodes[selected].y)); }
  }, [selected, draft.nodes]);
  const drag = useRef<{ index: number; slot: string; origin: PcbOutlineNode; start: PcbPoint } | null>(null);
  const padding = Math.max(board.width, board.height) * 0.06;
  const commit = (next: Draft) => { setPast([...past.slice(-99), draft]); setFuture([]); setDraft(next); setError(""); };
  const undo = () => { if (!past.length) return; setFuture([draft, ...future]); setDraft(past[past.length - 1]); setPast(past.slice(0, -1)); setSelected(null); };
  const redo = () => { if (!future.length) return; setPast([...past, draft]); setDraft(future[0]); setFuture(future.slice(1)); setSelected(null); };
  const moveNode = (n: PcbOutlineNode, dx: number, dy: number): PcbOutlineNode => ({ x: n.x + dx, y: n.y + dy,
    ...(n.in && { in: { x: n.in.x + dx, y: n.in.y + dy } }), ...(n.out && { out: { x: n.out.x + dx, y: n.out.y + dy } }) });
  const add = (p: PcbPoint) => {
    if (draft.closed || !workspace.canMutate) return;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.y < 0 || p.x > board.width || p.y > board.height) { setError("頂點必須在板框尺寸內。"); return; }
    if (draft.nodes.length >= 100) { setError("最多 100 個節點。"); return; }
    commit({ ...draft, nodes: [...draft.nodes, p] }); setSelected(draft.nodes.length);
  };
  const remove = () => { if (selected === null) return; const nodes = draft.nodes.filter((_, i) => i !== selected); commit({ nodes, closed: draft.closed && nodes.length >= 3 }); setSelected(null); };
  const pointFor = (svg: SVGSVGElement, clientX: number, clientY: number, alt: boolean): PcbPoint => {
    const matrix = svg.getScreenCTM(); if (!matrix) return { x: 0, y: 0 };
    const p = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    const q = board.snapToGrid ? snapPoint(p, board.gridSize, alt) : p;
    return { x: Math.round(q.x * 1000) / 1000, y: Math.round(q.y * 1000) / 1000 };
  };
  const apply = () => {
    const points = sampleBoardNodes(draft.nodes), message = outlineError(points, board);
    if (message) { setError(message); return; }
    if (workspace.updateBoard({ outline: [[...points, { ...points[0] }]], outlineNodes: draft.nodes, outlineSource: "手繪板框" })) onClose();
    else setError("無法套用，請確認目前仍可編輯。");
  };
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="max-w-4xl max-h-[94dvh] overflow-y-auto" onKeyDown={e => {
      if ((e.target as HTMLElement).matches("input,textarea")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.stopPropagation(); if (e.shiftKey) redo(); else undo(); }
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); e.stopPropagation(); remove(); }
    }}>
      <DialogHeader><DialogTitle>板框鋼筆編輯器</DialogTitle><DialogDescription>點一下畫直線；按住拖曳拉出曲線把手；點回起點封閉。封閉後可拖動節點與把手。完成才套入主畫面，取消保留原板。</DialogDescription></DialogHeader>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={!past.length} onClick={undo}>復原</Button><Button variant="outline" disabled={!future.length} onClick={redo}>重做</Button>
        <Button variant="outline" onClick={() => { commit({ nodes: [], closed: false }); setSelected(null); }}>重新繪製</Button>
        <Button variant="outline" onClick={() => { commit({ nodes: [{ x: 0, y: 0 }, { x: board.width, y: 0 }, { x: board.width, y: board.height }, { x: 0, y: board.height }], closed: true }); setSelected(null); }}>矩形起稿</Button>
        <Button variant="outline" disabled={selected === null} onClick={remove}>刪除節點</Button>
        <Button variant="outline" disabled={selected === null} onClick={() => commit({ ...draft, nodes: draft.nodes.map((p, i) => i === selected ? { x: p.x, y: p.y } : p) })}>轉為尖角</Button>
        <Button variant="outline" disabled={selected === null || draft.nodes.length < 2} onClick={() => {
          if (selected === null) return;
          const before = draft.nodes[(selected + draft.nodes.length - 1) % draft.nodes.length], after = draft.nodes[(selected + 1) % draft.nodes.length];
          const dx = (after.x - before.x) / 6, dy = (after.y - before.y) / 6;
          commit({ ...draft, nodes: draft.nodes.map((p, i) => i === selected ? { ...p, in: { x: p.x - dx, y: p.y - dy }, out: { x: p.x + dx, y: p.y + dy } } : p) });
        }}>轉為曲線</Button>
        <Button variant="outline" disabled={selected === null || draft.nodes.length < 2 || draft.nodes.length >= 100} onClick={() => {
          if (selected === null) return;
          const i = selected, j = (i + 1) % draft.nodes.length; if (!draft.closed && j === 0) return;
          const a = draft.nodes[i], b = draft.nodes[j], c = a.out ?? a, d = b.in ?? b;
          const mid = (p: PcbPoint, q: PcbPoint) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
          const ac = mid(a, c), cd = mid(c, d), db = mid(d, b), left = mid(ac, cd), right = mid(cd, db);
          const nodes = [...draft.nodes]; nodes[i] = { ...a, out: ac }; nodes[j] = { ...b, in: db };
          nodes.splice(i + 1, 0, { ...mid(left, right), in: left, out: right }); commit({ ...draft, nodes }); setSelected(i + 1);
        }}>下一段插入節點</Button>
      </div>
      <svg viewBox={`${-padding} ${-padding} ${board.width + padding * 2} ${board.height + padding * 2}`} className="w-full h-[min(48vh,460px)] rounded-lg border border-cyan-700 bg-slate-950 touch-none focus:outline focus:outline-2 focus:outline-cyan-300" role="img" aria-label="板框鋼筆畫布" tabIndex={0}
        onPointerDown={e => {
          if (e.button !== 0 || !workspace.canMutate) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const p = pointFor(e.currentTarget, e.clientX, e.clientY, e.altKey), target = (e.target as Element).closest("[data-node]");
          if (target) {
            const index = Number(target.getAttribute("data-node"));
            if (index === 0 && !draft.closed && draft.nodes.length >= 3) { commit({ ...draft, closed: true }); return; }
            setSelected(index); setPast([...past.slice(-99), draft]); setFuture([]);
            drag.current = { index, slot: target.getAttribute("data-slot")!, origin: structuredClone(draft.nodes[index]), start: p };
          } else if (!draft.closed && draft.nodes.length < 100 && p.x >= 0 && p.y >= 0 && p.x <= board.width && p.y <= board.height) {
            add(p); drag.current = { index: draft.nodes.length, slot: "new", origin: p, start: p };
          }
        }} onPointerMove={e => {
          const active = drag.current; if (!active) return;
          const p = pointFor(e.currentTarget, e.clientX, e.clientY, e.altKey);
          setDraft(current => ({ ...current, nodes: current.nodes.map((n, i) => {
            if (i !== active.index) return n; const a = active.origin;
            if (active.slot === "new") return Math.hypot(p.x - a.x, p.y - a.y) < 0.1 ? a : { ...a, out: p, in: { x: 2 * a.x - p.x, y: 2 * a.y - p.y } };
            return active.slot === "node" ? moveNode(a, p.x - active.start.x, p.y - active.start.y) : { ...n, [active.slot]: p };
          }) }));
        }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
        <rect width={board.width} height={board.height} fill="#122536" stroke="#496477" strokeWidth={padding / 12} />
        {board.showGrid && <><defs><pattern id="outline-editor-grid" width={board.gridSize} height={board.gridSize} patternUnits="userSpaceOnUse"><path d={`M ${board.gridSize} 0 L 0 0 0 ${board.gridSize}`} fill="none" stroke="#76b8ca" strokeOpacity="0.25" strokeWidth="0.15" /></pattern></defs><rect width={board.width} height={board.height} fill="url(#outline-editor-grid)" /></>}
        <path d={boardNodesPath(draft.nodes, draft.closed)} fill={draft.closed ? "#28c7b844" : "none"} stroke="#5eead4" strokeWidth={padding / 7} />
        {draft.nodes.map((p, i) => <g key={i}>
          {i === selected && (["in", "out"] as const).map(slot => p[slot] && <g key={slot}><line x1={p.x} y1={p.y} x2={p[slot]!.x} y2={p[slot]!.y} stroke="#c4b5fd" strokeWidth={padding / 12} /><circle data-node={i} data-slot={slot} cx={p[slot]!.x} cy={p[slot]!.y} r={padding / 3} fill="#c4b5fd" /></g>)}
          <circle data-node={i} data-slot="node" cx={p.x} cy={p.y} r={padding / 3} stroke={i === selected ? "white" : "none"} strokeWidth={padding / 8} fill={i === 0 ? "#fbbf24" : "#5eead4"} />
        </g>)}
      </svg>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex-1 min-w-20 text-xs">X (mm)<input aria-label="板框頂點 X" type="number" value={x} onChange={e => setX(e.target.value)} className="pcb-control w-full" /></label>
        <label className="flex-1 min-w-20 text-xs">Y (mm)<input aria-label="板框頂點 Y" type="number" value={y} onChange={e => setY(e.target.value)} className="pcb-control w-full" /></label>
        <Button variant="outline" disabled={!workspace.canMutate || draft.closed || !x.trim() || !y.trim()} onClick={() => add({ x: Number(x), y: Number(y) })}>加入頂點</Button>
        <label className="text-xs">選取節點<select aria-label="選取板框節點" value={selected ?? ""} onChange={e => setSelected(e.target.value === "" ? null : Number(e.target.value))} className="pcb-control"><option value="">未選取</option>{draft.nodes.map((_, i) => <option key={i} value={i}>{i + 1}</option>)}</select></label>
        <Button variant="outline" disabled={selected === null || !x.trim() || !y.trim()} onClick={() => {
          const px = Number(x), py = Number(y); if (selected === null || !Number.isFinite(px) || !Number.isFinite(py)) return;
          const n = draft.nodes[selected]; commit({ ...draft, nodes: draft.nodes.map((p, i) => i === selected ? moveNode(p, px - n.x, py - n.y) : p) });
        }}>移動節點</Button>
      </div>
      <p className="text-sm text-slate-300" aria-live="polite">{draft.nodes.length} 個節點 · {draft.closed ? "已封閉，可調整節點與把手" : "繪製中"} · {board.snapToGrid ? `吸附 ${board.gridSize} mm；Alt 暫停` : "自由定位"}</p>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <DialogFooter><Button variant="outline" onClick={onClose}>取消</Button><Button disabled={!workspace.canMutate || draft.nodes.length < 3} onClick={apply}>封閉並套用</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
