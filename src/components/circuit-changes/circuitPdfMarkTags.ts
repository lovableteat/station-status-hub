import type { CircuitCropRect } from "./circuitPdf";

/**
 * Where the number tag of each AI mark goes (2026-11-24, the user's MCU1 sheet: tags of neighbouring marks lay on top of
 * each other, F9 under F11 under F10, and nothing was readable). A tag sits above the top-left corner of its box, as the
 * CSS draws it; when that place is taken it moves along the top edge, then to a row above, then below the box, and keeps
 * its box's colour so it still reads as that mark's. Pure: sizes are CSS pixels of the drawing on screen.
 */
export interface CircuitMarkTagOffset { dx: number; dy: number }

/** The tag as circuitPdf.css draws it: 16px high, 5px padding, bold 11px digits, at least 22px wide. */
const TAG_HEIGHT = 16, TAG_GAP = 6, TAG_INSET = 5, SPACE = 2;
export const circuitMarkTagWidth = (id: string) => Math.max(22, 10 + 7 * id.length);

type Box = { x: number; y: number; width: number; height: number };
const clash = (a: Box, b: Box) => a.x < b.x + b.width + SPACE && b.x < a.x + a.width + SPACE && a.y < b.y + b.height + SPACE && b.y < a.y + a.height + SPACE;

export function placeCircuitMarkTags(marks: ReadonlyArray<{ id: string; rect: CircuitCropRect }>, width: number, height: number): Map<string, CircuitMarkTagOffset> {
  const offsets = new Map<string, CircuitMarkTagOffset>();
  if (!width || !height) return offsets;
  const placed: Box[] = [];
  // The marked areas themselves (with their corner brackets): a tag on another mark's area would cover what is to be read.
  const areas = new Map(marks.map(mark => [mark.id, { x: mark.rect.x * width - TAG_INSET, y: mark.rect.y * height - TAG_INSET, width: mark.rect.width * width + 2 * TAG_INSET, height: mark.rect.height * height + 2 * TAG_INSET }]));
  const order = [...marks].sort((left, right) => left.rect.y - right.rect.y || left.rect.x - right.rect.x);
  for (const mark of order) {
    const left = mark.rect.x * width, top = mark.rect.y * height, boxWidth = mark.rect.width * width, boxHeight = mark.rect.height * height;
    const tag = { width: circuitMarkTagWidth(mark.id), height: TAG_HEIGHT };
    const home = { x: left - TAG_INSET, y: top - TAG_GAP - TAG_HEIGHT };
    const step = tag.width + SPACE, row = TAG_HEIGHT + SPACE;
    // Along the top edge first (as far as the box reaches, at least three tags), then rows above, then beside the box on
    // the right, then under it.
    const along = Math.max(3, Math.floor((boxWidth + TAG_INSET) / step));
    const candidates: CircuitMarkTagOffset[] = [];
    for (let k = 0; k <= along; k++) candidates.push({ dx: k * step, dy: 0 });
    for (let r = 1; r <= 3; r++) for (let k = 0; k <= along; k++) candidates.push({ dx: k * step, dy: -r * row });
    for (let r = 0; r <= 3; r++) candidates.push({ dx: boxWidth + 2 * TAG_INSET + SPACE + TAG_INSET, dy: TAG_GAP + TAG_HEIGHT + r * row });
    const under = boxHeight + 2 * TAG_GAP + TAG_HEIGHT;
    for (let k = 0; k <= along; k++) candidates.push({ dx: k * step, dy: under });
    const fits = (offset: CircuitMarkTagOffset) => {
      const box = { x: home.x + offset.dx, y: home.y + offset.dy, ...tag };
      return box.x >= -TAG_INSET && box.x + box.width <= width + TAG_INSET && box.y >= 0 && box.y + box.height <= height ? box : null;
    };
    // A larger mark around this one (a changed drawing around a renamed label) cannot be left; only the others count.
    const middle = { x: left + boxWidth / 2, y: top + boxHeight / 2 };
    const obstacles = [...areas].filter(([id, area]) => id !== mark.id && !(middle.x >= area.x && middle.x <= area.x + area.width && middle.y >= area.y && middle.y <= area.y + area.height)).map(([, area]) => area);
    const free = (box: Box, strict: boolean) => !placed.some(other => clash(box, other)) && (!strict || !obstacles.some(area => clash(box, area)));
    let chosen: CircuitMarkTagOffset | null = null, chosenBox: Box | null = null;
    // Clear of other tags and of other marked areas; failing that, clear of other tags at least.
    for (const strict of [true, false]) {
      for (const offset of candidates) {
        const box = fits(offset);
        if (box && free(box, strict)) { chosen = offset; chosenBox = box; break; }
      }
      if (chosen) break;
    }
    // Nowhere free: the usual place (a tag off the page edge still shows; the hide toggle clears them all).
    if (!chosen) { chosen = { dx: 0, dy: 0 }; chosenBox = { x: home.x, y: home.y, ...tag }; }
    placed.push(chosenBox!);
    if (chosen.dx || chosen.dy) offsets.set(mark.id, chosen);
  }
  return offsets;
}

/** The style that moves a tag: CSS variables read by `.circuit-pdf-ai-mark > span` / `.circuit-pdf-ai-annotation-box > span`. */
export const circuitMarkTagStyle = (offset: CircuitMarkTagOffset | undefined) => offset ? { "--tag-dx": `${offset.dx}px`, "--tag-dy": `${offset.dy}px` } as Record<string, string> : {};
