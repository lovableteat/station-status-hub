
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
          body { 
            font-family: 'Microsoft JhengHei', Arial, sans-serif; 
            margin: 20px; 
            background: white;
          }
          .header { 
            text-align: center; 
            margin-bottom: 30px; 
            border-bottom: 2px solid #333;
            padding-bottom: 10px;
          }
          .summary { 
            background: #f8f9fa; 
            padding: 15px; 
            margin-bottom: 20px; 
            border-radius: 5px;
            border: 1px solid #dee2e6;
          }
          table { 
            width: 100%; 
            border-collapse: collapse; 
            margin-bottom: 20px; 
            font-size: 12px;
          }
          th, td { 
            border: 1px solid #dee2e6; 
            padding: 8px; 
            text-align: left; 
            word-break: break-word;
          }
          th { 
            background-color: #e9ecef; 
            font-weight: bold;
            text-align: center;
          }
          .footer { 
            margin-top: 30px; 
            text-align: center; 
            font-size: 10px; 
            color: #6c757d; 
            border-top: 1px solid #dee2e6;
            padding-top: 10px;
          }
          .status-done { color: #28a745; font-weight: bold; }
          .status-ongoing { color: #fd7e14; font-weight: bold; }
          .status-notstart { color: #dc3545; font-weight: bold; }
          @media print {
            body { margin: 0; }
            .header, .summary, table { break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${title}</h1>
          <p>生成時間: ${new Date().toLocaleString('zh-TW')}</p>
        </div>
        
        <div class="summary">
          <h2>統計摘要</h2>
          <p><strong>總資料筆數:</strong> ${data.length}</p>
          ${data.length > 0 ? `
            <p><strong>報表範圍:</strong> 包含所有系統測試進度與狀態資訊</p>
          ` : ''}
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
                  // 為狀態添加樣式
                  if (header.includes('狀態') || header.includes('status')) {
                    let className = '';
                    if (value === 'Done' || value === '已完成') className = 'status-done';
                    else if (value === 'On-going' || value === '進行中') className = 'status-ongoing';
                    else if (value === 'Not Start' || value === '未開始') className = 'status-notstart';
                    return `<td class="${className}">${value || '-'}</td>`;
                  }
                  return `<td>${value || '-'}</td>`;
                }).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
        ` : '<div style="text-align: center; padding: 40px;"><p>無資料可匯出</p></div>'}
        
        <div class="footer">
          <p>此報告由測試管理系統自動生成</p>
          <p>GB300 L10 Production Testing System</p>
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
      }, 1000); // 增加等待時間確保內容完全載入
    } else {
      throw new Error("無法開啟新視窗，請檢查瀏覽器的彈出視窗設定");
    }
  } catch (error) {
    console.error('PDF generation error:', error);
    throw new Error('PDF 生成失敗: ' + (error as Error).message);
  }
};

export const generateExcel = async (title: string, data: any[]): Promise<Blob> => {
  try {
    const workbook = XLSX.utils.book_new();
    
    if (data && data.length > 0) {
      // Create worksheet from data
      const worksheet = XLSX.utils.json_to_sheet(data);
      
      // 設定欄寬
      const maxWidths: { [key: string]: number } = {};
      
      // 計算每欄的最大寬度
      Object.keys(data[0]).forEach(key => {
        maxWidths[key] = Math.max(
          key.length,
          ...data.map(row => String(row[key] || '').length)
        );
      });
      
      // 設定欄寬（限制最大寬度）
      const colWidths = Object.values(maxWidths).map(width => ({
        wch: Math.min(width + 2, 50) // 最大50個字元寬度
      }));
      
      worksheet['!cols'] = colWidths;
      
      // 添加標題行
      XLSX.utils.sheet_add_aoa(worksheet, [[title]], { origin: 'A1' });
      XLSX.utils.sheet_add_aoa(worksheet, [[`生成時間: ${new Date().toLocaleString('zh-TW')}`]], { origin: 'A2' });
      XLSX.utils.sheet_add_aoa(worksheet, [['總筆數: ' + data.length]], { origin: 'A3' });
      
      // 調整數據起始位置
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
      range.s.r = 4; // 從第5行開始數據
      worksheet['!ref'] = XLSX.utils.encode_range(range);
      
      XLSX.utils.book_append_sheet(workbook, worksheet, '測試數據');
    } else {
      // Create empty worksheet with title
      const worksheet = XLSX.utils.aoa_to_sheet([
        [title],
        [`生成時間: ${new Date().toLocaleString('zh-TW')}`],
        [],
        ['無資料可匯出']
      ]);
      XLSX.utils.book_append_sheet(workbook, worksheet, '測試數據');
    }
    
    const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    return new Blob([wbout], { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });
  } catch (error) {
    console.error('Excel generation error:', error);
    throw new Error('Excel 生成失敗: ' + (error as Error).message);
  }
};

export const downloadFile = (blob: Blob, filename: string) => {
  try {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Download error:', error);
    throw new Error('檔案下載失敗');
  }
};
