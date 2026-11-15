import type { PcbModelAsset, PcbModelAssetPart, PcbModelAssetPartMetadata, PcbPlacedComponent } from "../types.ts";

/**
 * Schematic package models built in Blender (scripts/pcb-package-models) and assembled here at each
 * component's real 長 × 寬 × 高. Bodies scale to the component; leads, pins, pads and solder balls keep
 * their own cross-section and repeat at a pitch, so a large part never gets thick pins (AGENTS PCB rules).
 * The result is an in-memory PcbModelAsset that both 3D renderers draw through the same mount pipeline as
 * STEP models. It is never stored, uploaded or written to `modelAssetId`; a STEP model always wins.
 * These are schematic packages, not verified footprints.
 */
export type PcbPackageKey =
  | "chip-resistor" | "chip-capacitor" | "qfp" | "qfn" | "bga" | "inductor" | "usb-c" | "header" | "electrolytic";

export const PCB_PACKAGE_LABELS: Record<PcbPackageKey, string> = {
  "chip-resistor": "晶片電阻",
  "chip-capacitor": "積層陶瓷電容",
  qfp: "QFP 鷗翼接腳 IC",
  qfn: "QFN 無接腳 IC",
  bga: "BGA 錫球 IC",
  inductor: "屏蔽電感",
  "usb-c": "USB-C 母座",
  header: "排針座",
  electrolytic: "電解電容",
};

export interface PcbPackageKitPiece {
  color: [number, number, number];
  positions: number[];
  indices: number[];
}

export interface PcbPackageKit {
  schemaVersion: 1;
  pieces: Record<string, PcbPackageKitPiece>;
}

/** Built-in library parts have a fixed package. */
const BUILT_IN_PACKAGES: Record<string, PcbPackageKey> = {
  "builtin-u-stm32f407vgt6": "qfp",
  "builtin-u-mt40a512m16": "bga",
  "builtin-j-12401548e4": "usb-c",
  "builtin-r-rc0603fr-0710kl": "chip-resistor",
  "builtin-c-grm188r71c104ka01": "chip-capacitor",
  "builtin-l-vls3012et-2r2m": "inductor",
  "builtin-u-tps62130rgtr": "qfn",
  "builtin-j-47053-1000": "header",
};

/**
 * Which schematic package a component shows. Built-in parts by library id; other parts by their explicit
 * type and shape fields only, never by name or part number. Unknown types keep today's procedural body.
 */
export function resolvePcbPackageKey(component: Pick<PcbPlacedComponent, "id" | "type" | "shape" | "width" | "height" | "modelAssetId">): PcbPackageKey | null {
  if (component.modelAssetId) return null;
  const builtIn = BUILT_IN_PACKAGES[component.id];
  if (builtIn) return builtIn;
  const type = component.type?.trim().toLocaleLowerCase();
  switch (type) {
    case "resistor": return "chip-resistor";
    case "capacitor": return component.shape === "circle" ? "electrolytic" : "chip-capacitor";
    case "inductor": return "inductor";
    case "ic": case "processor": case "mcu": case "cpu":
      return Math.min(component.width, component.height) >= 7 ? "qfp" : "qfn";
    case "memory": return "bga";
    case "connector": return "header";
    default: return null;
  }
}

export function isPcbPackageKit(value: unknown): value is PcbPackageKit {
  if (!value || typeof value !== "object") return false;
  const kit = value as Partial<PcbPackageKit>;
  if (kit.schemaVersion !== 1 || !kit.pieces || typeof kit.pieces !== "object") return false;
  return Object.values(kit.pieces).every((piece) => Array.isArray(piece?.positions) && Array.isArray(piece.indices)
    && Array.isArray(piece.color) && piece.positions.length % 3 === 0 && piece.indices.length % 3 === 0
    && piece.indices.every((index) => Number.isInteger(index) && index >= 0 && index < piece.positions.length / 3));
}

type Quarter = 0 | 1 | 2 | 3;
interface Placement { scale: [number, number, number]; at: [number, number, number]; quarter?: Quarter }

class PackageBuilder {
  private readonly parts = new Map<string, { color: [number, number, number]; position: number[]; index: number[] }>();
  private readonly kit: PcbPackageKit;
  constructor(kit: PcbPackageKit) {
    this.kit = kit;
  }

  /** Scale the piece, turn it by quarter turns around the up axis, then move it. */
  add(partName: string, pieceName: string, placement: Placement) {
    const piece = this.kit.pieces[pieceName];
    if (!piece) throw new Error(`missing package piece ${pieceName}`);
    let part = this.parts.get(partName);
    if (!part) this.parts.set(partName, part = { color: piece.color, position: [], index: [] });
    const base = part.position.length / 3;
    const [sx, sy, sz] = placement.scale;
    const [tx, ty, tz] = placement.at;
    const quarter = placement.quarter ?? 0;
    for (let i = 0; i < piece.positions.length; i += 3) {
      const x = piece.positions[i] * sx, y = piece.positions[i + 1] * sy, z = piece.positions[i + 2] * sz;
      const [rx, rz] = quarter === 0 ? [x, z] : quarter === 1 ? [-z, x] : quarter === 2 ? [-x, -z] : [z, -x];
      part.position.push(round(rx + tx), round(y + ty), round(rz + tz));
    }
    for (const index of piece.indices) part.index.push(base + index);
  }

  build(key: PcbPackageKey, width: number, depth: number, height: number): PcbModelAsset {
    const metadataParts: PcbModelAssetPartMetadata[] = [];
    const parts: PcbModelAssetPart[] = [];
    for (const [name, part] of this.parts) {
      const id = `${key}-${metadataParts.length}`;
      metadataParts.push({ id, name, color: part.color, vertexCount: part.position.length / 3, indexCount: part.index.length });
      parts.push({ id, position: part.position, index: part.index });
    }
    const dimensions = { widthMm: width, depthMm: depth, heightMm: height };
    return {
      metadata: {
        schemaVersion: 1,
        id: `package:${key}:${width}x${depth}x${height}`,
        fileName: PCB_PACKAGE_LABELS[key],
        createdAt: "2026-11-15T00:00:00.000Z",
        updatedAt: "2026-11-15T00:00:00.000Z",
        dimensions,
        calibratedDimensions: dimensions,
        upAxis: "y",
        bounds: { min: [-width / 2, 0, -depth / 2], max: [width / 2, height, depth / 2] },
        parts: metadataParts,
      },
      parts,
    };
  }
}

const round = (value: number) => Math.round(value * 10_000) / 10_000;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
/** Centres of `count` items spread over `span` at `pitch`, centred on 0. */
const along = (count: number, pitch: number) => Array.from({ length: count }, (_, index) => (index - (count - 1) / 2) * pitch);
const fit = (span: number, pitch: number, cap: number) => clamp(Math.floor(span / pitch) + 1, 1, cap);

function chip(builder: PackageBuilder, W: number, D: number, H: number, mlcc: boolean) {
  const cap = clamp(W * (mlcc ? 0.22 : 0.2), 0.1, Math.max(0.1, W * 0.3));
  for (const side of [-1, 1]) {
    builder.add("terminal", "terminal_cap", { scale: [cap, H, D], at: [side * (W / 2 - cap / 2), 0, 0] });
  }
  if (mlcc) {
    builder.add("body", "chip_mlcc", { scale: [W - cap, H * 0.96, D * 0.96], at: [0, H * 0.02, 0] });
    return;
  }
  builder.add("body", "chip_body", { scale: [W - cap * 1.2, H * 0.9, D * 0.96], at: [0, 0, 0] });
  builder.add("coat", "chip_coat", { scale: [W - cap * 2.1, H * 0.08, D * 0.86], at: [0, H * 0.9, 0] });
}

function pinOneMark(builder: PackageBuilder, x: number, z: number, top: number, size: number) {
  const diameter = clamp(size * 0.1, 0.25, 1);
  builder.add("orientation mark", "pin1_mark", { scale: [diameter, 0.02, diameter], at: [x, top - 0.012, z] });
}

function qfp(builder: PackageBuilder, W: number, D: number, H: number) {
  const lead = clamp(Math.min(W, D) * 0.07, 0.5, 1);
  const standoff = Math.min(0.1, H * 0.1);
  const bodyW = W - lead * 2, bodyD = D - lead * 2;
  builder.add("body", "body_block", { scale: [bodyW, H - standoff, bodyD], at: [0, standoff, 0] });
  // The nominal lead leaves the body at 0.45-0.60 mm; keep it at roughly a third of the body height.
  const rise = clamp(((H - standoff) * 0.35 + standoff) / 0.525, 0.5, 1.6);
  const pitch = Math.min(bodyW, bodyD) > 6 ? 0.5 : 0.4;
  const width = pitch * 0.44;
  for (const [quarter, span, offset] of [[0, bodyD, bodyW / 2], [1, bodyW, bodyD / 2], [2, bodyD, bodyW / 2], [3, bodyW, bodyD / 2]] as const) {
    for (const t of along(fit(span - pitch * 2, pitch, 64), pitch)) {
      const [x, z] = quarter === 0 ? [offset, t] : quarter === 1 ? [t, offset] : quarter === 2 ? [-offset, t] : [t, -offset];
      builder.add("lead", "qfp_lead", { scale: [lead, rise, width], at: [x, 0, z], quarter });
    }
  }
  pinOneMark(builder, -bodyW * 0.36, -bodyD * 0.36, H, Math.min(bodyW, bodyD));
}

function qfn(builder: PackageBuilder, W: number, D: number, H: number) {
  const pad = 0.06;
  builder.add("body", "body_block", { scale: [W, H - pad * 0.5, D], at: [0, pad * 0.5, 0] });
  const pitch = Math.min(W, D) >= 2 ? 0.5 : 0.4;
  const length = clamp(Math.min(W, D) * 0.12, 0.25, 0.5);
  const width = pitch * 0.5;
  for (const [quarter, span, offset] of [[0, D, W / 2], [1, W, D / 2], [2, D, W / 2], [3, W, D / 2]] as const) {
    for (const t of along(fit(span - pitch * 2.4, pitch, 48), pitch)) {
      const inset = offset - length / 2 + 0.01;
      const [x, z] = quarter === 0 ? [inset, t] : quarter === 1 ? [t, inset] : quarter === 2 ? [-inset, t] : [t, -inset];
      builder.add("terminal pad", "terminal_pad", { scale: quarter % 2 === 0 ? [length, pad, width] : [width, pad, length], at: [x, 0, z] });
    }
  }
  pinOneMark(builder, -W * 0.3, -D * 0.3, H, Math.min(W, D));
}

function bga(builder: PackageBuilder, W: number, D: number, H: number) {
  const pitch = Math.min(W, D) >= 4 ? 0.8 : 0.5;
  const ball = pitch * 0.5;
  const standoff = Math.min(ball * 0.8, H * 0.3);
  const substrate = Math.min(0.25, H * 0.2);
  builder.add("substrate", "bga_substrate", { scale: [W, substrate, D], at: [0, standoff, 0] });
  builder.add("body", "body_block", { scale: [W * 0.94, H - standoff - substrate, D * 0.94], at: [0, standoff + substrate, 0] });
  // Only the two outer rings are visible from the side; inner balls would only cost triangles.
  const xs = along(fit(W - pitch * 1.2, pitch, 40), pitch), zs = along(fit(D - pitch * 1.2, pitch, 40), pitch);
  xs.forEach((x, i) => zs.forEach((z, j) => {
    const ring = Math.min(i, j, xs.length - 1 - i, zs.length - 1 - j);
    if (ring < 2) builder.add("solder ball terminal", "bga_ball", { scale: [ball, standoff * 1.15, ball], at: [x, 0, z] });
  }));
  pinOneMark(builder, -W * 0.36, -D * 0.36, H, Math.min(W, D));
}

function inductor(builder: PackageBuilder, W: number, D: number, H: number) {
  const pad = Math.min(0.08, H * 0.06);
  builder.add("body", "ferrite_body", { scale: [W, H - pad, D], at: [0, pad, 0] });
  for (const side of [-1, 1]) {
    builder.add("terminal", "terminal_pad", { scale: [W * 0.24, pad * 1.5, D * 0.82], at: [side * (W / 2 - W * 0.12), 0, 0] });
  }
}

function usbC(builder: PackageBuilder, W: number, D: number, H: number) {
  // Authored at 8.94 x 7.35 x 3.26 mm (a USB-C receptacle shell); it is a thin-walled shell, not pins.
  const scale: [number, number, number] = [W / 8.94, H / 3.26, D / 7.35];
  builder.add("shield", "usbc_shield", { scale, at: [0, 0, 0] });
  builder.add("shield leg", "usbc_shield_leg", { scale, at: [0, 0, 0] });
  builder.add("tongue", "usbc_tongue", { scale, at: [0, 0, 0] });
  builder.add("contact", "usbc_contact", { scale, at: [0, 0, 0] });
}

function header(builder: PackageBuilder, W: number, D: number, H: number) {
  const pitch = W >= 3.8 ? 2.54 : Math.max(0.8, W * 0.6);
  const rows = D >= 4.5 ? 2 : 1;
  const count = clamp(Math.round((W - 0.3) / pitch), 1, 40);
  const baseH = Math.min(H * 0.55, 3.2);
  builder.add("housing", "header_base", { scale: [W, baseH, D], at: [0, 0, 0] });
  builder.add("housing", "header_wall", { scale: [W, H - baseH, D * 0.18], at: [0, baseH, D / 2 - D * 0.09] });
  const post = Math.min(0.64, pitch * 0.4);
  const rowZ = rows === 1 ? [-D * 0.08] : [-pitch / 2, pitch / 2];
  for (const x of along(count, pitch)) for (const z of rowZ) {
    // Posts stand on the base instead of running through it.
    builder.add("pin", "header_pin", { scale: [post, H * 0.97 - baseH, post], at: [x, baseH, z] });
  }
}

function electrolytic(builder: PackageBuilder, W: number, D: number, H: number) {
  const diameter = Math.min(W, D);
  // The sleeve covers the side; only the aluminium top shows, so the two never share a wall.
  builder.add("sleeve", "ecap_sleeve", { scale: [diameter, H * 0.9, diameter], at: [0, 0, 0] });
  builder.add("aluminium can metal", "ecap_can", { scale: [diameter * 0.96, H * 0.12, diameter * 0.96], at: [0, H * 0.88, 0] });
  for (const quarter of [0, 1] as const) {
    builder.add("vent", "ecap_vent", { scale: [diameter * 0.55, 0.02, Math.max(0.15, diameter * 0.05)], at: [0, H - 0.012, 0], quarter });
  }
}

const cache = new Map<string, PcbModelAsset>();
const CACHE_LIMIT = 300;

/** The assembled schematic package for a component, or null when it has none (or a STEP model). */
export function getPcbPackageAsset(component: Pick<PcbPlacedComponent, "id" | "type" | "shape" | "width" | "height" | "maxHeight" | "modelAssetId">, kit: PcbPackageKit | null): PcbModelAsset | null {
  if (!kit) return null;
  const key = resolvePcbPackageKey(component);
  if (!key) return null;
  const W = component.width, D = component.height, H = component.maxHeight;
  if (![W, D, H].every((value) => Number.isFinite(value) && value > 0)) return null;
  const cacheKey = `${key}:${W}:${D}:${H}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;
  try {
    const builder = new PackageBuilder(kit);
    if (key === "chip-resistor") chip(builder, W, D, H, false);
    else if (key === "chip-capacitor") chip(builder, W, D, H, true);
    else if (key === "qfp") qfp(builder, W, D, H);
    else if (key === "qfn") qfn(builder, W, D, H);
    else if (key === "bga") bga(builder, W, D, H);
    else if (key === "inductor") inductor(builder, W, D, H);
    else if (key === "usb-c") usbC(builder, W, D, H);
    else if (key === "header") header(builder, W, D, H);
    else electrolytic(builder, W, D, H);
    const asset = builder.build(key, W, D, H);
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
    cache.set(cacheKey, asset);
    return asset;
  } catch {
    return null;
  }
}

let kitRequest: Promise<PcbPackageKit | null> | null = null;
let kitFailures = 0;

/** Loads the kit once per page; a failed load may be retried a few times, then the boxes stay. */
export function loadPcbPackageKit(url: string, fetcher: typeof fetch = fetch): Promise<PcbPackageKit | null> {
  if (kitRequest) return kitRequest;
  kitRequest = fetcher(url)
    .then((response) => response.ok ? response.json() : null)
    .then((value) => {
      if (isPcbPackageKit(value)) return value;
      throw new Error("invalid package kit");
    })
    .catch(() => {
      kitFailures += 1;
      if (kitFailures < 3) kitRequest = null;
      return null;
    });
  return kitRequest;
}

/** Test hook: forget the loaded kit. */
export function resetPcbPackageKitForTests() {
  kitRequest = null;
  kitFailures = 0;
  cache.clear();
}
