import {
  CATEGORY_GUIDANCE,
  LEVELS,
  getLevelWeights,
} from "./rd2Assessment.mjs";
import { WeightDistributionChart } from "./PerformanceCharts";

export function AssessmentPolicy() {
  return (
    <section className="rd2-policy">
      <header className="rd2-section-heading">
        <h2>系統說明與政策</h2>
        <p>先依職級確認評核重點，再用 STAR 寫下這一期的實績。</p>
      </header>

      <div className="rd2-policy-grid">
        <section className="rd2-card">
          <h3>各職級評核指導原則</h3>
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
          <h3>評核權重分配</h3>
          <WeightDistributionChart />
          <details className="rd2-table-details">
            <summary>檢視權重數值表</summary>
            <div className="rd2-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>職級</th>
                    <th>KPI</th>
                    <th>OKR</th>
                    <th>IDP</th>
                  </tr>
                </thead>
                <tbody>
                  {LEVELS.map((level) => {
                    const weights = getLevelWeights(level.value);
                    return (
                      <tr key={level.value}>
                        <th>{level.label}</th>
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
            權重僅供評核參考。當責評分（1–5 分）與綜合評分（0–100
            分）分開記錄，不併入上表。
          </p>
        </section>
      </div>

      <section className="rd2-card">
        <h3>STAR 實績撰寫</h3>
        <p className="rd2-card-lead">
          S 情境 → T 任務 → A 行動 → R 結果。用具體成果與佐證說明工作的影響。
        </p>
        <div className="rd2-guidance-grid">
          {Object.keys(CATEGORY_GUIDANCE).map((category) => (
            <article className="rd2-guidance-item" key={category}>
              <h4>
                <span className="rd2-guidance-tag" data-category={category}>
                  {category}
                </span>
                {CATEGORY_GUIDANCE[category].title}
              </h4>
              <p>{CATEGORY_GUIDANCE[category].focus}</p>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
