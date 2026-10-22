import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const presentationSource = await readFile(new URL("../src/components/material-requests/materialRequestPresentation.ts", import.meta.url), "utf8");
const transpiled = ts.transpileModule(presentationSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { buildPendingApplications, groupPendingMaterials } = await import(`data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`);

const record = (id, mpn, needsApplication, extra = {}) => ({ id, manufacturer: `Vendor ${id}`, manufacturerPartNumber: mpn, needsApplication, name: "", ...extra });
const group = (key, displayRef, records, extra = {}) => ({ key, displayRef, name: `Part ${key}`, searchText: displayRef.toLowerCase(), primaryRecord: records[0], records, ...extra });

test("by default only locations with no number on any vendor row are listed, once each", () => {
  const c291 = group("g1", "C291_C1", [record("a", "C1608", true), record("b", "AMK107", false), record("c", "C0603", true)]);
  const empty = group("g2", "C5", [record("d", "X", true), record("e", "Y", true)]);
  const done = group("g3", "R5", [record("f", "RC0402", false)]);
  assert.deepEqual(buildPendingApplications([c291, empty, done]).map((item) => [item.key, item.record.manufacturerPartNumber]), [["g2::d", "X"]]);
});

test("with alternates, one line per vendor row still to apply for, in location order, never merged across locations", () => {
  const c291 = group("g1", "C291_C1", [
    record("a", "C1608X6S226MBTS", true),
    record("b", "AMK107BC6226MA-T", false),
    record("c", "C0603S226M004T", true),
  ]);
  const u1 = group("g2", "U1_C0P1", [record("d", "RAA228942", true)]);
  const u2 = group("g3", "U1_C0P2", [record("e", "RAA228942", true)]);
  const done = group("g4", "R5", [record("f", "RC0402", false)]);
  const applications = buildPendingApplications([c291, u1, u2, done], { includeAlternates: true });
  assert.deepEqual(applications.map((item) => [item.key, item.displayRef, item.record.manufacturerPartNumber]), [
    ["g1::a", "C291_C1", "C1608X6S226MBTS"],
    ["g1::c", "C291_C1", "C0603S226M004T"],
    ["g2::d", "U1_C0P1", "RAA228942"],
    ["g3::e", "U1_C0P2", "RAA228942"],
  ]);
  assert.equal(applications[0].group, c291);
  assert.equal(applications[0].name, "Part g1", "falls back to the location's name");
  assert.match(applications[1].searchText, /c0603s226m004t/);
  assert.match(applications[1].searchText, /vendor c/);
});

test("the primary row is not listed twice and lines keep their location's category", () => {
  const primary = record("p", "X1", true);
  const g = group("g", "J7", [primary, primary, record("q", "X2", true)], { primaryRecord: primary });
  const applications = buildPendingApplications([g], { includeAlternates: true });
  assert.deepEqual(applications.map((item) => item.key), ["g::p", "g::q"]);
  assert.deepEqual(buildPendingApplications([g]).map((item) => item.key), ["g::p"], "the default view lists the location once");
  const categories = groupPendingMaterials(applications);
  assert.deepEqual(categories.map((category) => [category.key, category.groups.length]), [["connector", 2]]);
});
