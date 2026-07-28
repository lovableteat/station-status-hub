import { Users } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { PcbProjectPeer, PcbViewMode } from "./hooks/usePcbProjectPresence.ts";

interface CurrentUser {
  displayName: string;
  userId: string;
  username: string;
}

const AVATAR_COLORS = ["#4fc3e6", "#72d5ae", "#f2b65c", "#f07f91", "#8ea9ff"];

function initials(name: string) {
  const chunks = name.trim().split(/\s+/).filter(Boolean);
  if (!chunks.length) return "?";
  return chunks.slice(0, 2).map((chunk) => chunk[0]).join("").toLocaleUpperCase();
}

function avatarColor(id: string) {
  const score = [...id].reduce((total, character) => total + character.charCodeAt(0), 0);
  return AVATAR_COLORS[score % AVATAR_COLORS.length];
}

export function PcbCollaborators({
  connected,
  currentUser,
  dirty,
  peers,
  viewMode,
}: {
  connected: boolean;
  currentUser: CurrentUser | null;
  dirty: boolean;
  peers: PcbProjectPeer[];
  viewMode: PcbViewMode;
}) {
  const visiblePeers = peers.slice(0, 3);
  const currentName = currentUser?.displayName || currentUser?.username || "訪客";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="pcb-collaborator-trigger"
          aria-label={`同案編輯者 ${peers.length + 1} 人`}
          title="查看同案編輯者"
        >
          <span
            className="pcb-collaborator-avatar is-current"
            style={{ "--pcb-avatar-color": avatarColor(currentUser?.userId ?? "guest") } as React.CSSProperties}
          >
            {initials(currentName)}
          </span>
          {visiblePeers.map((peer) => (
            <span
              key={peer.tabId}
              className="pcb-collaborator-avatar"
              style={{ "--pcb-avatar-color": avatarColor(peer.userId) } as React.CSSProperties}
            >
              {initials(peer.displayName)}
            </span>
          ))}
          {peers.length > visiblePeers.length && (
            <span className="pcb-collaborator-more">+{peers.length - visiblePeers.length}</span>
          )}
          <span className="pcb-collaborator-count">
            <Users aria-hidden="true" />
            {peers.length + 1}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="pcb-collaborator-popover">
        <div className="pcb-collaborator-heading">
          <div>
            <strong>同案編輯者</strong>
            <span>{connected ? "即時連線中" : "正在連線"}</span>
          </div>
          <span>{peers.length + 1} 人</span>
        </div>
        <div className="pcb-collaborator-list">
          <div className="pcb-collaborator-person">
            <span
              className="pcb-collaborator-avatar"
              style={{ "--pcb-avatar-color": avatarColor(currentUser?.userId ?? "guest") } as React.CSSProperties}
            >
              {initials(currentName)}
            </span>
            <span><strong>{currentName}（你）</strong><small>{viewMode.toUpperCase()} · {dirty ? "編輯中，尚未儲存" : "已儲存"}</small></span>
            <i className="is-online" />
          </div>
          {peers.map((peer) => (
            <div key={peer.tabId} className="pcb-collaborator-person">
              <span
                className="pcb-collaborator-avatar"
                style={{ "--pcb-avatar-color": avatarColor(peer.userId) } as React.CSSProperties}
              >
                {initials(peer.displayName)}
              </span>
              <span><strong>{peer.displayName}</strong><small>{peer.viewMode.toUpperCase()} · {peer.dirty ? "編輯中，尚未儲存" : "已儲存"}</small></span>
              <i className={peer.dirty ? "is-editing" : "is-online"} />
            </div>
          ))}
        </div>
        <p className="pcb-collaborator-note">此處顯示目前開啟同一專案的人員與編輯狀態。</p>
      </PopoverContent>
    </Popover>
  );
}
