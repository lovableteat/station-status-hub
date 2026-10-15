import assert from "node:assert/strict";
import test from "node:test";
import {
  DIAGRAM_APPEARANCE_KEY, DIAGRAM_THEME, diagramNodeColors, diagramStrokeColor,
  diagramTheme, readDiagramAppearance, writeDiagramAppearance,
} from "../../src/components/comparison/diagramTheme.ts";

function luminance(color: string) {
  const channels = [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrast(first: string, second: string) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("dark appearance keeps arbitrary diagram colors readable without changing print appearance", () => {
  const dark = diagramTheme("dark");
  for (const red of [0, 51, 102, 153, 204, 255]) {
    for (const green of [0, 51, 102, 153, 204, 255]) {
      for (const blue of [0, 51, 102, 153, 204, 255]) {
        const color = `#${[red, green, blue].map(channel => channel.toString(16).padStart(2, "0")).join("")}`;
        const node = diagramNodeColors(color, "dark");
        assert.ok(contrast(node.text, node.fill) >= 7, `${color}: node labels`);
        assert.ok(contrast(node.detail, node.fill) >= 4.5, `${color}: secondary node text`);
        assert.ok(contrast(node.stroke, dark.canvas) >= 5.5, `${color}: arrow / canvas`);
        assert.ok(contrast(node.stroke, node.fill) >= 3, `${color}: node border`);
        assert.equal(diagramStrokeColor(color, "dark"), node.stroke);
      }
    }
  }
  assert.equal(diagramTheme().canvas, "#ffffff", "export defaults must stay on a light page");
  assert.equal(diagramNodeColors("#ffffff").text, DIAGRAM_THEME.text);
  assert.equal(diagramStrokeColor("#000000"), "#000000");
});

test("appearance defaults to dark and remembers an explicit light or dark choice", () => {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  assert.equal(readDiagramAppearance(storage), "dark");
  writeDiagramAppearance("light", storage);
  assert.equal(data.get(DIAGRAM_APPEARANCE_KEY), "light");
  assert.equal(readDiagramAppearance(storage), "light");
  writeDiagramAppearance("dark", storage);
  assert.equal(readDiagramAppearance(storage), "dark");
  data.set(DIAGRAM_APPEARANCE_KEY, "invalid");
  assert.equal(readDiagramAppearance(storage), "dark");
});

test("unavailable browser storage does not prevent drawing or changing appearance", () => {
  assert.equal(readDiagramAppearance(null), "dark");
  assert.doesNotThrow(() => writeDiagramAppearance("light", null));
  assert.equal(readDiagramAppearance({ getItem() { throw new Error("Storage denied"); } }), "dark");
  assert.doesNotThrow(() => writeDiagramAppearance("light", { setItem() { throw new Error("Quota exceeded"); } }));
});
