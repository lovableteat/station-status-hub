import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("./rlcPriority.ts", import.meta.url), "utf8").catch(() => "");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const domain = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
const record = (id, maker = "Example A", mpn = "R-10K", extra = {}) => ({ id, manufacturer: maker, manufacturerPartNumber: mpn, partNumber: "REAL-1", virtualAlternative: "", refDes: "R1", displayRef: "R1", partUsageStatus: "", sourcingStatus: "Approved", ...extra });
const group = (key, name = "RES 10K 1% 0603 0.1W", records = [record(key)], ref = "R1") => ({ key, name, displayRef: ref, records, primaryRecord: records[0], sectionName: "Board", assemblyName: "Main" });
const qualified = (projectId, spec, candidate, rank = 1) => ({ ...domain.createRlcPriorityRule(projectId, spec, candidate), customerApproval: "approved", avl: "not-required", engineering: "approved", rank });

test("RLC scope is determined by actual references, including PR/PC/PL", () => {
  assert.equal(typeof domain.getRlcKind, "function");
  for (const [ref, expected] of [["R1", "R"], ["PR12", "R"], ["PC3", "C"], ["PL9", "L"], ["R1-R9", "R"], ["U1", null], ["J1", null], ["Q1", null], ["CR1", null], ["R1, U1", null], ["R1-C2", null]]) {
    assert.equal(domain.getRlcKind(group("g", "10K", [record("1", undefined, undefined, { refDes: ref })], ref)), expected, ref);
  }
});

test("full specs merge references while ratings, packages and unit case remain distinct", () => {
  const groups = domain.buildRlcPriorityGroups([
    group("a"), group("b", "  RES 10K   1% 0603 0.1W  ", [record("b", "Example B", "R-B", { refDes: "R2" })], "R2"),
    group("c", "RES 10K 1% 0402 0.1W"), group("d", "RES 10K 1% 0603 0.25W"), group("e", "RES 10m 0603"), group("f", "RES 10M 0603"),
  ], "project-a", []);
  assert.equal(groups.length, 5);
  assert.deepEqual(groups[0].refs, ["R1", "R2"]);
  assert.equal(groups[0].sourceGroupKeys.length, 2);
  assert.equal(groups[0].manufacturerCount, 2);
  assert.equal(groups[0].candidates.length, 2);
  assert.equal(groups[0].candidates[0].virtualPartNumbers.length, 0, "real number cannot become virtual");
});

test("defaults remain pending despite Approved sourcing; project rules never leak", () => {
  const base = domain.buildRlcPriorityGroups([group("a")], "a", [])[0];
  assert.equal(base.candidates[0].rule.customerApproval, "pending");
  assert.equal(base.candidates[0].eligible, false);
  const rule = qualified("a", base, base.candidates[0]);
  assert.equal(domain.buildRlcPriorityGroups([group("a")], "a", [rule])[0].recommendation.status, "recommended");
  assert.equal(domain.buildRlcPriorityGroups([group("a")], "b", [rule])[0].recommendation.status, "needs-qualification");
  assert.equal(domain.buildRlcPriorityGroups([group("a")], null, [rule])[0].recommendation.status, "unassigned");
});

test("qualification and source restriction gate candidates before ranking", () => {
  const input = group("a", undefined, [record("1"), record("2", "Example B", "R-B")]);
  const base = domain.buildRlcPriorityGroups([input], "p", [])[0];
  const a = qualified("p", base, base.candidates[0], 1);
  const b = qualified("p", base, base.candidates[1], 9);
  a.engineering = "blocked";
  let result = domain.buildRlcPriorityGroups([input], "p", [a, b])[0];
  assert.equal(result.recommendation.candidateKey, b.candidateKey);
  a.engineering = "approved";
  input.records[0].partUsageStatus = "新設計產品不建議使用";
  result = domain.buildRlcPriorityGroups([input], "p", [a, b])[0];
  assert.equal(result.recommendation.candidateKey, b.candidateKey);
  assert.match(result.candidates[0].exclusionReasons.join(" "), /不建議使用/);
  for (const restriction of ["禁用", "ODM 不建議用料", "NRND", "Disqualified", "不建議採用"]) {
    input.records[0].partUsageStatus = restriction;
    assert.equal(domain.buildRlcPriorityGroups([input], "p", [a, b])[0].candidates[0].eligible, false, restriction);
  }
});

test("unranked, fractional and tied priorities cannot produce an arbitrary winner", () => {
  const input = group("a", undefined, [record("1"), record("2", "Example B", "R-B")]);
  const base = domain.buildRlcPriorityGroups([input], "p", [])[0];
  const a = qualified("p", base, base.candidates[0], null);
  const b = qualified("p", base, base.candidates[1], 1.5);
  assert.equal(domain.buildRlcPriorityGroups([input], "p", [a, b])[0].recommendation.status, "needs-ranking");
  a.rank = b.rank = 2;
  assert.equal(domain.buildRlcPriorityGroups([input], "p", [a, b])[0].recommendation.status, "tied");
  b.rank = 3;
  assert.equal(domain.buildRlcPriorityGroups([input], "p", [a, b])[0].recommendation.candidateKey, a.candidateKey);
});

test("candidate identity spans rows/BOMs; missing source candidates remain visible but excluded", () => {
  const base = domain.buildRlcPriorityGroups([group("old", undefined, [record("old")])], "p", [])[0];
  const rule = qualified("p", base, base.candidates[0]);
  const repeated = domain.buildRlcPriorityGroups([group("new", undefined, [record("new", "example a", "r-10k"), record("next", "EXAMPLE A", "R-10K")])], "p", [rule])[0];
  assert.equal(repeated.candidates.length, 1);
  assert.equal(repeated.candidates[0].rule.rank, 1);
  const missing = domain.buildRlcPriorityGroups([group("different", undefined, [record("3", "Example B", "R-B")])], "p", [rule])[0];
  const old = missing.candidates.find(item => item.key === rule.candidateKey);
  assert.equal(old.inCurrentBom, false);
  assert.equal(old.eligible, false);
  assert.equal(old.rule.rank, 1);
  const absentSpec = domain.buildRlcPriorityGroups([], "p", [rule])[0];
  assert.equal(absentSpec.candidates[0].inCurrentBom, false);
  assert.equal(absentSpec.recommendation.status, "needs-qualification");
});

test("manufacturer and MPN are both required and source BOM is never mutated", () => {
  const input = [group("missing", undefined, [record("1", "", "R-X"), record("2", "Example B", "")])];
  const before = JSON.stringify(input);
  const output = domain.buildRlcPriorityGroups(input, "p", []);
  assert.equal(output[0].candidates.every(item => !item.eligible), true);
  assert.equal(JSON.stringify(input), before);
});
