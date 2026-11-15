import { useEffect, useState } from "react";

export interface PcbOwnerMember {
  userId: string;
  displayName: string;
}

export type PcbOwnerDirectoryLoader = () => Promise<PcbOwnerMember[]>;

type DirectoryRow = { user_id?: unknown; display_name?: unknown; username?: unknown };
type DirectoryClient = { rpc?: (name: string) => PromiseLike<{ data: unknown; error: unknown }> };

/**
 * Loader for the existing authenticated member directory RPC that the 料號申請 owner picker already reads
 * (public account identities only). The workspace passes it down so dialogs never import the data client.
 */
export function createPcbOwnerDirectoryLoader(client: unknown): PcbOwnerDirectoryLoader {
  return async () => {
    const rpc = (client as DirectoryClient | null)?.rpc;
    if (typeof rpc !== "function") throw new Error("member directory unavailable");
    const { data, error } = await rpc.call(client, "list_active_collaboration_members");
    if (error) throw error;
    const rows = Array.isArray(data) ? data as DirectoryRow[] : [];
    return rows.flatMap((row) => {
      const userId = typeof row.user_id === "string" ? row.user_id : "";
      const name = (typeof row.display_name === "string" && row.display_name.trim())
        || (typeof row.username === "string" ? row.username.trim() : "");
      return userId && name ? [{ userId, displayName: name.slice(0, 60) }] : [];
    });
  };
}

/**
 * Members who can be picked as a board's 負責人, loaded only while a board form is open. When the directory is
 * unavailable the picker still offers the current user and names already used on boards.
 */
export function usePcbOwnerDirectory(enabled: boolean, load?: PcbOwnerDirectoryLoader): { members: PcbOwnerMember[]; failed: boolean } {
  const [state, setState] = useState<{ members: PcbOwnerMember[]; failed: boolean }>({ members: [], failed: false });
  useEffect(() => {
    if (!enabled || !load) return;
    let active = true;
    let request: Promise<PcbOwnerMember[]>;
    try {
      request = load();
    } catch {
      setState({ members: [], failed: true });
      return;
    }
    request.then(
      (members) => { if (active) setState({ members, failed: false }); },
      () => { if (active) setState({ members: [], failed: true }); },
    );
    return () => { active = false; };
  }, [enabled, load]);
  return enabled && load ? state : { members: [], failed: false };
}
