import { detectSupplierMapping, type SupplierSheet, type SupplierMapping } from './supplierDirectory';
export type ImportSheet = SupplierSheet & { mapping: SupplierMapping; enabled: boolean };
export async function readSupplierWorkbooks(files: File[]): Promise<ImportSheet[]> {
  if (!files.length || files.length > 20) throw new Error('每次請選擇 1–20 份 Excel 或 CSV');
  if (files.reduce((n, f) => n + f.size, 0) > 15 * 1024 * 1024) throw new Error('所選檔案合計不可超過 15 MiB');
  const XLSX = await import('xlsx');
  const sheets: ImportSheet[] = [];
  let totalRows = 0;
  for (const file of files) {
    if (!/\.(xlsx?|csv)$/i.test(file.name) || file.size > 5 * 1024 * 1024) throw new Error('每份請使用 5 MiB 以內的 XLSX、XLS 或 CSV');
    const buffer = await file.arrayBuffer();
    let source: ArrayBuffer | string = buffer;
    const type = /\.csv$/i.test(file.name) ? 'string' : 'array';
    if (type === 'string') {
      try { source = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
      catch { source = new TextDecoder('big5', { fatal: true }).decode(buffer); }
    }
    const metadata = XLSX.read(source, { type, bookSheets: true });
    if (metadata.SheetNames.length + sheets.length > 50) throw new Error('每次最多 50 張工作表');
    const workbook = XLSX.read(source, { type, sheetRows: 10001, cellDates: false });
    for (const name of workbook.SheetNames) {
      const ws = workbook.Sheets[name], ref = ws['!fullref'] ?? ws['!ref'];
      if (ref) {
        const range = XLSX.utils.decode_range(ref);
        if (range.e.r >= 10000 || range.e.c >= 256) throw new Error(`「${name}」超過 10000 列或 256 欄，請分開匯入`);
      }
      const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false, range: 0 });
      totalRows += rows.length;
      if (totalRows > 20000) throw new Error('每次最多 20000 列來源資料');
      const mapping = detectSupplierMapping(rows);
      sheets.push({ file: file.name, sheet: name, group: file.name.replace(/\.(xlsx?|csv)$/i, ''), rows, merges: ws['!merges'] ?? [], mapping, enabled: mapping.columns.length > 0 });
    }
  }
  return sheets;
}
