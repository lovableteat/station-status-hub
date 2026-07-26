import type { PcbProject } from "./types.ts";

interface PcbCanvasHostProps {
  project: PcbProject;
  zoom: number;
}

/** Passive Task 7 host; Task 8 replaces the board preview with SVG interaction. */
export function PcbCanvasHost({ project, zoom }: PcbCanvasHostProps) {
  return (
    <main
      className="pcb-canvas-host"
      data-testid="pcb-canvas-host"
      aria-label="PCB 畫布預留區"
    >
      <div className="pcb-canvas-stage">
        <div
          className="pcb-board-preview"
          style={{
            aspectRatio: `${project.board.width} / ${project.board.height}`,
            backgroundColor: project.board.background,
            transform: `scale(${Math.min(zoom, 125) / 100})`,
          }}
          aria-hidden="true"
        >
          <span className="pcb-board-origin" />
        </div>
        <div className="pcb-canvas-message">
          <strong>2D 畫布宿主</strong>
          <span>目前顯示空板預覽；元件互動與 SVG 編輯會由下一階段接入。</span>
        </div>
      </div>
    </main>
  );
}
