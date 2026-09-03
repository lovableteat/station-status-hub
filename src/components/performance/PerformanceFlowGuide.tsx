import type { ReviewStatus } from "./assessmentTypes";

const STEPS = [
  {
    id: "self",
    title: "員工自評",
    who: "員工本人",
    what: "在「員工自評」分頁，依 IDP、OKR、KPI 逐條新增 STAR 實績（情境／任務／行動／結果），新增後會列在下方，可持續補充並附證明圖片或內部連結，完成後按「送出自評」。",
  },
  {
    id: "manager",
    title: "直屬主管評核",
    who: "課長／部長",
    what: "職員自評交給直屬課長；課長本人的自評交給部長。課長只看直屬職員，部長只看直屬課長；課長出缺的代理課，由部長直接評核同仁。受密碼保護的考核須先解鎖。",
  },
  {
    id: "done",
    title: "課長彙整送部長",
    who: "課長 → 部長",
    what: "課長完成職員評核後，在「課長彙整與部長審閱」整理本課成果並送交部長。部長查看課長提交的彙整，可確認或退回課長補充；不直接展開非代理課職員的原始考核。個人考核與課務彙整分別記錄完成狀態。",
  },
] as const;

/** Which step a record is sitting on right now. */
const stepStateFor = (status: ReviewStatus | null, index: number) => {
  if (!status) return index === 0 ? "current" : "todo";
  const reached = status === "approved" ? 2 : status === "submitted" ? 1 : 0;
  if (index < reached) return "done";
  if (index === reached) return "current";
  return "todo";
};

export function PerformanceFlowGuide({
  status = null,
  employeeName,
  canManage = false,
  canManageAll = false,
}: {
  status?: ReviewStatus | null;
  employeeName?: string;
  canManage?: boolean;
  canManageAll?: boolean;
}) {
  const visibleSteps = STEPS;

  return (
    <details className="rd2-flow" open>
      <summary>
        <span className="rd2-flow-title">評核流程：三個階段</span>
        <span className="rd2-flow-context">
          {employeeName
            ? `目前檢視：${employeeName}`
            : canManageAll
              ? "主管評分專區 · 依權限與密碼保護顯示考核"
              : canManage
                ? "主管專用 · 顯示你負責的所屬同仁"
                : "完成自評後交由直屬主管處理"}
        </span>
      </summary>

      <ol className="rd2-flow-steps">
        {visibleSteps.map((step) => {
          const stepIndex = STEPS.findIndex((item) => item.id === step.id);
          return (
            <li key={step.id} data-state={stepStateFor(status, stepIndex)}>
              <span className="rd2-flow-num" aria-hidden="true">
                {stepIndex + 1}
              </span>
              <div className="rd2-flow-body">
                <h4>
                  {step.title}
                  <span className="rd2-flow-who">{step.who}</span>
                </h4>
                <p>{step.what}</p>
              </div>
            </li>
          );
        })}
      </ol>

      <p className="rd2-flow-note">
        {canManage ? (
          <>
            <strong>主管專用提醒</strong>
            {canManageAll
              ? "主管評分與回饋僅限管理員指定的績效主管檢視；員工只能看到自己的自評流程。需要補件時請按「退回補充」。"
              : "主管評分與回饋僅限管理員指定的績效主管檢視；需要補件時請按「退回補充」，狀態會退回讓員工重新編輯。"}
          </>
        ) : (
          <>
            <strong>送出後會發生什麼？</strong>
            自評送出後會交給直屬主管；若需要補件，考核會退回讓你重新編輯，主管評分與回饋不會出現在員工畫面。
          </>
        )}
      </p>
    </details>
  );
}
