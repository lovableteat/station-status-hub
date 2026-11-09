// Same API as src/components/circuit-changes/pdfStorage.ts; the version list and PDF files stay in the isolated fixture server.
import { normalizeCircuitPdfRegistry } from '../../src/components/circuit-changes/circuitPdf.ts';
const account = () => new URLSearchParams(location.search).get('qaUser') || 'A';
const headers = (extra = {}) => ({ 'x-qa-account': account(), ...extra });
export const CIRCUIT_PDF_BUCKET = 'material-spec-documents';
async function failure(response, fallback) { const result = await response.json().catch(() => ({})); return new Error(result.error || fallback); }
async function readRow(seriesId) {
  const response = await fetch(`/__circuit/pdf-registry?${new URLSearchParams({ seriesId })}`, { headers: headers() });
  if (!response.ok) throw await failure(response, '無法讀取 PDF 清單');
  const result = await response.json();
  return { registry: normalizeCircuitPdfRegistry(result.data), version: result.version };
}
export async function loadCircuitPdfRegistry(seriesId) { return (await readRow(seriesId)).registry; }
// Like the real module: the write only lands if the copy it was based on is still the stored one, otherwise read and merge again.
export async function saveCircuitPdfRegistry(seriesId, change) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { registry, version } = await readRow(seriesId);
    const next = change(registry);
    const response = await fetch(`/__circuit/pdf-registry?${new URLSearchParams({ seriesId, version: String(version) })}`, { method: 'PUT', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(next) });
    if (response.status === 409) continue;
    if (!response.ok) throw await failure(response, 'PDF 清單尚未儲存');
    return next;
  }
  throw new Error('PDF 清單同時有多人更新，請稍後重試；你的標記仍保留在畫面上。');
}
export async function uploadCircuitPdf(_seriesId, documentId, file) {
  const path = `circuit-pdf/qa-board/${documentId}.pdf`;
  const response = await fetch(`/__circuit/pdf-object?${new URLSearchParams({ path })}`, { method: 'PUT', headers: headers({ 'Content-Type': 'application/pdf' }), body: file });
  if (!response.ok) throw await failure(response, 'PDF 上傳失敗');
  return path;
}
export async function downloadCircuitPdf(path) {
  const response = await fetch(`/__circuit/pdf-object?${new URLSearchParams({ path })}`, { headers: headers() });
  if (!response.ok) throw await failure(response, 'PDF 下載失敗');
  return response.arrayBuffer();
}
export async function removeCircuitPdfFile(path) {
  if (!path) return;
  const response = await fetch(`/__circuit/pdf-object?${new URLSearchParams({ path })}`, { method: 'DELETE', headers: headers() });
  if (!response.ok) throw await failure(response, 'PDF 檔案移除失敗');
}
