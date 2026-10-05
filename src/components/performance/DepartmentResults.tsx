export interface CompletedDepartmentResult {
  review_id: string;
  employee_name: string;
  employee_number: string;
  job_grade: string | null;
  reviewer_name: string;
  completed_at: string;
  category_scores: Record<'IDP' | 'OKR' | 'KPI', unknown>;
  total_score: unknown;
}
export interface DepartmentResultGroup {
  chief_id: string;
  chief_name: string;
  department: string;
  section: string;
  locked_results: number;
  results: CompletedDepartmentResult[];
}
export function validResultScore(value: unknown): number | null {
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') return null;
  const score = Number(value);
  return Number.isFinite(score) && score >= 0 && score <= 100 ? score : null;
}
export function resultGrade(value: unknown): string {
  const score = validResultScore(value);
  return score === null ? '—' : score >= 90 ? 'A+' : score >= 80 ? 'A' : score >= 70 ? 'B' : score >= 60 ? 'C' : 'D';
}
const scoreText = (value: unknown) => {
  const score = validResultScore(value);
  return score === null ? '—' : new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 2 }).format(score);
};
export function DepartmentResults({ groups }: { groups: DepartmentResultGroup[] }) {
  return <section className="rd2-department-results" aria-label="各課已完成評核成績">
    <div><h3>各課已完成評核成績</h3><p className="rd2-hint">顯示本期主管評核完成的成績；總分依該同仁職等權重計算，與主管儲存的結果一致。未完成或退回補充的考核不列入。</p></div>
    {(groups.length ? groups : [{ chief_id: 'empty', chief_name: '', department: '', section: '成績結果', locked_results: 0, results: [] }]).map(group => <article className="rd2-department-result-card" key={group.chief_id}>
      <header><h4>{group.section || group.department}{group.chief_name ? ` · ${group.chief_name}` : ''}</h4><span className="rd2-hint">可查看 {group.results.length} 人</span></header>
      {group.locked_results > 0 && <p className="rd2-result-lock" role="status">另有 {group.locked_results} 人已完成評核，需在資料保護區解鎖所屬群組後查看成績。</p>}
      <div className="rd2-result-table-scroll" tabIndex={0} role="region" aria-label={`${group.section} 成績表，可左右捲動`}>
        <table data-empty={!group.results.length}><thead><tr><th scope="col">同仁 / 工號</th><th scope="col">職等</th><th scope="col">IDP</th><th scope="col">OKR</th><th scope="col">KPI</th><th scope="col">主管加權總分</th><th scope="col">等第</th></tr></thead>
          <tbody>{group.results.map(row => <tr key={row.review_id}>
            <th scope="row"><span>{row.employee_name}</span><small>{row.employee_number || '未提供工號'}</small></th>
            <td data-label="職等">{row.job_grade || '—'}</td>
            {(['IDP', 'OKR', 'KPI'] as const).map(category => <td key={category} data-label={category}>{scoreText(row.category_scores?.[category])}</td>)}
            <td className="rd2-result-total" data-label="加權總分">{scoreText(row.total_score)}</td><td data-label="等第"><span className="rd2-result-grade">{resultGrade(row.total_score)}</span></td>
          </tr>)}{!group.results.length && <tr><td colSpan={7} className="rd2-result-empty">{group.locked_results ? '解鎖後即可查看已完成的成績' : '目前沒有符合條件的已完成評核成績'}</td></tr>}</tbody>
        </table>
      </div>
    </article>)}
  </section>;
}
