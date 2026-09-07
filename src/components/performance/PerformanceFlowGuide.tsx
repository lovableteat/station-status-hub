import { ArrowRight, ClipboardCheck, Network, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReviewStatus } from "./assessmentTypes";

export function PerformanceFlowGuide({
  canManage = false,
  onStartSelf,
  onOrganization,
}: {
  canManage?: boolean;
  onStartSelf?: () => void;
  onOrganization?: () => void;
}) {
  return (
    <section className="rd2-process" aria-labelledby="rd2-process-title">
      <div className="rd2-process-heading">
        <div>
          <h2 id="rd2-process-title">依組織分工，一層一層完成評核</h2>
          <p>先確認歸屬，再填寫實績；每個人只處理自己負責的階段。</p>
        </div>
        <div className="rd2-actions">
          {canManage && onOrganization && (
            <Button variant="outline" onClick={onOrganization}>
              <Network />
              查看組織架構
            </Button>
          )}
          {onStartSelf && (
            <Button onClick={onStartSelf}>
              開始填寫自評
              <ArrowRight />
            </Button>
          )}
        </div>
      </div>
      <div className="rd2-process-layout">
        <div className="rd2-process-roles">
          <p className="rd2-process-caption">誰評核誰</p>
          <ul>
            <li data-role="director">
              <Network aria-hidden="true" />
              <div>
                <strong>部長</strong>
                <span>評核直屬課長，審閱各課彙整</span>
              </div>
            </li>
            <li data-role="chief">
              <ClipboardCheck aria-hidden="true" />
              <div>
                <strong>課長</strong>
                <span>評核本課同仁，並彙整本課成果送部長</span>
              </div>
            </li>
            <li data-role="member">
              <UserRound aria-hidden="true" />
              <div>
                <strong>一般同仁</strong>
                <span>逐條填寫個人實績，送交直屬課長</span>
              </div>
            </li>
          </ul>
          <p className="rd2-acting-note">
            <strong>實際歸屬不在這裡設定。</strong>{" "}
            每個人隸屬哪一層由管理員在「組織架構」逐一指派；課長出缺時由部長代理，直接評核該課同仁。
          </p>
        </div>
        <ol className="rd2-process-stages">
          <li>
            <span>01</span>
            <div>
              <h3>職員填寫，送交課長</h3>
              <p>
                確認團隊與職等，依 IDP、OKR、KPI 新增 STAR
                實績與佐證，完成後送出自評。
              </p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <h3>課長評核，整理本課成果</h3>
              <p>
                逐類對照直屬職員的 IDP、OKR、KPI 自評並留下評語，再完成 7 題當責評分；需要補件時退回補充。
              </p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <h3>部長審閱，回覆課長</h3>
              <p>
                課長另至「課長彙整與部長審閱」送交本課成果。部長確認或退回彙整，不展開非代理課職員的原始考核。
              </p>
            </div>
          </li>
        </ol>
      </div>
      <div className="rd2-process-footnote">
        <strong>課長本人的自評 → 直屬部長</strong>
        <span>個人考核與課務彙整分開完成；主管分數維持隱藏，退回說明與附件會顯示給員工補充。</span>
      </div>
    </section>
  );
}

export function PerformanceTaskGuide({
  mode,
  status,
}: {
  mode: "self" | "manager";
  status?: ReviewStatus | null;
}) {
  const self = mode === "self";
  const steps = self
    ? ["確認基本資料", "逐條新增實績與佐證", "送交直屬主管"]
    : ["選擇直屬評核對象", "逐類對照自評並留下評語", "完成當責量表並送出"];
  return (
    <section
      className="rd2-task-guide"
      aria-label={self ? "自評填寫流程" : "主管評核流程"}
    >
      <ol>
        {steps.map((step, index) => (
          <li key={step}>
            <b>{index + 1}</b>
            <span>{step}</span>
            {index < 2 && <ArrowRight aria-hidden="true" />}
          </li>
        ))}
      </ol>
      <p>
        {self
          ? status === "approved"
            ? "本期個人考核已完成，可在下方查看自評內容。"
            : status === "submitted"
              ? "自評已送出，等待直屬主管評核。若需補件，主管會退回讓你補充。"
              : "職員送課長，課長送部長；代理課同仁直接交由部長評核。"
          : "課長評直屬職員，部長評直屬課長；代理課由部長直接處理。"}
      </p>
    </section>
  );
}
