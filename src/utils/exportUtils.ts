import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

// Export utility functions for generating actual PDF and Excel files

export const generatePDF = async (title: string, data: any[]): Promise<Blob> => {
  try {
    const doc = new jsPDF();
    
    // Add title
    doc.setFontSize(18);
    doc.text(title, 14, 22);
    
    // Add generation time
    doc.setFontSize(10);
    doc.text(`生成時間: ${new Date().toLocaleString('zh-TW')}`, 14, 32);
    
    if (data && data.length > 0) {
      // Get headers from the first object
      const headers = Object.keys(data[0]);
      const tableData = data.map(item => 
        headers.map(header => {
          const value = item[header];
          // Convert objects to strings
          if (typeof value === 'object' && value !== null) {
            return JSON.stringify(value);
          }
          return value || '';
        })
      );
      
      // Add table
      autoTable(doc, {
        head: [headers],
        body: tableData,
        startY: 40,
        styles: { 
          fontSize: 8,
          cellPadding: 2
        },
        headStyles: {
          fillColor: [66, 139, 202],
          textColor: 255
        }
      });
    } else {
      doc.text('無資料可匯出', 14, 45);
    }
    
    return new Blob([doc.output('blob')], { type: 'application/pdf' });
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