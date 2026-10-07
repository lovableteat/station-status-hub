export type AiFailureKind = 'busy' | 'minute-quota' | 'daily-quota' | 'billing' | 'timeout' | 'network' | 'auth' | 'invalid' | 'tracking';
export class AiRequestFailure extends Error {
    constructor(message: string, public kind: AiFailureKind, public retryAfterMs = 0, public status?: number) {
        super(message);
        this.name = 'AiRequestFailure';
    }
}
function record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}
export function classifyAiFailure(status: number, payload: unknown, retryAfter: string | null = null, now = Date.now()) {
    const error = record(record(payload).error);
    const details = Array.isArray(error.details) ? error.details : [];
    let retryAfterMs = retryAfter ? Math.max(0, Number(retryAfter) * 1000 || Date.parse(retryAfter) - now || 0) : 0;
    for (const detail of details) {
        const delay = record(detail).retryDelay;
        if (typeof delay === 'string' && /^\d+(\.\d+)?s$/.test(delay))
            retryAfterMs = Math.max(retryAfterMs, parseFloat(delay) * 1000);
    }
    const description = JSON.stringify(payload);
    const kind: AiFailureKind = status === 401 || status === 403 ? 'auth'
        : status === 402 || (status === 429 && /billing|credit|quotaValue":"0"/i.test(description)) ? 'billing'
            : status === 429 ? /perday|per_day|daily/i.test(description) ? 'daily-quota' : 'minute-quota'
                : status === 408 || status === 504 ? 'timeout'
                    : status >= 500 ? 'busy' : 'invalid';
    const messages: Record<AiFailureKind, string> = {
        busy: 'AI 服務暫時繁忙，正在嘗試其他可用模型。',
        'minute-quota': '這個模型暫時達到每分鐘額度，需等候額度恢復。',
        'daily-quota': '這個模型的今日額度已用完，短時間重送不會恢復。',
        billing: 'AI 帳務額度不足或未開通此模型，請至 API 管理檢查，系統已停止重送。',
        timeout: '模型回應逾時，正在嘗試其他可用模型。',
        network: 'AI 連線暫時中斷。', auth: 'AI 金鑰無效、已失效或沒有使用權限，請至 API 管理檢查。',
        invalid: 'AI 請求內容或模型設定無法使用，請檢查附件與模型設定。', tracking: '無法確認本系統用量紀錄，請重新登入或稍後重試。',
    };
    return new AiRequestFailure(messages[kind], kind, retryAfterMs, status);
}
export function nextPacificMidnight(now: number) {
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' });
    const parts = (time: number) => Object.fromEntries(formatter.formatToParts(time).map(part => [part.type, Number(part.value)]));
    const today = parts(now);
    const wallTime = Date.UTC(today.year, today.month - 1, today.day + 1);
    let midnight = wallTime;
    for (let i = 0; i < 3; i++) {
        const local = parts(midnight);
        const offset = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second) - midnight;
        midnight = wallTime - offset;
    }
    return midnight;
}
export function cooldownForFailure(failure: AiRequestFailure, now = Date.now()) {
    if (failure.kind === 'daily-quota')
        return Math.max(nextPacificMidnight(now), now + failure.retryAfterMs);
    if (failure.kind === 'minute-quota')
        return now + Math.max(60000, failure.retryAfterMs);
    if (failure.kind === 'busy' || failure.kind === 'timeout')
        return now + Math.max(90000, failure.retryAfterMs);
    return 0;
}
export function readAiCooldowns(storage?: Pick<Storage, 'getItem'>, now = Date.now()): Record<string, number> {
    try {
        const raw = record(JSON.parse(storage?.getItem('ai-model-cooldowns-v1') || '{}'));
        return Object.fromEntries(Object.entries(raw).filter(([, until]) => typeof until === 'number' && until > now && until < now + 172800000).slice(0, 30)) as Record<string, number>;
    }
    catch {
        return {};
    }
}
export function writeAiCooldowns(values: Record<string, number>, storage?: Pick<Storage, 'setItem'>) {
    try {
        storage?.setItem('ai-model-cooldowns-v1', JSON.stringify(values));
    }
    catch { /* Recovery still works when storage is unavailable. */ }
}
export async function requestAiWithRecovery<T extends {
    id: string;
    model: string;
    cooldownUntil: number;
}, R>({ targets, execute, onProgress = () => { }, onFailure = () => { }, hasAttachments = false, now = Date.now, pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)), random = Math.random, }: {
    targets: T[];
    execute: (target: T, attempt: number, timeoutMs: number) => Promise<R>;
    onProgress?: (message: string) => void;
    onFailure?: (target: T, failure: AiRequestFailure, until: number) => void;
    hasAttachments?: boolean;
    now?: () => number;
    pause?: (ms: number) => Promise<void>;
    random?: () => number;
}) {
    const started = now();
    const budget = hasAttachments ? 90000 : 75000;
    const candidates = targets.filter(target => target.cooldownUntil <= now()).slice(0, 3);
    if (!candidates.length) {
        const earliest = Math.min(...targets.map(target => target.cooldownUntil));
        throw new AiRequestFailure(Number.isFinite(earliest)
            ? `可用模型仍在等待恢復，最早可於 ${new Date(earliest).toLocaleTimeString('zh-TW')} 再試；目前未重送請求。`
            : '目前沒有可用的 AI 模型設定。', 'busy');
    }
    let failure: AiRequestFailure | undefined;
    let attempt = 0;
    for (const [index, target] of candidates.entries()) {
        const tries = index < candidates.length - 1 ? 1 : Math.min(2, 3 - attempt);
        for (let retry = 0; retry < tries; retry++) {
            const remaining = budget - (now() - started);
            if (remaining <= 0 || attempt >= 3)
                break;
            onProgress(`${attempt ? '正在恢復連線，改用' : '正在查詢'} ${target.model}…`);
            try {
                const result = await execute(target, ++attempt, Math.min(hasAttachments ? 45000 : 25000, remaining));
                return { result, target, attempt, durationMs: now() - started };
            }
            catch (error) {
                failure = error instanceof AiRequestFailure ? error : new AiRequestFailure('AI 連線中斷，請檢查網路後再試。', 'network');
                const until = cooldownForFailure(failure, now());
                onFailure(target, failure, until);
                if (['auth', 'invalid', 'tracking', 'billing'].includes(failure.kind))
                    throw failure;
                if (index < candidates.length - 1)
                    break;
                if (failure.kind === 'daily-quota' || failure.kind === 'timeout' || retry === tries - 1 || attempt >= 3)
                    break;
                const minimumWait = failure.kind === 'minute-quota' ? failure.retryAfterMs || 60000 : 1000 * 2 ** retry;
                const wait = Math.max(minimumWait, failure.retryAfterMs) + Math.round(random() * 500);
                if (wait >= budget - (now() - started))
                    break;
                onProgress(`服務暫時繁忙，${Math.ceil(wait / 1000)} 秒後自動重試 ${target.model}…`);
                await pause(wait);
            }
        }
    }
    throw new AiRequestFailure(failure?.kind === 'daily-quota' ? '可用模型的今日額度已用完，請等待額度恢復。'
        : failure?.kind === 'minute-quota' ? '可用模型暫時達到每分鐘額度，請等待額度恢復；系統已停止重送。'
            : failure?.kind === 'timeout' ? 'AI 回應逾時，已停止等待。輸入與附件保留在對話中，可稍後重試。'
                : '可用 AI 模型目前暫時繁忙或連線中斷，已停止重送。輸入與附件保留在對話中，可稍後重試。', failure?.kind || 'busy', failure?.retryAfterMs, failure?.status);
}
