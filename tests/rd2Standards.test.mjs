import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCOUNTABILITY_QUESTIONS,
  KPI_REFERENCES,
  getAccountabilityQuestions,
  getAccountabilityRole,
  getLevelWeights,
  RATING_SCALE,
} from "../src/components/performance/rd2Standards.mjs";
import {
  createAssessmentForm,
  readManagerAssessment,
  serializeManagerAssessment,
  validateAssessment,
} from "../src/components/performance/rd2Assessment.mjs";
import { toPerformanceCsv } from "../src/components/performance/performanceData.mjs";

test("workbook A7:D9 weights use numeric grade without filling unpublished 13/49 weights", () => {
  for (const grade of [19, 23])
    assert.deepEqual(getLevelWeights(grade), { KPI: 60, OKR: 20, IDP: 20 });
  for (const grade of [29, 33])
    assert.deepEqual(getLevelWeights(String(grade)), {
      KPI: 50,
      OKR: 30,
      IDP: 20,
    });
  for (const grade of [39, 43])
    assert.deepEqual(getLevelWeights(grade), { KPI: 40, OKR: 35, IDP: 25 });
  for (const grade of [13, 49, "junior", "manager", "", null])
    assert.equal(getLevelWeights(grade), null);
});
test("all 91 HW/FW criteria from B16:E17 are retained, including gate ownership and regression", () => {
  const counts = {
    EE: [
      [7, 3],
      [6, 2],
      [9, 4],
      [9, 5],
    ],
    FW: [
      [7, 3],
      [6, 3],
      [9, 5],
      [9, 4],
    ],
  };
  for (const team of ["EE", "FW"])
    ["junior", "senior", "leader", "manager"].forEach((role, index) => {
      const reference = KPI_REFERENCES[team][role];
      assert.deepEqual(
        [reference.baseline.length, reference.outstanding.length],
        counts[team][index],
      );
      assert.ok(
        reference.baseline.every((line) => reference.raw.includes(line)),
      );
      assert.ok(
        reference.outstanding.every((line) => reference.raw.includes(line)),
      );
    });
  assert.match(KPI_REFERENCES.EE.leader.baseline[6], /PCB Gerber release/);
  assert.match(KPI_REFERENCES.FW.manager.outstanding[3], /Develop FW Leaders/);
  assert.match(KPI_REFERENCES.FW.leader.baseline[7], /Drive HW activities/); // source ambiguity explicitly retained
});
test("workbook question IDs remain stable and each hierarchy selects its own seven questions", () => {
  assert.equal(ACCOUNTABILITY_QUESTIONS.length, 21);
  assert.deepEqual(
    ACCOUNTABILITY_QUESTIONS.map((q) => q.number),
    Array.from({ length: 21 }, (_, i) => i + 1),
  );
  for (const [level, first, last] of [
    ["director", 1, 7],
    ["section_chief", 8, 14],
    ["member", 15, 21],
  ]) {
    const questions = getAccountabilityQuestions(getAccountabilityRole(level));
    assert.equal(questions.length, 7);
    assert.equal(questions[0].number, first);
    assert.equal(questions.at(-1).number, last);
  }
  assert.equal(RATING_SCALE[0].label, "1分（完全未做到）");
  assert.equal(RATING_SCALE[2].label, "3分（基本做到）");
  assert.equal(getAccountabilityQuestions("unknown").length, 0);
});
test("new role-specific scoring preserves legacy answers without reusing them as employee ratings", () => {
  const old = readManagerAssessment(
    'RD2_MANAGER_V1\n{"answers":{"q1":4,"q2":5},"feedback":"old feedback"}',
  );
  assert.equal(old.answers.q1, 4);
  assert.equal(old.answers.q2, 5);
  assert.equal(old.answers.q15, null);
  const form = createAssessmentForm(null, {
    userId: "one",
    displayName: "Employee",
  });
  form.self.employeeNumber = "E001";
  form.manager = { ...old, roleGroup: "employee" };
  assert.match(validateAssessment(form, "manager", "submit"), /7 題/);
  getAccountabilityQuestions("employee").forEach((q) => {
    form.manager.answers[q.id] = 3;
  });
  assert.equal(validateAssessment(form, "manager", "submit"), "");
  const reopened = readManagerAssessment(
    serializeManagerAssessment(form.manager),
  );
  assert.equal(reopened.answers.q1, 4);
  assert.equal(reopened.answers.q21, 3);
  const csv = toPerformanceCsv([
    {
      employeeName: "Employee",
      department: "RD2",
      reviewerName: "Chief",
      status: "approved",
      goals: [],
      managerFeedback: serializeManagerAssessment(reopened),
      selfFeedback: "",
    },
  ]);
  assert.match(csv, /一般員工 Q21/);
  assert.match(csv, /中階管理層 Q8/);
  assert.doesNotMatch(
    toPerformanceCsv(
      [
        {
          managerFeedback: serializeManagerAssessment(reopened),
          selfFeedback: "",
          goals: [],
        },
      ],
      { includeManager: false },
    ),
    /Q21|old feedback/,
  );
});
