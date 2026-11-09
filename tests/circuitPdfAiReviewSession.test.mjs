import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const { React, create, act, loader, deferred } = createRequire(import.meta.url)("./support/renderHarness.cjs");
const key = "v1:official:working:2:3";
const report = (id = "existing") => ({ id, key, summary: "本頁初審", findings: [] });
const pdfs = () => ({ official: { id: "official", name: "官方.pdf" }, officialPdf: { numPages: 500 }, officialPage: 2,
  active: { id: "working", name: "工作.pdf" }, activePdf: { numPages: 500 }, page: 3 });

async function mount({ rows = [], firstLoad, ...overrides } = {}) {
  const loads = [], saves = [];
  let loadResult = firstLoad;
  const storage = {
    loadCircuitPdfAiReviews: async (seriesId, targetKey) => {
      loads.push({ seriesId, targetKey });
      return loadResult ? loadResult() : structuredClone(rows);
    },
    saveCircuitPdfAiReview: async (seriesId, value, expectedRevision) => {
      saves.push({ seriesId, report: structuredClone(value), expectedRevision });
      return { report: structuredClone(value), revision: expectedRevision + 1 };
    },
  };
  // Provider execution and the review form have their own tests. This probe
  // exposes their onSave boundary so this suite exercises the session wrapper.
  const { CircuitPdfAiReviewSession } = loader({ globals: { Error }, mocks: {
    "./pdfAiReviewStorage": storage,
    "./CircuitPdfAiReviewDialog": { CircuitPdfAiReview: props => React.createElement("review-probe", props) },
  } })("src/components/circuit-changes/CircuitPdfAiReviewSession.tsx");
  let props = { open: true, onOpenChange() {}, seriesId: "series-A", userId: "user-A", userName: "工程師 A", canEdit: true, pdfs: pdfs(), ...overrides };
  let root;
  await act(async () => { root = create(React.createElement(CircuitPdfAiReviewSession, props)); });
  return {
    root, loads, saves,
    get props() { return props; },
    get review() { return root.root.findAllByType("review-probe")[0]?.props; },
    text: () => JSON.stringify(root.toJSON()),
    setLoad: fn => { loadResult = fn; },
    update: patch => act(async () => { props = { ...props, ...patch }; root.update(React.createElement(CircuitPdfAiReviewSession, props)); }),
    unmount: () => act(() => root.unmount()),
  };
}

test("session blocks generation and editing until the stored reports for the exact pair have loaded", async () => {
  const pending = deferred(), existing = report();
  const view = await mount({ firstLoad: () => pending.promise });
  try {
    assert.equal(view.review, undefined);
    assert.match(view.text(), /正在讀取這兩個版本的初審紀錄/);
    assert.deepEqual(view.loads, [{ seriesId: "series-A", targetKey: key }]);
    await act(async () => pending.resolve([{ report: existing, revision: 7 }]));
    assert.deepEqual(view.review.savedReport, existing);
    assert.deepEqual(view.review.previousReports, [existing]);
    assert.equal(view.review.official.page, 2);
    assert.equal(view.review.working.page, 3);
    assert.equal(view.saves.length, 0);
  } finally { view.unmount(); }
});

test("a newly generated report saves at revision zero and its next manual save uses the returned revision", async () => {
  const view = await mount();
  try {
    const generated = report("new-report");
    assert.equal(view.review.savedReport, undefined);
    await act(async () => view.review.onSave(generated));
    assert.deepEqual(view.saves[0], { seriesId: "series-A", report: generated, expectedRevision: 0 });
    assert.deepEqual(structuredClone(view.review.previousReports), [generated]);
    const decision = { ...generated, summary: "工程師已人工核對" };
    await act(async () => view.review.onSave(decision));
    assert.equal(view.saves[1].expectedRevision, 1);
    assert.equal(view.review.savedReport.summary, "工程師已人工核對");
  } finally { view.unmount(); }
});

test("manual changes to a loaded report use its loaded revision without creating another report", async () => {
  const existing = report(), older = report("older");
  const view = await mount({ rows: [{ report: existing, revision: 7 }, { report: older, revision: 3 }] });
  try {
    const edited = { ...existing, summary: "已核對 NET 與接腳" };
    await act(async () => view.review.onSave(edited));
    assert.equal(view.saves[0].expectedRevision, 7);
    assert.deepEqual(view.review.previousReports, [edited, older]);
    await act(async () => view.review.onSave({ ...edited, summary: "補充人工備註" }));
    assert.equal(view.saves[1].expectedRevision, 8);
    assert.equal(view.review.previousReports.length, 2);
  } finally { view.unmount(); }
});

test("failed report loading leaves the review blocked and an explicit retry reloads the same target", async () => {
  const view = await mount({ firstLoad: async () => { throw new Error("暫時離線"); } });
  try {
    assert.equal(view.review, undefined);
    assert.match(view.text(), /暫時離線/);
    const pending = deferred();
    view.setLoad(() => pending.promise);
    const retry = view.root.root.findAll(node => node.type === "stub" && node.props.children === "重試讀取")[0];
    assert.ok(retry);
    await act(async () => retry.props.onClick());
    assert.equal(view.review, undefined);
    assert.match(view.text(), /正在讀取這兩個版本的初審紀錄/);
    assert.equal(view.loads.length, 2);
    assert.deepEqual(view.loads[1], view.loads[0]);
    await act(async () => pending.resolve([{ report: report(), revision: 4 }]));
    assert.ok(view.review);
    assert.equal(view.saves.length, 0);
  } finally { view.unmount(); }
});

test("callbacks captured under another page or account cannot save into the new session", async () => {
  for (const change of [view => ({ pdfs: { ...view.props.pdfs, page: 4 } }), () => ({ userId: "user-B", userName: "工程師 B" })]) {
    const view = await mount();
    try {
      const oldSave = view.review.onSave;
      await view.update(change(view));
      await assert.rejects(oldSave(report("late-AI-result")), /版本、頁碼或權限已變更/);
      assert.equal(view.saves.length, 0, "a stale callback must not reach persistence");
      assert.equal(view.loads.length, 2);
    } finally { view.unmount(); }
  }
});

test("a response from the old page is ignored while the new page's reports are still loading", async () => {
  const oldPage = deferred(), newPage = deferred();
  const view = await mount({ firstLoad: () => oldPage.promise });
  try {
    view.setLoad(() => newPage.promise);
    await view.update({ pdfs: { ...view.props.pdfs, page: 4 } });
    await act(async () => oldPage.resolve([{ report: report("old-page"), revision: 5 }]));
    assert.equal(view.review, undefined);
    await act(async () => newPage.resolve([]));
    assert.equal(view.review.working.page, 4);
    assert.equal(view.review.savedReport, undefined);
    assert.deepEqual(view.review.previousReports, []);
    assert.equal(view.saves.length, 0);
  } finally { view.unmount(); }
});

test("read-only sessions display loaded reports with generation and manual saves disabled", async () => {
  const view = await mount({ canEdit: false, rows: [{ report: report(), revision: 9 }] });
  try {
    assert.equal(view.review.disabled, true);
    assert.equal(view.review.savedReport.id, "existing");
    await assert.rejects(view.review.onSave(report()), /權限已變更/);
    assert.equal(view.saves.length, 0);
  } finally { view.unmount(); }
});
