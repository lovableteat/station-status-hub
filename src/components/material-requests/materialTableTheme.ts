import type { CSSProperties } from "react";
import type { BomTableColorTheme } from "./materialBomStorage";

export const DEFAULT_BOM_TABLE_COLOR_THEME: Required<BomTableColorTheme> = {
  primary: "#0F5D74",
  alternative: "#343B73",
  secondary: "#10243D",
  crosshair: "#61CCBC",
};

export const isMaterialTableColor = (value: unknown): value is string => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim());

export function normalizeBomTableColorTheme(theme: Partial<BomTableColorTheme> | null | undefined): Required<BomTableColorTheme> {
  const pick = (key: keyof BomTableColorTheme) => isMaterialTableColor(theme?.[key]) ? theme[key]!.trim().toUpperCase() : DEFAULT_BOM_TABLE_COLOR_THEME[key];
  return { primary: pick("primary"), alternative: pick("alternative"), secondary: pick("secondary"), crosshair: pick("crosshair") };
}

function hexToRgb(value: string) {
  const parsed = Number.parseInt(value.replace("#", ""), 16);
  return { r: (parsed >> 16) & 255, g: (parsed >> 8) & 255, b: parsed & 255 };
}

export function withAlpha(value: string, alpha: number) {
  const { r, g, b } = hexToRgb(value);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function blendWithSurface(value: string, alpha: number) {
  const foreground = hexToRgb(value);
  const surface = hexToRgb("#0B1B2D");
  const blend = (fg: number, bg: number) => Math.round(fg * alpha + bg * (1 - alpha));
  return `rgb(${blend(foreground.r, surface.r)}, ${blend(foreground.g, surface.g)}, ${blend(foreground.b, surface.b)})`;
}

export function buildTableRowStyle(color: string, options?: { backgroundAlpha?: number; hoverAlpha?: number; accentAlpha?: number }): CSSProperties {
  const backgroundAlpha = options?.backgroundAlpha ?? 0.16;
  const hoverAlpha = options?.hoverAlpha ?? 0.24;
  return {
    "--material-row-bg": withAlpha(color, backgroundAlpha),
    "--material-row-solid": blendWithSurface(color, backgroundAlpha),
    "--material-row-hover": withAlpha(color, hoverAlpha),
    "--material-row-hover-solid": blendWithSurface(color, hoverAlpha),
    "--material-row-accent": withAlpha(color, options?.accentAlpha ?? 0.92),
  } as CSSProperties;
}

export function buildMaterialCrosshairStyle(color: string): CSSProperties {
  return {
    "--material-crosshair-tint": withAlpha(color, 0.12),
    "--material-crosshair-active": withAlpha(color, 0.25),
    "--material-crosshair-color": color,
  } as CSSProperties;
}
