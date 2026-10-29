import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { DEFAULT_BOM_TABLE_COLOR_THEME, normalizeBomTableColorTheme, buildMaterialCrosshairStyle, buildTableRowStyle } from "../src/components/material-requests/materialTableTheme.ts";

test("existing three-color BOM preferences keep their values and receive a crosshair default", () => {
  const legacy = { primary: "#114422", alternative: "#223355", secondary: "#441122" };
  assert.deepEqual(normalizeBomTableColorTheme(legacy), { ...legacy, crosshair: DEFAULT_BOM_TABLE_COLOR_THEME.crosshair });
  assert.deepEqual(normalizeBomTableColorTheme(null), DEFAULT_BOM_TABLE_COLOR_THEME);
});

test("only full hex colors become CSS variables; row colors and crosshair are independent", () => {
  const theme = normalizeBomTableColorTheme({ primary: " #abcdef ", alternative: "url(javascript:bad)", secondary: 123, crosshair: "#aa3300" });
  assert.equal(theme.primary, "#ABCDEF");
  assert.equal(theme.alternative, DEFAULT_BOM_TABLE_COLOR_THEME.alternative);
  assert.equal(theme.secondary, DEFAULT_BOM_TABLE_COLOR_THEME.secondary);
  assert.deepEqual(buildMaterialCrosshairStyle(theme.crosshair), {
    "--material-crosshair-tint": "rgba(170, 51, 0, 0.12)",
    "--material-crosshair-active": "rgba(170, 51, 0, 0.25)",
    "--material-crosshair-color": "#AA3300",
  });
  assert.equal(buildTableRowStyle(theme.primary)["--material-row-bg"], "rgba(171, 205, 239, 0.16)");
});

test("the actual storage normalizer round-trips the optional crosshair without breaking old preferences", async () => {
  const source = await readFile(new URL("../src/components/material-requests/materialBomStorage.ts", import.meta.url), "utf8");
  const file = ts.createSourceFile("storage.ts", source, ts.ScriptTarget.Latest, true);
  const fn = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "normalizeTableColorTheme");
  assert.ok(fn);
  const compiled = ts.transpileModule(fn.getText(file), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const normalize = new Function(`${compiled}; return normalizeTableColorTheme;`)();
  const legacy = { primary: "#114422", alternative: "#223355", secondary: "#441122" };
  assert.deepEqual(normalize(legacy), legacy);
  assert.deepEqual(normalize(JSON.parse(JSON.stringify({ ...legacy, crosshair: "#ffaa00" }))), { ...legacy, crosshair: "#FFAA00" });
  assert.deepEqual(normalize({ ...legacy, crosshair: "bad" }), legacy);
  assert.equal(normalize({ ...legacy, primary: "bad" }), undefined);
});
