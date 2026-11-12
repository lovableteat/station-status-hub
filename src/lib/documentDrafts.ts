/** Same-document RAM only. Never serializes File objects or authorizes access. */
export interface DocumentDraftScope { readonly documentToken: object; readonly actorId: string; readonly epoch: number; readonly client: string; readonly surface: string; readonly entityId: string }
export interface DocumentDraftEntry<T> { generation: number; value: T }
interface Registry { token: object; actor: string | null; epoch: number; sequence: number; entries: Map<string, DocumentDraftEntry<unknown>>; listeners: Set<() => void> }
const documents = new WeakMap<object, Registry>();
function registry(): Registry | null {
  if (typeof window === 'undefined') return null;
  let value = documents.get(window);
  if (!value) { value = { token: {}, actor: null, epoch: 0, sequence: 0, entries: new Map(), listeners: new Set() }; documents.set(window, value);
    const current = value;
    window.addEventListener('beforeunload', event => {
      if (!current.entries.size) return;
      event.preventDefault(); event.returnValue = '';
    });
  }
  return value;
}
/** Called by the identity owner, never by individual editors. */
export function setDocumentDraftActor(actorId: string | null): void {
  const r = registry(); if (!r || r.actor === actorId) return;
  r.entries.clear(); r.epoch++; r.actor = actorId; r.listeners.forEach(listener => listener());
}
export function documentDraftScope(actorId: string | null | undefined, surface: string, entityId: string, client = 'default'): DocumentDraftScope | null {
  const r = registry();
  return r && actorId && r.actor === actorId ? Object.freeze({ documentToken: r.token, actorId, epoch: r.epoch, client, surface, entityId }) : null;
}
export function isDocumentDraftScopeCurrent(scope: DocumentDraftScope | null): boolean {
  const r = registry(); return Boolean(r && scope && r.token === scope.documentToken && r.actor === scope.actorId && r.epoch === scope.epoch);
}
const key = (s: DocumentDraftScope) => JSON.stringify([s.actorId, s.epoch, s.client, s.surface, s.entityId]);
export function readDocumentDraft<T>(scope: DocumentDraftScope | null): DocumentDraftEntry<T> | null {
  return scope && isDocumentDraftScopeCurrent(scope) ? registry()!.entries.get(key(scope)) as DocumentDraftEntry<T> ?? null : null;
}
export function writeDocumentDraft<T>(scope: DocumentDraftScope | null, value: T): number | null {
  if (!scope || !isDocumentDraftScopeCurrent(scope)) return null;
  const r = registry()!, generation = ++r.sequence;
  r.entries.set(key(scope), { generation, value }); r.listeners.forEach(listener => listener()); return generation;
}
export function clearDocumentDraft(scope: DocumentDraftScope | null, expectedGeneration: number): boolean {
  if (!scope || readDocumentDraft(scope)?.generation !== expectedGeneration) return false;
  const r = registry()!, deleted = r.entries.delete(key(scope));
  r.listeners.forEach(listener => listener()); return deleted;
}

export function subscribeDocumentDraft(listener: () => void): () => void {
  const r = registry(); r?.listeners.add(listener); return () => { r?.listeners.delete(listener); };
}
