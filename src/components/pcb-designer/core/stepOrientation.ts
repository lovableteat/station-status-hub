import type {
  ImportedStepBounds,
  ImportedStepDimensions,
  ImportedStepModel,
  ModelUpAxis,
} from "@/components/data-center/dataCenterTypes";

/** The three choices offered in the STEP preview, Z first because ECAD part libraries use it. */
export const PCB_STEP_UP_AXES: readonly ModelUpAxis[] = ["z", "y", "x"];

const AXIS_INDEX: Record<ModelUpAxis, 0 | 1 | 2> = { x: 0, y: 1, z: 2 };
const roundMm = (value: number) => Math.max(0, Math.round(value * 10) / 10);

/**
 * Which model axis points away from the PCB, for a STEP part placed on a board.
 *
 * ECAD part libraries (KiCad, Altium, Allegro and most vendor models) are Z-up with the seating plane at
 * Z = 0, and through-hole leads below it. When the file's Z range reaches that plane in its lower half,
 * trust it: a tall part (TO-220, radial capacitor, pin header) is thinner across than it is high, so the
 * "thinnest side is up" guess lays it on its side. Other files (no seating plane at Z = 0, or a model
 * centred on the origin) keep the thinnest-span guess. The preview lets the user pick another axis.
 */
export function inferPcbStepUpAxis(bounds: ImportedStepBounds): ModelUpAxis {
  const zMin = bounds.min[2];
  const zMax = bounds.max[2];
  const zSpan = zMax - zMin;
  const tolerance = Math.max(0.01, zSpan * 0.001);
  if (zSpan > 0 && zMin <= tolerance && zMax > tolerance && (0 - zMin) / zSpan < 0.5 - 1e-6) return "z";
  const spans = [0, 1, 2].map((axis) => bounds.max[axis] - bounds.min[axis]);
  const smallest = Math.min(...spans);
  if (spans[0] === smallest) return "x";
  if (spans[1] === smallest) return "y";
  return "z";
}

/** 長 (across), 寬 (front to back) and 高 (height) of the model when the given axis points up; 0.1 mm, like the importer. */
export function getPcbStepDimensions(bounds: ImportedStepBounds, upAxis: ModelUpAxis): ImportedStepDimensions {
  const span = (axis: ModelUpAxis) => bounds.max[AXIS_INDEX[axis]] - bounds.min[AXIS_INDEX[axis]];
  if (upAxis === "x") return { widthMm: roundMm(span("y")), depthMm: roundMm(span("z")), heightMm: roundMm(span("x")) };
  if (upAxis === "y") return { widthMm: roundMm(span("x")), depthMm: roundMm(span("z")), heightMm: roundMm(span("y")) };
  return { widthMm: roundMm(span("x")), depthMm: roundMm(span("y")), heightMm: roundMm(span("z")) };
}

/** The same imported model with another up axis; geometry is untouched, only the axis and the derived size change. */
export function orientImportedStepModel<T extends ImportedStepModel>(model: T, upAxis: ModelUpAxis): T {
  const dimensions = getPcbStepDimensions(model.bounds, upAxis);
  return { ...model, upAxis, dimensions, calibratedDimensions: { ...dimensions } };
}
