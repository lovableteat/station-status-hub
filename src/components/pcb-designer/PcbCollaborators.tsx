import type { CSSProperties } from "react";
import { Eye, PencilLine, Users } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { PcbAccessMode, PcbProjectPeer, PcbViewMode } from "./hooks/usePcbProjectPresence.ts";

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
  currentProjectId,
  currentProjectName,
  currentUser,
  dirty,
  accessMode,
  lockEditorName,
  peers,
  viewMode,
  workspaceConnected,
  workspacePeers,
}: {
  connected: boolean;
  currentProjectId: string;
  currentProjectName: string;
  currentUser: CurrentUser | null;
  dirty: boolean;
  accessMode: PcbAccessMode;
  lockEditorName: string | null;
  peers: PcbProjectPeer[];
  viewMode: PcbViewMode;
  workspaceConnected: boolean;
  workspacePeers: PcbProjectPeer[];
}) {
  const currentName = currentUser?.displayName || currentUser?.username || "訪客";
  const localPeer: PcbProjectPeer = {
    displayName: currentName,
    dirty,
    projectId: currentProjectId,
    projectName: currentProjectName,
    tabId: "current-tab",
    userId: currentUser?.userId ?? "guest",
    username: currentUser?.username ?? "guest",
    viewMode,
    accessMode,
  };
  const remoteSessions = workspacePeers.length > 0 ? workspacePeers : peers;
  const sessions = [localPeer, ...remoteSessions];
  const peopleCount = new Set(sessions.map((peer) => peer.userId)).size;
  const projectGroups = [...sessions.reduce((groups, peer) => {
    const group = groups.get(peer.projectId) ?? {
      projectId: peer.projectId,
      projectName: peer.projectName || "未命名板子",
      peers: [] as PcbProjectPeer[],
    };
    group.peers.push(peer);
    groups.set(peer.projectId, group);
    return groups;
  }, new Map<string, { projectId: string; projectName: string; peers: PcbProjectPeer[] }>()).values()]
    .sort((left, right) => {
      if (left.projectId === currentProjectId) return -1;
      if (right.projectId === currentProjectId) return 1;
      const leftHasEditor = left.peers.some((peer) => peer.accessMode === "editor");
      const rightHasEditor = right.peers.some((peer) => peer.accessMode === "editor");
      if (leftHasEditor !== rightHasEditor) return leftHasEditor ? -1 : 1;
      return left.projectName.localeCompare(right.projectName, "zh-Hant");
    });
  const visiblePeers = sessions.slice(0, 3);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="pcb-collaborator-trigger"
          aria-label={`PCB 即時協作 ${peopleCount} 人，${projectGroups.length} 塊板`}
          title="查看所有人正在編輯或檢視的板子"
        >
          <span className="pcb-collaborator-trigger-avatars" aria-hidden="true">
            {visiblePeers.map((peer) => (
              <span
                key={peer.tabId}
                className={`pcb-collaborator-avatar ${peer.tabId === "current-tab" ? "is-current" : ""}`}
                style={{ "--pcb-avatar-color": avatarColor(peer.userId) } as CSSProperties}
              >
                {initials(peer.displayName)}
              </span>
            ))}
          </span>
          <span className="pcb-collaborator-trigger-copy">
            <strong><Users aria-hidden="true" />協作 {peopleCount} 人</strong>
            <small>{projectGroups.length} 塊板正在使用</small>
          </span>
          <i className={workspaceConnected ? "is-online" : ""} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="pcb-collaborator-popover">
        <div className="pcb-collaborator-heading">
          <div>
            <strong>PCB 即時協作</strong>
            <span>{workspaceConnected ? "全工作區已連線" : "正在連線"}</span>
          </div>
          <span>{peopleCount} 人 · {projectGroups.length} 板</span>
        </div>

        <div className="pcb-collaborator-projects">
          {projectGroups.map((group) => {
            const editors = group.peers.filter((peer) => peer.accessMode === "editor");
            const viewers = group.peers.filter((peer) => peer.accessMode === "viewer");
            return (
              <section key={group.projectId} className="pcb-collaborator-project">
                <header className="pcb-collaborator-project-head">
                  <span>
                    <strong>{group.projectName}</strong>
                    <small>{editors.length ? "有人正在編輯" : "目前僅供檢視"}</small>
                  </span>
                  {group.projectId === currentProjectId && <b>目前板子</b>}
                </header>

                <div className="pcb-collaborator-project-people">
                  {editors.map((peer) => (
                    <div key={peer.tabId} className="pcb-collaborator-person is-editor">
                      <span
                        className="pcb-collaborator-avatar"
                        style={{ "--pcb-avatar-color": avatarColor(peer.userId) } as CSSProperties}
                      >
                        {initials(peer.displayName)}
                      </span>
                      <span>
                        <strong>{peer.displayName}{peer.tabId === "current-tab" ? "（你）" : ""}</strong>
                        <small>
                          <PencilLine aria-hidden="true" />
                          {peer.viewMode.toUpperCase()} · {peer.dirty ? "編輯中，尚未儲存" : "編輯中"}
                        </small>
                      </span>
                      <i className={peer.dirty ? "is-editing" : "is-online"} />
                    </div>
                  ))}
                  {viewers.length > 0 && (
                    <div className="pcb-collaborator-viewers">
                      <Eye aria-hidden="true" />
                      <span>
                        <strong>{viewers.length} 人即時檢視</strong>
                        <small>{viewers.map((peer) => `${peer.displayName}${peer.tabId === "current-tab" ? "（你）" : ""}`).join("、")}</small>
                      </span>
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>

        <p className="pcb-collaborator-note">
          {!connected && accessMode === "viewer" && lockEditorName
            ? `目前由 ${lockEditorName} 編輯；你會即時看到已儲存版本。`
            : "同案協作一次只允許一人編輯；其他人會自動切換成即時檢視。"}
        </p>
      </PopoverContent>
    </Popover>
  );
}
