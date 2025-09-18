import * as XLSX from 'xlsx';

/**
 * 匯出數據為 CSV 格式
 */
export function exportToCsv(data: any[], filename: string) {
  if (!data || data.length === 0) {
    throw new Error('沒有數據可匯出');
  }

  // 獲取所有列名
  const headers = Object.keys(data[0]);
  
  // 創建 CSV 內容
  const csvContent = [
    // 標題行
    headers.join(','),
    // 數據行
    ...data.map(row => 
      headers.map(header => {
        const value = row[header];
        // 處理特殊字符和換行符
        if (value === null || value === undefined) return '';
        if (typeof value === 'object') return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
        const stringValue = String(value);
        // 如果包含逗號、引號或換行符，需要用引號包圍並轉義內部引號
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      }).join(',')
    )
  ].join('\n');

  // 添加 BOM 以確保中文正確顯示
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8' });
  
  // 創建下載連結
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

/**
 * 匯出數據為 Excel 格式
 */
export async function exportToExcel(data: any[], filename: string) {
  if (!data || data.length === 0) {
    throw new Error('沒有數據可匯出');
  }

  try {
    // 創建工作簿
    const workbook = XLSX.utils.book_new();
    
    // 處理數據，轉換複雜對象為字符串
    const processedData = data.map(row => {
      const processedRow: Record<string, any> = {};
      Object.keys(row).forEach(key => {
        const value = row[key];
        if (value === null || value === undefined) {
          processedRow[key] = '';
        } else if (typeof value === 'object') {
          processedRow[key] = JSON.stringify(value);
        } else {
          processedRow[key] = value;
        }
      });
      return processedRow;
    });

    // 創建工作表
    const worksheet = XLSX.utils.json_to_sheet(processedData);
    
    // 設置列寬
    const headers = Object.keys(data[0]);
    const colWidths = headers.map(header => {
      const maxLength = Math.max(
        header.length,
        ...data.map(row => {
          const value = row[header];
          return value ? String(value).length : 0;
        })
      );
      return { wch: Math.min(Math.max(maxLength, 10), 50) };
    });
    worksheet['!cols'] = colWidths;

    // 添加工作表到工作簿
    XLSX.utils.book_append_sheet(workbook, worksheet, '數據');
    
    // 寫入文件
    XLSX.writeFile(workbook, filename);
  } catch (error) {
    console.error('Excel 匯出錯誤:', error);
    throw new Error('Excel 匯出失敗');
  }
}

/**
 * 格式化數據用於顯示
 */
export function formatDisplayValue(value: any, key: string): string {
  if (value === null || value === undefined) {
    return '-';
  }

  if (typeof value === 'boolean') {
    return value ? '是' : '否';
  }

  if (key.includes('date') || key.includes('time') || key.includes('at')) {
    try {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return date.toLocaleString('zh-TW');
      }
    } catch {
      // 如果不是日期格式，直接返回原值
    }
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

/**
 * 獲取狀態顯示文本
 */
export function getStatusDisplayText(status: string): string {
  const statusMap: Record<string, string> = {
    'open': '未解決',
    'closed': '已解決',
    'in_progress': '處理中',
    'Not Start': '未開始',
    'In Progress': '進行中',
    'Completed': '已完成',
    'active': '活躍',
    'inactive': '停用',
  };
  
  return statusMap[status] || status;
}