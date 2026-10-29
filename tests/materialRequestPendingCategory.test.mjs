import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const presentationSource = await readFile(new URL("../src/components/material-requests/materialRequestPresentation.ts", import.meta.url), "utf8");
const transpiled = ts.transpileModule(presentationSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText.replace('"./materialTrackingStatus.ts"', JSON.stringify(new URL("../src/components/material-requests/materialTrackingStatus.ts", import.meta.url).href));
const { groupPendingMaterials, isPendingMaterialCategory, resolvePendingMaterialCategory } = await import(`data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`);

const group = (displayRef, primaryCategory, otherCategories = []) => ({
  displayRef,
  primaryRecord: primaryCategory === undefined ? {} : { pendingCategory: primaryCategory },
  records: [primaryCategory === undefined ? {} : { pendingCategory: primaryCategory }, ...otherCategories.map((pendingCategory) => ({ pendingCategory }))],
});

test("the Ref Des prefix decides until a category is chosen by hand", () => {
  assert.deepEqual(resolvePendingMaterialCategory(group("U100")), { category: "ic", manual: false });
  assert.deepEqual(resolvePendingMaterialCategory(group("U100", "other")), { category: "other", manual: true });
  assert.deepEqual(resolvePendingMaterialCategory(group("PU7", undefined, ["ic"])), { category: "ic", manual: true }, "a choice saved on any row of the part counts");
  assert.deepEqual(resolvePendingMaterialCategory(group("J1", "rlc", ["ic"])), { category: "rlc", manual: true }, "the main row wins when rows disagree");
  assert.deepEqual(resolvePendingMaterialCategory(group("C5", "bogus")), { category: "rlc", manual: false }, "unknown values are ignored");
  assert.equal(isPendingMaterialCategory("connector"), true);
  assert.equal(isPendingMaterialCategory("auto"), false);
});

test("hand-picked categories move parts between the 待處理料 tabs", () => {
  const categories = groupPendingMaterials([group("U100", "other"), group("U66"), group("XJ3", "connector"), group("R1")]);
  assert.deepEqual(categories.map((category) => [category.key, category.groups.map((item) => item.displayRef)]), [
    ["connector", ["XJ3"]],
    ["ic", ["U66"]],
    ["rlc", ["R1"]],
    ["other", ["U100"]],
  ]);
});
