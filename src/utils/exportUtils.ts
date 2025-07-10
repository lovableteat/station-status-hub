import * as XLSX from 'xlsx';

// Export utility functions for generating actual PDF and Excel files

export const generatePDF = async (title: string, data: any[]): Promise<void> => {
  try {
    // Create HTML content similar to data center approach
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
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; }
          th { background-color: #f2f2f2; font-weight: bold; }
          .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${title}</h1>
          <p>生成時間: ${new Date().toLocaleString('zh-TW')}</p>
        </div>
        
        <div class="summary">
          <h2>統計摘要</h2>
          <p>總資料筆數: ${data.length}</p>
        </div>
        
        ${data.length > 0 ? `
        <table>
          <thead>
            <tr>
              ${Object.keys(data[0]).map(header => `<th>${header}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${data.map(item => `
              <tr>
                ${Object.keys(data[0]).map(header => {
                  const value = item[header];
                  if (typeof value === 'object' && value !== null) {
                    return `<td>${JSON.stringify(value)}</td>`;
                  }
                  return `<td>${value || '-'}</td>`;
                }).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
        ` : '<p>無資料可匯出</p>'}
        
        <div class="footer">
          <p>此報告由測試管理系統自動生成</p>
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

export const generateExcel = async (title: string, data: any[]): Promise<Blob> => {
  try {
    const workbook = XLSX.utils.book_new();
    
    if (data && data.length > 0) {
      // Create worksheet from data
      const worksheet = XLSX.utils.json_to_sheet(data);
      
      // Add title row
      XLSX.utils.sheet_add_aoa(worksheet, [[title]], { origin: 'A1' });
      XLSX.utils.sheet_add_aoa(worksheet, [[`生成時間: ${new Date().toLocaleString('zh-TW')}`]], { origin: 'A2' });
      
      // Adjust data starting position
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
      range.s.r = 3; // Start data from row 4
      worksheet['!ref'] = XLSX.utils.encode_range(range);
      
      XLSX.utils.book_append_sheet(workbook, worksheet, '報表資料');
    } else {
      // Create empty worksheet with title
      const worksheet = XLSX.utils.aoa_to_sheet([
        [title],
        [`生成時間: ${new Date().toLocaleString('zh-TW')}`],
        [],
        ['無資料可匯出']
      ]);
      XLSX.utils.book_append_sheet(workbook, worksheet, '報表資料');
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