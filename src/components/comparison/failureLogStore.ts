/**
 * Sends a 失敗紀錄 to the backend and keeps it on this computer until the backend has it.
 * The backend store is the 意見收集 one (create a draft, then submit it); both calls accept being repeated with the
 * same id, so a record whose reply was lost is simply sent again.
 */
import type { FeedbackContext, FeedbackDraft, FeedbackReport, FeedbackTab } from "./feedback/types.ts";
import { FEEDBACK_TABS } from "./feedback/types.ts";

export interface FailureRecord {
  id: string;
  reporterId: string;
  title: string;
  description: string;
  tab: FeedbackTab;
  projectName: string;
  context: FeedbackContext;
  /** When it failed, in milliseconds; a record that could not be sent for FAILURE_KEEP_MS is given up. */
  at: number;
  /** How often the backend refused its content (see isContentRefusal). */
  tries: number;
}
export interface FailureLogSink {
  createDraft(draft: FeedbackDraft): Promise<FeedbackReport>;
  submitDraft(id: string): Promise<FeedbackReport>;
}
export interface KeyValueStore { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }

/** Records waiting on this computer; the oldest is dropped when another one does not fit. */
export const FAILURE_QUEUE_LIMIT = 20;
/** A record whose content the backend refuses is given up after this many refusals. */
export const FAILURE_SEND_TRIES = 3;
/** A record that could not be sent for two weeks is given up, so nothing waits forever. */
export const FAILURE_KEEP_MS = 14 * 24 * 60 * 60 * 1000;
export const failureQueueKey = (accountId: string) => `comparison-failure-log:${accountId}`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function validRecord(value: unknown, accountId: string): value is FailureRecord {
  const record = value as Partial<FailureRecord> | null;
  return Boolean(record) && typeof record!.id === "string" && UUID.test(record!.id) && record!.reporterId === accountId
    && typeof record!.title === "string" && typeof record!.description === "string" && typeof record!.projectName === "string"
    && typeof record!.tab === "string" && Object.keys(FEEDBACK_TABS).includes(record!.tab)
    && Boolean(record!.context) && typeof record!.context === "object" && Number.isInteger(record!.tries) && Number.isFinite(record!.at);
}

export function readFailureQueue(store: KeyValueStore, accountId: string): FailureRecord[] {
  try {
    const parsed: unknown = JSON.parse(store.getItem(failureQueueKey(accountId)) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(item => validRecord(item, accountId)).slice(-FAILURE_QUEUE_LIMIT) : [];
  } catch { return []; }
}

/** False when this computer's storage refused it (full, or blocked); the record is then only sent once. */
export function writeFailureQueue(store: KeyValueStore, accountId: string, records: readonly FailureRecord[]): boolean {
  try {
    if (records.length) store.setItem(failureQueueKey(accountId), JSON.stringify(records.slice(-FAILURE_QUEUE_LIMIT)));
    else store.removeItem(failureQueueKey(accountId));
    return true;
  } catch { return false; }
}

export function queueFailureRecord(store: KeyValueStore, record: FailureRecord): boolean {
  return writeFailureQueue(store, record.reporterId, [...readFailureQueue(store, record.reporterId).filter(item => item.id !== record.id), record]);
}

export async function sendFailureRecord(sink: FailureLogSink, record: FailureRecord): Promise<void> {
  const draft = await sink.createDraft({ id: record.id, reporterId: record.reporterId, title: record.title, description: record.description,
    category: "bug", tab: record.tab, projectName: record.projectName, context: record.context, screenshots: [] });
  if (!draft.isSubmitted) await sink.submitDraft(record.id);
}

/** The backend could not be reached at all: nothing else will get through either. */
export function isConnectionProblem(message: string): boolean {
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|time[d ]?out|逾時|ERR_(NETWORK|INTERNET|CONNECTION|NAME)|ECONN|\b50[234]\b|gateway|offline/i.test(message);
}

/**
 * The backend read the record and refused what is in it (the checks of create_draft, or text Postgres cannot store).
 * Sending the same record again gives the same answer. Everything else — a lapsed sign-in, a busy database, a server
 * error, two tabs sending the same record at once — can pass, so it is tried again and does not count.
 */
export function isContentRefusal(message: string): boolean {
  return /格式不正確|最多可附上|這份回報已送出|unsupported unicode|invalid input syntax|invalid byte sequence|check constraint|value too long/i.test(message);
}

export interface FailureFlushResult {
  sent: string[];
  /** Still on this computer, to be sent later. */
  waiting: string[];
  /** Given up and removed from this computer: refused FAILURE_SEND_TRIES times, or older than FAILURE_KEEP_MS. */
  dropped: { id: string; reason: string }[];
  /** Why a waiting or dropped record was not accepted, by record id. */
  reasons: Record<string, string>;
}

/** Sends every waiting record of this account, oldest first. Stops at the first one the backend cannot be reached for. */
export async function flushFailureQueue(sink: FailureLogSink, store: KeyValueStore, accountId: string, now = Date.now()): Promise<FailureFlushResult> {
  const result: FailureFlushResult = { sent: [], waiting: [], dropped: [], reasons: {} };
  const queue = readFailureQueue(store, accountId);
  for (let index = 0; index < queue.length; index++) {
    const record = queue[index];
    try {
      await sendFailureRecord(sink, record);
      result.sent.push(record.id);
    } catch (caught) {
      const reason = caught instanceof Error ? caught.message : String(caught);
      if (isConnectionProblem(reason)) {
        for (const item of queue.slice(index)) { result.waiting.push(item.id); result.reasons[item.id] = reason; }
        break;
      }
      result.reasons[record.id] = reason;
      if (isContentRefusal(reason)) record.tries += 1;
      // A lapsed sign-in is not the record's fault: an old record waits for the next sign-in instead of being given up.
      const signIn = /jwt|expired|\b401\b|安全登入|permission denied/i.test(reason);
      if (record.tries >= FAILURE_SEND_TRIES || (!signIn && now - record.at > FAILURE_KEEP_MS)) result.dropped.push({ id: record.id, reason });
      else result.waiting.push(record.id);
    }
  }
  // Records added while this was running stay; only what was handled here is taken out or updated.
  const handled = new Set([...result.sent, ...result.dropped.map(item => item.id)]);
  const tries = new Map(queue.map(record => [record.id, record.tries]));
  writeFailureQueue(store, accountId, readFailureQueue(store, accountId).filter(record => !handled.has(record.id)).map(record => ({ ...record, tries: tries.get(record.id) ?? record.tries })));
  return result;
}
