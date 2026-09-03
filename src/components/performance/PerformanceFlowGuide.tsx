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
    title: "主管評分",
    who: "所屬主管",
    what: "依組織架構查看所屬同仁；部長涵蓋所屬各課，課長涵蓋課內成員。受密碼保護的考核須先解鎖，再依受評者層級完成 7 題當責評分、主管回饋與選填的綜合評分。",
  },
  {
    id: "done",
    title: "完成考核",
    who: "系統",
    what: "主管送出後狀態轉為「已完成」，該期考核定案，紀錄會保留在考核紀錄中供查詢與匯出。",
  },
] as const;

/** Which step a record is sitting on right now. */
const stepStateFor = (status: ReviewStatus | null, index: number) => {
  if (!status) return index === 0 ? "current" : "todo";
  const reached =
    status === "approved" ? 3 : status === "submitted" ? 1 : 0;
  if (status === "approved") return "done";
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
  const visibleSteps = canManage
    ? STEPS
    : STEPS.filter((step) => step.id !== "manager");

  return (
    <details className="rd2-flow" open>
      <summary>
        <span className="rd2-flow-title">怎麼用？{canManage ? "三個" : "兩個"}步驟</span>
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
