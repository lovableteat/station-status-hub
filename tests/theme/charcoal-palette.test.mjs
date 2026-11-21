import assert from "node:assert/strict";
import test from "node:test";
import postcss from "postcss";

import charcoalPalette, { recolorCssValue } from "../../scripts/postcss-charcoal-palette.mjs";
import { readFile } from 'node:fs/promises';

test('selected AI model retains its authored accent after the charcoal palette pass',async()=>{
  const source=await readFile(new URL('../../src/index.css',import.meta.url),'utf8');
  const css=source.match(/\.ai-selected-model\s*\{[^}]+\}/)?.[0];
  assert.ok(css);
  const authored=postcss.parse(css).first;
  const compiled=(await postcss([charcoalPalette()]).process(css,{from:undefined})).root.first;
  for(const prop of ['background','color','border-color'])assert.equal(compiled.nodes.find(node=>node.prop===prop).value,authored.nodes.find(node=>node.prop===prop).value);
});

test("generated utility colors keep their opacity while changing to the charcoal palette", () => {
  assert.equal(
    recolorCssValue("rgb(37 99 235 / var(--tw-bg-opacity))", "background-color"),
    "rgb(79 196 179 / var(--tw-bg-opacity))",
  );
  assert.equal(recolorCssValue("#2a526f", "border-color"), "#3a3941");
  assert.equal(recolorCssValue("hsl(var(--primary) / 0.2)", "background"), "hsl(var(--primary) / 0.2)");
});

test("a declaration is recolored once and pale interface text stays neutral", async () => {
  const result = await postcss([charcoalPalette()]).process(
    `.admin-workspace { --admin-accent-blue: #4f8cff; color: #e8f3fb; }`,
    { from: undefined },
  );
  assert.match(result.css, /--admin-accent-blue: #62cbbb/);
  assert.match(result.css, /color: #f2f2ef/);
  assert.doesNotMatch(result.css, /#c99b5e/);
});

test("hover, open dialog, and mobile rules receive the same palette without changing print output", async () => {
  const css = `
    .button:hover { background: #2563eb; }
    [data-state="open"].dialog { background-color: rgb(7 21 34 / 95%); border-color: #2a526f; }
    @media (max-width: 640px) { .dock[aria-current="page"] { background: #4f8cff; } }
    @media print { .report { background: #ffffff; color: #2563eb; } }
  `;
  const result = await postcss([charcoalPalette()]).process(css, { from: undefined });
  assert.match(result.css, /\.button:hover \{ background: #/);
  assert.doesNotMatch(result.css.split("@media print")[0], /#2563eb|#4f8cff|#2a526f/);
  assert.match(result.css, /@media print \{ \.report \{ background: #ffffff; color: #2563eb; \} \}/);
});

test("warning and error retain distinct semantic colors", () => {
  const warning = recolorCssValue("#fbbf24", "background-color");
  const error = recolorCssValue("#fb7185", "background-color");
  const accent = recolorCssValue("#3b82f6", "background-color");
  assert.notEqual(warning, error);
  assert.notEqual(warning, accent);
  assert.notEqual(error, accent);
  assert.equal(recolorCssValue("#f78ea0", "color"), "#e9aab0");
});

test("diagram editor preserves its requested Apple palette without changing the surrounding site", async () => {
  const css = `.comparison-diagram-editor { background: #f5f5f7; color: #1d1d1f; --diagram-accent: #0071e3; }`;
  const editor = await postcss([charcoalPalette()]).process(css, { from: "src/components/comparison/diagramEditor.css" });
  assert.equal(editor.css, css);
  const surrounding = await postcss([charcoalPalette()]).process(css, { from: "src/index.css" });
  assert.notEqual(surrounding.css, css);
});

test("the 維修中心 palette survives compilation and covers every tab, not only 故障清單", async () => {
  const from = new URL("../../src/components/maintenance/maintenancePalette.css", import.meta.url);
  const css = await readFile(from, "utf8");
  const compiled = await postcss([charcoalPalette()]).process(css, { from: from.pathname });
  assert.match(compiled.css, /--mf-panel: #1b2936/);
  assert.match(compiled.css, /background: #0f171f/);
  const outside = await postcss([charcoalPalette()]).process(css, { from: "src/index.css" });
  assert.doesNotMatch(outside.css, /--mf-panel: #1b2936/, "the exemption is by file, not for every stylesheet");
  // 2026-11-21: the frame was scoped to the 故障清單 tab, so the other three tabs were charcoal.
  assert.doesNotMatch(css.replace(/\/\*[^]*?\*\//g, ""), /data-module=|data-mobile-maintenance-module=/, "no rule may depend on which tab is open");
  const index = await readFile(new URL("../../src/pages/Index.tsx", import.meta.url), "utf8");
  assert.match(index, /import "@\/components\/maintenance\/maintenancePalette\.css";/, "loaded with the shell, whatever tab opens first");
  // 工具與資產 uses fixed navy utilities; every one it uses must be mapped, or it shows as charcoal in the slate frame.
  const tools = (await Promise.all(["ToolsManagement", "CodeStorageManager", "CommandLibrary", "FileUploadDialog"]
    .map((name) => readFile(new URL(`../../src/components/tools/${name}.tsx`, import.meta.url), "utf8")))).join("\n");
  const navy = [...new Set(tools.match(/(?:hover:)?(?:bg|border)-\[#(?:0[0-9a-f]|1[0-2]|2[0-9a-f]|3[0-9a-f])[0-9a-f]{4}\](?!\/)/gi) ?? [])]
    .filter((utility) => !/#(?:38d7ff|3c4c45)/i.test(utility));
  const escape = (utility) => `.${utility.replace(/[:[\]#]/g, (char) => `\\${char}`)}`;
  for (const utility of navy) assert.ok(css.includes(escape(utility)), `${utility} is mapped to the palette`);
  assert.ok(navy.length >= 15, `found the tools tab's navy utilities (${navy.length})`);
  for (const name of ["CodeStorageManager", "CommandLibrary", "FileUploadDialog"]) {
    const source = await readFile(new URL(`../../src/components/tools/${name}.tsx`, import.meta.url), "utf8");
    assert.match(source, /<DialogContent[^>]*className="[^"]*\bmf-tool-dialog\b/, `${name}: its dialog takes the palette`);
  }
  const fault = await readFile(new URL("../../src/components/maintenance/maintenanceFaultLayout.css", import.meta.url), "utf8");
  assert.doesNotMatch(fault, /--mf-panel:|\.maintenance-shell:has/, "the fault tab no longer has a palette of its own");
});

test("maintenance fault colors survive compilation within their own stylesheet", async () => {
  const from = new URL("../../src/components/maintenance/maintenanceFaultLayout.css", import.meta.url);
  const css = await readFile(from, "utf8");
  const compiled = await postcss([charcoalPalette()]).process(css, { from: from.pathname });
  assert.match(compiled.css, /background: #264c4d/);
  assert.match(compiled.css, /linear-gradient\(100deg, #233c46/);
  const outside = await postcss([charcoalPalette()]).process(css, { from: "src/index.css" });
  assert.doesNotMatch(outside.css, /background: #264c4d/);
});

test("solid action and destructive fills keep readable text across hover states", async () => {
  const result = await postcss([charcoalPalette()]).process(`
    .bg-blue-600 { background-color: #2563eb; }
    .bg-rose-500 { background-color: #fb7185; }
    .hover\\:bg-rose-400:hover { background-color: #fb7185; }
    .bg-rose-500\\/20 { background-color: rgb(251 113 133 / .2); }
    .text-white { color: #fff; }
  `, { from: undefined });
  assert.match(result.css, /\.bg-blue-600\[class\] \{ color: hsl\(var\(--primary-foreground\)\); \}/);
  assert.match(result.css, /\.bg-rose-500\[class\] \{ color: hsl\(var\(--primary-foreground\)\); \}/);
  assert.match(result.css, /\.hover\\:bg-rose-400:hover\[class\] \{ color: hsl\(var\(--primary-foreground\)\); \}/);
  assert.doesNotMatch(result.css, /\.bg-rose-500\\\/20\[class\]/);
});
