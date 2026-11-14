import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { FlaskConical, LoaderCircle, Lock, LockOpen, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { readResearchBrd } from "./core/researchBrd.ts";
import {
  addResearchTrack, addResearchVia, getResearchPendingPads, moveResearchComponent,
  routeResearchNet, suggestResearchPlacement, type ResearchBoard, type ResearchPoint,
} from "./core/researchLayout.ts";
import "./pcb-research.css";

type Scheme = { name: string; board: ResearchBoard; pending: string[] };
type Draft = { name: string; schemes: Scheme[]; warnings: string[] };
type Tool = "place" | "track" | "via";

async function localDraft(owner: string, draft?: Draft): Promise<Draft | undefined> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("pcb-research-drafts", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("drafts", draft ? "readwrite" : "readonly");
      const store = tx.objectStore("drafts");
      const request = draft ? store.put(draft, owner) : store.get(owner);
      tx.oncomplete = () => resolve(draft ? undefined : request.result);
      tx.onabort = tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}

const points = (value: readonly ResearchPoint[]) => value.map(({ x, y }) => `${x},${y}`).join(" ");
const number = (value: number) => Number(value.toFixed(2));
const trialId = () => `trial-${crypto.randomUUID()}`;

export function PcbResearchDialog({ open, owner, onClose }: { open: boolean; owner: string; onClose: () => void }) {
  const [draft, setDraft] = useState<Draft>();
  const [token, setToken] = useState("");
  const [file, setFile] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [index, setIndex] = useState(0);
  const [compare, setCompare] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [net, setNet] = useState("");
  const [layer, setLayer] = useState("");
  const [width, setWidth] = useState("");
  const [clearance, setClearance] = useState("");
  const [via, setVia] = useState("");
  const [allowLayerChanges, setAllowLayerChanges] = useState(false);
  const [alternateLayer, setAlternateLayer] = useState("");
  const [tool, setTool] = useState<Tool>("place");
  const [padsSelectable, setPadsSelectable] = useState(false);
  const [start, setStart] = useState<ResearchPoint>();
  const [center, setCenter] = useState<ResearchPoint>();
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState<{ id: string; origin: ResearchPoint; point: ResearchPoint }>();
  const [editCopper, setEditCopper] = useState<string>();
  const [editPosition, setEditPosition] = useState(false);
  const [coordX, setCoordX] = useState("");
  const [coordY, setCoordY] = useState("");
  const [showImport, setShowImport] = useState(false);
  const canvas = useRef<SVGSVGElement>(null);
  const pendingRequest = useRef<AbortController>();
  const scheme = draft?.schemes[index];
  const board = scheme?.board;
  const activeLayer = board?.layers.includes(layer) ? layer : board?.layers[0] ?? "";
  const otherLayer = board?.layers.find((name) => name === alternateLayer && name !== activeLayer)
    ?? board?.layers.find((name) => name !== activeLayer);
  const component = board?.components.find((part) => part.id === selected.at(-1));
  const copper = board?.tracks.find((track) => track.id === editCopper && !track.locked) ?? board?.vias.find((item) => item.id === editCopper && !item.locked);
  const nets = useMemo(() => [...new Set(board?.pads.filter((pad) => !pad.obstacleOnly && pad.net).map((pad) => pad.net))].sort(), [board?.pads]);
  const readyRules = width.trim() !== "" && clearance.trim() !== "" && Number(width) > 0 && Number(clearance) >= 0 && Number.isFinite(Number(width)) && Number.isFinite(Number(clearance));
  const viaSize = via.trim() && Number.isFinite(Number(via)) && Number(via) > 0 ? Number(via) : undefined;
  const dimensions = board && { width: board.width / zoom, height: board.height / zoom };
  const size = dimensions && Math.max(dimensions.width, dimensions.height);
  const view = board && dimensions && {
    ...dimensions, x: (center?.x ?? board.width / 2) - dimensions.width / 2,
    y: (center?.y ?? board.height / 2) - dimensions.height / 2,
  };

  useEffect(() => () => pendingRequest.current?.abort(), []);

  function update(board: ResearchBoard, affected: string[] = []) {
    setDraft((previous) => {
      if (!previous) return previous;
      const changed = new Set(affected);
      return { ...previous, schemes: previous.schemes.map((item, i) => i !== index ? item : {
        ...item, board, pending: [...item.pending.filter((name) => !changed.has(name)),
          ...[...changed].filter((name) => getResearchPendingPads(board, name).length > 0)],
      }) };
    });
  }

  async function importBoard() {
    if (!file || !token.trim()) return;
    const controller = new AbortController();
    pendingRequest.current = controller;
    setBusy(true); setError(""); setMessage("");
    try {
      const { board, warnings } = await readResearchBrd(file, { token: token.trim(), signal: controller.signal });
      setDraft({ name: file.name, warnings, schemes: [{ name: "方案 A", board, pending: board.unresolvedNets ?? [] }] });
      setIndex(0); setLayer(board.layers[0] ?? ""); setSelected([]); setNet(""); setStart(undefined); setEditPosition(false); setEditCopper(undefined);
      setZoom(1); setCenter(undefined); setTool("place"); setCompare(false); setShowImport(false); setFile(undefined);
      setMessage(`已讀取 ${board.components.length.toLocaleString()} 個元件、${board.pads.length.toLocaleString()} 個焊盤。`);
    } catch (failure) {
      setError(controller.signal.aborted ? "已取消匯入。" : failure instanceof Error ? failure.message : "無法讀取板檔。");
    } finally { setBusy(false); pendingRequest.current = undefined; }
  }

  async function persist(save: boolean) {
    if (save && !draft) return;
    setError("");
    try {
      const restored = await localDraft(owner, save ? draft : undefined);
      if (save) setMessage("已儲存在目前瀏覽器。");
      else if (restored) {
        setDraft(restored); setIndex(0); setSelected([]); setNet(""); setLayer(""); setStart(undefined); setEditPosition(false); setEditCopper(undefined);
        setZoom(1); setCenter(undefined); setTool("place"); setCompare(false); setMessage("已載入本機方案。");
      } else setMessage("這個瀏覽器還沒有儲存方案。");
    } catch { setError("無法讀寫瀏覽器儲存空間，畫面上的方案仍可繼續編輯。"); }
  }

  function move(id: string, point: ResearchPoint, rotation?: number) {
    if (!board) return;
    const result = moveResearchComponent(board, id, point, rotation);
    if (result.reason) { setError("這個位置受板框、禁制區或元件鎖定限制。"); return; }
    setError(""); update(result.board, result.affectedNets);
    if (result.affectedNets.length) setMessage(`已移動元件，${result.affectedNets.length} 個相關 Net 已重新檢查。`);
  }

  function place() {
    if (!board || !selected.length) return;
    const result = suggestResearchPlacement(board, selected);
    setError(""); update(result.board, result.affectedNets);
    setMessage(`移動 ${result.moved.length} 個元件，略過 ${result.skipped.length} 個。`);
  }

  async function route() {
    if (!board || !net || !readyRules) return;
    setBusy(true); setError(""); setMessage("正在為所選 Net 試走…");
    await new Promise((resolve) => setTimeout(resolve, 30));
    try {
      const useVia = allowLayerChanges && viaSize && otherLayer;
      const result = routeResearchNet(board, net, { width: Number(width), clearance: Number(clearance), layers: useVia ? [activeLayer, otherLayer] : [activeLayer], viaDiameter: useVia ? viaSize : undefined });
      update(result.board, [net]);
      setMessage(result.reason === "unsupported" ? "" : `新增 ${result.tracks.length} 段線、${result.vias.length} 顆 Via，${result.pending.length} 個焊盤仍待檢查。`);
      if (result.reason === "unsupported") setError("這個 Net 含不支援的焊盤、連接點或規則，請在板上核對後手動處理。");
      else if (result.reason) setError("指定範圍內無法完整走通，請調整位置、走線層或規則後再試。");
    } catch { setError("試走失敗，請調整範圍後再試。"); }
    finally { setBusy(false); }
  }

  function boardPoint(event: ReactPointerEvent<SVGElement>): ResearchPoint | undefined {
    const transform = canvas.current?.getScreenCTM();
    if (!transform) return;
    const { x, y } = new DOMPoint(event.clientX, event.clientY).matrixTransform(transform.inverse());
    return { x: number(x), y: number(y) };
  }

  function draw(point: ResearchPoint) {
    if (!board || !net || !readyRules) return;
    setError("");
    if (tool === "via" && viaSize) {
      const result = addResearchVia(board, { id: trialId(), net, ...point, diameter: viaSize, layers: board.layers }, Number(clearance));
      if (result.reason) setError("這個 Via 位置不符合目前的間距或板框限制。");
      else update(result.board, [net]);
    } else if (tool === "track") {
      if (!start) { setStart(point); return; }
      const bend = { x: point.x, y: start.y };
      const path = [start, bend, point].filter((item, i, list) => i === 0 || item.x !== list[i - 1].x || item.y !== list[i - 1].y);
      if (path.length < 2) return;
      const result = addResearchTrack(board, { id: trialId(), net, layer: activeLayer, width: Number(width), points: path }, Number(clearance));
      if (result.reason) setError("線段不符合目前的間距或板框限制。可以換個轉折點再試。");
      else { update(result.board, [net]); setStart(point); }
    }
  }

  const shown = compare ? draft?.schemes : scheme ? [scheme] : [];
  const importVisible = !draft || showImport;
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
      <DialogContent className="pcb-research-dialog" onEscapeKeyDown={(event) => { if (busy || start) event.preventDefault(); if (start) setStart(undefined); }} onInteractOutside={(event) => event.preventDefault()}>
        <header className="pcb-research-heading">
          <div className="flex items-center gap-2"><FlaskConical aria-hidden="true" className="size-5 text-primary" /><DialogTitle>研發試排</DialogTitle></div>
          <DialogDescription>{draft ? `${draft.name} · 方案保存在這台電腦的瀏覽器` : "匯入一份 Allegro .brd，用擺料、試走線和方案比較驗證架構。"}</DialogDescription>
        </header>
        <div className="pcb-research-bar">
          {draft && <Button type="button" variant="outline" disabled={busy} onClick={() => setShowImport(!showImport)}>{showImport ? "收起匯入" : "更換 .brd"}</Button>}
          {!draft && <Button type="button" variant="outline" disabled={busy} onClick={() => void persist(false)}>開啟本機方案</Button>}
          {draft && <Button type="button" variant="outline" disabled={busy} onClick={() => void persist(true)}>儲存本機方案</Button>}
          {draft && <Button type="button" variant="outline" disabled={busy || draft.schemes.length > 1} onClick={() => {
            if (!scheme) return;
            setDraft({ ...draft, schemes: [...draft.schemes, { ...scheme, name: "方案 B" }] }); setIndex(1); setStart(undefined);
          }}>複製成方案 B</Button>}
          {draft && draft.schemes.length > 1 && <Button type="button" variant={compare ? "secondary" : "outline"} aria-pressed={compare} disabled={busy} onClick={() => { setCompare(!compare); setStart(undefined); }}>A／B 比較</Button>}
        </div>
        {importVisible && <section className="pcb-research-import" aria-label="匯入 Allegro 板檔">
          <label>Allegro .brd<input type="file" accept=".brd" disabled={busy} onChange={(event) => setFile(event.target.files?.[0])} /></label>
          <label>本機配對碼<input type="password" autoComplete="off" value={token} disabled={busy} onChange={(event) => setToken(event.target.value)} /></label>
          <Button type="button" disabled={!file || !token.trim() || busy} onClick={() => void importBoard()}>{busy ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Upload aria-hidden="true" className="size-4" />}匯入 .brd</Button>
          {busy && pendingRequest.current && <Button type="button" variant="outline" onClick={() => pendingRequest.current?.abort()}>取消匯入</Button>}
          <details className="pcb-research-setup"><summary>如何啟動本機轉換器</summary><p>在核准的電腦準備 Python 3 和 KiCad 10。從專案目錄執行 <code>py -m server.pcb_research.bridge --origin https://lovableteat.github.io</code>，再貼上終端機顯示的配對碼。板檔只由這台電腦的轉換器處理。</p></details>
        </section>}
        {(error || message) && <div className="pcb-research-feedback">{error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}</div>}
        {draft && draft.warnings.length > 0 && <details className="pcb-research-warnings"><summary>匯入限制（{draft.warnings.length}）</summary><ul>{draft.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></details>}
        {board && view && size && <>
          <div className="pcb-research-bar pcb-research-controls" aria-label="試排操作">
            <label>方案<select aria-label="方案" value={index} disabled={busy || compare} onChange={(event) => { setIndex(Number(event.target.value)); setStart(undefined); setEditCopper(undefined); setEditPosition(false); }}>{draft?.schemes.map((item, i) => <option key={i} value={i}>{item.name}</option>)}</select></label>
            <label>銅層<select aria-label="銅層" value={activeLayer} disabled={busy} onChange={(event) => { setLayer(event.target.value); setStart(undefined); }}>{board.layers.map((name) => <option key={name}>{name}</option>)}</select></label>
            <Button type="button" variant="outline" disabled={busy || zoom <= 1} aria-label="縮小板圖" onClick={() => setZoom(Math.max(1, zoom / 2))}>−</Button>
            <Button type="button" variant="outline" disabled={busy || zoom >= 32} aria-label="放大板圖" onClick={() => { if (component) setCenter(component); setZoom(Math.min(32, zoom * 2)); }}>＋</Button>
            <Button type="button" variant="outline" disabled={busy || zoom === 1} onClick={() => { setZoom(1); setCenter(undefined); }}>看全板</Button>
            <Button type="button" variant="outline" disabled={busy || compare} aria-pressed={padsSelectable && tool === "place"} onClick={() => { setTool("place"); setStart(undefined); setPadsSelectable(!padsSelectable); }}>點焊盤選 Net</Button>
            <label>定位元件<select aria-label="定位元件" value={component?.id ?? ""} disabled={busy || compare} onChange={(event) => {
              const part = board.components.find((item) => item.id === event.target.value);
              setSelected(part ? [part.id] : []); setEditPosition(false); if (part) { setCenter(part); setZoom(Math.max(zoom, 4)); }
            }}><option value="">選一顆元件</option>{board.components.map((part) => <option value={part.id} key={part.id}>{part.reference}</option>)}</select></label>
            <Button type="button" disabled={busy || compare || !selected.length} onClick={place}>自動擺料{selected.length > 0 ? `（${selected.length}）` : ""}</Button>
            {component && <Button type="button" variant="outline" disabled={busy || compare} onClick={() => update({ ...board, components: board.components.map((part) => part.id === component.id ? { ...part, locked: !part.locked } : part) })}>{component.locked ? <LockOpen aria-hidden="true" className="size-4" /> : <Lock aria-hidden="true" className="size-4" />}{component.locked ? "解鎖" : "鎖定"} {component.reference}</Button>}
            {component && <Button type="button" variant="outline" disabled={busy || compare || component.locked} onClick={() => move(component.id, component, component.rotation + 90)}>旋轉 90°</Button>}
            {component && <Button type="button" variant="outline" disabled={busy || compare || component.locked} aria-pressed={editPosition} onClick={() => {
              setEditPosition(!editPosition); setCoordX(String(number(component.x))); setCoordY(String(number(component.y)));
            }}>設定座標</Button>}
          </div>
          {editPosition && component && !component.locked && !compare && <form className="pcb-research-bar pcb-research-controls" aria-label="元件座標" onSubmit={(event) => {
            event.preventDefault(); if (coordX.trim() && coordY.trim()) move(component.id, { x: Number(coordX), y: Number(coordY) }); setEditPosition(false);
          }}>
            <span>{component.reference}</span>
            <label>X mm<input type="number" step="any" value={coordX} onChange={(event) => setCoordX(event.target.value)} required /></label>
            <label>Y mm<input type="number" step="any" value={coordY} onChange={(event) => setCoordY(event.target.value)} required /></label>
            <Button type="submit" disabled={busy}>套用座標</Button>
            <Button type="button" variant="outline" onClick={() => setEditPosition(false)}>取消</Button>
          </form>}
          <div className="pcb-research-bar pcb-research-controls" aria-label="佈線操作">
            <label>Net<input list="pcb-research-nets" value={net} placeholder="輸入 Net 或點焊盤" disabled={busy || compare} onChange={(event) => { setNet(event.target.value); setStart(undefined); }} /><datalist id="pcb-research-nets">{nets.map((name) => <option key={name} value={name} />)}</datalist></label>
            <label>線寬 mm<input type="number" min="0.001" step="any" value={width} disabled={busy || compare} onChange={(event) => setWidth(event.target.value)} /></label>
            <label>間距 mm<input type="number" min="0" step="any" value={clearance} disabled={busy || compare} onChange={(event) => setClearance(event.target.value)} /></label>
            <label>Via 外徑 mm<input type="number" min="0.001" step="any" value={via} disabled={busy || compare} onChange={(event) => setVia(event.target.value)} /></label>
            <label className="pcb-research-check"><input type="checkbox" checked={allowLayerChanges && !!otherLayer} disabled={busy || compare || !otherLayer} onChange={(event) => setAllowLayerChanges(event.target.checked)} />允許試走換層</label>
            {allowLayerChanges && otherLayer && <label>備用走線層<select aria-label="備用走線層" value={otherLayer} disabled={busy || compare} onChange={(event) => setAlternateLayer(event.target.value)}>{board.layers.filter((name) => name !== activeLayer).map((name) => <option key={name}>{name}</option>)}</select></label>}
            <Button type="button" disabled={busy || compare || !nets.includes(net) || !readyRules || allowLayerChanges && !viaSize} onClick={() => void route()}>自動試走</Button>
            <Button type="button" variant="outline" disabled={busy || compare || !nets.includes(net) || !readyRules} aria-pressed={tool === "track"} onClick={() => { setTool(tool === "track" ? "place" : "track"); setStart(undefined); }}>手動畫線</Button>
            <Button type="button" variant="outline" disabled={busy || compare || !nets.includes(net) || !readyRules || !viaSize} aria-pressed={tool === "via"} onClick={() => { setTool(tool === "via" ? "place" : "via"); setStart(undefined); }}>新增 Via</Button>
            {copper && <Button type="button" variant="outline" disabled={busy || compare} onClick={() => {
              update({ ...board, tracks: board.tracks.filter((track) => track.id !== copper.id), vias: board.vias.filter((item) => item.id !== copper.id) }, [copper.net]);
              setEditCopper(undefined);
            }}>移除所選試走物件</Button>}
            {net && <Button type="button" variant="outline" disabled={busy || compare || !board.tracks.some((track) => track.net === net && !track.locked) && !board.vias.some((item) => item.net === net && !item.locked)} onClick={() => { update({ ...board, tracks: board.tracks.filter((track) => track.net !== net || track.locked), vias: board.vias.filter((item) => item.net !== net || item.locked) }, [net]); setStart(undefined); }}>清除這個 Net 的試走</Button>}
          </div>
          <p className="pcb-research-hint">{compare ? "兩個方案使用同一個圖層與縮放。" : tool === "track" ? start ? "點下一站繼續畫，Esc 結束。" : "點焊盤或畫布開始畫線。" : tool === "via" ? "點畫布放置通孔 Via。" : padsSelectable ? "點焊盤選取它所屬的 Net。" : "拖曳元件移位，Shift＋點選可累選。選擇元件可放大定位。"}{" "}試走使用你填寫的線寬與間距。</p>
          <div className="pcb-research-boards" data-compare={compare}>
            {shown?.map((item) => {
              const editing = !compare && !busy;
              const inView = (x: number, y: number, margin = 0) => x + margin >= view.x && x - margin <= view.x + view.width && y + margin >= view.y && y - margin <= view.y + view.height;
              const tracks = item.board.tracks.filter((track) => track.layer === activeLayer && (zoom === 1 || track.points.slice(1).some((point, i) => {
                const previous = track.points[i];
                return Math.max(point.x, previous.x) >= view.x && Math.min(point.x, previous.x) <= view.x + view.width
                  && Math.max(point.y, previous.y) >= view.y && Math.min(point.y, previous.y) <= view.y + view.height;
              })));
              const lockedTracks = new Map<string, { width: number; active: boolean; paths: string[] }>();
              for (const track of tracks) {
                if (!track.locked) continue;
                const active = Boolean(net && track.net === net);
                const key = `${track.width}:${active}`;
                if (!lockedTracks.has(key)) lockedTracks.set(key, { width: track.width, active, paths: [] });
                lockedTracks.get(key)?.paths.push(`M${track.points.map((point) => `${point.x},${point.y}`).join("L")}`);
              }
              const pads = item.board.pads.filter((pad) => pad.layers.includes(activeLayer) && inView(pad.x, pad.y, Math.max(pad.width, pad.height)));
              return <figure className="pcb-research-board" key={item.name}>
                <figcaption><strong>{item.name}</strong><span>試走 {item.board.tracks.filter((track) => !track.locked).length} 段 · Via {item.board.vias.filter((item) => !item.locked).length} 顆 · 待查 Net {item.pending.length}</span></figcaption>
                <svg ref={editing ? canvas : undefined} viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} role="img" aria-label={`${item.name} 板圖`} onPointerMove={(event) => {
                  if (editing && drag) { const point = boardPoint(event), part = board.components.find((item) => item.id === drag.id); if (point && part) setDrag({ ...drag, point: { x: part.x + point.x - drag.origin.x, y: part.y + point.y - drag.origin.y } }); }
                }} onPointerCancel={() => setDrag(undefined)} onPointerUp={(event) => {
                  if (!editing) return;
                  const point = boardPoint(event); if (!point) return;
                  if (drag) {
                    setDrag(undefined);
                    if (Math.hypot(point.x - drag.origin.x, point.y - drag.origin.y) > size / 450) move(drag.id, drag.point);
                  } else if (tool !== "place" && !(event.target as Element).closest("[data-pad]")) draw(point);
                }}>
                  <rect width={item.board.width} height={item.board.height} fill="#132725" />
                  {item.board.outline && <polygon points={points(item.board.outline)} fill="#1c3331" stroke="#50837b" strokeWidth={size / 450} />}
                  {item.board.holes?.map((hole, i) => <polygon key={i} points={points(hole)} fill="#0c1516" />)}
                  {item.board.keepouts.filter((zone) => (!zone.layers?.length || zone.layers.includes(activeLayer)) && inView(zone.x + zone.width / 2, zone.y + zone.height / 2, Math.max(zone.width, zone.height))).map((zone) => zone.points ? <polygon key={zone.id} points={points(zone.points)} fill="#f9731633" /> : <rect key={zone.id} x={zone.x} y={zone.y} width={zone.width} height={zone.height} fill="#f9731633" />)}
                  {[...lockedTracks].map(([key, group]) => <path key={key} d={group.paths.join("")} stroke={group.active ? "#f5cd72" : "#527f82"} strokeWidth={group.width} strokeLinecap="round" strokeLinejoin="round" fill="none" pointerEvents="none" />)}
                  {tracks.filter((track) => !track.locked).map((track) => <polyline key={track.id} points={points(track.points)} stroke={track.id === editCopper ? "#fff0ba" : track.net === net ? "#f5cd72" : "#73dfc8"} strokeWidth={track.width} strokeLinecap="round" strokeLinejoin="round" fill="none" onPointerUp={() => { if (editing && tool === "place") { setEditCopper(track.id); setNet(track.net); } }} />)}
                  {item.board.components.filter((part) => inView(part.x, part.y, Math.hypot(part.width, part.height))).map((part) => {
                    const pos = editing && drag?.id === part.id ? drag.point : part;
                    return <g key={part.id} transform={`translate(${pos.x} ${pos.y}) rotate(${part.rotation})`} onPointerDown={(event) => {
                      if (!editing || tool !== "place") return;
                      setEditPosition(false);
                      setSelected((old) => event.shiftKey ? old.includes(part.id) ? old.filter((id) => id !== part.id) : [...old, part.id] : [part.id]);
                      const point = boardPoint(event);
                      if (point && !part.locked && !event.shiftKey) { event.currentTarget.setPointerCapture(event.pointerId); setDrag({ id: part.id, origin: point, point: part }); }
                    }}>
                      <rect x={-part.width / 2} y={-part.height / 2} width={part.width} height={part.height} rx={size / 450} fill={selected.includes(part.id) ? "#437a68" : "#294441"} fillOpacity=".8" stroke={selected.includes(part.id) ? "#9debd5" : "#718f82"} strokeWidth={size / 630} />
                      {(selected.includes(part.id) || zoom > 2 && part.width > size / 42) && <text x={0} y={0} dominantBaseline="middle" textAnchor="middle" fontSize={size / 70} fill="#e0f6f0" pointerEvents="none">{part.reference}</text>}
                    </g>;
                  })}
                  {pads.map((pad) => <rect key={pad.id} x={pad.x - pad.width / 2} y={pad.y - pad.height / 2} width={pad.width} height={pad.height} fill={pad.net && pad.net === net ? "#ffdc87" : "#7c8c69"} data-pad="" style={{ pointerEvents: tool === "place" && (!pad.net || !padsSelectable) ? "none" : undefined }} onPointerUp={() => {
                    if (!editing || !pad.net) return;
                    if (tool === "place") { setNet(pad.net); setStart(undefined); }
                    else if (net === pad.net) draw(pad);
                  }} />)}
                  {item.board.vias.filter((via) => via.layers.includes(activeLayer) && inView(via.x, via.y, via.diameter)).map((via) => <circle key={via.id} cx={via.x} cy={via.y} r={via.diameter / 2} fill={via.id === editCopper ? "#fff0ba" : via.net === net ? "#f5cd72" : "#81aeb3"} pointerEvents={tool === "place" && !via.locked ? undefined : "none"} onPointerUp={() => { if (editing && tool === "place" && !via.locked) { setEditCopper(via.id); setNet(via.net); } }} />)}
                  {editing && start && <circle cx={start.x} cy={start.y} r={size / 130} fill="#f5cd72" pointerEvents="none" />}
                </svg>
              </figure>;
            })}
          </div>
        </>}
      </DialogContent>
    </Dialog>
  );
}
