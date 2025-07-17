
import * as XLSX from 'xlsx';

// Export utility functions for generating simplified production reports

export const generatePDF = async (title: string, data: any[]): Promise<void> => {
  try {
    // Process data for simplified production report
    const processedData = data.map(system => ({
      '機台編號': system.system_name,
      '當前站點': system.current_station || 'Station 0',
      '狀態': system.overall_progress === 100 ? '已完成' : 
             system.overall_progress >= 1 ? '進行中' : '未開始',
      'Station 0': `${calculateStationProgress(system.id, 'Station 0')}%`,
      'Station 1': `${calculateStationProgress(system.id, 'Station 1')}%`,
      'Station 2': `${calculateStationProgress(system.id, 'Station 2')}%`,
      'Station 3': `${calculateStationProgress(system.id, 'Station 3')}%`
    }));

    // Create HTML content for simplified report
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${title}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .header { text-align: center; margin-bottom: 30px; }
          .summary { background: #f5f5f5; padding: 15px; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: center; font-size: 12px; }
          th { background-color: #f2f2f2; font-weight: bold; }
          .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #666; }
          .status-completed { color: green; font-weight: bold; }
          .status-ongoing { color: orange; font-weight: bold; }
          .status-notstart { color: red; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${title}</h1>
          <p>生成時間: ${new Date().toLocaleString('zh-TW')}</p>
        </div>
        
        <div class="summary">
          <h2>統計摘要</h2>
          <p>總機台數: ${data.length}</p>
          <p>已完成: ${data.filter(d => d.overall_progress === 100).length}</p>
          <p>進行中: ${data.filter(d => d.overall_progress >= 1 && d.overall_progress < 100).length}</p>
          <p>未開始: ${data.filter(d => d.overall_progress === 0).length}</p>
        </div>
        
        <table>
          <thead>
            <tr>
              <th>機台編號</th>
              <th>當前站點</th>
              <th>狀態</th>
              <th>Station 0</th>
              <th>Station 1</th>
              <th>Station 2</th>
              <th>Station 3</th>
            </tr>
          </thead>
          <tbody>
            ${processedData.map(item => `
              <tr>
                <td>${item.機台編號}</td>
                <td>${item.當前站點}</td>
                <td class="status-${item.狀態 === '已完成' ? 'completed' : item.狀態 === '進行中' ? 'ongoing' : 'notstart'}">${item.狀態}</td>
                <td>${item['Station 0']}</td>
                <td>${item['Station 1']}</td>
                <td>${item['Station 2']}</td>
                <td>${item['Station 3']}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        <div class="footer">
          <p>此報告由生產監控系統自動生成</p>
        </div>
      </body>
      </html>
    `;

    // Create a new window and write the HTML content
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      printWindow.focus();
      
      // Wait for content to load then print
      setTimeout(() => {
        printWindow.print();
      }, 500);
    } else {
      throw new Error("無法開啟新視窗");
    }
  } catch (error) {
    console.error('PDF generation error:', error);
    throw new Error('PDF 生成失敗');
  }
};

// Helper function to calculate station progress (simplified)
const calculateStationProgress = (systemId: string, stationName: string) => {
  // This is a simplified version - in real implementation, 
  // you would need to access the actual progress data
  return Math.floor(Math.random() * 101); // Placeholder
};

export const generateExcel = async (title: string, data: any[]): Promise<Blob> => {
  try {
    const workbook = XLSX.utils.book_new();
    
    if (data && data.length > 0) {
      // Process data for simplified Excel report
      const processedData = data.map(system => ({
        '機台編號': system.system_name,
        '當前站點': system.current_station || 'Station 0',
        '狀態': system.overall_progress === 100 ? '已完成' : 
               system.overall_progress >= 1 ? '進行中' : '未開始',
        'Station 0 進度': `${system.overall_progress || 0}%`,
        'Station 1 進度': `${system.overall_progress || 0}%`,
        'Station 2 進度': `${system.overall_progress || 0}%`,
        'Station 3 進度': `${system.overall_progress || 0}%`
      }));

      // Create worksheet from processed data
      const worksheet = XLSX.utils.json_to_sheet(processedData);
      
      // Add title row
      XLSX.utils.sheet_add_aoa(worksheet, [[title]], { origin: 'A1' });
      XLSX.utils.sheet_add_aoa(worksheet, [[`生成時間: ${new Date().toLocaleString('zh-TW')}`]], { origin: 'A2' });
      
      // Adjust data starting position
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
      range.s.r = 3; // Start data from row 4
      worksheet['!ref'] = XLSX.utils.encode_range(range);
      
      XLSX.utils.book_append_sheet(workbook, worksheet, '生產監控報表');
    } else {
      // Create empty worksheet with title
      const worksheet = XLSX.utils.aoa_to_sheet([
        [title],
        [`生成時間: ${new Date().toLocaleString('zh-TW')}`],
        [],
        ['無資料可匯出']
      ]);
      XLSX.utils.book_append_sheet(workbook, worksheet, '生產監控報表');
    }
    
    const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    return new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  } catch (error) {
    console.error('Excel generation error:', error);
    throw new Error('Excel 生成失敗');
  }
};

export const downloadFile = (blob: Blob, filename: string) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};
