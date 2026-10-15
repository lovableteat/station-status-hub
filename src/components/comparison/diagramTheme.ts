/** Shared canvas colors for the editor and portable SVG, PNG and PDF exports. */
export const DIAGRAM_THEME = {
  canvas: "#ffffff",
  text: "#1f2937",
  detail: "#526171",
  labelBackground: "#ffffff",
} as const;

function channels(color: string): number[] {
  return [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16));
}

function blend(color: string, toward: string, amount: number): string {
  const destination = channels(toward);
  return `#${channels(color).map((value, index) => Math.round(value + (destination[index] - value) * amount).toString(16).padStart(2, "0")).join("")}`;
}

function luminance(color: string): number {
  const linear = channels(color).map(channel => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

/** Retain the chosen hue while keeping even white/yellow connections visible. */
export function diagramStrokeColor(color: string): string {
  if (luminance(color) <= 0.25) return color.toLowerCase();
  let low = 0, high = 1;
  for (let step = 0; step < 12; step++) {
    const amount = (low + high) / 2;
    if (luminance(blend(color, "#233542", amount)) > 0.25) low = amount;
    else high = amount;
  }
  return blend(color, "#233542", high);
}

export function diagramNodeColors(color: string) {
  return {
    fill: blend(color, DIAGRAM_THEME.canvas, 0.88),
    stroke: diagramStrokeColor(color),
    text: DIAGRAM_THEME.text,
    detail: DIAGRAM_THEME.detail,
  };
}
