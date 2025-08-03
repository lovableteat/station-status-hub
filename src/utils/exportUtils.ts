
import * as XLSX from 'xlsx';

// Export utility functions for generating simplified production reports

export const generatePDF = async (title: string, data: any[], stations?: any[], testItems?: any[], progress?: any[]): Promise<void> => {
  try {
    // Process data for simplified production report
    const processedData = data.map(system => ({
      '機台編號': system.system_name,
      '當前站點': system.current_station || 'Station 0',
      '狀態': system.status === '已完成' ? '已完成' : 
             system.overall_progress >= 1 ? '進行中' : '未開始',
      'Station 0': `${calculateStationProgress(system.id, 'Station 0', stations, testItems, progress)}%`,
      'Station 1': `${calculateStationProgress(system.id, 'Station 1', stations, testItems, progress)}%`,
      'Station 2': `${calculateStationProgress(system.id, 'Station 2', stations, testItems, progress)}%`,
      'Station 3': `${calculateStationProgress(system.id, 'Station 3', stations, testItems, progress)}%`
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
          <p>已完成: ${data.filter(d => d.status === '已完成').length}</p>
          <p>進行中: ${data.filter(d => d.status === '進行中').length}</p>
          <p>未開始: ${data.filter(d => d.status === '未開始').length}</p>
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

// Helper function to calculate station progress using actual progress data
const calculateStationProgress = (systemId: string, stationName: string, stations?: any[], testItems?: any[], progress?: any[]) => {
  if (!stations || !testItems || !progress) return 0;
  
  // 找到對應的站點
  const station = stations.find(s => s.station_name?.includes(stationName));
  if (!station) return 0;
  
  // 該站點的測項
  const stationItems = testItems.filter(item => item.station_id === station.id);
  if (stationItems.length === 0) return 0;
  
  // 該系統在該站點已完成的測項
  const completedItems = stationItems.filter(item => {
    const prog = progress.find(p => 
      p.system_id === systemId && 
      p.station_id === station.id && 
      p.item_id === item.id &&
      p.status === 'Done'
    );
    return prog !== undefined;
  });
  
  return Math.round((completedItems.length / stationItems.length) * 100);
};

export const generateExcel = async (title: string, data: any[], stations?: any[], testItems?: any[], progress?: any[]): Promise<Blob> => {
  try {
    const workbook = XLSX.utils.book_new();
    
    if (data && data.length > 0) {
      // Process data for comprehensive Excel report with proper formatting
      const processedData = data.map(system => {
        const systemId = system.id;
        const systemProgress = progress?.filter(p => p.system_id === systemId) || [];
        
        // Calculate station-specific progress
        const getStationProgress = (stationName: string) => {
          if (!stations || !testItems) return 0;
          const station = stations.find(s => s.station_name?.includes(stationName) || s.name?.includes(stationName));
          if (!station) return 0;
          
          const stationItems = testItems.filter(item => item.station_id === station.id);
          if (stationItems.length === 0) return 0;
          
          const completedItems = systemProgress.filter(p => 
            p.station_id === station.id && p.status === 'Done'
          ).length;
          
          let progress = stationItems.length > 0 ? Math.round((completedItems / stationItems.length) * 100) : 0;
          
          // 如果系統狀態為已完成，且這是目標站點，則顯示100%
          if (system.status === '已完成' && station.station_order >= 1 && station.station_order <= 4) {
            progress = 100;
          }
          
          return progress;
        };

        return {
          '系統編號': system.system_name || system.name || '',
          '序號': system.serial_number || '',
          '型號': system.model || '',
          '負責工程師': system.assigned_engineer || '',
          '目前站點': system.current_station || '',
          '整體進度(%)': system.overall_progress || 0,
          '狀態': system.status || '',
          'Station 0 進度(%)': getStationProgress('Station 0'),
          'Station 1 進度(%)': getStationProgress('Station 1'), 
          'Station 2 進度(%)': getStationProgress('Station 2'),
          'Station 3 進度(%)': getStationProgress('Station 3'),
          '實際開始時間': system.actual_started_at ? new Date(system.actual_started_at).toLocaleDateString('zh-TW') + ' ' + new Date(system.actual_started_at).toLocaleTimeString('zh-TW') : '',
          '實際完成時間': system.actual_completed_at ? new Date(system.actual_completed_at).toLocaleDateString('zh-TW') + ' ' + new Date(system.actual_completed_at).toLocaleTimeString('zh-TW') : '',
          'OS MAC': system.os_mac_address || '',
          'BMC 位址': system.bmc_address || '',
          'BOM 90': system.bom_90 || '',
          '建立時間': system.created_at ? new Date(system.created_at).toLocaleDateString('zh-TW') + ' ' + new Date(system.created_at).toLocaleTimeString('zh-TW') : '',
          '更新時間': system.updated_at ? new Date(system.updated_at).toLocaleDateString('zh-TW') + ' ' + new Date(system.updated_at).toLocaleTimeString('zh-TW') : ''
        };
      });

      // Create worksheet with proper headers
      const worksheet = XLSX.utils.json_to_sheet(processedData, { 
        header: [
          '系統編號', '序號', '型號', '負責工程師', '目前站點', '整體進度(%)', '狀態',
          'Station 0 進度(%)', 'Station 1 進度(%)', 'Station 2 進度(%)', 'Station 3 進度(%)',
          '實際開始時間', '實際完成時間', 'OS MAC', 'BMC 位址', 'BOM 90', '建立時間', '更新時間'
        ]
      });
      
      // Insert title rows at the top
      XLSX.utils.sheet_add_aoa(worksheet, [
        [title],
        [`生成時間: ${new Date().toLocaleDateString('zh-TW')} ${new Date().toLocaleTimeString('zh-TW')}`],
        [`資料筆數: ${data.length}`],
        []
      ], { origin: 'A1' });
      
      // Adjust starting row for data
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
      range.s.r = 4; // Start data from row 5 (0-indexed)
      worksheet['!ref'] = XLSX.utils.encode_range(range);
      
      // Set column widths for better readability
      const colWidths = [
        { wch: 15 }, // 系統編號
        { wch: 20 }, // 序號  
        { wch: 12 }, // 型號
        { wch: 15 }, // 負責工程師
        { wch: 15 }, // 目前站點
        { wch: 12 }, // 整體進度
        { wch: 12 }, // 狀態
        { wch: 15 }, // Station 0
        { wch: 15 }, // Station 1
        { wch: 15 }, // Station 2
        { wch: 15 }, // Station 3
        { wch: 20 }, // 實際開始時間
        { wch: 20 }, // 實際完成時間
        { wch: 20 }, // OS MAC
        { wch: 18 }, // BMC 位址
        { wch: 12 }, // BOM 90
        { wch: 20 }, // 建立時間
        { wch: 20 }  // 更新時間
      ];
      worksheet['!cols'] = colWidths;
      
      XLSX.utils.book_append_sheet(workbook, worksheet, '系統報表');

      // Add detailed progress sheet if progress data is available
      if (progress && progress.length > 0) {
        const progressData = progress.map(prog => {
          const system = data.find(s => s.id === prog.system_id);
          const station = stations?.find(s => s.id === prog.station_id);
          const item = testItems?.find(i => i.id === prog.item_id);
          
          return {
            '系統名稱': system?.system_name || '',
            '站點名稱': station?.station_name || station?.name || '',
            '測試項目': item?.item_name || '',
            '狀態': prog.status || '',
            '進度(%)': prog.progress_percent || 0,
            '開始時間': prog.started_at ? new Date(prog.started_at).toLocaleDateString('zh-TW') + ' ' + new Date(prog.started_at).toLocaleTimeString('zh-TW') : '',
            '完成時間': prog.completed_at ? new Date(prog.completed_at).toLocaleDateString('zh-TW') + ' ' + new Date(prog.completed_at).toLocaleTimeString('zh-TW') : '',
            '實際小時': prog.actual_hours || 0,
            '負責人': prog.assigned_to || '',
            '備註': prog.notes || ''
          };
        });
        
        const progressWorksheet = XLSX.utils.json_to_sheet(progressData);
        progressWorksheet['!cols'] = [
          { wch: 18 }, { wch: 18 }, { wch: 25 }, { wch: 12 }, { wch: 10 },
          { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 15 }, { wch: 30 }
        ];
        XLSX.utils.book_append_sheet(workbook, progressWorksheet, '詳細進度');
      }
    } else {
      // Create empty worksheet with title
      const worksheet = XLSX.utils.aoa_to_sheet([
        [title],
        [`生成時間: ${new Date().toLocaleDateString('zh-TW')} ${new Date().toLocaleTimeString('zh-TW')}`],
        [],
        ['無資料可匯出']
      ]);
      XLSX.utils.book_append_sheet(workbook, worksheet, '系統報表');
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
