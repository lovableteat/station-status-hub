import {
  CATEGORY_GUIDANCE,
  LEVELS,
  TEAMS,
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

      <section className="rd2-card">
        <h3>STAR 實績撰寫</h3>
        <p className="rd2-card-lead">
          S 情境 → T 任務 → A 行動 → R 結果。用具體成果與佐證說明工作的影響。
        </p>
        <div className="rd2-guidance-grid">
          {Object.keys(CATEGORY_GUIDANCE).map((category) => (
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
              <p>{CATEGORY_GUIDANCE[category].focus}</p>
              <p className="rd2-hint">{CATEGORY_GUIDANCE[category].cadence}</p>
              <ul className="rd2-guidance-list">
                {CATEGORY_GUIDANCE[category].details.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
              {category !== "KPI" && (
                <details>
                  <summary>
                    {category === "OKR"
                      ? "原表歷史 OKR 範例（2025Q4／2026Q1）"
                      : "完整 IDP 指引"}
                  </summary>
                  <p className="rd2-prewrap">
                    {CATEGORY_GUIDANCE[category].example}
                  </p>
                </details>
              )}
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
