import type { PcbRemoteClient } from "./remoteSync.ts";

export type PcbRemoteAccessStatus = "checking" | "ready" | "session-required" | "denied" | "error";
export interface PcbRemoteAccessSnapshot {
  status: PcbRemoteAccessStatus;
  generation: number;
}
export interface PcbSession {
  access_token: string;
  expires_at?: number;
  user: { id: string };
}
/** Read-only Auth surface. PCB never signs out, changes credentials or creates sessions. */
export interface PcbSessionSource {
  getSession: () => Promise<{ data: { session: PcbSession | null }; error: unknown }>;
  onAuthStateChange?: (callback: (event: string, session: PcbSession | null) => void) => {
    data: { subscription: { unsubscribe: () => void } };
  };
}

export class PcbRemoteAccessError extends Error {
  readonly status: Exclude<PcbRemoteAccessStatus, "checking" | "ready">;
  constructor(status: PcbRemoteAccessError["status"]) {
    super(status === "denied" ? "PCB cloud access was denied" : status === "session-required"
      ? "PCB cloud access requires a valid session" : "PCB cloud request failed");
    this.name = "PcbRemoteAccessError";
    this.status = status;
  }
}

export function isPcbAuthorizationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: string; status?: number; message?: string };
  return value.status === 401 || value.status === 403
    || ["42501", "PGRST301", "PGRST302", "PGRST303"].includes(value.code ?? "")
    || /(?:jwt|token).*(?:expired|invalid)|(?:expired|invalid).*(?:jwt|token)|permission denied|not authorized/i.test(value.message ?? "");
}

export function throwIfPcbAuthorizationError(error: unknown): void {
  if (isPcbAuthorizationError(error)) throw new PcbRemoteAccessError("denied");
}

function validSession(session: PcbSession | null): boolean {
  return Boolean(session?.access_token && session.user?.id && Number.isFinite(session.expires_at)
    && session.expires_at! * 1_000 > Date.now());
}

/** Keep a remote client present on session loss: null would enable local/unlocked editing. */
export function guardPcbRemoteClient(client: PcbRemoteClient, auth?: PcbSessionSource): PcbRemoteClient {
  let snapshot: PcbRemoteAccessSnapshot = { status: "checking", generation: 0 };
  const listeners = new Set<() => void>();
  let unsubscribe: (() => void) | undefined;
  let actorId: string | null = null;
  const publish = (status: PcbRemoteAccessStatus, invalidate = false) => {
    if (snapshot.status === status && !invalidate) return;
    snapshot = { status, generation: snapshot.generation + (invalidate ? 1 : 0) };
    listeners.forEach((listener) => listener());
  };
  const fail = (status: PcbRemoteAccessError["status"]) => {
    publish(status, snapshot.status !== status);
    return new PcbRemoteAccessError(status);
  };
  const execute = async <T>(operation: () => Promise<T>): Promise<T> => {
    if (snapshot.status === "denied") throw new PcbRemoteAccessError("denied");
    const generation = snapshot.generation;
    try {
      if (!auth) throw new PcbRemoteAccessError("session-required");
      const session = await auth.getSession();
      if (session.error) throw new PcbRemoteAccessError(isPcbAuthorizationError(session.error) ? "session-required" : "error");
      if (!validSession(session.data.session)) throw new PcbRemoteAccessError("session-required");
      const verifiedActor = session.data.session!.user.id;
      if (actorId !== null && actorId !== verifiedActor) throw new PcbRemoteAccessError("denied");
      actorId = verifiedActor;
      if (generation !== snapshot.generation) throw new Error("PCB session changed during request");
      publish("ready");
      const result = await operation();
      // Also fence clients used without a mounted subscription. getSession reads
      // the SDK's current session; it does not create a new login for legacy mode.
      const current = await auth.getSession();
      if (current.error || !validSession(current.data.session)) throw new PcbRemoteAccessError("session-required");
      if (current.data.session!.user.id !== verifiedActor) throw new PcbRemoteAccessError("denied");
      if (generation !== snapshot.generation) throw new Error("PCB session changed during request");
      return result;
    } catch (error) {
      // A response from an older session must not re-enable, hydrate or save the current draft.
      if (generation !== snapshot.generation) throw error;
      throw fail(error instanceof PcbRemoteAccessError ? error.status
        : isPcbAuthorizationError(error) ? "denied" : "error");
    }
  };
  const soft = async <T>(operation: () => Promise<T>, failure: T): Promise<T> => {
    try { return await execute(operation); } catch { return failure; }
  };
  return {
    getAccessSnapshot: () => snapshot,
    subscribeAccess: (listener) => {
      listeners.add(listener);
      if (listeners.size === 1 && auth?.onAuthStateChange) {
        const subscription = auth.onAuthStateChange((event, session) => {
          if (event === "INITIAL_SESSION") return;
          // Do not await Auth calls inside its callback (the SDK holds its Auth lock).
          if (!validSession(session)) { publish("session-required", true); return; }
          if (actorId !== null && actorId !== session!.user.id) { publish("denied", true); return; }
          // Routine refresh/focus events for this actor do not release a healthy
          // lease, reload a draft, or override a server's authorization denial.
          if (snapshot.status === "denied" || (snapshot.status === "ready" && actorId === session!.user.id)) return;
          publish("checking", true);
        });
        unsubscribe = () => subscription.data.subscription.unsubscribe();
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size) { unsubscribe?.(); unsubscribe = undefined; }
      };
    },
    retryAccess: () => publish("checking", true),
    load: () => execute(() => client.load!()),
    save: (state) => soft(() => client.save!(state), false),
    acquireProjectLock: (input) => execute(() => client.acquireProjectLock!(input)),
    loadProjectLock: (projectId) => execute(() => client.loadProjectLock!(projectId)),
    releaseProjectLock: (projectId) => soft(() => client.releaseProjectLock!(projectId), false),
    deleteProject: (projectId) => soft(() => client.deleteProject!(projectId), false),
    saveModelAsset: (asset) => soft(() => client.saveModelAsset!(asset), false),
    loadModelAsset: (assetId) => soft(() => client.loadModelAsset!(assetId), null),
    listModelAssets: () => soft(() => client.listModelAssets!(), []),
  };
}
