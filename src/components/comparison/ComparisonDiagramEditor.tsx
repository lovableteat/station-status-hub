import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background, BackgroundVariant, ConnectionMode, Controls, Handle, MarkerType,
  NodeResizer, Position, ReactFlow, ReactFlowProvider, useReactFlow,
  type Connection, type Edge, type Node, type NodeChange, type NodePositionChange, type NodeProps,
} from "@xyflow/react";
import { ArrowDownToLine, Circle, Copy, Diamond, Expand, FolderOpen, LayoutGrid, Link2, Minus, Plus, Redo2, Save, Square, StickyNote, Trash2, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { createBlankDiagram, createDiagramFromResult, autoLayoutDiagram, parseDiagramDocument, type DiagramDocument, type DiagramNode } from "./diagramModel";
import { listDiagrams, saveDiagram, deleteDiagram } from "./diagramStorage";
import { diagramHistory, editDiagram, undoDiagram, redoDiagram } from "./diagramHistory";
import { downloadDiagram } from "./diagramExport";
import type { ComparisonSession } from "./types";
import "@xyflow/react/dist/style.css";
import "./diagramEditor.css";

interface Props {
  accountId: string;
  session: ComparisonSession | null;
  canEdit: boolean;
  pdfUrl?: string;
  initialSource?: { kind: "power" | "i2c"; revision: "a" | "b" };
  onSourceConsumed?: () => void;
}
type Resize = { x: number; y: number; width: number; height: number };
type FlowData = DiagramNode & Record<string, unknown> & { editable: boolean; onResize: (id: string, value: Resize) => void };
type FlowNode = Node<FlowData, "diagram">;
const ports = [["left", Position.Left], ["right", Position.Right], ["top", Position.Top], ["bottom", Position.Bottom]] as const;
const shapes = [{ shape: "rectangle", name: "方框", Icon: Square }, { shape: "ellipse", name: "圓形", Icon: Circle }, { shape: "diamond", name: "判斷", Icon: Diamond }, { shape: "note", name: "備註", Icon: StickyNote }] as const;
const colors = ["#63c8b7", "#79a9e8", "#d6ad65", "#b59bdf", "#e28f99", "#a4adb9"];
const message = (error: unknown) => error instanceof Error ? error.message : "操作失敗，請重試";
const snapshot = (document: DiagramDocument) => JSON.stringify(document);
function sourceDiagram(session: ComparisonSession, kind: "power" | "i2c", revision: "a" | "b") {
  const document = createDiagramFromResult(session, kind, revision);
  if (!document.nodes.length) throw new Error(`${revision.toUpperCase()} 版沒有可帶入的 ${kind === "power" ? "Power Tree" : "I²C Map"} 資料，請確認這份比對結果。`);
  return document;
}

const DiagramNodeView = memo(function DiagramNodeView({ id, data, selected }: NodeProps<FlowNode>) {
  return <div className={`diagram-node is-${data.shape}`} style={{ "--node-color": data.color } as React.CSSProperties}>
    <NodeResizer isVisible={selected && data.editable} minWidth={80} minHeight={50} maxWidth={2400} maxHeight={2400} onResizeEnd={(_, size) => data.onResize(id, size)} />
    <div className="diagram-node-surface" />
    <div className="diagram-node-content"><strong>{data.label || "未命名"}</strong>{data.detail && <small>{data.detail}</small>}{data.refdes && <span>{data.refdes}</span>}</div>
    {ports.map(([port, position]) => <Handle key={port} id={port} type="source" position={position} isConnectable={data.editable} aria-label={`${data.label || "圖形"} ${port} 連接點`} />)}
  </div>;
});
const nodeTypes = { diagram: DiagramNodeView };

export default function ComparisonDiagramEditor(props: Props) {
  return <ReactFlowProvider><DiagramEditor {...props} /></ReactFlowProvider>;
}

function DiagramEditor({ accountId, session, canEdit, pdfUrl, initialSource, onSourceConsumed }: Props) {
  const [history, setHistory] = useState(() => diagramHistory(createBlankDiagram()));
  const document = history.present;
  const documentRef = useRef(document);
  documentRef.current = document;
  const [saved, setSaved] = useState<DiagramDocument[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState(() => snapshot(document));
  const [selected, setSelected] = useState<{ kind: "node" | "edge"; id: string } | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [operation, setOperation] = useState(false);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [revision, setRevision] = useState<"a" | "b">("b");
  const [format, setFormat] = useState<"json" | "svg" | "png" | "pdf">("json");
  const [connectionSource, setConnectionSource] = useState("");
  const [connectionTarget, setConnectionTarget] = useState("");
  const flow = useReactFlow<FlowNode>();
  const canvas = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  const dragBefore = useRef<DiagramDocument | null>(null);
  const writeQueue = useRef(Promise.resolve());
  const sourceConsumed = useRef<Props["initialSource"]>();
  const currentViewport = useRef(document.viewport);
  const capability = useRef({ accountId, canEdit });
  capability.current = { accountId, canEdit };
  const operationRef = useRef(false);
  const deletedIds = useRef(new Set<string>());
  const dirty = savedSnapshot !== snapshot(document);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const writable = canEdit && Boolean(accountId) && !loading && !operation;

  useEffect(() => {
    alive.current = true;
    const removedDocuments = deletedIds.current;
    return () => {
      alive.current = false;
      // Internal tab changes do not trigger beforeunload. Flush the last edit
      // into the same account queue even when its debounce has not fired yet.
      if (!dirtyRef.current || !capability.current.canEdit || removedDocuments.has(documentRef.current.id)) return;
      try {
        const latest = parseDiagramDocument({ ...documentRef.current, title: documentRef.current.title.trim() || "未命名圖表", viewport: currentViewport.current });
        writeQueue.current = writeQueue.current.catch(() => {}).then(() => saveDiagram(accountId, latest)).catch(caught => console.warn("圖稿離頁儲存失敗。", caught));
      } catch (caught) { console.warn("圖稿離頁儲存失敗。", caught); }
    };
  }, [accountId]);
  useEffect(() => {
    let current = true;
    setLoading(true);
    listDiagrams(accountId).then(items => { if (current) setSaved(items); }).catch(caught => { if (current) setError(message(caught)); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [accountId]);

  const commit = useCallback((change: (current: DiagramDocument) => DiagramDocument) => {
    if (!canEdit || !accountId || operationRef.current) return;
    setHistory(current => {
      const next = change(current.present);
      if (snapshot(next) === snapshot(current.present)) return current;
      return editDiagram(current, { ...next, updatedAt: new Date().toISOString() });
    });
  }, [accountId, canEdit]);
  const save = useCallback(async () => {
    if (!canEdit || !accountId) throw new Error("目前帳號為唯讀，無法儲存圖稿");
    const beforeSave = snapshot(documentRef.current);
    const current = parseDiagramDocument({ ...documentRef.current, title: documentRef.current.title.trim() || "未命名圖表", viewport: currentViewport.current });
    setStatus("正在儲存…");
    const write = writeQueue.current.catch(() => {}).then(() => {
      if (!capability.current.canEdit || capability.current.accountId !== accountId || deletedIds.current.has(current.id)) throw new Error("帳號、圖稿或編輯權限已變更，圖稿尚未儲存");
      return saveDiagram(accountId, current);
    });
    writeQueue.current = write;
    await write;
    if (!alive.current) return;
    setSaved(items => [current, ...items.filter(item => item.id !== current.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    if (documentRef.current.id === current.id) {
      if (snapshot(documentRef.current) === beforeSave && documentRef.current.title !== current.title) {
        setHistory(previous => ({ ...previous, present: { ...previous.present, title: current.title } }));
      }
      // Compare the same semantic snapshot; the viewport is also restored on open.
      setSavedSnapshot(snapshot({ ...current, viewport: documentRef.current.viewport }));
      setStatus("已儲存於此帳號的本機瀏覽器");
      setError("");
    }
  }, [accountId, canEdit]);
  useEffect(() => {
    if (!dirty || !writable || dragBefore.current) return;
    const timer = window.setTimeout(() => { void save().catch(caught => { if (alive.current) { setError(message(caught)); setStatus("尚未儲存，可先匯出圖稿備份"); } }); }, 900);
    return () => window.clearTimeout(timer);
  }, [dirty, document, save, writable]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const load = useCallback((next: DiagramDocument, isSaved: boolean) => {
    setHistory(diagramHistory(next));
    setSavedSnapshot(isSaved ? snapshot(next) : "");
    currentViewport.current = next.viewport;
    setSelected(null); setError(""); setStatus(isSaved ? "已開啟圖稿" : "新圖稿");
    setConnectionSource(""); setConnectionTarget("");
    window.requestAnimationFrame(() => {
      if (!alive.current) return;
      void flow.setViewport(next.viewport);
      if (!isSaved && next.nodes.length) void flow.fitView({ padding: 0.2, maxZoom: 1.2 });
    });
  }, [flow]);
  const switchTo = useCallback(async (make: () => DiagramDocument, isSaved = false) => {
    if (operationRef.current) return;
    operationRef.current = true; setOperation(true);
    try {
      if (snapshot(documentRef.current) !== savedSnapshot && canEdit) await save();
      if (alive.current) load(make(), isSaved);
    } catch (caught) { if (alive.current) setError(message(caught)); }
    finally { operationRef.current = false; if (alive.current) setOperation(false); }
  }, [canEdit, load, save, savedSnapshot]);
  useEffect(() => {
    if (!initialSource || sourceConsumed.current === initialSource || loading || !session) return;
    sourceConsumed.current = initialSource;
    if (canEdit) void switchTo(() => sourceDiagram(session, initialSource.kind, initialSource.revision)).finally(() => onSourceConsumed?.());
    else onSourceConsumed?.();
  }, [canEdit, initialSource, loading, onSourceConsumed, session, switchTo]);

  const resize = useCallback((id: string, size: Resize) => commit(current => ({ ...current, nodes: current.nodes.map(node => node.id === id ? { ...node, ...size } : node) })), [commit]);
  const nodes: FlowNode[] = useMemo(() => document.nodes.map(node => ({
    id: node.id, type: "diagram", position: { x: node.x, y: node.y },
    style: { width: node.width, height: node.height }, ariaLabel: node.label || "未命名圖形",
    data: { ...node, editable: writable, onResize: resize },
    selected: selected?.kind === "node" && selected.id === node.id,
  })), [document.nodes, resize, selected, writable]);
  const edges: Edge[] = useMemo(() => document.edges.map(edge => ({
    id: edge.id, source: edge.source, target: edge.target, sourceHandle: edge.sourcePort ?? "right", targetHandle: edge.targetPort ?? "left",
    type: "smoothstep", label: edge.label, selected: selected?.kind === "edge" && selected.id === edge.id,
    markerEnd: { type: MarkerType.ArrowClosed, color: edge.color },
    style: { stroke: edge.color, strokeWidth: 2, strokeDasharray: edge.style === "dashed" ? "7 5" : undefined },
    labelStyle: { fill: "#e7e9eb", fontSize: 12 }, labelBgStyle: { fill: "#191c1d" }, labelBgPadding: [6, 4], labelBgBorderRadius: 4,
  })), [document.edges, selected]);
  const selectedNode = selected?.kind === "node" ? document.nodes.find(node => node.id === selected.id) : undefined;
  const selectedEdge = selected?.kind === "edge" ? document.edges.find(edge => edge.id === selected.id) : undefined;
  const sourcePdf = document.source?.revision === "b" && document.source.sessionId === session?.id && document.source.generated === session?.result.meta.generated ? pdfUrl : undefined;
  const patchNode = (patch: Partial<DiagramNode>) => { if (selectedNode) commit(current => ({ ...current, nodes: current.nodes.map(node => node.id === selectedNode.id ? { ...node, ...patch } : node) })); };
  const deleteSelection = useCallback(() => {
    if (!selected) return;
    commit(current => ({ ...current, nodes: selected.kind === "node" ? current.nodes.filter(node => node.id !== selected.id) : current.nodes,
      edges: current.edges.filter(edge => selected.kind === "edge" ? edge.id !== selected.id : edge.source !== selected.id && edge.target !== selected.id) }));
    setSelected(null);
  }, [commit, selected]);
  const connect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    commit(current => {
      if (current.edges.length >= 6000) return current;
      if (!current.nodes.some(node => node.id === connection.source) || !current.nodes.some(node => node.id === connection.target)) return current;
      if (current.edges.some(edge => edge.source === connection.source && edge.target === connection.target && (edge.sourcePort ?? "right") === (connection.sourceHandle ?? "right") && (edge.targetPort ?? "left") === (connection.targetHandle ?? "left"))) return current;
      return { ...current, edges: [...current.edges, { id: crypto.randomUUID(), source: connection.source!, target: connection.target!, sourcePort: (connection.sourceHandle ?? "right") as "right", targetPort: (connection.targetHandle ?? "left") as "left", label: "", color: colors[0], style: "solid" }] };
    });
  }, [commit]);
  const onNodesChange = useCallback((changes: NodeChange<FlowNode>[]) => {
    if (!writable || operationRef.current) return;
    const positions = changes.filter((change): change is NodePositionChange => change.type === "position" && Boolean(change.position));
    if (!positions.length) return;
    setHistory(current => {
      const next = { ...current.present, nodes: current.present.nodes.map(node => {
        const change = positions.find(item => item.id === node.id);
        return change?.type === "position" && change.position ? { ...node, x: change.position.x, y: change.position.y } : node;
      }) };
      if (snapshot(next) === snapshot(current.present)) return current;
      return dragBefore.current ? { ...current, present: next } : editDiagram(current, { ...next, updatedAt: new Date().toISOString() });
    });
  }, [writable]);
  const addNode = (shape: DiagramNode["shape"]) => {
    if (document.nodes.length >= 2000) { setError("每份圖稿最多 2,000 個圖形"); return; }
    const bounds = canvas.current?.getBoundingClientRect();
    const center = bounds ? flow.screenToFlowPosition({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }) : { x: 120, y: 120 };
    const node: DiagramNode = { id: crypto.randomUUID(), x: Math.round(center.x / 20) * 20, y: Math.round(center.y / 20) * 20, width: 180, height: shape === "diamond" ? 120 : 90, shape, label: shapes.find(item => item.shape === shape)!.name, detail: "", color: shape === "note" ? colors[2] : colors[0] };
    commit(current => ({ ...current, nodes: [...current.nodes, node] })); setSelected({ kind: "node", id: node.id });
  };
  const duplicate = () => {
    if (!selectedNode || document.nodes.length >= 2000) return;
    const copied = { ...selectedNode, id: crypto.randomUUID(), x: selectedNode.x + 40, y: selectedNode.y + 40 };
    commit(current => ({ ...current, nodes: [...current.nodes, copied] })); setSelected({ kind: "node", id: copied.id });
  };
  const importFile = async (file: File) => {
    try {
      if (file.size > 64 * 1024 * 1024) throw new Error("圖稿檔案不可超過 64 MB");
      const imported = parseDiagramDocument(JSON.parse(await file.text()));
      await switchTo(() => ({ ...imported, id: crypto.randomUUID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));
    } catch (caught) { if (alive.current) setError(message(caught)); }
  };
  const removeDocument = async () => {
    if (!writable || operationRef.current) return;
    const id = documentRef.current.id;
    operationRef.current = true; setOperation(true);
    deletedIds.current.add(id);
    try {
      const deletion = writeQueue.current.catch(() => {}).then(() => {
        if (!alive.current || !capability.current.canEdit || capability.current.accountId !== accountId) throw new Error("帳號或編輯權限已變更，圖稿未刪除");
        return deleteDiagram(accountId, id);
      });
      writeQueue.current = deletion;
      await deletion;
      if (!alive.current) return;
      setSaved(items => items.filter(item => item.id !== id));
      load(createBlankDiagram(), true);
    } catch (caught) {
      deletedIds.current.delete(id);
      if (alive.current) setError(message(caught));
    } finally { operationRef.current = false; if (alive.current) setOperation(false); }
  };

  return <section className={`comparison-diagram-editor${expanded ? " is-expanded" : ""}`} aria-label="圖表編輯器" onKeyDown={event => {
    const typing = (event.target as HTMLElement).closest("input,textarea,select,[contenteditable=true]");
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); if (writable) void save().catch(caught => setError(message(caught))); return; }
    if (typing || !writable) return;
    if (event.key === "Escape") { setSelected(null); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); setHistory(event.shiftKey ? redoDiagram : undoDiagram); }
    else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") { event.preventDefault(); setHistory(redoDiagram); }
    else if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); deleteSelection(); }
  }}>
    <div className="diagram-editor-heading"><div><h2>圖表編輯器</h2><p>{document.source ? `${document.source.kind === "power" ? "Power Tree" : "I²C Map"} · ${document.source.revision.toUpperCase()} 版修訂圖` : "Block Diagram / 流程圖"}</p></div><div className="diagram-save-status" role="status">{loading ? "正在讀取圖稿…" : dirty ? "尚未儲存" : status || "圖稿儲存於此帳號的本機瀏覽器"}</div><Button variant="ghost" size="icon" aria-label={expanded ? "離開全畫布" : "展開全畫布"} onClick={() => setExpanded(value => !value)}>{expanded ? <X /> : <Expand />}</Button></div>
    {error && <div className="diagram-editor-error" role="alert">{error}<Button size="sm" variant="ghost" onClick={() => setError("")}>關閉</Button></div>}
    <div className="diagram-document-bar"><Label htmlFor="diagram-title">圖稿名稱</Label><Input id="diagram-title" value={document.title} maxLength={240} disabled={!writable} onChange={event => commit(current => ({ ...current, title: event.target.value }))} onBlur={() => { if (!document.title.trim()) commit(current => ({ ...current, title: "未命名圖表" })); }} /><select aria-label="開啟已儲存圖稿" value={saved.some(item => item.id === document.id) ? document.id : ""} disabled={loading} onChange={event => { const item = saved.find(item => item.id === event.target.value); if (item) void switchTo(() => item, true); }}><option value="" disabled>開啟已儲存圖稿（{saved.length}）</option>{saved.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select><Button variant="outline" size="sm" disabled={!writable} onClick={() => void save().catch(caught => setError(message(caught)))}><Save />儲存</Button><Button variant="ghost" size="icon" aria-label="刪除此圖稿" disabled={!writable || !saved.some(item => item.id === document.id)} onClick={() => setDeleting(true)}><Trash2 /></Button></div>
    <div className="diagram-editor-toolbar"><div><Button size="sm" variant="outline" disabled={!writable} onClick={() => void switchTo(() => createBlankDiagram())}><Plus />空白圖稿</Button><Button size="sm" variant="ghost" disabled={!writable} onClick={() => input.current?.click()}><FolderOpen />開啟圖稿檔</Button><input ref={input} className="sr-only" aria-label="選擇圖稿 JSON" type="file" accept=".json,application/json" disabled={!writable} onChange={event => { const file = event.target.files?.[0]; if (file) void importFile(file); event.target.value = ""; }} /></div><div className="diagram-source-controls"><select aria-label="來源版本" value={revision} onChange={event => setRevision(event.target.value as "a" | "b")} disabled={!session || !writable}><option value="a">A 版</option><option value="b">B 版</option></select><Button size="sm" variant="ghost" disabled={!session || !writable} onClick={() => void switchTo(() => sourceDiagram(session!, "power", revision))}>帶入 Power Tree</Button><Button size="sm" variant="ghost" disabled={!session || !writable} onClick={() => void switchTo(() => sourceDiagram(session!, "i2c", revision))}>帶入 I²C Map</Button></div><div className="diagram-export-controls"><select aria-label="匯出格式" value={format} onChange={event => setFormat(event.target.value as typeof format)}><option value="json">可編輯圖稿 JSON</option><option value="svg">SVG 向量圖</option><option value="png">PNG 圖片</option><option value="pdf">PDF</option></select><Button size="sm" variant="outline" disabled={exporting} onClick={async () => { setExporting(true); try { await downloadDiagram({ ...document, title: document.title.trim() || "未命名圖表", viewport: currentViewport.current }, format); setStatus("圖稿已匯出"); } catch (caught) { setError(message(caught)); } finally { if (alive.current) setExporting(false); } }}><ArrowDownToLine />{exporting ? "匯出中…" : "匯出"}</Button></div></div>
    <div className="diagram-workbench"><aside className="diagram-palette" aria-label="繪圖工具"><span>圖形</span>{shapes.map(({ shape, name, Icon }) => <Button key={shape} variant="ghost" disabled={!writable} onClick={() => addNode(shape)}><Icon /><span>{name}</span></Button>)}<div className="diagram-palette-divider" /><Button variant="ghost" disabled={!writable || !history.past.length} onClick={() => setHistory(undoDiagram)}><Undo2 /><span>復原</span></Button><Button variant="ghost" disabled={!writable || !history.future.length} onClick={() => setHistory(redoDiagram)}><Redo2 /><span>重做</span></Button><Button variant="ghost" disabled={!writable || !document.nodes.length} onClick={() => { commit(current => autoLayoutDiagram(current)); window.requestAnimationFrame(() => void flow.fitView({ padding: 0.2 })); }}><LayoutGrid /><span>排列</span></Button></aside>
      <div ref={canvas} className="diagram-canvas"><ReactFlow<FlowNode> nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onConnect={connect} connectionMode={ConnectionMode.Loose} nodesDraggable={writable} nodesConnectable={writable} connectOnClick nodesFocusable edgesFocusable deleteKeyCode={null} multiSelectionKeyCode={null} selectionKeyCode={null} snapToGrid snapGrid={[20, 20]} minZoom={0.1} maxZoom={4} colorMode="dark" ariaLabelConfig={{ "controls.ariaLabel": "畫布縮放", "controls.zoomIn.ariaLabel": "放大圖表", "controls.zoomOut.ariaLabel": "縮小圖表", "controls.fitView.ariaLabel": "適合畫布", "node.a11yDescription.default": "選取圖形以編輯，可拖曳調整位置。", "edge.a11yDescription.default": "選取連線以編輯。" }} onlyRenderVisibleElements onNodeClick={(_, node) => setSelected({ kind: "node", id: node.id })} onEdgeClick={(_, edge) => setSelected({ kind: "edge", id: edge.id })} onPaneClick={() => setSelected(null)} onNodeDragStart={() => { dragBefore.current = documentRef.current; }} onNodeDragStop={() => { const before = dragBefore.current; dragBefore.current = null; if (before) setHistory(current => editDiagram(current, { ...current.present, updatedAt: new Date().toISOString() }, before)); }} onMoveEnd={(_, viewport) => { currentViewport.current = viewport; setZoomPercent(Math.round(viewport.zoom * 100)); if (writable && !operationRef.current) setHistory(current => JSON.stringify(current.present.viewport) === JSON.stringify(viewport) ? current : { ...current, present: { ...current.present, viewport } }); }} defaultViewport={document.viewport} aria-label="圖表畫布"><Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#38413f" /><Controls showInteractive={false} /></ReactFlow>{!document.nodes.length && <div className="diagram-canvas-empty"><Square /><strong>從一個方框開始</strong><span>點選左側圖形，或帶入比對結果</span></div>}<div className="diagram-canvas-count"><button type="button" aria-label="設為百分之百縮放" onClick={() => void flow.zoomTo(1)}>{zoomPercent}%</button>{document.nodes.length} 個圖形 <Minus /> {document.edges.length} 條連線</div></div>
      <aside className="diagram-inspector" aria-label="圖形屬性"><h3>{selectedNode ? "圖形屬性" : selectedEdge ? "連線屬性" : "圖稿"}</h3>{selectedNode || selectedEdge ? <><Label htmlFor="diagram-label">{selectedNode ? "名稱" : "連線文字"}</Label><Textarea id="diagram-label" rows={2} maxLength={500} value={(selectedNode ?? selectedEdge)!.label} disabled={!writable} onChange={event => selectedNode ? patchNode({ label: event.target.value }) : commit(current => ({ ...current, edges: current.edges.map(edge => edge.id === selectedEdge!.id ? { ...edge, label: event.target.value } : edge) }))} />{selectedNode && <><Label htmlFor="diagram-detail">說明</Label><Textarea id="diagram-detail" rows={3} maxLength={4000} value={selectedNode.detail} disabled={!writable} onChange={event => patchNode({ detail: event.target.value })} /><div className="diagram-size-fields"><div><Label htmlFor="diagram-width">寬</Label><Input id="diagram-width" type="number" min={80} max={2400} value={Math.round(selectedNode.width)} disabled={!writable} onChange={event => { const value = Number(event.target.value); if (value >= 80 && value <= 2400) patchNode({ width: value }); }} /></div><div><Label htmlFor="diagram-height">高</Label><Input id="diagram-height" type="number" min={50} max={2400} value={Math.round(selectedNode.height)} disabled={!writable} onChange={event => { const value = Number(event.target.value); if (value >= 50 && value <= 2400) patchNode({ height: value }); }} /></div></div>{selectedNode.refdes && <p className="diagram-source-ref">元件 {selectedNode.refdes}</p>}{selectedNode.page && sourcePdf && <Button size="sm" variant="outline" asChild><a href={`${sourcePdf}#page=${selectedNode.page}`} target="_blank" rel="noopener noreferrer">查看線路圖第 {selectedNode.page} 頁</a></Button>}<Button size="sm" variant="ghost" disabled={!writable} onClick={duplicate}><Copy />複製圖形</Button></>}
        <Label>顏色</Label><div className="diagram-swatches">{colors.map(color => <button key={color} type="button" title={color} aria-label={`使用 ${color} 顏色`} aria-pressed={(selectedNode ?? selectedEdge)!.color === color} disabled={!writable} style={{ background: color }} onClick={() => selectedNode ? patchNode({ color }) : commit(current => ({ ...current, edges: current.edges.map(edge => edge.id === selectedEdge!.id ? { ...edge, color } : edge) }))} />)}</div>{selectedEdge && <><Label htmlFor="diagram-line-style">線條</Label><select id="diagram-line-style" value={selectedEdge.style ?? "solid"} disabled={!writable} onChange={event => commit(current => ({ ...current, edges: current.edges.map(edge => edge.id === selectedEdge.id ? { ...edge, style: event.target.value as "solid" | "dashed" } : edge) }))}><option value="solid">實線</option><option value="dashed">虛線</option></select></>}<Button size="sm" variant="ghost" className="diagram-delete-selection" disabled={!writable} onClick={deleteSelection}><Trash2 />刪除{selectedNode ? "圖形" : "連線"}</Button></> : <><p className="diagram-inspector-hint">選取圖形或連線以編輯內容。</p><div className="diagram-connection-form"><h4><Link2 />建立連線</h4><Label htmlFor="diagram-connect-source">起點</Label><select id="diagram-connect-source" value={connectionSource} disabled={!writable} onChange={event => setConnectionSource(event.target.value)}><option value="">選擇圖形</option>{document.nodes.map(node => <option key={node.id} value={node.id}>{node.label || "未命名"}</option>)}</select><Label htmlFor="diagram-connect-target">終點</Label><select id="diagram-connect-target" value={connectionTarget} disabled={!writable} onChange={event => setConnectionTarget(event.target.value)}><option value="">選擇圖形</option>{document.nodes.filter(node => node.id !== connectionSource).map(node => <option key={node.id} value={node.id}>{node.label || "未命名"}</option>)}</select><Button size="sm" variant="outline" disabled={!writable || !connectionSource || !connectionTarget || connectionSource === connectionTarget} onClick={() => connect({ source: connectionSource, target: connectionTarget, sourceHandle: "right", targetHandle: "left" })}>新增連線</Button></div><p className="diagram-local-note">圖稿獨立儲存，請用 JSON 備份。修改圖形與連線會保留原始比對結果。</p></>}</aside>
    </div>
    <AlertDialog open={deleting} onOpenChange={setDeleting}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>刪除此圖稿？</AlertDialogTitle><AlertDialogDescription>「{document.title}」會從此帳號的本機圖稿移除。已匯出的圖稿檔可以重新開啟。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={() => void removeDocument()}>刪除圖稿</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>;
}
