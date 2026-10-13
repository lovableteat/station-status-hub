import { feedbackMatchesDraft, prepareFeedbackImages, validateFeedbackText } from "./core.ts";
import type { FeedbackAdapter, FeedbackAttachment, FeedbackDraft } from "./types.ts";

export function createFeedbackRepository(adapter: FeedbackAdapter) {
  async function cleanupDraft(id: string, assertCurrent: () => void) {
    assertCurrent();
    const report = await adapter.getReport(id);
    assertCurrent();
    if (!report || report.isSubmitted) return report;
    if (report.screenshots.length) { await adapter.removeImages(report.screenshots.map(image => image.path)); assertCurrent(); }
    await adapter.abandonDraft(id);
    assertCurrent();
    return null;
  }
  return {
    listReports: (adminMode = false) => adapter.listReports(adminMode),
    cleanupDraft,
    downloadImage: (path: string) => adapter.downloadImage(path),
    reviewReport: adapter.reviewReport,
    async submit(input: Omit<FeedbackDraft, "screenshots">, attachments: readonly FeedbackAttachment[], assertCurrent: () => void, progress?: (message: string) => void) {
      validateFeedbackText(input);
      const screenshots = await prepareFeedbackImages(input.id, input.reporterId, attachments);
      assertCurrent();
      const draft = { ...input, title: input.title.trim(), description: input.description.trim(), screenshots };
      const previous = await adapter.getReport(input.id);
      assertCurrent();
      if (previous?.isSubmitted) {
        if (!feedbackMatchesDraft(previous, draft)) throw new Error("這份回報已送出，請建立新的回報。");
        return previous;
      }
      if (previous) await cleanupDraft(input.id, assertCurrent);
      assertCurrent();
      try {
        progress?.("正在儲存問題說明…");
        const created = await adapter.createDraft(draft);
        assertCurrent();
        if (created.isSubmitted) return created;
        for (let index = 0; index < screenshots.length; index++) {
          assertCurrent();
          progress?.(`正在上傳截圖 ${index + 1}／${screenshots.length}…`);
          await adapter.uploadImage(screenshots[index], attachments[index].file);
          assertCurrent();
        }
        progress?.("正在確認回報…");
        const report = await adapter.submitDraft(input.id);
        assertCurrent();
        return report;
      } catch (caught) {
        assertCurrent();
        try {
          const completed = await cleanupDraft(input.id, assertCurrent);
          if (completed?.isSubmitted && feedbackMatchesDraft(completed, draft)) return completed;
        } catch {
          assertCurrent();
          throw new Error(`${caught instanceof Error ? caught.message : "送出失敗"}；附件清理尚待重試，請保留這份回報並再次送出。`);
        }
        throw caught;
      }
    },
  };
}
export type FeedbackRepository = ReturnType<typeof createFeedbackRepository>;
