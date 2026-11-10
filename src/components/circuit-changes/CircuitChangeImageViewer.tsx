import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, ChevronRight, Minus, Plus, Maximize, MapPin, Square, Trash2 } from "lucide-react";
import { CircuitImageMarks } from "./CircuitImageMarks";
import { CIRCUIT_IMAGE_SIDE_LABELS, type CircuitImage, type CircuitImageMark, type CircuitImageSide } from "./types";
import "./circuitImageViewer.css";

const sides = Object.keys(CIRCUIT_IMAGE_SIDE_LABELS) as CircuitImageSide[];
type Box = { x: number; y: number; width: number; height: number };

export function CircuitChangeImageViewer({ image, src, onChange, readOnly = false, position, onPrevious, onNext }: {
  image: CircuitImage; src: string; onChange?: (image: CircuitImage) => void; readOnly?: boolean;
  position?: { index: number; total: number }; onPrevious?: () => void; onNext?: () => void;
}) {
  const [zoom, setZoom] = useState(1), [tool, setTool] = useState<"view" | "pin" | "box">("view");
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<Box | null>(null);
  const [focusMark, setFocusMark] = useState("");
  const surface = useRef<HTMLDivElement>(null);
  const notes = useRef(new Map<string, HTMLInputElement>());
  const editable = !readOnly && Boolean(onChange);
  const point = (event: PointerEvent) => {
    const box = surface.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)), y: Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)) };
  };
  const span = (from: { x: number; y: number }, to: { x: number; y: number }): Box => ({ x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), width: Math.abs(to.x - from.x), height: Math.abs(to.y - from.y) });
  // The tool stays on so several positions can be marked in a row. Where the notes sit beside the picture the new mark's
  // note takes the keyboard right away; on a phone that would raise the keyboard over the picture after every tap.
  const add = (mark: CircuitImageMark) => { onChange?.({ ...image, marks: [...image.marks, mark] }); if (window.matchMedia?.("(min-width: 1024px)").matches) setFocusMark(mark.id); };
  const down = (event: PointerEvent<HTMLDivElement>) => {
    if (!editable || tool === "view" || event.button !== 0) return;
    event.preventDefault(); const p = point(event);
    if (tool === "pin") add({ id: crypto.randomUUID(), kind: "pin", ...p, text: "" });
    else { setStart(p); setDrag({ ...p, width: 0, height: 0 }); event.currentTarget.setPointerCapture(event.pointerId); }
  };
  const move = (event: PointerEvent<HTMLDivElement>) => { if (start && tool === "box") setDrag(span(start, point(event))); };
  const up = (event: PointerEvent<HTMLDivElement>) => {
    if (!start || !editable || tool !== "box") return;
    const box = span(start, point(event));
    setStart(null); setDrag(null);
    if (box.width < .005 || box.height < .005) return;
    add({ id: crypto.randomUUID(), kind: "box", ...box, text: "" });
  };
  const step = useRef({ onPrevious, onNext }); step.current = { onPrevious, onNext };
  // Listened for on the window: the button that was just used may have become disabled, and a disabled button passes no key on.
  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || (event.target as HTMLElement | null)?.closest?.("input,textarea,select")) return;
      const move = event.key === "ArrowLeft" ? step.current.onPrevious : event.key === "ArrowRight" ? step.current.onNext : undefined;
      if (move) { event.preventDefault(); move(); }
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, []);
  useEffect(() => { setZoom(1); setTool("view"); setStart(null); setDrag(null); }, [image.id]);
  useEffect(() => {
    if (!focusMark) return;
    const input = notes.current.get(focusMark);
    if (input) { input.focus(); setFocusMark(""); }
  }, [focusMark, image.marks.length]);
  const surfaceStyle = { "--circuit-zoom": zoom, "--circuit-image-aspect": image.width / image.height, aspectRatio: `${image.width} / ${image.height}`, touchAction: tool === "view" ? "auto" : "none" } as CSSProperties;
  return <section className="circuit-image-viewer" aria-label={`圖片標註：${image.name}`} data-tool={tool}>
    <div className="circuit-image-toolbar">
      {position && position.total > 1 && <span className="circuit-image-toolbar-group">
        <Button type="button" variant="outline" aria-label="上一張圖片" title="上一張（←）" disabled={!onPrevious} onClick={onPrevious}><ChevronLeft /></Button>
        <span>{position.index + 1} / {position.total}</span>
        <Button type="button" variant="outline" aria-label="下一張圖片" title="下一張（→）" disabled={!onNext} onClick={onNext}><ChevronRight /></Button>
      </span>}
      <span className="circuit-image-toolbar-group">
        <Button title="縮小圖片" type="button" variant="outline" aria-label="縮小圖片" onClick={() => setZoom(value => Math.max(.5, value - .5))} disabled={zoom <= .5}><Minus /></Button>
        <span>{Math.round(zoom * 100)}%</span>
        <Button title="放大圖片" type="button" variant="outline" aria-label="放大圖片" onClick={() => setZoom(value => Math.min(4, value + .5))} disabled={zoom >= 4}><Plus /></Button>
        <Button type="button" variant="outline" aria-label="圖片符合視窗" title="符合視窗" onClick={() => setZoom(1)}><Maximize /></Button>
      </span>
      {editable && <span className="circuit-image-toolbar-group">
        <Button title="點圖片加一個位置標記，再寫說明" type="button" variant={tool === "pin" ? "default" : "outline"} aria-pressed={tool === "pin"} onClick={() => setTool(value => value === "pin" ? "view" : "pin")}><MapPin />位置標記</Button>
        <Button title="在圖片上拖曳框出範圍，再寫說明" type="button" variant={tool === "box" ? "default" : "outline"} aria-pressed={tool === "box"} onClick={() => setTool(value => value === "box" ? "view" : "box")}><Square />框選</Button>
      </span>}
      <p className="circuit-image-hint">{tool === "pin" ? "點圖片上的修改位置即可加上標記，可連續點；再按一次「位置標記」結束。" : tool === "box" ? "在圖片上拖曳框出修改範圍，可連續框；再按一次「框選」結束。" : editable ? "選「位置標記」或「框選」標出改了哪裡；標記另外保存，原圖不變。" : "原圖與此修訂的標記。"}</p>
    </div>
    <div className="circuit-image-body">
      <div className="circuit-image-scroll">
        <div className="circuit-image-surface" ref={surface} style={surfaceStyle} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { setStart(null); setDrag(null); }}>
          <img src={src} alt={image.name} draggable={false} />
          <CircuitImageMarks marks={image.marks} draft={drag} />
        </div>
      </div>
      <aside className="circuit-image-notes" aria-label="圖片說明與標記">
        {editable && <label className="circuit-image-side">圖片用途
          <select aria-label="圖片用途" value={image.side} onChange={event => onChange?.({ ...image, side: event.target.value as CircuitImageSide })}>
            {sides.map(key => <option key={key} value={key}>{CIRCUIT_IMAGE_SIDE_LABELS[key]}</option>)}
          </select>
        </label>}
        <label className="circuit-image-caption">圖片說明<Textarea aria-label="圖片說明" value={image.caption} maxLength={2000} readOnly={!editable} placeholder={editable ? "這張圖要看什麼" : ""} onChange={event => onChange?.({ ...image, caption: event.target.value })} /></label>
        <div className="circuit-image-mark-heading"><span>標記</span><span>{image.marks.length} 個</span></div>
        {image.marks.length > 0
          ? <ol className="circuit-image-mark-list">{image.marks.map((mark, index) => <li key={mark.id}>
            <span>{index + 1}</span>
            <Input ref={(node: HTMLInputElement | null) => { if (node) notes.current.set(mark.id, node); else notes.current.delete(mark.id); }} aria-label={`標記 ${index + 1} 說明`} value={mark.text} maxLength={200} readOnly={!editable} placeholder={editable ? "這裡改了什麼" : ""} onChange={event => onChange?.({ ...image, marks: image.marks.map(value => value.id === mark.id ? { ...value, text: event.target.value } : value) })} />
            {editable && <Button title="刪除這個標記" type="button" variant="ghost" aria-label={`刪除標記 ${index + 1}`} onClick={() => onChange?.({ ...image, marks: image.marks.filter(value => value.id !== mark.id) })}><Trash2 /></Button>}
          </li>)}</ol>
          : <p className="circuit-image-mark-empty">{editable ? "還沒有標記。" : "這張圖沒有標記。"}</p>}
      </aside>
    </div>
  </section>;
}
