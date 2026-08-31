import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCOUNTABILITY_QUESTIONS,
  CATEGORIES,
  LEVELS,
  TEAMS,
  MAX_EVIDENCE_CHARACTERS,
  SELF_PREFIX,
  buildAssessmentReview,
  createAssessmentForm,
  draftKey,
  getKpiReference,
  getLevelWeights,
  readAssessmentDraft,
  readManagerAssessment,
  readSelfAssessment,
  safeEvidenceUrl,
  saveAssessmentDraft,
  serializeManagerAssessment,
  serializeSelfAssessment,
  validateAssessment,
} from "../src/components/performance/rd2Assessment.mjs";
import {
  normalizePerformanceReview,
  toPerformanceCsv,
} from "../src/components/performance/performanceData.mjs";
import { saveAssessmentRecord } from "../src/components/performance/assessmentPersistence.mjs";

const makeForm = () => {
  const form = createAssessmentForm(null, {
    userId: "user-1",
    displayName: "Test Employee",
  });
  Object.assign(form.self, {
    employeeNumber: "12345",
    team: "FW",
    level: "senior",
  });
  CATEGORIES.forEach((category) => {
    form.self.sections[category].text = `${category}: STAR result`;
  });
  return form;
};
const build = (form, mode = "self", action = "submit", previous) =>
  buildAssessmentReview({
    form,
    mode,
    action,
    previous,
    cycleId: "2026-q3",
    reviewerName: "Manager",
    id: "record-1",
    now: "2026-08-31T04:00:00Z",
  });
const memoryStorage = () => {
  const store = new Map();
  return {
    getItem: (key) => store.get(key) || null,
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key),
  };
};

test("all eight team/level combinations expose baseline and outstanding criteria", () => {
  assert.equal(TEAMS.length * LEVELS.length, 8);
  for (const team of TEAMS)
    for (const level of LEVELS) {
      const reference = getKpiReference(team.value, level.value);
      assert.ok(reference.baseline.length >= 3);
      assert.ok(reference.outstanding.length >= 2);
    }
  assert.equal(getKpiReference("invalid", "senior"), null);
  assert.ok(
    getKpiReference("FW", "senior").baseline.includes(
      "System firmware architecture design.",
    ),
  );
  assert.ok(
    getKpiReference("EE", "junior").baseline.includes(
      "BOM create and maintain.",
    ),
  );
});
test("policy weights are separate from the two original accountability questions", () => {
  assert.deepEqual(getLevelWeights("senior"), { KPI: 60, OKR: 20, IDP: 20 });
  assert.deepEqual(getLevelWeights("manager"), { KPI: 40, OKR: 35, IDP: 25 });
  assert.equal(ACCOUNTABILITY_QUESTIONS.length, 2);
  assert.equal(
    ACCOUNTABILITY_QUESTIONS[0].text,
    "我能清晰地定義並傳達組織的使命與願景",
  );
});
test("self submission requires employee number, team, level and all three narratives", () => {
  const form = makeForm();
  assert.equal(validateAssessment(form, "self", "submit"), "");
  form.self.sections.OKR.text = "   ";
  assert.match(validateAssessment(form, "self", "submit"), /IDP、OKR、KPI/);
  assert.equal(validateAssessment(form, "self", "draft"), "");
  form.self.employeeNumber = "";
  assert.match(validateAssessment(form, "self", "submit"), /工號/);
  form.self.employeeNumber = "1";
  form.self.team = "invalid";
  assert.match(validateAssessment(form, "self", "submit"), /團隊與職級/);
});
test("manager requires both integer ratings, supports return, and keeps optional score null", () => {
  const form = makeForm();
  form.manager.answers.q1 = 5;
  for (const value of [null, 0, 6, 2.5, "4"]) {
    form.manager.answers.q2 = value;
    assert.match(validateAssessment(form, "manager", "submit"), /兩題/);
  }
  form.manager.answers.q2 = 4;
  assert.equal(validateAssessment(form, "manager", "submit"), "");
  const record = build(form, "manager");
  assert.equal(record.status, "approved");
  assert.equal(record.score, null);
  assert.deepEqual(readManagerAssessment(record.managerFeedback).answers, {
    q1: 5,
    q2: 4,
  });
  assert.match(validateAssessment(form, "manager", "return"), /回饋/);
  form.manager.feedback = "請補充數據";
  assert.equal(build(form, "manager", "return").status, "in-progress");
  form.score = "101";
  assert.match(validateAssessment(form, "manager", "draft"), /0–100/);
});
test("versioned feedback round-trips text, images and links without public uploads", () => {
  const form = makeForm();
  form.self.sections.IDP.images = [
    { id: "img1", name: "evidence.png", dataUrl: "data:image/png;base64,YWJj" },
  ];
  form.self.sections.KPI.links = ["https://intranet.example/evidence"];
  assert.deepEqual(
    readSelfAssessment(serializeSelfAssessment(form.self)),
    form.self,
  );
  assert.equal(
    readSelfAssessment("原本的自由文字").legacyText,
    "原本的自由文字",
  );
  assert.equal(readManagerAssessment("原主管回饋").feedback, "原主管回饋");
  assert.equal(
    readSelfAssessment(SELF_PREFIX + "bad json").legacyText,
    SELF_PREFIX + "bad json",
  );
  assert.doesNotThrow(() => readManagerAssessment("RD2_MANAGER_V1\nnull"));
});
test("unsafe evidence schemes, SVG and excess images are rejected", () => {
  for (const value of [
    "javascript:alert(1)",
    "data:text/html,test",
    "http://unsafe.example",
    "not-url",
  ])
    assert.equal(safeEvidenceUrl(value), "");
  const form = makeForm();
  form.self.sections.IDP.links = ["javascript:alert(1)"];
  form.self.sections.IDP.images = [
    { dataUrl: "data:image/svg+xml;base64,YWJj" },
    ...[1, 2, 3].map((i) => ({
      id: String(i),
      name: "img",
      dataUrl: "data:image/png;base64,YWJj",
    })),
  ];
  const safe = readSelfAssessment(serializeSelfAssessment(form.self));
  assert.equal(safe.sections.IDP.images.length, 2);
  assert.deepEqual(safe.sections.IDP.links, []);
  form.self.sections.IDP.images = [
    { dataUrl: "x".repeat(MAX_EVIDENCE_CHARACTERS + 1) },
  ];
  assert.match(validateAssessment(form, "self", "submit"), /圖片總量/);
});
test("manager updates preserve every self-assessment byte and all legacy goals", () => {
  const previous = {
    ...build(makeForm()),
    goals: [
      {
        id: "goal-1",
        category: "OKR",
        title: "legacy",
        progress: 80,
        weight: 30,
      },
    ],
  };
  const form = createAssessmentForm(previous);
  form.manager.answers = { q1: 4, q2: 5 };
  form.manager.feedback = "Approved";
  const updated = build(form, "manager", "submit", previous);
  assert.equal(updated.selfFeedback, previous.selfFeedback);
  assert.deepEqual(updated.goals, previous.goals);
  const self = build(createAssessmentForm(updated), "self", "draft", updated);
  assert.equal(self.managerFeedback, updated.managerFeedback);
  assert.equal(self.employeeId, previous.employeeId);
});
test("drafts are isolated by user, cycle, mode and record; corrupt storage fails safely", () => {
  const storage = memoryStorage();
  const form = makeForm();
  const key = draftKey("a", "2026-q3", "self", "record-1");
  saveAssessmentDraft(storage, key, form, "2026-08-31T00:00:00Z");
  assert.deepEqual(
    readAssessmentDraft(storage, key, createAssessmentForm(null)).form,
    form,
  );
  for (const other of [
    draftKey("b", "2026-q3", "self", "record-1"),
    draftKey("a", "2026-q2", "self", "record-1"),
    draftKey("a", "2026-q3", "manager", "record-1"),
    draftKey("a", "2026-q3", "self", "record-2"),
  ])
    assert.equal(readAssessmentDraft(storage, other, form), null);
  storage.setItem(key, "not json");
  assert.equal(readAssessmentDraft(storage, key, form), null);
  storage.setItem(key, JSON.stringify({ version: 1, form: {} }));
  assert.equal(readAssessmentDraft(storage, key, form), null);
  storage.setItem(
    key,
    JSON.stringify({ version: 1, form: { ...form, goals: [null] } }),
  );
  assert.equal(readAssessmentDraft(storage, key, form), null);
  storage.setItem(
    key,
    JSON.stringify({ version: 1, form: { ...form, employeeName: {} } }),
  );
  assert.equal(readAssessmentDraft(storage, key, form), null);
  assert.throws(
    () =>
      saveAssessmentDraft(
        {
          setItem() {
            throw new Error("quota");
          },
        },
        key,
        form,
      ),
    /quota/,
  );
});
test("null scores stay unscored and CSV exports narratives/ratings, not JSON or image data", () => {
  for (const score of [null, undefined, ""])
    assert.equal(normalizePerformanceReview({ score }).score, null);
  assert.equal(normalizePerformanceReview({ score: 0 }).score, 0);
  const form = makeForm();
  form.employeeName = "=HYPERLINK(1)";
  const review = build(form);
  review.managerFeedback = serializeManagerAssessment({
    employeeNumber: "12345",
    answers: { q1: 4, q2: 5 },
    feedback: "Good",
  });
  const csv = toPerformanceCsv([review]);
  assert.match(csv, /IDP: STAR result/);
  assert.match(csv, /當責題一/);
  assert.match(csv, /"4","5","Good"/);
  assert.match(csv, /"'=HYPERLINK/);
  assert.doesNotMatch(csv, /RD2_SELF_V1|data:image/);
});
const mockDb = (response) => {
  const calls = [];
  let payload;
  const chain = {
    from(name) {
      calls.push(["from", name]);
      return this;
    },
    update(value) {
      payload = value;
      calls.push(["update"]);
      return this;
    },
    insert(value) {
      payload = value;
      calls.push(["insert"]);
      return this;
    },
    eq(key, value) {
      calls.push(["eq", key, value]);
      return this;
    },
    select(value) {
      calls.push(["select", value]);
      return this;
    },
    async single() {
      return typeof response === "function" ? response(payload) : response;
    },
  };
  return { chain, calls };
};
test("cloud persistence only resolves after reading back the matching saved record", async () => {
  const review = build(makeForm());
  const { chain, calls } = mockDb((payload) => ({
    data: payload,
    error: null,
  }));
  const saved = await saveAssessmentRecord(chain, review, null);
  assert.equal(saved.employeeName, review.employeeName);
  assert.equal(saved.score, null);
  assert.ok(calls.some(([action]) => action === "insert"));
  assert.ok(calls.some(([action]) => action === "select"));
});
test("permission, connection, missing readback and stale-version failures cannot report success", async () => {
  const review = build(makeForm());
  for (const response of [
    { data: null, error: { code: "42501" } },
    { data: null, error: null },
    { data: { id: "wrong-id" }, error: null },
    { data: null, error: { code: "PGRST116" } },
  ]) {
    const { chain, calls } = mockDb(response);
    await assert.rejects(
      saveAssessmentRecord(chain, review, review),
      /尚未確認儲存/,
    );
    assert.ok(
      calls.some(
        ([action, key, value]) =>
          action === "eq" && key === "updated_at" && value === review.updatedAt,
      ),
    );
  }
  const { chain } = mockDb(() => {
    throw new Error("network unavailable");
  });
  await assert.rejects(saveAssessmentRecord(chain, review, null), /network/);
});

test("new-record retries verify identical content without overwriting later edits", async () => {
  const review = build(makeForm());
  let attempts = 0;
  const { chain } = mockDb((payload) =>
    ++attempts === 1
      ? { error: { code: "23505" }, data: null }
      : { data: payload, error: null },
  );
  assert.equal((await saveAssessmentRecord(chain, review, null)).id, review.id);
  attempts = 0;
  const changed = mockDb((payload) =>
    ++attempts === 1
      ? { error: { code: "23505" }, data: null }
      : { data: { ...payload, status: "approved" }, error: null },
  );
  await assert.rejects(
    saveAssessmentRecord(changed.chain, review, null),
    /尚未確認儲存/,
  );
});
