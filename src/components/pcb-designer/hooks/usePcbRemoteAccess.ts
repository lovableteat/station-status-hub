import { useSyncExternalStore } from "react";
import type { PcbRemoteClient } from "../core/remoteSync.ts";
import type { PcbRemoteAccessSnapshot } from "../core/remoteAccess.ts";

const LOCAL_ACCESS: PcbRemoteAccessSnapshot = { status: "ready", generation: 0 };
const localSnapshot = () => LOCAL_ACCESS;
const localSubscribe = () => () => undefined;

export function usePcbRemoteAccess(client?: PcbRemoteClient | null) {
  return useSyncExternalStore(
    client?.subscribeAccess ?? localSubscribe,
    client?.getAccessSnapshot ?? localSnapshot,
    client?.getAccessSnapshot ?? localSnapshot,
  );
}
