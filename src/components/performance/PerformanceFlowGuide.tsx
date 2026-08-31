import type { ReviewStatus } from "./assessmentTypes";

const STEPS = [
  {
    id: "self",
    title: "員工自評",
    who: "員工本人",
    what: "在「員工自評」分頁，依 IDP、OKR、KPI 各寫一段 STAR 實績（情境／任務／行動／結果），可附證明圖片或內部連結，寫完按「送出自評」。",
  },
  {
    id: "manager",
    title: "主管評分",
    who: "直屬主管",
    what: "在「主管評分與紀錄」分頁挑選對象，看完自評後給當責 2 題各 1–5 分，填主管回饋，需要時補上 0–100 綜合評分，再按「送出主管評分」。",
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
}: {
  status?: ReviewStatus | null;
  employeeName?: string;
}) {
  return (
    <details className="rd2-flow" open>
      <summary>
        <span className="rd2-flow-title">怎麼用？三個步驟</span>
        <span className="rd2-flow-context">
          {employeeName
            ? `目前檢視：${employeeName}`
            : "員工先寫，主管後評，完成即定案"}
        </span>
      </summary>

      <ol className="rd2-flow-steps">
        {STEPS.map((step, index) => (
          <li key={step.id} data-state={stepStateFor(status, index)}>
            <span className="rd2-flow-num" aria-hidden="true">
              {index + 1}
            </span>
            <div className="rd2-flow-body">
              <h4>
                {step.title}
                <span className="rd2-flow-who">{step.who}</span>
              </h4>
              <p>{step.what}</p>
            </div>
          </li>
        ))}
      </ol>

      <p className="rd2-flow-note">
        <strong>要改已經送出的內容？</strong>
        員工自評送出後就交給主管，需要補件時請主管在評分畫面按「退回補充」，狀態會退回讓員工重新編輯；已完成的考核如需更正，由具管理權限者在考核紀錄中重新開啟或刪除重建。
      </p>
    </details>
  );
}
