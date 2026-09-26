import assert from "node:assert/strict";
import test from "node:test";
import postcss from "postcss";

import charcoalPalette, { recolorCssValue } from "../../scripts/postcss-charcoal-palette.mjs";

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
