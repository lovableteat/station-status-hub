import type { PerformanceReview } from './assessmentTypes';
import { AssessmentEntryList } from './AssessmentEntryList';
import { AssessmentEntryFeedback, AssessmentReturnHistory } from './AssessmentEntryFeedback';
import { EvidenceLink } from './EvidenceLink';
import { ACCOUNTABILITY_ROLES, calculateWeightedManagerScores, calculateWeightedSelfScores, getAccountabilityQuestions } from './rd2Standards.mjs';
import { ACCOUNTABILITY_QUESTIONS, CATEGORIES, readManagerAssessment, readSelfAssessment } from './rd2Assessment.mjs';
export function ReviewDetail({
  review,
  showManagerAssessment,
}: {
  review: PerformanceReview;
  showManagerAssessment: boolean;
}) {
  const self = readSelfAssessment(review.selfFeedback);
  const weightedSelf = calculateWeightedSelfScores(self.grade, self.sections);
  const manager = readManagerAssessment(review.managerFeedback);
  const weightedManager = calculateWeightedManagerScores(
    self.grade,
    manager.categoryReviews,
  );
  const categoryMeta = {
    IDP: { index: "01", label: "未來潛力與成長" },
    OKR: { index: "02", label: "創新與改善能力" },
    KPI: { index: "03", label: "角色基本盤穩定度" },
  } as const;
  return (
    <article className="rd2-card rd2-detail">
      <header className="rd2-review-detail-header">
        <div>
          <span className="rd2-review-detail-eyebrow">考核內容</span>
          <h3>{review.employeeName}</h3>
          <p>
            工號 {self.employeeNumber || manager.employeeNumber || "未填寫"} ·{" "}
            {review.department} · {review.role} · 職等 {self.grade || "未填寫"}
          </p>
        </div>
        <span className="rd2-review-detail-status">員工自評</span>
      </header>
      <div className="rd2-review-weighted-score">
        <div className="rd2-review-score-total">
          <span>員工加權自評</span>
          <div>
            <strong>
              {weightedSelf
                ? weightedSelf.total.toLocaleString("zh-TW", { maximumFractionDigits: 2 })
                : "—"}
            </strong>
            <small>/ 100</small>
          </div>
          <p>{weightedSelf ? "依政策權重自動換算" : `職等 ${self.grade || "未填"} 沒有政策權重`}</p>
        </div>
        <div className="rd2-review-score-breakdown">
          {CATEGORIES.map((category) => {
            const item = weightedSelf?.categories[category];
            return (
              <div
                key={category}
                className="rd2-review-score-part"
                data-category={category}
              >
                <div>
                  <b>{category}</b>
                  <span>權重 {item?.weight ?? "—"}%</span>
                </div>
                <strong>{item?.weighted ?? "—"}<small> 分</small></strong>
                <p>{item?.score ?? "—"} 原始分 × {item?.weight ?? "—"}%</p>
              </div>
            );
          })}
        </div>
      </div>
      {CATEGORIES.map((category) => (
        <section
          key={category}
          className="rd2-review-category"
          data-category={category}
        >
          <header className="rd2-review-category-header">
            <div className="rd2-review-category-title">
              <span className="rd2-review-category-index">{categoryMeta[category].index}</span>
              <div>
                <h4>{category}</h4>
                <p>{categoryMeta[category].label}</p>
              </div>
            </div>
            <span className="rd2-self-score-badge">
              原始自評{" "}
              <b>
                {self.sections[category].selfScore == null
                  ? "未評"
                  : `${self.sections[category].selfScore} 分`}
              </b>
              {weightedSelf?.categories[category].weighted != null && (
                <> · 加權 <b>{weightedSelf.categories[category].weighted} 分</b></>
              )}
            </span>
          </header>
          <div className="rd2-review-category-body">
            <AssessmentEntryList category={category} section={self.sections[category]} readonly onChange={() => {}}
              renderFeedback={(entry, index) => <AssessmentEntryFeedback category={category} entry={entry} index={index} manager={manager} showFeedback={true} />} />
            <div className="rd2-images">
              {self.sections[category].images.map((image) => (
                <a key={image.id} href={image.dataUrl} download={image.name}>
                  <img src={image.dataUrl} alt={image.name} loading="lazy" />
                </a>
              ))}
            </div>
            {!!self.sections[category].links.length && (
              <div className="rd2-review-evidence-links">
                <strong>證明連結</strong>
                {self.sections[category].links.map((url) => (
                  <EvidenceLink key={url} url={url} />
                ))}
              </div>
            )}
            {showManagerAssessment && (
              <div className="rd2-detail-manager-review">
                <strong>
                  主管評分：{manager.categoryReviews[category].score == null
                    ? "尚未評分"
                    : `${manager.categoryReviews[category].score} / 100`}
                </strong>
                {weightedManager?.categories[category].weighted != null && (
                  <span>
                    加權 {weightedManager.categories[category].weighted} 分
                  </span>
                )}
                {manager.categoryReviews[category].feedback ? (
                  <p className="rd2-prewrap">{manager.categoryReviews[category].feedback}</p>
                ) : (
                  <p className="rd2-hint">
                    {Object.values(manager.entryReviews[category]).some(
                      (entry) => entry && typeof entry === "object" && (
                        ("feedback" in entry && Boolean(entry.feedback)) ||
                        ("attachments" in entry && Array.isArray(entry.attachments) && entry.attachments.length > 0)
                      ),
                    )
                      ? "逐項回覆已列在各筆實績下方。"
                      : "尚未填寫類別總評。"}
                  </p>
                )}
              </div>
            )}
          </div>
        </section>
      ))}
      {self.legacyText && (
        <section className="rd2-review-secondary-section">
          <h4>既有自評內容</h4>
          <p className="rd2-prewrap">{self.legacyText}</p>
        </section>
      )}
      <AssessmentReturnHistory manager={manager} sections={self.sections} viewer={showManagerAssessment ? 'manager' : 'employee'} />
      {!!review.goals.length && (
        <section className="rd2-review-secondary-section">
          <h4>既有目標與進度</h4>
          <ul>
            {review.goals.map((goal) => (
              <li key={goal.id}>
                {goal.category} · {goal.title} — {goal.progress}%（權重{" "}
                {goal.weight}%）
              </li>
            ))}
          </ul>
        </section>
      )}
      {showManagerAssessment && (
        <>
          <section className="rd2-review-secondary-section" data-tone="accountability">
            <h4>主管當責評分</h4>
            {!manager.standardsVersion && <p className="rd2-hint">既有評分保留原題號；舊版兩題不會換算為新版七題評分。</p>}
            <p>{ACCOUNTABILITY_ROLES.find((role) => role.value === manager.roleGroup)?.label || "既有評分"}</p>
            {(manager.roleGroup ? getAccountabilityQuestions(manager.roleGroup) : ACCOUNTABILITY_QUESTIONS.filter((question) => manager.answers[question.id] != null)).map((question) => (
              <p key={question.id}>
                {question.text}：
                <strong>
                  {manager.answers[question.id] == null
                    ? "尚未評分"
                    : `${manager.answers[question.id]} / 5`}
                </strong>
              </p>
            ))}
          </section>
          <section className="rd2-review-secondary-section" data-tone="feedback">
            <h4>主管整體回覆</h4>
            <p className="rd2-prewrap">{manager.feedback || "尚無整體回覆"}</p>
            <h4 className="rd2-review-subheading">後續工作指示</h4>
            <p className="rd2-prewrap">{manager.workInstructions || "尚無工作指示"}</p>
            {!!manager.attachments.length && (
              <ul className="rd2-review-attachment-list">
                {manager.attachments.map((attachment) => (
                  <li key={attachment.id}>
                    <a href={attachment.dataUrl} download={attachment.name}>
                      <span>{attachment.name}</span>
                      <small>
                        {attachment.size < 1024 * 1024
                          ? `${Math.max(1, Math.round(attachment.size / 1024))} KB`
                          : `${(attachment.size / 1024 / 1024).toLocaleString("zh-TW", { maximumFractionDigits: 1 })} MB`}
                      </small>
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <p>
              主管加權評分：
              {review.score == null ? "尚未評分" : `${review.score} / 100`}
            </p>
          </section>
        </>
      )}
    </article>
  );
}
