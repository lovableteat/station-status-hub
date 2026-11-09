import { useRef, useState, type PointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Minus, Plus, Maximize, MapPin, Square, Trash2 } from "lucide-react";
import type { CircuitImage, CircuitImageMark } from "./types";
import "./circuitImageViewer.css";

export function CircuitChangeImageViewer({ image, src, onChange, readOnly = false }: {
  image: CircuitImage; src: string; onChange?: (image: CircuitImage) => void; readOnly?: boolean;
}) {
  const [zoom, setZoom] = useState(1), [tool, setTool] = useState<"view" | "pin" | "box">("view");
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const surface = useRef<HTMLDivElement>(null);
  const editable = !readOnly && Boolean(onChange);
  const point = (event: PointerEvent) => {
    const box = surface.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)), y: Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)) };
  };
  const add = (mark: CircuitImageMark) => { onChange?.({ ...image, marks: [...image.marks, mark] }); setTool("view"); };
  const down = (event: PointerEvent<HTMLDivElement>) => {
    if (!editable || tool === "view" || event.button !== 0) return;
    event.preventDefault(); const p = point(event);
    if (tool === "pin") add({ id: crypto.randomUUID(), kind: "pin", ...p, text: "" });
    else { setStart(p); event.currentTarget.setPointerCapture(event.pointerId); }
  };
  const up = (event: PointerEvent<HTMLDivElement>) => {
    if (!start || !editable || tool !== "box") return;
    const p = point(event), width = Math.abs(p.x - start.x), height = Math.abs(p.y - start.y);
    setStart(null);
    if (width < .005 || height < .005) return;
    add({ id: crypto.randomUUID(), kind: "box", x: Math.min(p.x, start.x), y: Math.min(p.y, start.y), width, height, text: "" });
  };
  return <section className="circuit-image-viewer" aria-label={`圖片標註：${image.name}`}>
    <div className="circuit-image-toolbar">
      <Button type="button" variant="outline" aria-label="縮小圖片" onClick={() => setZoom(value => Math.max(.5, value - .5))} disabled={zoom <= .5}><Minus /></Button>
      <span>{Math.round(zoom * 100)}%</span>
      <Button type="button" variant="outline" aria-label="放大圖片" onClick={() => setZoom(value => Math.min(4, value + .5))} disabled={zoom >= 4}><Plus /></Button>
      <Button type="button" variant="outline" aria-label="圖片符合視窗" onClick={() => setZoom(1)}><Maximize /></Button>
      {editable && <><Button type="button" variant={tool === "pin" ? "default" : "outline"} aria-pressed={tool === "pin"} onClick={() => setTool(value => value === "pin" ? "view" : "pin")}><MapPin />位置標記</Button><Button type="button" variant={tool === "box" ? "default" : "outline"} aria-pressed={tool === "box"} onClick={() => setTool(value => value === "box" ? "view" : "box")}><Square />框選</Button></>}
    </div>
    <p className="circuit-image-hint">{tool === "pin" ? "點選圖片上的修改位置，再於下方填寫標記說明。" : tool === "box" ? "在圖片上拖曳框選修改範圍，再於下方填寫說明。" : "可放大後捲動查看；標記另存，原圖保留。"}</p>
    <div className="circuit-image-scroll">
      <div className="circuit-image-surface" ref={surface} style={{ width: `${zoom * 100}%`, touchAction: tool === "view" ? "auto" : "none" }} onPointerDown={down} onPointerUp={up} onPointerCancel={() => setStart(null)}>
        <img src={src} alt={image.name} draggable={false} />
        <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-label="圖片標記" className="circuit-image-marks">
          {image.marks.filter(mark => mark.kind === "box").map(mark => <rect key={mark.id} x={mark.x * 1000} y={mark.y * 1000} width={(mark.width ?? 0) * 1000} height={(mark.height ?? 0) * 1000} vectorEffect="non-scaling-stroke" />)}
        </svg>
        {image.marks.map((mark, index) => <span key={mark.id} aria-hidden="true" className="circuit-image-pin" style={{ left: `clamp(12px, ${mark.x * 100}%, calc(100% - 12px))`, top: `clamp(12px, ${mark.y * 100}%, calc(100% - 12px))` }}>{index + 1}</span>)}
      </div>
    </div>
    <label className="circuit-image-caption">圖片說明<Textarea aria-label="圖片說明" value={image.caption} maxLength={2000} readOnly={!editable} onChange={event => onChange?.({ ...image, caption: event.target.value })} /></label>
    {image.marks.length > 0 && <ol className="circuit-image-mark-list">{image.marks.map((mark, index) => <li key={mark.id}><span>{index + 1}</span><Input aria-label={`標記 ${index + 1} 說明`} value={mark.text} maxLength={200} readOnly={!editable} onChange={event => onChange?.({ ...image, marks: image.marks.map(value => value.id === mark.id ? { ...value, text: event.target.value } : value) })} />{editable && <Button type="button" variant="ghost" aria-label={`刪除標記 ${index + 1}`} onClick={() => onChange?.({ ...image, marks: image.marks.filter(value => value.id !== mark.id) })}><Trash2 /></Button>}</li>)}</ol>}
  </section>;
}
