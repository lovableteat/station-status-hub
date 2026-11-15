import type {
  PcbModelAsset,
  PcbModelAssetPart,
  PcbModelAssetPartMetadata,
  PcbPackageModelChoice,
  PcbPlacedComponent,
} from "../types.ts";

/**
 * Schematic package models built in Blender (scripts/pcb-package-models) and assembled here at each
 * component's real 長 × 寬 × 高. Bodies scale to the component; leads, pins, pads and solder balls keep
 * their own cross-section and repeat at a pitch, so a large part never gets thick pins (AGENTS PCB rules).
 * Sizes outside a package's supported range return null and the component keeps today's procedural body,
 * instead of producing negative scales, thick terminals or geometry outside its box.
 * The result is an in-memory PcbModelAsset that both 3D renderers draw through the same mount pipeline as
 * STEP models. It is never stored, uploaded or written to `modelAssetId`; a STEP model always wins.
 * These are schematic packages, not verified footprints.
 */
export type PcbPackageKey = Exclude<PcbPackageModelChoice, "box">;

export const PCB_PACKAGE_LABELS: Record<PcbPackageKey, string> = {
  "chip-resistor": "晶片電阻",
  "chip-capacitor": "積層陶瓷電容（MLCC）",
  qfp: "QFP 鷗翼接腳 IC",
  qfn: "QFN 無接腳 IC",
  bga: "BGA 錫球 IC",
  inductor: "屏蔽電感",
  "usb-c": "USB-C 母座",
  header: "排針座",
  electrolytic: "電解電容",
};

export const PCB_PACKAGE_KEYS = Object.keys(PCB_PACKAGE_LABELS) as PcbPackageKey[];

const isPackageKey = (value: unknown): value is PcbPackageKey => typeof value === "string" && value in PCB_PACKAGE_LABELS;

/** Every piece the assembler uses; a kit without all of them is rejected as a failed load. */
export const PCB_PACKAGE_KIT_PIECES = [
  "body_block", "chip_body", "chip_mlcc", "chip_coat", "terminal_cap", "terminal_pad", "qfp_lead", "bga_substrate",
  "bga_ball", "ferrite_body", "header_base", "header_wall", "header_pin", "pin1_mark", "ecap_can", "ecap_sleeve",
  "ecap_vent", "usbc_shield", "usbc_tongue", "usbc_contact", "usbc_shield_leg",
] as const;

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
 * Which schematic package a component shows: a STEP model wins (null); then the component's explicit
 * 「3D 示意外形」 choice ("box" keeps the box); then the fixed package of a built-in part; then only the types
 * that name one package unambiguously (Resistor, Capacitor — circle means electrolytic —, Inductor). IC,
 * Memory and Connector need an explicit choice: their type alone does not tell the package. Never the name.
 */
export function resolvePcbPackageKey(component: Pick<PcbPlacedComponent, "id" | "type" | "shape" | "modelAssetId" | "packageModel">): PcbPackageKey | null {
  if (component.modelAssetId) return null;
  if (component.packageModel === "box") return null;
  if (isPackageKey(component.packageModel)) return component.packageModel;
  const builtIn = BUILT_IN_PACKAGES[component.id];
  if (builtIn) return builtIn;
  switch (component.type?.trim().toLocaleLowerCase()) {
    case "resistor": return "chip-resistor";
    case "capacitor": return component.shape === "circle" ? "electrolytic" : "chip-capacitor";
    case "inductor": return "inductor";
    default: return null;
  }
}

const isUnitColor = (value: unknown) => Array.isArray(value) && value.length === 3
  && value.every((channel) => typeof channel === "number" && Number.isFinite(channel) && channel >= 0 && channel <= 1);

export function isPcbPackageKit(value: unknown): value is PcbPackageKit {
  if (!value || typeof value !== "object") return false;
  const kit = value as Partial<PcbPackageKit>;
  if (kit.schemaVersion !== 1 || !kit.pieces || typeof kit.pieces !== "object" || Array.isArray(kit.pieces)) return false;
  return PCB_PACKAGE_KIT_PIECES.every((name) => {
    const piece = (kit.pieces as Record<string, PcbPackageKitPiece | undefined>)[name];
    return Boolean(piece) && Array.isArray(piece!.positions) && Array.isArray(piece!.indices)
      && piece!.positions.length >= 9 && piece!.positions.length % 3 === 0
      && piece!.indices.length >= 3 && piece!.indices.length % 3 === 0
      && piece!.positions.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate))
      && piece!.indices.every((index) => Number.isInteger(index) && index >= 0 && index < piece!.positions.length / 3)
      && isUnitColor(piece!.color);
  });
}

type Quarter = 0 | 1 | 2 | 3;
interface Placement { scale: [number, number, number]; at: [number, number, number]; quarter?: Quarter }

class UnsupportedSize extends Error {}

class PackageBuilder {
  private readonly parts = new Map<string, { color: [number, number, number]; position: number[]; index: number[] }>();
  private readonly kit: PcbPackageKit;
  constructor(kit: PcbPackageKit) {
    this.kit = kit;
  }

  /** Scale the piece, turn it by quarter turns around the up axis, then move it. Only positive scales keep the winding. */
  add(partName: string, pieceName: string, placement: Placement) {
    const piece = this.kit.pieces[pieceName];
    if (!piece) throw new UnsupportedSize(`missing package piece ${pieceName}`);
    const [sx, sy, sz] = placement.scale;
    if (![sx, sy, sz].every((value) => Number.isFinite(value) && value > 1e-4)) throw new UnsupportedSize(`degenerate scale for ${pieceName}`);
    let part = this.parts.get(partName);
    if (!part) this.parts.set(partName, part = { color: piece.color, position: [], index: [] });
    const base = part.position.length / 3;
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
      // The package must stay inside the component's box: anything outside means the size is not supported.
      for (let i = 0; i < part.position.length; i += 3) {
        if (Math.abs(part.position[i]) > width / 2 + 1e-6 || part.position[i + 1] < -1e-6 || part.position[i + 1] > height + 1e-6
          || Math.abs(part.position[i + 2]) > depth / 2 + 1e-6) throw new UnsupportedSize(`${name} leaves the component box`);
      }
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
/** Centres of `count` items at `pitch`, centred on 0. */
const along = (count: number, pitch: number) => Array.from({ length: count }, (_, index) => (index - (count - 1) / 2) * pitch);
const fit = (span: number, pitch: number, cap: number) => clamp(Math.floor(span / pitch) + 1, 1, cap);
/** Gap left between a body's top and the box top, so a mark or vent can sit on it without leaving the box. */
const TOP_GAP = 0.03;

/** Supported sizes (mm). Outside them the procedural body is shown instead of a distorted package. */
const SUPPORTED: Record<PcbPackageKey, (W: number, D: number, H: number) => boolean> = {
  "chip-resistor": (W, D, H) => W >= 0.4 && D >= 0.2 && H >= 0.15 && W <= 12 && D <= 8 && H <= 6,
  "chip-capacitor": (W, D, H) => W >= 0.4 && D >= 0.2 && H >= 0.15 && W <= 12 && D <= 8 && H <= 6,
  qfp: (W, D, H) => Math.min(W, D) >= 4 && Math.max(W, D) <= 60 && H >= 0.8 && H <= 6,
  qfn: (W, D, H) => Math.min(W, D) >= 1.2 && Math.max(W, D) <= 15 && H >= 0.3 && H <= 3,
  bga: (W, D, H) => Math.min(W, D) >= 2 && Math.max(W, D) <= 60 && H >= 0.5 && H <= 6,
  inductor: (W, D, H) => Math.min(W, D) >= 0.8 && Math.max(W, D) <= 30 && H >= 0.3 && H <= 20,
  // A shell scaled by the same factor on each axis: only near its modelled size, so contacts and legs never turn into thick walls.
  "usb-c": (W, D, H) => [W / 8.94, D / 7.35, H / 3.26].every((factor) => factor >= 0.75 && factor <= 1.35),
  header: (W, D, H) => W >= 1.5 && D >= 1.5 && H >= 2 && W <= 120 && D <= 20 && H <= 20,
  electrolytic: (W, D, H) => Math.min(W, D) >= 2 && Math.min(W, D) <= 40 && H >= 2 && H <= 60,
};

function chip(builder: PackageBuilder, W: number, D: number, H: number, mlcc: boolean) {
  const cap = clamp(W * (mlcc ? 0.22 : 0.2), 0.1, W * 0.3);
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
  // Sits on the body top (TOP_GAP below the box top) and ends exactly at the box top.
  builder.add("orientation mark", "pin1_mark", { scale: [diameter, TOP_GAP + 0.01, diameter], at: [x, top - TOP_GAP - 0.01, z] });
}

function qfp(builder: PackageBuilder, W: number, D: number, H: number) {
  const lead = clamp(Math.min(W, D) * 0.07, 0.5, 1);
  const standoff = Math.min(0.1, H * 0.1);
  const bodyW = W - lead * 2, bodyD = D - lead * 2;
  builder.add("body", "body_block", { scale: [bodyW, H - standoff - TOP_GAP, bodyD], at: [0, standoff, 0] });
  // The nominal lead leaves the body at 0.45-0.60 mm; keep it at about a third of the body height, below the top.
  const rise = clamp(((H - standoff) * 0.35 + standoff) / 0.525, 0.5, Math.min(1.6, (H * 0.8) / 0.6));
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
  builder.add("body", "body_block", { scale: [W, H - pad * 0.5 - TOP_GAP, D], at: [0, pad * 0.5, 0] });
  const pitch = Math.min(W, D) >= 2 ? 0.5 : 0.4;
  const length = clamp(Math.min(W, D) * 0.12, 0.25, 0.5);
  const width = pitch * 0.5;
  for (const [quarter, span, offset] of [[0, D, W / 2], [1, W, D / 2], [2, D, W / 2], [3, W, D / 2]] as const) {
    for (const t of along(fit(span - pitch * 2.4, pitch, 48), pitch)) {
      // Flush with the body side, never outside the box.
      const inset = offset - length / 2;
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
  builder.add("body", "body_block", { scale: [W * 0.94, H - standoff - substrate - TOP_GAP, D * 0.94], at: [0, standoff + substrate, 0] });
  // Only the outer ring is visible from the side; the inner array would only cost triangles.
  const xs = along(fit(W - pitch * 1.2, pitch, 40), pitch), zs = along(fit(D - pitch * 1.2, pitch, 40), pitch);
  xs.forEach((x, i) => zs.forEach((z, j) => {
    if (Math.min(i, j, xs.length - 1 - i, zs.length - 1 - j) === 0) {
      builder.add("solder ball terminal", "bga_ball", { scale: [ball, standoff * 1.15, ball], at: [x, 0, z] });
    }
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
  // Authored at 8.94 x 7.35 x 3.26 mm; SUPPORTED keeps each factor within 0.75–1.35.
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
  builder.add("aluminium can metal", "ecap_can", { scale: [diameter * 0.96, H * 0.12 - TOP_GAP, diameter * 0.96], at: [0, H * 0.88, 0] });
  for (const quarter of [0, 1] as const) {
    builder.add("vent", "ecap_vent", { scale: [diameter * 0.55, TOP_GAP, Math.max(0.15, diameter * 0.05)], at: [0, H - TOP_GAP, 0], quarter });
  }
}

const caches = new WeakMap<PcbPackageKit, Map<string, PcbModelAsset | null>>();
const CACHE_LIMIT = 150;

/** The assembled schematic package for a component, or null (no kit, a STEP model, no package or an unsupported size). */
export function getPcbPackageAsset(
  component: Pick<PcbPlacedComponent, "id" | "type" | "shape" | "width" | "height" | "maxHeight" | "modelAssetId" | "packageModel">,
  kit: PcbPackageKit | null,
): PcbModelAsset | null {
  if (!kit) return null;
  const key = resolvePcbPackageKey(component);
  if (!key) return null;
  const W = component.width, D = component.height, H = component.maxHeight;
  if (![W, D, H].every((value) => Number.isFinite(value) && value > 0) || !SUPPORTED[key](W, D, H)) return null;
  let cache = caches.get(kit);
  if (!cache) caches.set(kit, cache = new Map());
  const cacheKey = `${key}:${W}:${D}:${H}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey) ?? null;
  let asset: PcbModelAsset | null = null;
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
    asset = builder.build(key, W, D, H);
  } catch {
    asset = null;
  }
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  cache.set(cacheKey, asset);
  return asset;
}

let kitRequest: Promise<PcbPackageKit | null> | null = null;
let kitFailures = 0;
let loadedKit: PcbPackageKit | null = null;

/** The kit if a 3D view already loaded it; never starts a download (the inspector uses this). */
export function getLoadedPcbPackageKit(): PcbPackageKit | null {
  return loadedKit;
}

/** Loads the kit once per page; an invalid or failed load may be retried a few times, then the boxes stay. */
export function loadPcbPackageKit(url: string, fetcher: typeof fetch = fetch): Promise<PcbPackageKit | null> {
  if (kitRequest) return kitRequest;
  kitRequest = fetcher(url)
    .then((response) => {
      if (!response.ok) throw new Error(`package kit ${response.status}`);
      return response.json();
    })
    .then((value) => {
      if (isPcbPackageKit(value)) return (loadedKit = value);
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
  loadedKit = null;
}
