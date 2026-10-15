import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Background, BackgroundVariant, BaseEdge, ConnectionMode, Handle, MarkerType,
  NodeResizer, Position, ReactFlow, ReactFlowProvider, useReactFlow, useUpdateNodeInternals,
  type Connection, type Edge, type EdgeProps, type Node, type NodeChange, type NodePositionChange, type NodeProps,
} from "@xyflow/react";
import { ArrowDownToLine, ArrowUpRight, ArrowLeftRight, Check, ChevronDown, Circle, Copy, Expand, FilePlus2, FileText, FolderOpen, GitBranch, LayoutGrid, Link2, Maximize, Minus, Moon, MousePointer2, PanelLeftClose, PanelLeftOpen, Plus, Redo2, Save, Square, Sun, Trash2, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { createBlankDiagram, createDiagramFromResult, autoLayoutDiagram, parseDiagramDocument, type DiagramDocument, type DiagramNode, type DiagramEdge, type DiagramPoint, type DiagramPort } from "./diagramModel";
import { listDiagrams, saveDiagram, deleteDiagram } from "./diagramStorage";
import { diagramHistory, editDiagram, undoDiagram, redoDiagram } from "./diagramHistory";
import { downloadDiagram } from "./diagramExport";
import { diagramTheme, diagramNodeColors, diagramStrokeColor, readDiagramAppearance, writeDiagramAppearance, type DiagramAppearance } from "./diagramTheme";
import { buildDiagramEdgeRoutes, diagramEdgeEndpoint, diagramEdgeRoute, type DiagramEdgeRoute } from "./diagramGeometry";
import { diagramSymbolGraphics, diagramSymbolLabelBox, diagramSymbolPorts, isElectricalSymbol } from "./diagramSymbols";
import { diagramPalette as shapes } from "./diagramPalette";
import { DiagramColorControl } from "./DiagramColorControl";
import { constrainArrowPoint, snapArrowEndpoint, type ArrowEndpoint } from "./diagramInteractions";
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
type FlowData = DiagramNode & Record<string, unknown> & { editable: boolean; appearance: DiagramAppearance; onResize: (id: string, value: Resize) => void };
type ShapeFlowNode = Node<FlowData, "diagram">;
type FlowNode = ShapeFlowNode | Node<Record<string, unknown>, "endpoint">;
type FlowEdge = Edge<{ edge: DiagramEdge; nodes: ReadonlyMap<string, DiagramNode>; route: DiagramEdgeRoute; background: string }, "diagram">;
const endpointId = (id: string, side: "source" | "target") => `__diagram_endpoint_${id}_${side}`;
const ports = [["left", Position.Left], ["right", Position.Right], ["top", Position.Top], ["bottom", Position.Bottom]] as const;
const message = (error: unknown) => error instanceof Error ? error.message : "操作失敗，請重試";
const snapshot = (document: DiagramDocument) => JSON.stringify(document);
const validPort = (port: string | null | undefined, fallback: DiagramPort): DiagramPort => ports.some(([name]) => name === port) ? port as DiagramPort : fallback;
function nodeEndpointPort(node: DiagramNode | undefined, side: "source" | "target", preferred?: string | null): DiagramPort {
  const port = validPort(preferred, side === "source" ? "right" : "left");
  if (!node) return port;
  const available = diagramSymbolPorts(node.shape, node.rotation);
  return available.includes(port) ? port : available[side === "source" ? available.length - 1 : 0];
}
function setEndpoint(edge: DiagramEdge, side: "source" | "target", value: ArrowEndpoint): DiagramEdge {
  const next = { ...edge, [side]: value.nodeId };
  delete next[`${side}Point`]; delete next[`${side}Port`];
  if (value.nodeId) next[`${side}Port`] = value.port ?? (side === "source" ? "right" : "left");
  else next[`${side}Point`] = value.point;
  return next;
}
function sourceDiagram(session: ComparisonSession, kind: "power" | "i2c", revision: "a" | "b") {
  const document = createDiagramFromResult(session, kind, revision);
  if (!document.nodes.length) throw new Error(`${revision.toUpperCase()} 版沒有可帶入的 ${kind === "power" ? "Power Tree" : "I²C Map"} 資料，請確認這份比對結果。`);
  return document;
}

const DiagramNodeView = memo(function DiagramNodeView({ id, data, selected }: NodeProps<ShapeFlowNode>) {
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => { updateNodeInternals(id); }, [data.rotation, data.shape, id, updateNodeInternals]);
  const theme = diagramNodeColors(data.color, data.appearance, isElectricalSymbol(data.shape) ? undefined : data.fillColor);
  const symbol = diagramSymbolGraphics(data.shape);
  const labelBox = symbol ? diagramSymbolLabelBox(data.shape, data.rotation) : undefined;
  const availablePorts = diagramSymbolPorts(data.shape, data.rotation);
  return <div className={`diagram-node is-${data.shape}`} style={{ "--node-fill": theme.fill, "--node-stroke": theme.stroke, "--node-detail": theme.detail, color: theme.text } as React.CSSProperties}>
    <NodeResizer isVisible={selected && data.editable} minWidth={64} minHeight={symbol ? 40 : 50} maxWidth={2400} maxHeight={2400} onResizeEnd={(_, size) => data.onResize(id, size)} />
    {symbol ? <svg className="diagram-symbol" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><g transform={`rotate(${data.rotation ?? 0} 50 50)`}>{symbol.paths.map((path, index) => <path key={index} d={path} fill={data.shape === "netlabel" ? theme.fill : "none"} stroke={theme.stroke} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />)}</g></svg> : <div className="diagram-node-surface" />}
    <div className={`diagram-node-content${symbol ? " is-symbol-label" : ""}`} style={labelBox ? { left: `${labelBox.x}%`, top: `${labelBox.y}%`, width: `${labelBox.width}%`, height: `${labelBox.height}%` } : undefined}><strong>{data.label || "未命名"}</strong>{data.detail && <small>{data.detail}</small>}{data.refdes && <span>{data.refdes}</span>}</div>
    {ports.filter(([port]) => availablePorts.includes(port)).map(([port, position]) => <Handle key={port} id={port} type="source" position={position} isConnectable={data.editable} aria-label={`${data.label || "圖形"} ${port} 連接點`} />)}
  </div>;
});
function EndpointNodeView() {
  return <Handle id="center" type="source" position={Position.Right} isConnectable={false} style={{ left: "50%", top: "50%", right: "auto", transform: "translate(-50%, -50%)", width: 1, height: 1, opacity: 0, border: 0 }} />;
}
const DiagramEdgeView = memo(function DiagramEdgeView(props: EdgeProps<FlowEdge>) {
  if (!props.data) return null;
  const route = props.data.route;
  return <>{route.bridgePath && <path className="diagram-crossing-gap" d={route.bridgePath} fill="none" stroke={props.data.background} strokeWidth={(props.data.edge.width ?? 2) + 4} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />}<BaseEdge id={props.id} path={route.path} markerStart={props.markerStart} markerEnd={props.markerEnd} style={props.style} interactionWidth={28} label={props.label} labelX={route.label.x} labelY={route.label.y} labelStyle={props.labelStyle} labelBgStyle={props.labelBgStyle} labelBgPadding={props.labelBgPadding} labelBgBorderRadius={props.labelBgBorderRadius} /></>;
});
const nodeTypes = { diagram: DiagramNodeView, endpoint: EndpointNodeView };
const edgeTypes = { diagram: DiagramEdgeView };

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
  const [libraryOpen, setLibraryOpen] = useState(true);
  const [savedOpen, setSavedOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [appearance, setAppearance] = useState(readDiagramAppearance);
  const [arrowTool, setArrowTool] = useState(false);
  const [arrowLineType, setArrowLineType] = useState<NonNullable<DiagramEdge["lineType"]>>("straight");
  const [arrowhead, setArrowhead] = useState<NonNullable<DiagramEdge["arrowhead"]>>("end");
  const [arrowJump, setArrowJump] = useState<NonNullable<DiagramEdge["jump"]>>("arc");
  const [arrowColor, setArrowColor] = useState("#79a9e8");
  const [arrowDraft, setArrowDraft] = useState<{ start: DiagramPoint; end: DiagramPoint } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [operation, setOperation] = useState(false);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [revision, setRevision] = useState<"a" | "b">("b");
  const [connectionSource, setConnectionSource] = useState("");
  const [connectionTarget, setConnectionTarget] = useState("");
  const flow = useReactFlow<FlowNode, FlowEdge>();
  const canvas = useRef<HTMLDivElement>(null);
  const inspector = useRef<HTMLElement>(null);
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
  const drawing = useRef<{ pointerId: number; start: DiagramPoint; end: DiagramPoint } | null>(null);
  const reconnected = useRef(false);
  const cancelledReconnect = useRef(false);
  const canvasTheme = diagramTheme(appearance);
  const dirty = savedSnapshot !== snapshot(document);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const writable = canEdit && Boolean(accountId) && !loading && !operation;

  const fitCanvas = useCallback((next = documentRef.current) => {
    const area = canvas.current?.getBoundingClientRect();
    if (!area || area.width <= 0 || area.height <= 0) return;
    const points = next.nodes.flatMap(node => [{ x: node.x, y: node.y }, { x: node.x + node.width, y: node.y + node.height }]);
    const nodeMap = new Map(next.nodes.map(node => [node.id, node]));
    for (const route of buildDiagramEdgeRoutes(next.edges, nodeMap).values()) points.push(...route.points);
    if (!points.length) return;
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const point of points) { left = Math.min(left, point.x); top = Math.min(top, point.y); right = Math.max(right, point.x); bottom = Math.max(bottom, point.y); }
    const zoom = Math.max(0.1, Math.min(1.2, area.width / ((right - left + 48) * 1.4), area.height / ((bottom - top + 48) * 1.4)));
    void flow.setViewport({ x: (area.width - (left + right) * zoom) / 2, y: (area.height - (top + bottom) * zoom) / 2, zoom });
  }, [flow]);

  useEffect(() => {
    if (writable) return;
    drawing.current = null; cancelledReconnect.current = true; setArrowDraft(null); setArrowTool(false);
  }, [writable]);

  useEffect(() => {
    if (!expanded) return;
    const previous = window.document.body.style.overflow;
    window.document.body.style.overflow = "hidden";
    return () => { window.document.body.style.overflow = previous; };
  }, [expanded]);

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
    if (!canEdit || !accountId || !capability.current.canEdit || capability.current.accountId !== accountId || operationRef.current) return;
    setHistory(current => {
      const next = change(current.present);
      if (snapshot(next) === snapshot(current.present)) return current;
      return editDiagram(current, { ...next, updatedAt: new Date().toISOString() });
    });
  }, [accountId, canEdit]);
  const save = useCallback(async () => {
    if (!canEdit || !accountId) throw new Error("目前帳號為唯讀，無法儲存圖稿");
    const beforeSaveDocument = documentRef.current;
    const beforeSave = snapshot(beforeSaveDocument);
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
      // Parsing normalizes optional field order. Compare against the actual draft
      // captured by this write so normalization cannot leave it permanently dirty.
      setSavedSnapshot(snapshot({ ...beforeSaveDocument, title: current.title }));
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
    setSelected(null); setConnecting(false); setArrowTool(false); drawing.current = null; cancelledReconnect.current = true; setArrowDraft(null); setError(""); setStatus(isSaved ? "已開啟圖稿" : "新圖稿");
    setConnectionSource(""); setConnectionTarget("");
    window.requestAnimationFrame(() => {
      if (!alive.current) return;
      void flow.setViewport(next.viewport);
      if (!isSaved && (next.nodes.length || next.edges.length)) fitCanvas(next);
    });
  }, [fitCanvas, flow]);
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
  const byId = useMemo(() => new Map(document.nodes.map(node => [node.id, node])), [document.nodes]);
  const routes = useMemo(() => buildDiagramEdgeRoutes(document.edges, byId), [byId, document.edges]);
  const nodes: FlowNode[] = useMemo(() => [...document.nodes.map(node => ({
    id: node.id, type: "diagram", position: { x: node.x, y: node.y },
    style: { width: node.width, height: node.height }, ariaLabel: node.label || "未命名圖形",
    data: { ...node, editable: writable, appearance, onResize: resize },
    selected: selected?.kind === "node" && selected.id === node.id,
  }) as ShapeFlowNode), ...document.edges.flatMap(edge => (["source", "target"] as const).flatMap(side => {
    const point = edge[`${side}Point`];
    return edge[side] || !point ? [] : [{ id: endpointId(edge.id, side), type: "endpoint" as const, position: { x: point.x - 0.5, y: point.y - 0.5 }, data: {}, initialWidth: 1, initialHeight: 1, handles: [{ id: "center", type: "source" as const, position: Position.Right, x: 0, y: 0, width: 1, height: 1 }], style: { width: 1, height: 1, opacity: 0, pointerEvents: "none" as const }, draggable: false, selectable: false, focusable: false, ariaRole: "presentation" }];
  }))], [appearance, document.nodes, document.edges, resize, selected, writable]);
  const edges: FlowEdge[] = useMemo(() => document.edges.map(edge => ({
    id: edge.id, source: edge.source || endpointId(edge.id, "source"), target: edge.target || endpointId(edge.id, "target"), sourceHandle: edge.source ? nodeEndpointPort(byId.get(edge.source), "source", edge.sourcePort) : "center", targetHandle: edge.target ? nodeEndpointPort(byId.get(edge.target), "target", edge.targetPort) : "center",
    type: "diagram", label: edge.label, zIndex: edge.jump === "arc" ? 1 : 0, selected: selected?.kind === "edge" && selected.id === edge.id, data: { edge, nodes: byId, route: routes.get(edge.id)!, background: canvasTheme.canvas }, reconnectable: writable && !arrowTool && selected?.kind === "edge" && selected.id === edge.id,
    ariaLabel: edge.label ? `箭頭：${edge.label}` : "箭頭，選取後可拖動兩端",
    markerStart: edge.arrowhead === "both" ? { type: MarkerType.ArrowClosed, color: diagramStrokeColor(edge.color, appearance), orient: "auto-start-reverse", width: 18, height: 18 } : undefined,
    markerEnd: edge.arrowhead !== "none" ? { type: MarkerType.ArrowClosed, color: diagramStrokeColor(edge.color, appearance), width: 18, height: 18 } : undefined,
    style: { stroke: diagramStrokeColor(edge.color, appearance), strokeWidth: edge.width ?? 2, strokeDasharray: edge.style === "dashed" ? "7 5" : undefined },
    labelStyle: { fill: canvasTheme.text, fontSize: 12 }, labelBgStyle: { fill: canvasTheme.labelBackground }, labelBgPadding: [6, 4] as [number, number], labelBgBorderRadius: 4,
  })), [appearance, arrowTool, byId, canvasTheme.canvas, canvasTheme.labelBackground, canvasTheme.text, document.edges, routes, selected, writable]);
  const selectedNode = selected?.kind === "node" ? document.nodes.find(node => node.id === selected.id) : undefined;
  const selectedEdge = selected?.kind === "edge" ? document.edges.find(edge => edge.id === selected.id) : undefined;
  const sourcePdf = document.source?.revision === "b" && document.source.sessionId === session?.id && document.source.generated === session?.result.meta.generated ? pdfUrl : undefined;
  const patchNode = (patch: Partial<DiagramNode>) => { if (selectedNode) commit(current => ({ ...current, nodes: current.nodes.map(node => node.id === selectedNode.id ? { ...node, ...patch } : node) })); };
  const rotateSymbol = (rotation: NonNullable<DiagramNode["rotation"]>) => {
    if (!selectedNode || !isElectricalSymbol(selectedNode.shape)) return;
    const order: DiagramPort[] = ["top", "right", "bottom", "left"];
    const delta = (rotation - (selectedNode.rotation ?? 0) + 360) / 90;
    const remap = (port: DiagramPort) => order[(order.indexOf(port) + delta) % 4];
    const swap = delta % 2 === 1;
    commit(current => ({ ...current, nodes: current.nodes.map(node => node.id === selectedNode.id ? { ...node, rotation, ...(swap ? { x: node.x + (node.width - node.height) / 2, y: node.y + (node.height - node.width) / 2, width: node.height, height: node.width } : {}) } : node), edges: current.edges.map(edge => ({ ...edge,
      ...(edge.source === selectedNode.id ? { sourcePort: remap(nodeEndpointPort(selectedNode, "source", edge.sourcePort)) } : {}),
      ...(edge.target === selectedNode.id ? { targetPort: remap(nodeEndpointPort(selectedNode, "target", edge.targetPort)) } : {}),
    })) }));
  };
  const deleteSelection = useCallback(() => {
    if (!selected) return;
    commit(current => ({ ...current, nodes: selected.kind === "node" ? current.nodes.filter(node => node.id !== selected.id) : current.nodes,
      edges: current.edges.filter(edge => selected.kind === "edge" ? edge.id !== selected.id : edge.source !== selected.id && edge.target !== selected.id) }));
    setSelected(null);
  }, [commit, selected]);
  const connect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target && connection.sourceHandle === connection.targetHandle) return;
    commit(current => {
      if (current.edges.length >= 6000) return current;
      const source = current.nodes.find(node => node.id === connection.source), target = current.nodes.find(node => node.id === connection.target);
      if (!source || !target) return current;
      const sourcePort = nodeEndpointPort(source, "source", connection.sourceHandle), targetPort = nodeEndpointPort(target, "target", connection.targetHandle);
      if (source.id === target.id && sourcePort === targetPort) return current;
      if (current.edges.some(edge => edge.source === connection.source && edge.target === connection.target && nodeEndpointPort(source, "source", edge.sourcePort) === sourcePort && nodeEndpointPort(target, "target", edge.targetPort) === targetPort)) return current;
      return { ...current, edges: [...current.edges, { id: crypto.randomUUID(), source: connection.source!, target: connection.target!, sourcePort, targetPort, label: "", color: arrowColor, style: "solid", arrowhead, jump: arrowJump }] };
    });
  }, [arrowColor, arrowJump, arrowhead, commit]);
  const patchEdge = (patch: Partial<DiagramEdge>) => { if (selectedEdge) commit(current => ({ ...current, edges: current.edges.map(edge => edge.id === selectedEdge.id ? { ...edge, ...patch } : edge) })); };
  const reverseArrow = () => {
    if (!selectedEdge) return;
    patchEdge({ source: selectedEdge.target, target: selectedEdge.source, sourcePort: selectedEdge.target ? nodeEndpointPort(byId.get(selectedEdge.target), "target", selectedEdge.targetPort) : undefined, targetPort: selectedEdge.source ? nodeEndpointPort(byId.get(selectedEdge.source), "source", selectedEdge.sourcePort) : undefined, sourcePoint: selectedEdge.targetPoint, targetPoint: selectedEdge.sourcePoint });
  };
  const canDraw = () => writable && capability.current.canEdit && capability.current.accountId === accountId && !operationRef.current;
  const arrowEndpoints = (start: DiagramPoint, end: DiagramPoint) => ({
    start: snapArrowEndpoint(start, end, documentRef.current.nodes, 18 / currentViewport.current.zoom),
    end: snapArrowEndpoint(end, start, documentRef.current.nodes, 18 / currentViewport.current.zoom),
  });
  const createArrow = (start: DiagramPoint, end: DiagramPoint) => {
    if (!canDraw()) return;
    if (documentRef.current.edges.length >= 6000) { setError("每份圖稿最多 6,000 條箭頭或連線"); return; }
    const endpoints = arrowEndpoints(start, end);
    if (endpoints.start.point.x === endpoints.end.point.x && endpoints.start.point.y === endpoints.end.point.y) { setError("箭頭兩端重疊，請拖到另一個位置或圖形再放開"); return; }
    const edge = setEndpoint(setEndpoint({ id: crypto.randomUUID(), source: "", target: "", label: "", color: arrowColor, style: "solid", lineType: arrowLineType, arrowhead, jump: arrowJump, width: 2 }, "source", endpoints.start), "target", endpoints.end);
    commit(current => ({ ...current, edges: [...current.edges, edge] }));
    setSelected({ kind: "edge", id: edge.id });
  };
  const cancelDrawing = () => { drawing.current = null; setArrowDraft(null); };
  const drawingPoint = (event: React.PointerEvent, start?: DiagramPoint) => {
    const point = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    return constrainArrowPoint(start ?? point, point, Boolean(start && event.shiftKey));
  };
  const startDrawing = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!arrowTool || !canDraw() || event.button !== 0 || event.isPrimary === false) return;
    event.preventDefault(); event.stopPropagation();
    const start = drawingPoint(event);
    drawing.current = { pointerId: event.pointerId, start, end: start };
    event.currentTarget.setPointerCapture(event.pointerId);
    setArrowDraft({ start, end: start });
  };
  const moveDrawing = (event: React.PointerEvent<HTMLDivElement>) => {
    const pending = drawing.current;
    if (!pending || pending.pointerId !== event.pointerId || !canDraw()) return;
    const end = drawingPoint(event, pending.start);
    drawing.current = { ...pending, end }; setArrowDraft({ start: pending.start, end });
  };
  const finishDrawing = (event: React.PointerEvent<HTMLDivElement>) => {
    const pending = drawing.current;
    if (!pending || pending.pointerId !== event.pointerId) return;
    const end = drawingPoint(event, pending.start);
    cancelDrawing();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (Math.hypot(end.x - pending.start.x, end.y - pending.start.y) * currentViewport.current.zoom >= 8) createArrow(pending.start, end);
  };
  const reconnectArrow = (old: FlowEdge, connection: Connection) => {
    if (cancelledReconnect.current || !canDraw()) return;
    const stored = documentRef.current.edges.find(edge => edge.id === old.id);
    if (!stored) return;
    let changed = stored;
    for (const side of ["source", "target"] as const) {
      const id = connection[side];
      if (id === endpointId(stored.id, side) && !stored[side]) continue;
      if (!documentRef.current.nodes.some(node => node.id === id)) return;
      changed = setEndpoint(changed, side, { nodeId: id, port: nodeEndpointPort(documentRef.current.nodes.find(node => node.id === id), side, connection[`${side}Handle`]), point: { x: 0, y: 0 } });
    }
    reconnected.current = true;
    commit(current => ({ ...current, edges: current.edges.map(edge => edge.id === old.id ? changed : edge) }));
  };
  const finishReconnect = (event: MouseEvent | TouchEvent, old: FlowEdge, fixedHandle: "source" | "target", state: { isValid: boolean | null; toHandle?: unknown; fromHandle?: unknown }) => {
    if (cancelledReconnect.current || reconnected.current || !canDraw() || !state.fromHandle || state.toHandle || event.type === "touchcancel") return;
    const client = "changedTouches" in event ? event.changedTouches[0] : event;
    const bounds = canvas.current?.getBoundingClientRect();
    if (!client || bounds && (client.clientX < bounds.left || client.clientX > bounds.right || client.clientY < bounds.top || client.clientY > bounds.bottom)) return;
    const edge = documentRef.current.edges.find(item => item.id === old.id);
    if (!edge) return;
    // XYFlow 12 reports the fixed, opposite handle during a reconnection.
    const moved = fixedHandle === "source" ? "target" : "source";
    const point = constrainArrowPoint({ x: 0, y: 0 }, flow.screenToFlowPosition({ x: client.clientX, y: client.clientY }), false);
    const other = diagramEdgeEndpoint(edge, fixedHandle, documentRef.current.nodes).point;
    const endpoint = snapArrowEndpoint(point, other, documentRef.current.nodes, 18 / currentViewport.current.zoom);
    commit(current => ({ ...current, edges: current.edges.map(item => item.id === edge.id ? setEndpoint(item, moved, endpoint) : item) }));
  };
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
  const addNode = (shape: DiagramNode["shape"], point?: { x: number; y: number }) => {
    if (!writable || operationRef.current) return;
    setArrowTool(false); drawing.current = null; setArrowDraft(null);
    if (document.nodes.length >= 2000) { setError("每份圖稿最多 2,000 個圖形"); return; }
    const bounds = canvas.current?.getBoundingClientRect();
    const center = point ? flow.screenToFlowPosition(point) : bounds ? flow.screenToFlowPosition({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }) : { x: 120, y: 120 };
    const definition = shapes.find(item => item.shape === shape)!;
    const { width, height } = definition;
    let label: string = definition.name;
    if (shape === "resistor" || shape === "capacitor") {
      let count = 1;
      const prefix = shape === "resistor" ? "R" : "C";
      while (document.nodes.some(node => node.label === `${prefix}${count}`)) count++;
      label = `${prefix}${count}`;
    } else if (shape === "ground") label = "GND";
    else if (shape === "netlabel") label = "NET_NAME";
    const node: DiagramNode = { id: crypto.randomUUID(), x: Math.round((center.x - width / 2) / 20) * 20, y: Math.round((center.y - height / 2) / 20) * 20, width, height, shape, label, detail: "", color: definition.color };
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

  const exportDocument = async (format: "json" | "svg" | "png" | "pdf") => {
    setExporting(true);
    try {
      await downloadDiagram({ ...document, title: document.title.trim() || "未命名圖表", viewport: currentViewport.current }, format);
      setStatus("圖稿已匯出");
    } catch (caught) { setError(message(caught)); }
    finally { if (alive.current) setExporting(false); }
  };
  const selectObject = (kind: "node" | "edge", id: string) => { setSelected({ kind, id }); setConnecting(false); };
  const inspectorOpen = !arrowTool && Boolean(selectedNode || selectedEdge || connecting);
  const previewEdge = arrowDraft ? (() => {
    const endpoints = arrowEndpoints(arrowDraft.start, arrowDraft.end);
    return diagramEdgeRoute(setEndpoint(setEndpoint({ id: "preview", source: "", target: "", label: "", color: arrowColor, lineType: arrowLineType }, "source", endpoints.start), "target", endpoints.end), byId);
  })() : null;
  const selectedNodeId = selectedNode?.id;
  const selectedEdgeId = selectedEdge?.id;
  useEffect(() => {
    if ((!selectedNodeId && !selectedEdgeId) || !canvas.current) return;
    let frame = 0;
    const keepVisible = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const area = canvas.current?.getBoundingClientRect();
        const node = documentRef.current.nodes.find(item => item.id === selectedNodeId);
        const edge = documentRef.current.edges.find(item => item.id === selectedEdgeId);
        const points = edge ? diagramEdgeRoute(edge, new Map(documentRef.current.nodes.map(item => [item.id, item]))).points : [];
        const bounds = node ? { x: node.x, y: node.y, width: node.width, height: node.height } : points.length ? {
          x: Math.min(...points.map(point => point.x)), y: Math.min(...points.map(point => point.y)),
          width: Math.max(1, Math.max(...points.map(point => point.x)) - Math.min(...points.map(point => point.x))),
          height: Math.max(1, Math.max(...points.map(point => point.y)) - Math.min(...points.map(point => point.y))),
        } : undefined;
        if (!area || !bounds) return;
        const panel = inspector.current?.getBoundingClientRect();
        const overlap = panel && panel.left < area.right && panel.right > area.left ? Math.max(0, Math.min(area.bottom, panel.bottom) - Math.max(area.top, panel.top)) : 0;
        const height = area.height - overlap;
        if (height <= 48 || area.width <= 48) return;
        const current = currentViewport.current;
        const zoom = Math.min(current.zoom, (area.width - 48) / bounds.width, (height - 48) / bounds.height);
        const x = Math.max(24 - bounds.x * zoom, Math.min(current.x, area.width - 24 - (bounds.x + bounds.width) * zoom));
        const y = Math.max(24 - bounds.y * zoom, Math.min(current.y, height - 24 - (bounds.y + bounds.height) * zoom));
        if (Math.abs(x - current.x) > 1 || Math.abs(y - current.y) > 1 || zoom !== current.zoom) void flow.setViewport({ x, y, zoom });
      });
    };
    keepVisible();
    const observer = new ResizeObserver(keepVisible);
    observer.observe(canvas.current);
    if (inspector.current) observer.observe(inspector.current);
    return () => { observer.disconnect(); window.cancelAnimationFrame(frame); };
  }, [expanded, flow, libraryOpen, selectedNodeId, selectedEdgeId]);

  const editor = <section className={`comparison-diagram-editor${expanded ? " is-expanded" : ""}${arrowTool || connecting ? " is-connecting" : ""}`} data-diagram-theme={appearance} aria-label="圖表編輯器" onKeyDown={event => {
    const typing = (event.target as HTMLElement).closest("input,textarea,select,[contenteditable=true]");
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); if (writable) void save().catch(caught => setError(message(caught))); return; }
    if (typing) return;
    if (event.key === "Escape") { if (!selected && !connecting && !arrowTool) setExpanded(false); cancelDrawing(); cancelledReconnect.current = true; setArrowTool(false); setSelected(null); setConnecting(false); return; }
    if (!writable) return;
    if (!event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "a") { event.preventDefault(); setArrowTool(true); setConnecting(false); setSelected(null); return; }
    if (!event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "v") { cancelDrawing(); setArrowTool(false); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); setHistory(event.shiftKey ? redoDiagram : undoDiagram); }
    else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") { event.preventDefault(); setHistory(redoDiagram); }
    else if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); deleteSelection(); }
  }}>
    <header className="diagram-document-header">
      <FileText className="diagram-document-icon" aria-hidden="true" />
      <div className="diagram-document-identity">
        <Label className="sr-only" htmlFor="diagram-title">圖稿名稱</Label>
        <Input id="diagram-title" value={document.title} maxLength={240} disabled={!writable}
          onChange={event => commit(current => ({ ...current, title: event.target.value }))}
          onBlur={() => { if (!document.title.trim()) commit(current => ({ ...current, title: "未命名圖表" })); }} />
        <div className="diagram-document-meta">
          <span>{document.source ? `${document.source.kind === "power" ? "Power Tree" : "I²C Map"} · ${document.source.revision.toUpperCase()} 版` : "Block Diagram / 流程圖"}</span>
          <span className="diagram-save-status" role="status" title={status || "圖稿自動儲存於此帳號的本機瀏覽器"}>
            {!dirty && !loading && saved.some(item => item.id === document.id) && <Check aria-hidden="true" />}{loading ? "讀取中…" : operation ? "處理中…" : dirty ? (error || !canEdit ? "尚未儲存" : "儲存中…") : saved.some(item => item.id === document.id) ? "已存於本機" : "新圖稿"}
          </span>
          {!canEdit && <span>唯讀</span>}
        </div>
      </div>
      <div className="diagram-document-actions">
        <Button variant="ghost" size="icon" aria-label={appearance === "dark" ? "切換淺色模式" : "切換深色模式"} title={appearance === "dark" ? "切換淺色模式" : "切換深色模式"} onClick={() => { const next = appearance === "dark" ? "light" : "dark"; setAppearance(next); writeDiagramAppearance(next); }}>{appearance === "dark" ? <Sun /> : <Moon />}</Button>
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="sm">檔案<ChevronDown /></Button></DropdownMenuTrigger>
          <DropdownMenuContent className="diagram-menu" data-diagram-theme={appearance} align="end"><DropdownMenuGroup>
            <DropdownMenuItem disabled={!writable} onSelect={() => void switchTo(() => createBlankDiagram())}><FilePlus2 />空白圖稿</DropdownMenuItem>
            <DropdownMenuItem disabled={loading || operation} onSelect={() => setSavedOpen(true)}><FolderOpen />開啟已儲存圖稿<span className="diagram-menu-count">{saved.length}</span></DropdownMenuItem>
            <DropdownMenuItem disabled={!writable} onSelect={() => input.current?.click()}><FileText />開啟圖稿檔</DropdownMenuItem>
            <DropdownMenuItem disabled={!writable} onSelect={() => void save().catch(caught => setError(message(caught)))}><Save />儲存<span className="diagram-menu-shortcut">Ctrl S</span></DropdownMenuItem>
          </DropdownMenuGroup><DropdownMenuSeparator /><DropdownMenuGroup>
            <DropdownMenuItem aria-label="刪除此圖稿" disabled={!writable || !saved.some(item => item.id === document.id)} onSelect={() => setDeleting(true)}><Trash2 />刪除此圖稿</DropdownMenuItem>
          </DropdownMenuGroup></DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm" disabled={exporting}><ArrowDownToLine /><span>{exporting ? "匯出中…" : "匯出"}</span><ChevronDown /></Button></DropdownMenuTrigger>
          <DropdownMenuContent className="diagram-menu" data-diagram-theme={appearance} align="end"><DropdownMenuLabel>匯出目前圖稿</DropdownMenuLabel><DropdownMenuGroup>
            <DropdownMenuItem onSelect={() => void exportDocument("json")}>可編輯圖稿 JSON<span className="diagram-menu-shortcut">備份 / 分享</span></DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void exportDocument("svg")}>SVG 向量圖</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void exportDocument("png")}>PNG 圖片</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void exportDocument("pdf")}>PDF 文件</DropdownMenuItem>
          </DropdownMenuGroup></DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="icon" className="diagram-expand" aria-label={expanded ? "離開全畫布" : "展開全畫布"} title={expanded ? "離開全畫布" : "展開全畫布"} onClick={() => setExpanded(value => !value)}>{expanded ? <X /> : <Expand />}</Button>
      </div>
      <input ref={input} className="sr-only" aria-label="選擇圖稿 JSON" type="file" accept=".json,application/json" disabled={!writable} onChange={event => { const file = event.target.files?.[0]; if (file) void importFile(file); event.target.value = ""; }} />
    </header>
    {error && <div className="diagram-editor-error" role="alert"><span>{error}</span><Button size="icon" variant="ghost" aria-label="關閉錯誤訊息" onClick={() => setError("")}><X /></Button></div>}
    {routes.notice && <div className="diagram-route-notice" role="status">{routes.notice}</div>}
    <div className="diagram-command-bar" role="toolbar" aria-label="圖稿工具">
      <div className="diagram-command-group">
        <Button variant="ghost" size="icon" aria-label={libraryOpen ? "收合圖形庫" : "展開圖形庫"} title="圖形庫" aria-pressed={libraryOpen} onClick={() => setLibraryOpen(value => !value)}>{libraryOpen ? <PanelLeftClose /> : <PanelLeftOpen />}</Button>
        <Button variant="ghost" size="icon" aria-label="復原" title="復原 (Ctrl Z)" disabled={!writable || !history.past.length} onClick={() => setHistory(undoDiagram)}><Undo2 /></Button>
        <Button variant="ghost" size="icon" aria-label="重做" title="重做 (Ctrl Shift Z)" disabled={!writable || !history.future.length} onClick={() => setHistory(redoDiagram)}><Redo2 /></Button>
      </div>
      <div className="diagram-command-group diagram-drawing-tools">
        <Button variant="ghost" size="icon" aria-label="選取工具" title="選取與移動 (V)" aria-pressed={!arrowTool} onClick={() => { cancelDrawing(); setArrowTool(false); }}><MousePointer2 /></Button>
        <Button variant="ghost" size="sm" aria-label="畫箭頭" title="拖曳畫箭頭 (A)" aria-pressed={arrowTool && arrowhead !== "both"} disabled={!writable} onClick={() => { cancelDrawing(); setArrowTool(true); setArrowhead("end"); setConnecting(false); setSelected(null); }}><ArrowUpRight /><span>箭頭</span></Button>
        <Button variant="ghost" size="sm" aria-label="畫雙箭頭" title="拖曳畫雙向箭頭" aria-pressed={arrowTool && arrowhead === "both"} disabled={!writable} onClick={() => { cancelDrawing(); setArrowTool(true); setArrowhead("both"); setConnecting(false); setSelected(null); }}><ArrowLeftRight /><span>雙箭頭</span></Button>
      </div>
      <div className="diagram-command-group diagram-object-tools">
        <Button variant="ghost" size="icon" aria-label="複製圖形" title="複製圖形" disabled={!writable || !selectedNode} onClick={duplicate}><Copy /></Button>
        <Button variant="ghost" size="icon" aria-label="刪除選取物件" title="刪除選取物件 (Delete)" disabled={!writable || !selected} onClick={deleteSelection}><Trash2 /></Button>
      </div>
      <div className="diagram-command-group">
        <Button variant="ghost" size="sm" aria-label="連線" title="依起點與終點連線" aria-pressed={connecting} disabled={!writable || document.nodes.length < 2} onClick={() => { cancelDrawing(); setArrowTool(false); setConnecting(value => !value); setSelected(null); }}><Link2 /><span>連線</span></Button>
        <Button variant="ghost" size="sm" className="diagram-layout-button" aria-label="自動排列" title="自動排列" disabled={!writable || !document.nodes.length} onClick={() => { commit(current => autoLayoutDiagram(current)); window.requestAnimationFrame(() => fitCanvas()); }}><LayoutGrid /><span>自動排列</span></Button>
      </div>
      <div className="diagram-source-command">
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="sm" disabled={!session || !writable}><GitBranch /><span>帶入比對結果</span><ChevronDown /></Button></DropdownMenuTrigger>
          <DropdownMenuContent className="diagram-menu" data-diagram-theme={appearance} align="end">
            <DropdownMenuLabel>來源版本</DropdownMenuLabel><div className="diagram-source-controls"><select aria-label="來源版本" value={revision} onChange={event => setRevision(event.target.value as "a" | "b")} disabled={!session || !writable}><option value="a">A 版（舊版）</option><option value="b">B 版（新版）</option></select></div>
            <DropdownMenuGroup>
              <DropdownMenuItem disabled={!session || !writable} onSelect={() => void switchTo(() => sourceDiagram(session!, "power", revision))}>帶入 Power Tree</DropdownMenuItem>
              <DropdownMenuItem disabled={!session || !writable} onSelect={() => void switchTo(() => sourceDiagram(session!, "i2c", revision))}>帶入 I²C Map</DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
    {arrowTool && <div className="diagram-drawing-settings" role="group" aria-label="繪製連線設定">
      <label>路徑<select className="diagram-arrow-type" aria-label="繪製箭頭線型" value={arrowLineType} disabled={!writable} onChange={event => setArrowLineType(event.target.value as typeof arrowLineType)}><option value="straight">直線</option><option value="elbow">折線</option><option value="curve">曲線</option></select></label>
      <label>箭頭<select className="diagram-arrow-type" aria-label="繪製箭頭方向" value={arrowhead} disabled={!writable} onChange={event => setArrowhead(event.target.value as typeof arrowhead)}><option value="end">單向箭頭</option><option value="both">雙向箭頭</option><option value="none">無箭頭連線</option></select></label>
      <label>交叉處<select className="diagram-arrow-type" aria-label="繪製跨線方式" value={arrowJump} disabled={!writable} onChange={event => setArrowJump(event.target.value as typeof arrowJump)}><option value="arc">拱橋跨線</option><option value="none">不顯示拱橋</option></select></label>
      <label>線條顏色<input type="color" aria-label="繪製線條顏色" value={arrowColor} disabled={!writable} onInput={event => { if (/^#[0-9a-f]{6}$/i.test(event.currentTarget.value)) setArrowColor(event.currentTarget.value.toLowerCase()); }} onChange={event => { if (/^#[0-9a-f]{6}$/i.test(event.target.value)) setArrowColor(event.target.value.toLowerCase()); }} /></label>
    </div>}
    <div className={`diagram-workbench${libraryOpen ? " has-library" : ""}${inspectorOpen ? " has-inspector" : ""}`}>
      {libraryOpen && <aside className="diagram-palette" aria-label="繪圖工具">
        <div className="diagram-panel-heading"><h3>圖形庫</h3><span>點選新增</span></div>
        <div className="diagram-shape-grid">{shapes.map(({ shape, name, Icon }) => <Button key={shape} className={`diagram-shape is-${shape}`} variant="ghost" disabled={!writable} draggable={writable} onDragStart={event => { event.dataTransfer.setData("application/autocheck-shape", shape); event.dataTransfer.effectAllowed = "copy"; }} onClick={() => { setConnecting(false); addNode(shape); }}><Icon /><span>{name}</span></Button>)}</div>
        <div className="diagram-palette-help"><MousePointer2 /><p>拖曳圖形調整位置<br />點選物件編輯內容</p><ArrowUpRight /><p>按「箭頭」直接拖曳繪製<br />靠近圖形會自動吸附</p></div>
        <div className="diagram-palette-bottom"><span>鍵盤快捷鍵</span><div>畫箭頭<kbd>A</kbd></div><div>選取<kbd>V / Esc</kbd></div><div>復原<kbd>Ctrl Z</kbd></div><div>儲存<kbd>Ctrl S</kbd></div></div>
      </aside>}
      <div ref={canvas} className="diagram-canvas" onDragOver={event => { if (writable && event.dataTransfer.types.includes("application/autocheck-shape")) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } }} onDrop={event => { const shape = event.dataTransfer.getData("application/autocheck-shape"); if (!writable || !shapes.some(item => item.shape === shape)) return; event.preventDefault(); setConnecting(false); addNode(shape as DiagramNode["shape"], { x: event.clientX, y: event.clientY }); }}>
        <ReactFlow<FlowNode, FlowEdge> nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onNodesChange={onNodesChange} onConnect={connect} onReconnect={reconnectArrow} onReconnectStart={() => { reconnected.current = false; cancelledReconnect.current = false; }} onReconnectEnd={finishReconnect} edgesReconnectable={writable && !arrowTool} reconnectRadius={12 / (zoomPercent / 100)} connectionRadius={32} connectionMode={ConnectionMode.Loose} nodesDraggable={writable && !arrowTool} nodesConnectable={writable && !arrowTool} panOnDrag={!arrowTool} zoomOnScroll={!arrowDraft} connectOnClick nodesFocusable edgesFocusable deleteKeyCode={null} multiSelectionKeyCode={null} selectionKeyCode={null} snapToGrid snapGrid={[20, 20]} minZoom={0.1} maxZoom={4} colorMode={appearance} ariaLabelConfig={{ "node.a11yDescription.default": "選取圖形以編輯，可拖曳調整位置。", "edge.a11yDescription.default": "選取箭頭可編輯線型或反轉方向，拖曳兩端可調整端點。" }} elevateEdgesOnSelect={false} onlyRenderVisibleElements
          onNodeClick={(_, node) => selectObject("node", node.id)} onEdgeClick={(_, edge) => selectObject("edge", edge.id)} onPaneClick={() => { setSelected(null); setConnecting(false); }}
          onNodeDragStart={() => { dragBefore.current = documentRef.current; }}
          onNodeDragStop={() => { const before = dragBefore.current; dragBefore.current = null; if (before) setHistory(current => editDiagram(current, { ...current.present, updatedAt: new Date().toISOString() }, before)); }}
          onMoveEnd={(_, viewport) => { currentViewport.current = viewport; setZoomPercent(Math.round(viewport.zoom * 100)); if (writable && !operationRef.current) setHistory(current => JSON.stringify(current.present.viewport) === JSON.stringify(viewport) ? current : { ...current, present: { ...current.present, viewport } }); }}
          defaultViewport={currentViewport.current} aria-label="圖表畫布">
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color={canvasTheme.grid} />
        </ReactFlow>
        {arrowTool && <div className="diagram-arrow-overlay" aria-label="箭頭繪製區" onPointerDown={startDrawing} onPointerMove={moveDrawing} onPointerUp={finishDrawing} onPointerCancel={cancelDrawing}>
          <div className="diagram-arrow-hint" role="status">拖曳畫箭頭 · 靠近圖形自動吸附 · Shift 保持水平／垂直 · Esc 結束</div>
          {previewEdge && <svg className="diagram-arrow-preview" style={{ color: diagramStrokeColor(arrowColor, appearance) }} aria-hidden="true"><defs><marker id={`diagram-preview-${document.id}`} markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" fill="currentColor" /></marker></defs><g transform={`translate(${currentViewport.current.x},${currentViewport.current.y}) scale(${currentViewport.current.zoom})`}><path d={previewEdge.path} fill="none" stroke="currentColor" strokeWidth={2 / currentViewport.current.zoom} markerStart={arrowhead === "both" ? `url(#diagram-preview-${document.id})` : undefined} markerEnd={arrowhead !== "none" ? `url(#diagram-preview-${document.id})` : undefined} /></g></svg>}
        </div>}
        {!document.nodes.length && !document.edges.length && !arrowTool && <div className="diagram-canvas-empty"><div className="diagram-empty-shapes"><Square /><Link2 /><Circle /></div><strong>開始你的第一張圖</strong><span>從圖形庫新增方框，或按「箭頭」直接畫線</span>{canEdit && <Button disabled={!writable} onClick={() => addNode("rectangle")}><Plus />新增方框</Button>}<small>也可以從上方「帶入比對結果」開始</small></div>}
        {inspectorOpen && <span className="diagram-selection-indicator">{connecting ? "建立連線" : selectedNode ? "已選取 1 個圖形" : "已選取 1 條連線"}</span>}
      </div>
      {inspectorOpen && <aside ref={inspector} className="diagram-inspector" aria-label={connecting ? "建立連線" : "圖形屬性"}>
        <div className="diagram-panel-heading"><h3>{connecting ? "建立連線" : selectedNode ? "圖形屬性" : "連線屬性"}</h3><Button variant="ghost" size="icon" aria-label="關閉屬性面板" onClick={() => { setSelected(null); setConnecting(false); }}><X /></Button></div>
        {selectedNode || selectedEdge ? <div className="diagram-property-fields">
          <div className="diagram-property-section"><Label htmlFor="diagram-label">{selectedNode ? selectedNode.shape === "netlabel" ? "Net Name" : "名稱" : "連線文字"}</Label><Textarea id="diagram-label" rows={2} maxLength={500} value={(selectedNode ?? selectedEdge)!.label} disabled={!writable} onChange={event => selectedNode ? patchNode({ label: event.target.value }) : commit(current => ({ ...current, edges: current.edges.map(edge => edge.id === selectedEdge!.id ? { ...edge, label: event.target.value } : edge) }))} />
          {selectedEdge && <small className="diagram-edge-help">可填 Net Name，例如 VCC_3V3。</small>}
          {selectedNode && <><Label htmlFor="diagram-detail">說明</Label><Textarea id="diagram-detail" rows={3} maxLength={4000} placeholder="補充元件資訊或審查備註" value={selectedNode.detail} disabled={!writable} onChange={event => patchNode({ detail: event.target.value })} /></>}</div>
          <div className="diagram-property-section"><DiagramColorControl id={selectedNode ? "diagram-node-color" : "diagram-edge-color"} label={selectedNode ? "框線顏色" : "線條顏色"} value={(selectedNode ?? selectedEdge)!.color} disabled={!writable} onChange={color => selectedNode ? patchNode({ color }) : patchEdge({ color })} /></div>
          {selectedNode && !isElectricalSymbol(selectedNode.shape) && <div className="diagram-property-section"><DiagramColorControl id="diagram-node-fill" label="填色" value={selectedNode.fillColor ?? diagramNodeColors(selectedNode.color, appearance).fill} disabled={!writable} onChange={fillColor => patchNode({ fillColor })} /><Button variant="ghost" size="sm" disabled={!writable || !selectedNode.fillColor} onClick={() => patchNode({ fillColor: undefined })}>使用自動填色</Button></div>}
          {selectedNode && <div className="diagram-property-section">
            {isElectricalSymbol(selectedNode.shape) && <><Label htmlFor="diagram-symbol-rotation">符號方向</Label><select id="diagram-symbol-rotation" value={selectedNode.rotation ?? 0} disabled={!writable} onChange={event => rotateSymbol(Number(event.target.value) as NonNullable<DiagramNode["rotation"]>)}><option value="0">0°</option><option value="90">90°</option><option value="180">180°</option><option value="270">270°</option></select></>}
            <div className="diagram-size-fields"><div><Label htmlFor="diagram-width">寬度 <span>px</span></Label><Input id="diagram-width" type="number" min={64} max={2400} value={Math.round(selectedNode.width)} disabled={!writable} onChange={event => { const value = Number(event.target.value); if (value >= 64 && value <= 2400) patchNode({ width: value }); }} /></div><div><Label htmlFor="diagram-height">高度 <span>px</span></Label><Input id="diagram-height" type="number" min={40} max={2400} value={Math.round(selectedNode.height)} disabled={!writable} onChange={event => { const value = Number(event.target.value); if (value >= 40 && value <= 2400) patchNode({ height: value }); }} /></div></div>
            <Button size="sm" variant="outline" disabled={!writable} onClick={duplicate}><Copy />複製圖形</Button>
            {selectedNode.refdes && <p className="diagram-source-ref">元件 {selectedNode.refdes}</p>}{selectedNode.page && sourcePdf && <Button size="sm" variant="outline" asChild><a href={`${sourcePdf}#page=${selectedNode.page}`} target="_blank" rel="noopener noreferrer">查看線路圖第 {selectedNode.page} 頁</a></Button>}
          </div>}
          {selectedEdge && <div className="diagram-property-section">
            <p className="diagram-edge-help">拖曳箭頭兩端可改位置；放到圖形上會自動連接。</p>
            <Label htmlFor="diagram-line-type">路徑</Label><select id="diagram-line-type" value={selectedEdge.lineType ?? "elbow"} disabled={!writable} onChange={event => patchEdge({ lineType: event.target.value as DiagramEdge["lineType"] })}><option value="straight">直線</option><option value="elbow">折線</option><option value="curve">曲線</option></select>
            <Label htmlFor="diagram-arrowhead">箭頭方向</Label><select id="diagram-arrowhead" value={selectedEdge.arrowhead ?? "end"} disabled={!writable} onChange={event => patchEdge({ arrowhead: event.target.value as DiagramEdge["arrowhead"] })}><option value="end">單向箭頭</option><option value="both">雙向箭頭</option><option value="none">不顯示箭頭</option></select>
            <Label htmlFor="diagram-line-jump">交叉處</Label><select id="diagram-line-jump" value={selectedEdge.jump ?? "none"} disabled={!writable} onChange={event => patchEdge({ jump: event.target.value as DiagramEdge["jump"] })}><option value="arc">拱橋跨線</option><option value="none">不顯示拱橋</option></select><p className="diagram-edge-help">拱橋表示交叉而不相連；共用端點不加拱橋。</p>
            <Label htmlFor="diagram-line-style">線條</Label><select id="diagram-line-style" value={selectedEdge.style ?? "solid"} disabled={!writable} onChange={event => patchEdge({ style: event.target.value as "solid" | "dashed" })}><option value="solid">實線</option><option value="dashed">虛線</option></select>
            <Label htmlFor="diagram-line-width">線寬</Label><Input id="diagram-line-width" type="number" min={1} max={8} value={selectedEdge.width ?? 2} disabled={!writable} onChange={event => { const width = Number(event.target.value); if (Number.isInteger(width) && width >= 1 && width <= 8) patchEdge({ width }); }} />
            <Button variant="outline" size="sm" disabled={!writable} onClick={reverseArrow}><ArrowLeftRight />反轉方向</Button>
          </div>}
          <Button size="sm" variant="ghost" className="diagram-delete-selection" disabled={!writable} onClick={deleteSelection}><Trash2 />刪除{selectedNode ? "圖形" : "連線"}</Button>
        </div> : <div className="diagram-connection-form"><p>依序選擇起點與終點，或直接拖曳畫布上的連接點。</p><Label htmlFor="diagram-connect-source">起點</Label><select id="diagram-connect-source" value={connectionSource} disabled={!writable} onChange={event => setConnectionSource(event.target.value)}><option value="">選擇圖形</option>{document.nodes.map(node => <option key={node.id} value={node.id}>{node.label || "未命名"}</option>)}</select><Label htmlFor="diagram-connect-target">終點</Label><select id="diagram-connect-target" value={connectionTarget} disabled={!writable} onChange={event => setConnectionTarget(event.target.value)}><option value="">選擇圖形</option>{document.nodes.filter(node => node.id !== connectionSource).map(node => <option key={node.id} value={node.id}>{node.label || "未命名"}</option>)}</select><Button size="sm" disabled={!writable || !connectionSource || !connectionTarget || connectionSource === connectionTarget} onClick={() => connect({ source: connectionSource, target: connectionTarget, sourceHandle: nodeEndpointPort(byId.get(connectionSource), "source"), targetHandle: nodeEndpointPort(byId.get(connectionTarget), "target") })}><Link2 />新增連線</Button></div>}
      </aside>}
    </div>
    <footer className="diagram-statusbar">
      <div className="diagram-canvas-summary"><span>{document.nodes.length} 個圖形</span><span>{document.edges.length} 條連線</span><span className="diagram-local-note">圖稿僅存於此瀏覽器 · JSON 可備份</span></div>
      <div className="diagram-zoom-controls">
        <Button size="icon" variant="ghost" aria-label="縮小圖表" title="縮小" onClick={() => void flow.zoomOut()}><Minus /></Button>
        <button type="button" aria-label="設為百分之百縮放" title="重設為 100%" onClick={() => void flow.zoomTo(1)}>{zoomPercent}%</button>
        <Button size="icon" variant="ghost" aria-label="放大圖表" title="放大" onClick={() => void flow.zoomIn()}><Plus /></Button>
        <Button size="icon" variant="ghost" aria-label="適合畫布" title="適合畫布" onClick={() => fitCanvas()}><Maximize /></Button>
      </div>
    </footer>
    <Dialog open={savedOpen} onOpenChange={setSavedOpen}><DialogContent className="diagram-saved-dialog" data-diagram-theme={appearance}><DialogHeader><DialogTitle>開啟已儲存圖稿</DialogTitle><DialogDescription>此帳號在目前瀏覽器的圖稿。切換前會先保存目前內容。</DialogDescription></DialogHeader>
      <div className="diagram-saved-list">{saved.length ? saved.map(item => <button key={item.id} type="button" aria-label={`開啟圖稿：${item.title}`} disabled={operation} onClick={() => { void switchTo(() => item, true).then(() => setSavedOpen(false)); }}><FileText /><span><strong>{item.title}</strong><small>{new Date(item.updatedAt).toLocaleString("zh-TW")} · {item.nodes.length} 個圖形</small></span>{item.id === document.id && <Check />}</button>) : <p>尚未儲存圖稿。新增圖形後，內容會自動保存在這裡。</p>}</div>
    </DialogContent></Dialog>
    <AlertDialog open={deleting} onOpenChange={setDeleting}><AlertDialogContent className="diagram-delete-dialog" data-diagram-theme={appearance}><AlertDialogHeader><AlertDialogTitle>刪除此圖稿？</AlertDialogTitle><AlertDialogDescription>「{document.title}」會從此帳號的本機圖稿移除。已匯出的圖稿檔可以重新開啟。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={() => void removeDocument()}>刪除圖稿</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>;
  return expanded ? createPortal(editor, window.document.body) : editor;
}
