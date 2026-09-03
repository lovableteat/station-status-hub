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
        <div
          className="rd2-process-tree"
          aria-label="組織分工示意，實際歸屬依組織架構設定"
        >
          <p className="rd2-process-caption">組織分工示意</p>
          <div className="rd2-process-node" data-role="director">
            <Network />
            <div>
              <strong>部長</strong>
              <span>評核直屬課長 · 審閱課務彙整</span>
            </div>
          </div>
          <div className="rd2-process-branches">
            {["課別 A", "課別 B"].map((section) => (
              <div className="rd2-process-branch" key={section}>
                <div className="rd2-process-node" data-role="chief">
                  <ClipboardCheck />
                  <div>
                    <strong>課長</strong>
                    <span>{section} · 評核與彙整</span>
                  </div>
                </div>
                <div className="rd2-process-node" data-role="member">
                  <UserRound />
                  <div>
                    <strong>一般同仁</strong>
                    <span>逐條填寫個人實績</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="rd2-acting-note">
            <strong>課長出缺時</strong>{" "}
            由部長代理，直接評核該課同仁。實際歸屬由管理員在組織架構設定。
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
                查看直屬職員自評，完成 7 題當責評分及回饋；需要補件時退回補充。
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
        <span>個人考核與課務彙整分開完成；主管回饋不顯示在員工頁面。</span>
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
    : ["選擇直屬評核對象", "閱讀實績並完成 7 題評分", "填寫回饋並送出"];
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
