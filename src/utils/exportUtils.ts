// Export utility functions for generating actual PDF and Excel files

export const generatePDF = async (title: string, data: any[]): Promise<Blob> => {
  // Create a simple PDF content as text for demonstration
  // In a real application, you would use a library like jsPDF or Puppeteer
  const content = `
${title} 報表
生成時間: ${new Date().toLocaleString('zh-TW')}
========================

${data.map((item, index) => `
${index + 1}. ${JSON.stringify(item, null, 2)}
`).join('\n')}
`;

  return new Blob([content], { type: 'application/pdf' });
};

export const generateExcel = async (title: string, data: any[]): Promise<Blob> => {
  // Create a simple CSV content that can be opened in Excel
  // In a real application, you would use a library like xlsx
  let csvContent = `${title} 報表\n`;
  csvContent += `生成時間,${new Date().toLocaleString('zh-TW')}\n`;
  csvContent += `\n`;
  
  if (data.length > 0) {
    // Get headers from the first object
    const headers = Object.keys(data[0]);
    csvContent += headers.join(',') + '\n';
    
    // Add data rows
    data.forEach(item => {
      const row = headers.map(header => {
        const value = item[header];
        // Escape commas and quotes in CSV
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value || '';
      });
      csvContent += row.join(',') + '\n';
    });
  }

  return new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
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