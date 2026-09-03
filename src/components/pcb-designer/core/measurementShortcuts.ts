export type MeasurementFlipAxis = "horizontal" | "vertical";
export type MeasurementShortcuts = Record<MeasurementFlipAxis, string>;

export const DEFAULT_MEASUREMENT_SHORTCUTS: MeasurementShortcuts = {
  horizontal: "h",
  vertical: "v",
};
export const MEASUREMENT_SHORTCUTS_KEY =
  "work-platform:pcb-measurement-shortcuts:v1";

export function validMeasurementShortcuts(
  value: unknown,
): value is MeasurementShortcuts {
  if (!value || typeof value !== "object") return false;
  const keys = value as MeasurementShortcuts;
  return (
    typeof keys.horizontal === "string" &&
    /^[a-z]$/.test(keys.horizontal) &&
    typeof keys.vertical === "string" &&
    /^[a-z]$/.test(keys.vertical) &&
    keys.horizontal !== keys.vertical
  );
}

export function measurementShortcutAxis(
  event: Pick<
    KeyboardEvent,
    "key" | "shiftKey" | "ctrlKey" | "metaKey" | "altKey"
  >,
  keys: MeasurementShortcuts,
): MeasurementFlipAxis | null {
  if (!event.shiftKey || event.ctrlKey || event.metaKey || event.altKey)
    return null;
  const key = event.key.toLowerCase();
  if (key === keys.horizontal) return "horizontal";
  if (key === keys.vertical) return "vertical";
  return null;
}
