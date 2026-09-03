export type MeasurementRotationDirection = "clockwise" | "counterclockwise";
export type MeasurementShortcuts = Record<MeasurementRotationDirection, string>;
export const DEFAULT_MEASUREMENT_SHORTCUTS: MeasurementShortcuts = {
  clockwise: "r",
  counterclockwise: "Shift+r",
};
export const MEASUREMENT_SHORTCUTS_KEY =
  "work-platform:pcb-measurement-rotation-shortcuts:v1";
export const MEASUREMENT_SHORTCUT_OPTIONS = [
  "r",
  ..."abcdefghijklmnopqrstuvwxyz".split("").map((key) => `Shift+${key}`),
];
export function measurementShortcutLabel(shortcut: string): string {
  return shortcut.replace(/[a-z]$/, (key) => key.toUpperCase());
}
export function validMeasurementShortcuts(
  value: unknown,
): value is MeasurementShortcuts {
  if (!value || typeof value !== "object") return false;
  const keys = value as MeasurementShortcuts;
  return (
    MEASUREMENT_SHORTCUT_OPTIONS.includes(keys.clockwise) &&
    MEASUREMENT_SHORTCUT_OPTIONS.includes(keys.counterclockwise) &&
    keys.clockwise !== keys.counterclockwise
  );
}
export function measurementShortcutDirection(
  event: Pick<
    KeyboardEvent,
    "key" | "shiftKey" | "ctrlKey" | "metaKey" | "altKey"
  >,
  keys: MeasurementShortcuts,
): MeasurementRotationDirection | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  const key = `${event.shiftKey ? "Shift+" : ""}${event.key.toLowerCase()}`;
  if (key === keys.clockwise) return "clockwise";
  if (key === keys.counterclockwise) return "counterclockwise";
  return null;
}
