import { PDFSystemData, PDFStatsData, PDFProgressCalculator } from "./PDFProgressCalculator";

export class PDFReportGenerator {
  static generateHTML(systemsData: PDFSystemData[], stats: PDFStatsData): string {
    const reportTitle = "L10 測試進度追蹤報告";
    const generateTime = new Date().toLocaleString('zh-TW');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${reportTitle}</title>
        <style>
          ${this.getStyles()}
        </style>
      </head>
      <body>
        ${this.generateHeader(reportTitle, generateTime)}
        ${this.generateStatsSection(stats)}
        ${this.generateTableSection(systemsData)}
        ${this.generateFooter()}
      </body>
      </html>
    `;
  }

  private static getStyles(): string {
    return `
      body { 
        font-family: 'Microsoft YaHei', Arial, sans-serif; 
        margin: 20px; 
        font-size: 12px;
        line-height: 1.4;
      }
      .header { 
        text-align: center; 
        margin-bottom: 30px; 
        border-bottom: 3px solid #2563eb;
        padding-bottom: 20px;
      }
      .header h1 { 
        color: #1e40af; 
        margin-bottom: 10px; 
        font-size: 24px;
        font-weight: bold;
      }
      .header .meta {
        color: #6b7280;
        font-size: 14px;
      }
      .stats { 
        background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); 
        padding: 25px; 
        margin-bottom: 30px; 
        border-radius: 12px;
        border: 2px solid #cbd5e1;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      }
      .stats h2 { 
        color: #1e293b; 
        margin-top: 0; 
        margin-bottom: 20px;
        font-size: 18px;
        text-align: center;
      }
      .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 20px;
      }
      .stats-item {
        background: white;
        padding: 20px;
        border-radius: 8px;
        border: 1px solid #e2e8f0;
        text-align: center;
        box-shadow: 0 2px 4px -1px rgba(0, 0, 0, 0.06);
      }
      .stats-value {
        font-size: 28px;
        font-weight: bold;
        margin-bottom: 8px;
      }
      .stats-label {
        color: #64748b;
        font-size: 14px;
        font-weight: 500;
      }
      .stats-completed .stats-value { color: #16a34a; }
      .stats-ongoing .stats-value { color: #ea580c; }
      .stats-notstarted .stats-value { color: #dc2626; }
      .stats-total .stats-value { color: #2563eb; }
      .stats-rate .stats-value { color: #7c3aed; }
      
      table { 
        width: 100%; 
        border-collapse: collapse; 
        margin-bottom: 30px; 
        font-size: 11px;
        background: white;
        border-radius: 8px;
        overflow: hidden;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      }
      th { 
        background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); 
        color: white;
        font-weight: bold;
        padding: 15px 8px;
        text-align: center;
        font-size: 12px;
        border-right: 1px solid rgba(255, 255, 255, 0.2);
      }
      th:last-child { border-right: none; }
      td { 
        border: 1px solid #e5e7eb; 
        padding: 12px 8px; 
        text-align: center; 
        vertical-align: middle;
      }
      tr:nth-child(even) { background-color: #f9fafb; }
      tr:hover { background-color: #f3f4f6; }
      
      .system-name { 
        font-weight: bold; 
        color: #1f2937;
        font-size: 12px;
      }
      .engineer-name {
        color: #4b5563;
        font-weight: 500;
      }
      
      .status-completed { 
        color: #16a34a; 
        font-weight: bold;
        background-color: #dcfce7;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 10px;
      }
      .status-ongoing { 
        color: #ea580c; 
        font-weight: bold;
        background-color: #fed7aa;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 10px;
      }
      .status-notstarted { 
        color: #dc2626; 
        font-weight: bold;
        background-color: #fee2e2;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 10px;
      }
      
      .progress-100 { 
        color: #16a34a; 
        font-weight: bold;
        background-color: #dcfce7;
        padding: 4px 6px;
        border-radius: 4px;
      }
      .progress-high { 
        color: #ea580c; 
        font-weight: bold;
        background-color: #fed7aa;
        padding: 4px 6px;
        border-radius: 4px;
      }
      .progress-low { 
        color: #2563eb; 
        font-weight: bold;
        background-color: #dbeafe;
        padding: 4px 6px;
        border-radius: 4px;
      }
      .progress-zero { 
        color: #dc2626; 
        font-weight: bold;
        background-color: #fee2e2;
        padding: 4px 6px;
        border-radius: 4px;
      }
      
      .exclude-yes { color: #16a34a; font-weight: bold; }
      .exclude-no { color: #dc2626; font-weight: bold; }
      
      .footer { 
        margin-top: 40px; 
        text-align: center; 
        font-size: 11px; 
        color: #6b7280; 
        border-top: 2px solid #e5e7eb;
        padding-top: 20px;
      }
      .footer p { margin: 5px 0; }
      
      .datetime-cell {
        font-size: 10px;
        color: #4b5563;
        max-width: 100px;
        word-wrap: break-word;
      }
      
      @media print {
        body { margin: 10px; font-size: 10px; }
        .stats { break-inside: avoid; }
        table { break-inside: auto; }
        tr { break-inside: avoid; break-after: auto; }
      }
    `;
  }

  private static generateHeader(title: string, generateTime: string): string {
    return `
      <div class="header">
        <h1>${title}</h1>
        <div class="meta">
          <p>生成時間: ${generateTime}</p>
          <p>報告類型: 系統測試進度追蹤</p>
        </div>
      </div>
    `;
  }

  private static generateStatsSection(stats: PDFStatsData): string {
    return `
      <div class="stats">
        <h2>📊 測試統計總覽</h2>
        <div class="stats-grid">
          <div class="stats-item stats-total">
            <div class="stats-value">${stats.totalSystems}</div>
            <div class="stats-label">總系統數</div>
          </div>
          <div class="stats-item stats-completed">
            <div class="stats-value">${stats.completedSystems}</div>
            <div class="stats-label">已完成</div>
          </div>
          <div class="stats-item stats-ongoing">
            <div class="stats-value">${stats.inProgressSystems}</div>
            <div class="stats-label">進行中</div>
          </div>
          <div class="stats-item stats-notstarted">
            <div class="stats-value">${stats.notStartedSystems}</div>
            <div class="stats-label">未開始</div>
          </div>
          <div class="stats-item stats-rate">
            <div class="stats-value">${stats.completionRate}%</div>
            <div class="stats-label">完成率</div>
          </div>
        </div>
      </div>
    `;
  }

  private static generateTableSection(systemsData: PDFSystemData[]): string {
    const formatDateTime = (dateString?: string) => {
      if (!dateString) return '-';
      return new Date(dateString).toLocaleDateString('zh-TW') + '<br/>' + 
             new Date(dateString).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
    };

    const rows = systemsData.map(system => `
      <tr>
        <td class="system-name">${system.systemName}</td>
        <td class="engineer-name">${system.assignedEngineer}</td>
        <td><span class="${PDFProgressCalculator.getStatusColorClass(system.status)}">${system.status}</span></td>
        <td><span class="${PDFProgressCalculator.getProgressColorClass(system.station0Progress)}">${system.station0Progress}%</span></td>
        <td><span class="${PDFProgressCalculator.getProgressColorClass(system.station1Progress)}">${system.station1Progress}%</span></td>
        <td><span class="${PDFProgressCalculator.getProgressColorClass(system.station2Progress)}">${system.station2Progress}%</span></td>
        <td><span class="${PDFProgressCalculator.getProgressColorClass(system.station3Progress)}">${system.station3Progress}%</span></td>
        <td><span class="${PDFProgressCalculator.getProgressColorClass(system.overallProgress)}">${system.overallProgress}%</span></td>
        <td class="datetime-cell">${formatDateTime(system.actualStartedAt)}</td>
        <td class="datetime-cell">${formatDateTime(system.actualCompletedAt)}</td>
        <td><span class="${system.excludeFromDashboard ? 'exclude-no' : 'exclude-yes'}">${system.excludeFromDashboard ? '否' : '是'}</span></td>
      </tr>
    `).join('');

    return `
      <table>
        <thead>
          <tr>
            <th style="width: 12%;">系統編號</th>
            <th style="width: 10%;">負責工程師</th>
            <th style="width: 8%;">整體狀態</th>
            <th style="width: 9%;">Station 0<br/>工廠組裝</th>
            <th style="width: 9%;">Station 1<br/>開機</th>
            <th style="width: 9%;">Station 2<br/>FW & SFT</th>
            <th style="width: 9%;">Station 3<br/>NV diag</th>
            <th style="width: 8%;">整體進度</th>
            <th style="width: 12%;">開始時間</th>
            <th style="width: 12%;">完成時間</th>
            <th style="width: 7%;">列入統計</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `;
  }

  private static generateFooter(): string {
    return `
      <div class="footer">
        <p><strong>🔧 L10 測試管理系統</strong></p>
        <p>此報告由系統自動生成，包含所有測試系統的詳細進度信息</p>
        <p>如有疑問請聯繫系統管理員</p>
      </div>
    `;
  }
}
