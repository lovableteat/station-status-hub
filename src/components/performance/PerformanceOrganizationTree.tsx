import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronUp,
  Network,
  Pencil,
  Plus,
  UserMinus,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  OrganizationMember,
  OrganizationAddOptions,
} from "./PerformanceOrganization";

const LEVELS = { director: "部長", section_chief: "課長", member: "一般同仁" };
type Props = {
  members: OrganizationMember[];
  matchingIds: Set<string>;
  administrator: boolean;
  canAdd: boolean;
  filtering: boolean;
  emptyOrganization: boolean;
  statusOf: (member: OrganizationMember) => string;
  canInspect: (member: OrganizationMember) => boolean;
  onInspect: (member: OrganizationMember) => void;
  onEdit: (member: OrganizationMember) => void;
  onRemove: (member: OrganizationMember) => void;
  onAdd: (
    parent?: OrganizationMember,
    options?: OrganizationAddOptions,
  ) => void;
};

export function PerformanceOrganizationTree({
  members,
  matchingIds,
  administrator,
  canAdd,
  filtering,
  emptyOrganization,
  statusOf,
  canInspect,
  onInspect,
  onEdit,
  onRemove,
  onAdd,
}: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const viewport = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const panning = useRef<{ x: number; y: number; left: number; top: number } | null>(
    null,
  );
  const ZOOM_MIN = 0.4;
  const ZOOM_MAX = 1.6;
  const clampZoom = (value: number) =>
    Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value * 100) / 100));
  const stepZoom = (delta: number) => setZoom((value) => clampZoom(value + delta));

  /** Ctrl/⌘ + wheel zooms; a plain wheel keeps scrolling the viewport. */
  const onWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    stepZoom(event.deltaY > 0 ? -0.1 : 0.1);
  };

  /** Drag anywhere that is not a control to pan the chart. */
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button, a, input, select")) return;
    const node = viewport.current;
    if (!node) return;
    panning.current = {
      x: event.clientX,
      y: event.clientY,
      left: node.scrollLeft,
      top: node.scrollTop,
    };
    node.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = panning.current;
    const node = viewport.current;
    if (!start || !node) return;
    node.scrollLeft = start.left - (event.clientX - start.x);
    node.scrollTop = start.top - (event.clientY - start.y);
  };
  const endPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!panning.current) return;
    panning.current = null;
    viewport.current?.releasePointerCapture(event.pointerId);
  };
  const { roots, children } = useMemo(() => {
    const ids = new Set(members.map((member) => member.employee_id));
    const children = new Map<string, OrganizationMember[]>();
    const roots: OrganizationMember[] = [];
    for (const member of members) {
      if (!member.manager_id || !ids.has(member.manager_id)) roots.push(member);
      else
        children.set(member.manager_id, [
          ...(children.get(member.manager_id) || []),
          member,
        ]);
    }
    return { roots, children };
  }, [members]);
  const rootKey = roots.map((member) => member.employee_id).join(":");
  const centerRoot = () => {
    const container = viewport.current;
    const node = container?.querySelector<HTMLElement>(
      ".rd2-orgchart-roots > li > article",
    );
    if (!container || !node) return;
    const box = container.getBoundingClientRect();
    const card = node.getBoundingClientRect();
    container.scrollLeft +=
      card.left + card.width / 2 - box.left - box.width / 2;
  };
  useEffect(() => {
    centerRoot();
  }, [rootKey, emptyOrganization]);
  const toggle = (id: string) =>
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const renderNode = (
    member: OrganizationMember,
    ancestors = new Set<string>(),
  ): ReactNode => {
    if (ancestors.has(member.employee_id)) return null;
    const reports = children.get(member.employee_id) || [];
    // Members reporting straight to a director are genuine direct reports
    // (their manager_id is the director), so they hang off the director node
    // instead of a synthetic "代理課" grouping. Each card still shows its own
    // 課別, so nothing is lost by dropping the wrapper.
    // A director can have both 課長 and its own members. Rendering them as
    // siblings puts a 一般同仁 on the 課長 row; keep the chiefs on that row and
    // drop the director's own members through an unlabelled branch so every
    // member lands on the bottom row.
    const chiefReports =
      member.org_level === "director"
        ? reports.filter((child) => child.org_level !== "member")
        : reports;
    const passthroughReports =
      member.org_level === "director"
        ? reports.filter((child) => child.org_level === "member")
        : [];
    const open = filtering || !collapsed.has(member.employee_id);
    const parentMissing = member.org_level !== "director" && !member.manager_id;
    const addLabel = member.org_level === "director" ? "新增課長" : "新增同仁";
    return (
      <li key={member.employee_id}>
        <article
          className="rd2-orgchart-node"
          data-level={member.org_level}
          data-context={!matchingIds.has(member.employee_id) || undefined}
          aria-label={`${LEVELS[member.org_level]} ${member.display_name}`}
        >
          <div className="rd2-orgchart-node-top">
            <span className="rd2-orgchart-level">
              {LEVELS[member.org_level]}
            </span>
            <span className="rd2-orgchart-unit">
              {member.section || member.department || "未分配部門"}
            </span>
          </div>
          <div className="rd2-orgchart-person">
            <span className="rd2-orgchart-avatar" aria-hidden="true">
              {member.display_name.slice(0, 1)}
            </span>
            <div>
              <strong>{member.display_name}</strong>
              <span>{member.job_title || member.username}</span>
            </div>
          </div>
          <p className="rd2-orgchart-note">
            {parentMissing
              ? "待指定直屬主管"
              : member.org_level === "member"
                ? member.department
                : `${reports.length} 位直屬`}
            {member.account_status !== "active"
              ? " · 未啟用"
              : member.performance_role === "none"
                ? " · 未開通績效"
                : ""}
          </p>
          <div className="rd2-orgchart-review">
            <span>{statusOf(member)}</span>
            {canInspect(member) && (
              <button
                type="button"
                onClick={() => onInspect(member)}
                aria-label={`查看 ${member.display_name} 考核`}
              >
                考核紀錄
              </button>
            )}
          </div>
          {administrator && (
            <div className="rd2-orgchart-node-actions">
              <button
                type="button"
                disabled={member.account_status !== "active"}
                onClick={() => onEdit(member)}
                aria-label={`編輯 ${member.display_name} 組織資料`}
              >
                <Pencil />
                編輯
              </button>
              <button
                type="button"
                onClick={() => onRemove(member)}
                aria-label={`移除 ${member.display_name} 組織分類`}
              >
                <UserMinus />
                移除分類
              </button>
            </div>
          )}
          {administrator &&
            member.org_level !== "member" &&
            member.is_manager &&
            member.account_status === "active" && (
              <button
                type="button"
                className="rd2-orgchart-add"
                disabled={!canAdd}
                onClick={() => {
                  setCollapsed((previous) => {
                    const next = new Set(previous);
                    next.delete(member.employee_id);
                    return next;
                  });
                  onAdd(member);
                }}
                aria-label={`在 ${member.display_name} 下${addLabel}`}
              >
                <Plus />
                {addLabel}
              </button>
            )}
          {reports.length > 0 && (
            <button
              type="button"
              className="rd2-orgchart-branch-toggle"
              disabled={filtering}
              aria-expanded={open}
              onClick={() => toggle(member.employee_id)}
              aria-label={`${open ? "收合" : "展開"} ${member.display_name} 的下屬`}
            >
              {open ? <ChevronUp /> : <ChevronDown />}
              {open ? "收合" : `${reports.length} 位直屬`}
            </button>
          )}
          {administrator &&
            member.org_level === "director" &&
            member.is_manager &&
            member.account_status === "active" && (
              <button
                type="button"
                className="rd2-orgchart-add"
                disabled={!canAdd}
                aria-label={`在 ${member.display_name} 代理的課新增同仁`}
                onClick={() => {
                  setCollapsed((previous) => {
                    const next = new Set(previous);
                    next.delete(member.employee_id);
                    return next;
                  });
                  onAdd(member, { org_level: "member" });
                }}
              >
                <Plus />
                新增代理課同仁
              </button>
            )}
        </article>
        {reports.length > 0 && open && (
          <ul>
            {chiefReports.map((child) =>
              renderNode(child, new Set([...ancestors, member.employee_id])),
            )}
            {passthroughReports.length > 0 && (
              <li className="rd2-orgchart-passthrough">
                <ul>
                  {passthroughReports.map((child) =>
                    renderNode(child, new Set([...ancestors, member.employee_id])),
                  )}
                </ul>
              </li>
            )}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div className="rd2-orgchart">
      <div className="rd2-orgchart-toolbar">
        <span className="rd2-orgchart-title">
          <Network aria-hidden="true" />
          {emptyOrganization ? "組織層級示意" : "組織架構樹狀圖"}
        </span>
        <div className="rd2-orgchart-controls">
          {!emptyOrganization && (
            <>
              <Button
                size="sm"
                variant="ghost"
                disabled={filtering}
                onClick={() => setCollapsed(new Set())}
              >
                全部展開
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={filtering}
                onClick={() => setCollapsed(new Set(children.keys()))}
              >
                全部收合
              </Button>
            </>
          )}
          <div className="rd2-orgchart-zoom" role="group" aria-label="縮放">
            <Button
              size="sm"
              variant="ghost"
              aria-label="縮小"
              disabled={zoom <= ZOOM_MIN}
              onClick={() => stepZoom(-0.1)}
            >
              −
            </Button>
            <button
              type="button"
              className="rd2-orgchart-zoom-value"
              title="回到 100%"
              onClick={() => setZoom(1)}
            >
              {Math.round(zoom * 100)}%
            </button>
            <Button
              size="sm"
              variant="ghost"
              aria-label="放大"
              disabled={zoom >= ZOOM_MAX}
              onClick={() => stepZoom(0.1)}
            >
              ＋
            </Button>
          </div>
          <Button size="sm" variant="ghost" onClick={centerRoot}>
            回到頂層
          </Button>
        </div>
      </div>
      {emptyOrganization && (
        <div className="rd2-orgchart-empty-intro">
          <strong>先設定部長，建立第一個部門</strong>
          <p>
            {administrator
              ? "下方為層級示意。選擇部長後，即可在節點下新增課長與同仁。"
              : "下方為層級示意，實際人員由管理員設定。"}
          </p>
        </div>
      )}
      <div
        ref={viewport}
        className="rd2-orgchart-viewport"
        role="region"
        aria-label="組織樹狀圖，可拖曳平移，Ctrl 加滾輪縮放"
        tabIndex={0}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
      >
        <div
          className="rd2-orgchart-canvas"
          style={{ zoom }}
        >
          {emptyOrganization ? (
            <ul className="rd2-orgchart-roots rd2-orgchart-placeholder">
              <li>
                <article className="rd2-orgchart-node" data-level="director">
                  <Network aria-hidden="true" />
                  <strong>部長</strong>
                  <span>尚未指定人員</span>
                  {administrator && (
                    <Button onClick={() => onAdd()} disabled={!canAdd}>
                      <Plus />
                      選擇部長
                    </Button>
                  )}
                </article>
                <ul>
                  {["第一個課", "另一個課"].map((label) => (
                    <li key={label}>
                      <article
                        className="rd2-orgchart-node"
                        data-level="section_chief"
                      >
                        <Users aria-hidden="true" />
                        <strong>課長</strong>
                        <span>{label} · 待設定</span>
                      </article>
                      <ul>
                        <li>
                          <article
                            className="rd2-orgchart-node"
                            data-level="member"
                          >
                            <Users aria-hidden="true" />
                            <strong>一般同仁</strong>
                            <span>依直屬課長歸屬</span>
                          </article>
                        </li>
                      </ul>
                    </li>
                  ))}
                </ul>
              </li>
            </ul>
          ) : roots.length ? (
            <ul className="rd2-orgchart-roots">
              {roots.map((member) => renderNode(member))}
            </ul>
          ) : (
            <p className="rd2-empty">目前篩選條件沒有符合的人員</p>
          )}
        </div>
      </div>
    </div>
  );
}
