// Canonical official pointer remains separate from the editable PDF registry, as in production.
const account = () => new URLSearchParams(location.search).get('qaUser') || 'A';
async function officialRequest(seriesId, documentId) {
  const response = await fetch(`/__circuit/pdf-official?${new URLSearchParams({ seriesId })}`, {
    ...(documentId ? { method: 'PUT', body: JSON.stringify({ documentId }) } : {}),
    headers: { 'x-qa-account': account(), 'Content-Type': 'application/json' },
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || '官方基準讀取失敗');
  return result.data;
}
export const loadCircuitPdfOfficial = seriesId => officialRequest(seriesId);
export const saveCircuitPdfOfficial = (seriesId, documentId) => officialRequest(seriesId, documentId);
export async function loadCircuitPdfOfficialHistory(seriesId) {
  const response = await fetch(`/__circuit/pdf-official-history?${new URLSearchParams({ seriesId })}`, { headers: { 'x-qa-account': account() } });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || '官方版本紀錄讀取失敗');
  return result.data;
}
