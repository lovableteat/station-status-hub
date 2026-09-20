import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("submitted forms stop showing the unsent draft warning", async () => {
  const [editor, page] = await Promise.all([
    readSource("src/components/performance/AssessmentEditor.tsx"),
    readSource("src/components/performance/PerformanceAppraisalPage.tsx"),
  ]);
  assert.match(editor, /showDraftWarning\s*&&\s*!submitStatus\s*&&\s*<p className="rd2-hint" role="status">/);
  assert.match(page, /showDraftWarning=\{tab !== "manager" \|\| editorReview\?\.status === "submitted"\}/);
});

test("completed review details distinguish category summaries from per-entry replies", async () => {
  const [page, feedback] = await Promise.all([
    readSource("src/components/performance/PerformanceAppraisalPage.tsx"),
    readSource("src/components/performance/AssessmentEntryFeedback.tsx"),
  ]);
  assert.doesNotMatch(page, /尚無此類評語/);
  assert.match(page, /逐項回覆已列在各筆實績下方/);
  assert.match(feedback, /editable && history\.length > 0/);
});

test("section summaries preserve director reply history and attachments", async () => {
  const [component, persistence, migration] = await Promise.all([
    readSource("src/components/performance/PerformanceSectionReports.tsx"),
    readSource("src/components/performance/sectionReportPersistence.mjs"),
    readSource("supabase/migrations/20260920120000_complete_performance_feedback_workflow.sql"),
  ]);
  assert.match(component, /AssessmentAttachments/);
  assert.match(component, /readSectionReportFeedbackHistory/);
  assert.match(component, /部長回覆歷程/);
  assert.match(persistence, /review_performance_section_report_v2/);
  assert.match(persistence, /p_attachments: attachments/);
  assert.match(migration, /feedback_history jsonb/i);
  assert.match(migration, /director_attachments jsonb/i);
  assert.match(migration, /update workspace\.performance_section_reports report[\s\S]*report\.feedback_history = '\[\]'::jsonb/i);
  assert.match(migration, /jsonb_array_length\(coalesce\(p_attachments, '\[\]'::jsonb\)\) <= 4/i);
  assert.match(migration, /feedback_history\s*=\s*coalesce\(feedback_history/i);
});

test("section overview copy follows the current manager level", async () => {
  const [source, helper] = await Promise.all([
    readSource("src/components/performance/PerformanceSectionReports.tsx"),
    readSource("src/components/performance/sectionReportFeedback.mjs"),
  ]);
  assert.match(source, /getSectionReportRoleCopy\(own\?\.org_level\)/);
  assert.match(helper, /評核直屬同仁/);
  assert.match(helper, /你的自評請到「員工自評」/);
});

test("performance notifications close their overlay before navigation", async () => {
  const source = await readSource("src/components/collaboration/CollaborationCenter.tsx");
  assert.match(source, /setOpen\(false\);\s*window\.location\.assign\(buildPerformanceReturnActionUrl/);
});

test("review attachments provide explicit download feedback and readable filenames", async () => {
  const [component, styles] = await Promise.all([
    readSource("src/components/performance/AssessmentAttachments.tsx"),
    readSource("src/components/performance/performance.css"),
  ]);
  assert.match(component, /下載中/);
  assert.match(component, /下載已開始/);
  assert.match(component, /title=\{attachment\.name\}/);
  assert.match(styles, /\.rd2-review-attachment-list span\s*\{[^}]*overflow-wrap:\s*anywhere/s);
});

test("account creation dialog has an accessible description", async () => {
  const source = await readSource("src/components/admin/AdminPanel.tsx");
  assert.match(source, /<DialogTitle>新增系統用戶<\/DialogTitle>\s*<DialogDescription>/);
});
