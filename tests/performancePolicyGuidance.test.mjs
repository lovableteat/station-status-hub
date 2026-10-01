import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../src/components/performance/AssessmentPolicy.tsx", import.meta.url),
  "utf8",
);

test("policy keeps reusable writing guidance ahead of role-specific reference material", () => {
  assert.ok(source.indexOf("<ReusableWritingGuide") < source.indexOf('className="rd2-policy-grid"'));
  assert.match(source, /具象[\s\S]*精準[\s\S]*量化[\s\S]*個人當責/);
  assert.match(source, /STAR 百字範本/);
  assert.match(source, /送出前自我檢核/);
  assert.match(source, /類別正確：[\s\S]*貢獻清楚：[\s\S]*結果量化：[\s\S]*文字精簡：/);
});

test("policy distinguishes the three categories and preserves the five score bands", () => {
  assert.match(source, /IDP:[\s\S]*下一階段責任/);
  assert.match(source, /OKR:[\s\S]*流程或業務影響/);
  assert.match(source, /KPI:[\s\S]*角色基本盤/);
  assert.match(source, /\["A\+", "90–100", "遠優於期望"\]/);
  assert.match(source, /\["D", "59 以下", "遠低於期望"\]/);
});

test("reusable policy copy does not hard-code the supplied annual URL or dates", () => {
  assert.doesNotMatch(source, /epa\.tw\.pegatroncorp\.com|10月0?5日|2026\/10\/05/);
});
