const account = () => new URLSearchParams(location.search).get('qaUser') || 'A';
export class CircuitChangeConflictError extends Error { constructor(message = '這個修改項目已由其他人更新；你的草稿仍保留，請先對照最新內容。') { super(message); } }
async function request(method, args) {
  const response = await fetch('/__circuit/api', { method:'POST', headers:{'Content-Type':'application/json','x-qa-account':account()}, body:JSON.stringify({method,args}) });
  const result = await response.json();
  if (!response.ok) { if (response.status === 409) throw new CircuitChangeConflictError(result.error); throw new Error(result.error || 'QA request failed'); }
  return result.data;
}
export const listCircuitChangeSets = (...args) => request('listCircuitChangeSets',args);
export const createCircuitChangeSet = (...args) => request('createCircuitChangeSet',args);
export const listCircuitChangeItems = (...args) => request('listCircuitChangeItems',args);
export const getCircuitChangeItem = (...args) => request('getCircuitChangeItem',args);
export const saveCircuitChangeItem = (...args) => request('saveCircuitChangeItem',args);
export const actOnCircuitChangeItem = (...args) => request('actOnCircuitChangeItem',args);
export const setCircuitChangeItemRemoved = (...args) => request('setCircuitChangeItemRemoved',args);
export const listCircuitChangeEvents = (...args) => request('listCircuitChangeEvents',args);
export const getCircuitChangeEvent = (...args) => request('getCircuitChangeEvent',args);
export const loadCircuitChangeItemsForExport = (...args) => request('loadCircuitChangeItemsForExport',args);
export const loadCircuitChangeEventsForExport = (...args) => request('loadCircuitChangeEventsForExport',args);
export function subscribeCircuitChanges(seriesId,setId,onChange) {
  const events = new EventSource(`/__circuit/events?${new URLSearchParams({seriesId,setId,account:account()})}`);
  events.onmessage = onChange;
  return () => events.close();
}
