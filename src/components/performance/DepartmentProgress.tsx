export interface DepartmentProgressRow {
  chief_id: string;
  chief_name: string;
  department: string;
  section: string;
  total_members: number;
  completed_members: number;
  awaiting_members: number;
  returned_members: number;
  drafting_members: number;
  not_started_members: number;
  report_status: string;
}

export const DEPARTMENT_REPORT_STATUS: Record<string, string> = {
  not_submitted: "尚未送交彙整",
  draft: "彙整草稿",
  submitted: "待部長審閱",
  returned: "部長退回補充",
  approved: "部長已確認",
};

export function filterDepartmentProgress(rows: DepartmentProgressRow[], search: string, status: string) {
  return rows.filter(row => (!status || row.report_status === status)
    && [row.chief_name, row.department, row.section].join(" ").toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
}

export function DepartmentProgress({ rows }: { rows: DepartmentProgressRow[] }) {
  return (
    <section className="rd2-department-progress" aria-label="各課即時考核進度">
      <h3>各課即時考核進度</h3>
      <p className="rd2-hint">已完成的主管評核成績顯示在上方，尚未完成與退回補充的人數可在這裡查看。</p>
      <div className="rd2-department-progress-list">
        {rows.map(row => (
          <article key={row.chief_id} className="rd2-department-progress-card">
            <header><h4>{row.section || row.department} · {row.chief_name}</h4><span className="rd2-pill">{DEPARTMENT_REPORT_STATUS[row.report_status] || row.report_status}</span></header>
            <p className="rd2-progress-completed">已完成評核 <strong>{row.completed_members} / {row.total_members}</strong> 人</p>
            <progress aria-label={`${row.section} 即時考核完成進度`} max={Math.max(1, row.total_members)} value={row.completed_members} />
            <dl>
              <div><dt>待主管評核</dt><dd>{row.awaiting_members} 人</dd></div>
              <div><dt>退回補充</dt><dd>{row.returned_members} 人</dd></div>
              <div><dt>自評填寫中</dt><dd>{row.drafting_members} 人</dd></div>
              <div><dt>尚未建立自評</dt><dd>{row.not_started_members} 人</dd></div>
            </dl>
          </article>
        ))}
        {!rows.length && <div className="rd2-department-progress-card"><h4>課別 · 課長 · 考核進度</h4><p className="rd2-empty">目前篩選條件沒有符合的課別</p></div>}
      </div>
    </section>
  );
}
