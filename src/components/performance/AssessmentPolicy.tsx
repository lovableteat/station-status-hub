import {
  CATEGORY_GUIDANCE,
  LEVELS,
  TEAMS,
  getCategoryRoleReference,
  getKpiReference,
} from "./rd2Assessment.mjs";
import { useState } from "react";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  STANDARDS_SOURCE,
  WEIGHT_GROUPS,
  ACCOUNTABILITY_ROLES,
  RATING_SCALE,
  getAccountabilityQuestions,
  COMMON_KPI_REFERENCES,
} from "./rd2Standards.mjs";
import { GRADE_RESPONSIBILITIES } from "./rd2GradeResponsibilities.mjs";
import { WeightDistributionChart } from "./PerformanceCharts";

const CATEGORY_ORDER = ["IDP", "OKR", "KPI"] as const;

const WRITING_PRINCIPLES = [
  ["具象", "交代具體情境、問題與你的責任。"],
  ["精準", "只保留關鍵作法、判斷與取捨。"],
  ["量化", "用比例、時間、次數或影響人數說明成果。"],
  ["個人當責", "清楚區分自己完成的行動與團隊共同成果。"],
] as const;

const CATEGORY_BOUNDARIES = {
  IDP: {
    question: "為了承擔下一階段責任，你補強了什麼能力？",
    include: "自學、專案實作、知識輸出，三者形成可驗證的閉環。",
    avoid: "避免只寫上課、看書或學習心得。",
  },
  OKR: {
    question: "是否改變原本作法，並帶來流程或業務影響？",
    include: "流程再造、自動化、週期縮短、錯誤率降低或專利成果。",
    avoid: "避免只寫辛苦程度、完成例行工作或個人受到稱讚。",
  },
  KPI: {
    question: "角色基本盤是否穩定做到，並有品質與效率證據？",
    include: "日常流程、交付品質、問題處理、可靠度與工作紀律。",
    avoid: "避免把例行工作硬包裝成創新突破。",
  },
} as const;

const STAR_TEMPLATE =
  "面對【情境／問題】，我負責【任務／目標】，透過【關鍵行動／方法】，達成【量化結果】，並產出【可驗證佐證／可複用成果】。";

const SUBMISSION_CHECKS = [
  "類別正確：OKR 已排除日常維護、例行修錯等 KPI 內容。",
  "貢獻清楚：沒有只寫「我很努力」，已說明自己的關鍵行動與判斷。",
  "結果量化：至少包含比例、節省工時、錯誤降低次數或受惠人數之一。",
  "文字精簡：每筆濃縮為 1–3 句、約 100 字，主管能快速看懂做法與成果。",
] as const;

const STAR_EXAMPLES = [
  {
    category: "OKR",
    title: "流程改善／工具開發",
    weak: "專案進度很好，我協助團隊開發測試腳本並排查問題。",
    strong:
      "面對 50 筆日誌需人工比對、每月耗時過高，我獨立撰寫自動化腳本，將除錯時間由 81% 降至 45 分鐘，累計節省 40 小時，並交付 5 位同仁持續使用。",
  },
  {
    category: "IDP",
    title: "技術突破／知識輸出",
    weak: "今年認真自學新技術並完成線上課程，學到很多。",
    strong:
      "為解決整機架構知識缺口，我完成電源時序與散熱課程，將方法實作於專案問題排查，並整理成可複用的 Bring-up 指引，供 2 位新人依流程完成驗證。",
  },
] as const;

const SCORE_BANDS = [
  ["A+", "90–100", "遠優於期望"],
  ["A", "80–89", "優於期望"],
  ["B", "70–79", "符合期望"],
  ["C", "60–69", "低於期望"],
  ["D", "59 以下", "遠低於期望"],
] as const;

function ReusableWritingGuide({ role }: { role: string }) {
  return (
    <section className="rd2-card rd2-policy-writing-guide">
      <h3>填寫速查與可複用範本</h3>
      <p className="rd2-card-lead">
        考核不是拼湊病歷或流水帳；請用過去的具體行為，說清楚責任、作法與成果。
      </p>

      <div className="rd2-writing-principles" aria-label="四項填寫原則">
        {WRITING_PRINCIPLES.map(([title, description]) => (
          <article key={title}>
            <strong>{title}</strong>
            <span>{description}</span>
          </article>
        ))}
      </div>

      <div className="rd2-guidance-grid">
        {CATEGORY_ORDER.map((category) => {
          const boundary = CATEGORY_BOUNDARIES[category];
          return (
            <article
              className="rd2-guidance-item"
              data-category={category}
              key={category}
            >
              <h4>
                <span className="rd2-guidance-tag" data-category={category}>
                  {category}
                </span>
                {CATEGORY_GUIDANCE[category].title}
              </h4>
              <strong className="rd2-guidance-question">{boundary.question}</strong>
              <p>{CATEGORY_GUIDANCE[category].focus}</p>
              <p className="rd2-guidance-include">建議寫：{boundary.include}</p>
              <p className="rd2-guidance-avoid">避免寫：{boundary.avoid}</p>
              <details>
                <summary>查看完整判斷標準</summary>
                <ul className="rd2-guidance-list">
                  {CATEGORY_GUIDANCE[category].details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
                <p className="rd2-hint">檢視時機：{CATEGORY_GUIDANCE[category].cadence}</p>
              </details>
              {category !== "KPI" && (() => {
                const categoryReference = getCategoryRoleReference(category, role);
                return categoryReference ? (
                  <details>
                    <summary>
                      {LEVELS.find((item) => item.value === role)?.label} · 完整標準
                    </summary>
                    <p className="rd2-hint">
                      來源：評分表 {categoryReference.source}
                    </p>
                    <div className="rd2-role-reference-columns">
                      <div>
                        <h5>Baseline · 基本要求</h5>
                        <ol>
                          {categoryReference.baseline.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ol>
                      </div>
                      <div>
                        <h5>Outstanding · 卓越表現</h5>
                        <ol>
                          {categoryReference.outstanding.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ol>
                      </div>
                    </div>
                  </details>
                ) : null;
              })()}
            </article>
          );
        })}
      </div>

      <div className="rd2-policy-tool-grid">
        <section className="rd2-policy-template">
          <h4>STAR 百字範本</h4>
          <p>S 情境 → T 任務 → A 行動 → R 結果；每筆以 1–3 句、約 100 字完成。</p>
          <blockquote>{STAR_TEMPLATE}</blockquote>
        </section>
        <section className="rd2-policy-checklist">
          <h4>送出前自我檢核</h4>
          <ol>
            {SUBMISSION_CHECKS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </section>
      </div>

      <details className="rd2-policy-examples">
        <summary>查看好寫法與容易失焦的寫法</summary>
        <div className="rd2-policy-example-grid">
          {STAR_EXAMPLES.map((example) => (
            <article key={example.category} data-category={example.category}>
              <h4>
                <span className="rd2-guidance-tag" data-category={example.category}>
                  {example.category}
                </span>
                {example.title}
              </h4>
              <p><strong>容易失焦</strong>{example.weak}</p>
              <p><strong>建議寫法</strong>{example.strong}</p>
            </article>
          ))}
        </div>
      </details>
    </section>
  );
}

export function AssessmentPolicy() {
  const [team, setTeam] = useState("EE");
  const [role, setRole] = useState("junior");
  const reference = getKpiReference(team, role);
  return (
    <section className="rd2-policy">
      <header className="rd2-section-heading">
        <h2>評分標準與撰寫參考</h2>
        <p>依數字職等確認權重、依 HW／FW 角色確認 KPI，再用 STAR 填寫實績。</p>
        <p className="rd2-hint">
          標準來源：{STANDARDS_SOURCE.file} · {STANDARDS_SOURCE.sheet}
        </p>
      </header>

      <div className="rd2-policy-principles">
        <p>
          <strong>組織歸屬</strong>
          <span>決定誰評核誰，由管理員設定部長、課長及同仁。</span>
        </p>
        <p>
          <strong>職務與職等</strong>
          <span>決定 KPI 參考與政策權重；當責題目則依組織層級帶入。</span>
        </p>
        <p>
          <strong>資料保護</strong>
          <span>
            主管可在組織架構設定群組密碼；包含管理員，受保護資料都須先解鎖。
          </span>
        </p>
      </div>

      <ReusableWritingGuide role={role} />

      <div className="rd2-policy-grid">
        <section className="rd2-card">
          <h3>職務角色與 HW 基本要求摘錄</h3>
          <p className="rd2-hint">
            下方可查閱各角色完整 HW／FW 標準；角色所列職等範圍不代表權重分組。
          </p>
          <div className="rd2-level-grid">
            {LEVELS.map((level) => (
              <article className="rd2-level-item" key={level.value}>
                <h4>{level.label}</h4>
                <p>{level.policy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="rd2-card">
          <h3>數字職等與權重</h3>
          <div className="rd2-score-band-grid" aria-label="評分等第速查">
            {SCORE_BANDS.map(([grade, range, description]) => (
              <article key={grade}>
                <strong>{grade}</strong>
                <span>{range}</span>
                <small>{description}</small>
              </article>
            ))}
          </div>
          <p className="rd2-hint">分數等第為通用對照；最終結果以當期核定為準。</p>
          <WeightDistributionChart />
          <details className="rd2-table-details">
            <summary>檢視權重數值表</summary>
            <div className="rd2-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>數字職等</th>
                    <th>KPI</th>
                    <th>OKR</th>
                    <th>IDP</th>
                  </tr>
                </thead>
                <tbody>
                  {WEIGHT_GROUPS.map((weights) => {
                    return (
                      <tr key={weights.label}>
                        <th>{weights.label}</th>
                        <td>{weights.KPI}%</td>
                        <td>{weights.OKR}%</td>
                        <td>{weights.IDP}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
          <p className="rd2-hint">
            原表 A7:D9 以數字職等分組，與職務角色範圍不同。職等 13／49
            沒有提供權重，待確認。
            原表未提供當責分數與綜合評分的換算公式，兩者分開記錄。
          </p>
          <p className="rd2-policy-formula">
            <strong>提供主管的加權自評</strong>
            <span>各類原始自評乘上該類政策權重，再將 IDP、OKR、KPI 三項相加。</span>
            <span>主管逐類對照同一份自評給 0–100 分與評語，並用相同權重產生主管加權評分；7 題當責量表另外保留。</span>
          </p>
        </section>
      </div>

      <section className="rd2-card">
        <h3>完整 HW／FW KPI 標準</h3>
        <FieldGroup className="rd2-reference-grid">
          <Field>
            <FieldLabel htmlFor="policy-team">查閱團隊</FieldLabel>
            <select
              id="policy-team"
              value={team}
              onChange={(e) => setTeam(e.target.value)}
            >
              {TEAMS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="policy-role">查閱職務角色</FieldLabel>
            <select
              id="policy-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              {LEVELS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>
        </FieldGroup>
        <p className="rd2-hint">
          來源：評分表 {reference.source} · 基本要求 {reference.baseline.length}{" "}
          項、卓越表現 {reference.outstanding.length} 項
        </p>
        <div className="rd2-reference-grid">
          <div>
            <h4>Baseline · 基本要求</h4>
            <ol>
              {reference.baseline.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </div>
          <div>
            <h4>Outstanding · 卓越表現</h4>
            <ol>
              {reference.outstanding.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </div>
        </div>
        {COMMON_KPI_REFERENCES[role] && (
          <details>
            <summary>共通 KPI 與工作態度</summary>
            <p className="rd2-prewrap">{COMMON_KPI_REFERENCES[role]}</p>
          </details>
        )}
        {team === "FW" && role === "leader" && (
          <p className="rd2-hint">
            原表 FW Leader 第 8 點使用 HW／hardware 字樣，保留原文待確認。
          </p>
        )}
      </section>

      <section className="rd2-card">
        <h3>數字職等職責說明</h3>
        <p className="rd2-hint">
          依原表內嵌職等圖整理，與權重分組、組織權限分開呈現。
        </p>
        <div className="rd2-level-grid">
          {GRADE_RESPONSIBILITIES.map((group) => (
            <details key={group.level} className="rd2-level-item">
              <summary>
                Level {group.level} · 職等 {group.grades.join("、")}
              </summary>
              <ul>
                {group.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </section>

      <section className="rd2-card">
        <h3>完整當責評分題庫</h3>
        <p>
          依受評者分為高階管理層、中階管理層、一般員工，每類 7 題，共 21 題。
        </p>
        <p className="rd2-hint">
          {RATING_SCALE.map((rating) => rating.label).join(" · ")}
        </p>
        {ACCOUNTABILITY_ROLES.map((group) => (
          <details key={group.value} className="rd2-reference">
            <summary>{group.label} · 7 題</summary>
            <ol>
              {getAccountabilityQuestions(group.value).map((question) => (
                <li key={question.id}>
                  <strong>
                    題號 {question.number} · {question.dimension}
                  </strong>
                  <p>{question.text}</p>
                </li>
              ))}
            </ol>
          </details>
        ))}
      </section>

    </section>
  );
}
