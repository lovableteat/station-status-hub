import {
  CATEGORY_GUIDANCE,
  LEVELS,
  getLevelWeights,
} from "./rd2Assessment.mjs";

export function AssessmentPolicy() {
  return (
    <section className="rd2-policy">
      <header className="rd2-section-heading">
        <h2>系統說明與政策</h2>
        <p>依職級確認評核重點，再填寫 STAR 實績。</p>
      </header>
      <section className="rd2-card">
        <h3>各職級評核指導原則</h3>
        {LEVELS.map((level) => (
          <article className="rd2-policy-row" key={level.value}>
            <h4>{level.label}</h4>
            <p>{level.policy}</p>
          </article>
        ))}
      </section>
      <section className="rd2-card">
        <h3>評核權重分配</h3>
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
        <p className="rd2-hint">
          政策權重供評核參考；當責 1–5 分與綜合 0–100 分分開記錄。
        </p>
      </section>
      <section className="rd2-card">
        <h3>STAR 實績撰寫</h3>
        <p>
          S 情境 → T 任務 → A 行動 → R 結果。用具體成果與證明，說明工作的影響。
        </p>
        {Object.keys(CATEGORY_GUIDANCE).map((category) => (
          <article className="rd2-policy-row" key={category}>
            <h4>
              {category} · {CATEGORY_GUIDANCE[category].title}
            </h4>
            <p>{CATEGORY_GUIDANCE[category].focus}</p>
          </article>
        ))}
      </section>
    </section>
  );
}
