import type { AssessmentEntry, PerformanceReview, SelfAssessment } from "./assessmentTypes";
import { CATEGORIES, readSelfAssessment } from "./rd2Assessment.mjs";

function evidenceText(links: string[] = [], files: Array<{ name: string }> = [], images: Array<{ name: string }> = []) {
  const lines: string[] = [];
  const uniqueLinks = [...new Set(links.filter(Boolean))];
  if (uniqueLinks.length) lines.push("證明連結：", ...uniqueLinks);
  if (files.length) lines.push(`附件：${files.map(file => file.name || "未命名附件").join("、")}`);
  if (images.length) lines.push(`自評圖片：${images.map(image => image.name || "未命名圖片").join("、")}`);
  return lines.join("\n");
}

/** Plain text for an external appraisal system with a single input field. */
export function buildPerformanceCopyText(review: PerformanceReview): string {
  if (review.contentLoaded === false) throw new Error("考核內容尚未讀取完成，請稍後再複製。");
  const self = readSelfAssessment(review.selfFeedback) as SelfAssessment;
  const header = [
    `員工：${review.employeeName || "未命名員工"}`,
    self.employeeNumber ? `工號：${self.employeeNumber}` : "",
    review.department ? `部門：${review.department}` : "",
    review.cycleId ? `考核週期：${review.cycleId}` : "",
  ].filter(Boolean).join("\n");
  const blocks: string[] = [];

  if (self.legacyText.trim()) blocks.push(`【既有自評內容】\n${self.legacyText}`);

  for (const category of CATEGORIES) {
    const section = self.sections[category];
    const entries: AssessmentEntry[] = section.entries?.filter(entry => entry.text.trim()) || [];
    if (!entries.length && section.text.trim()) entries.push({ id: "legacy", text: section.text });
    if (section.draftText?.trim()) entries.push({ id: "draft", text: section.draftText });
    const sectionEvidence = evidenceText(section.links, [], section.images);
    if (!entries.length && !sectionEvidence) continue;

    const contents = entries.map((entry, index) => {
      const evidence = evidenceText(entry.links, entry.attachments);
      // Keep every original line, including manually written STAR prose. Do not
      // reconstruct S/T/A/R or concatenate the generated section text again.
      return [`${index + 1}. ${entry.text}`, evidence].filter(Boolean).join("\n");
    });
    if (sectionEvidence) contents.push(sectionEvidence);
    blocks.push([`【${category}】`, ...contents].join("\n\n"));
  }

  return [header, blocks.length ? blocks.join("\n\n") : "尚未填寫實績。"].join("\n\n");
}

/** The same paste-ready content for a selected set of employees. */
export function buildPerformanceReviewsCopyText(reviews: PerformanceReview[], cycle?: string): string {
  return reviews.map(review => buildPerformanceCopyText(cycle ? { ...review, cycleId: cycle } : review)).join("\n\n──────────\n\n");
}
