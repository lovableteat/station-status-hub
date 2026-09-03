import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "react-router-dom";
import { GitBranch, List, Pencil, RefreshCw, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useUser } from "@/components/auth/UserContext";
import {
  findOrganizationReview,
  organizationTreeMembers,
  validateOrganizationManager,
} from "./organizationData.mjs";
import { PERFORMANCE_STATUS } from "./performanceData.mjs";
import type { PerformanceReview } from "./assessmentTypes";

export interface OrganizationMember {
  employee_id: string;
  username: string;
  display_name: string;
  account_status: string;
  is_manager: boolean;
  manager_id: string | null;
  department: string;
  job_title: string;
  org_level: "director" | "section_chief" | "member";
  section: string;
  performance_role: "none" | "employee" | "manager";
  updated_at: string | null;
}
// New private RPCs are not yet present in the generated database types.
const orgDb = supabase as unknown as {
  rpc: (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<{
    data: OrganizationMember[] | null;
    error: { code?: string; message: string } | null;
  }>;
};
const STATUS: Record<string, string> = {
  unavailable: "尚無可查看紀錄",
  ...Object.fromEntries(
    Object.entries(PERFORMANCE_STATUS).map(([id, value]) => [
      id,
      (value as { label: string }).label,
    ]),
  ),
};
const LEVELS = { director: "部長", section_chief: "課長", member: "一般成員" };

export function PerformanceOrganization({
  reviews,
  cycle,
  onChanged,
}: {
  reviews: PerformanceReview[];
  cycle: string;
  onChanged: () => void;
}) {
  const { user } = useUser();
  const { canEditModule, isPerformanceManager } = usePermissions();
  const administrator = user?.role === "admin" || user?.role === "super_admin";
  const allowed =
    administrator || (isPerformanceManager && canEditModule("performance"));
  const [params, setParams] = useSearchParams();
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<OrganizationMember | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const search = params.get("orgSearch") || "";
  const status = params.get("orgStatus") || "";
  const manager = params.get("orgManager") || "";
  const department = params.get("orgDepartment") || "";
  const section = params.get("orgSection") || "";
  const view = params.get("orgView") === "list" ? "list" : "tree";
  const update = (values: Record<string, string | null>) =>
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      Object.entries(values).forEach(([name, value]) =>
        value ? next.set(name, value) : next.delete(name),
      );
      return next;
    });
  const load = useCallback(async () => {
    if (!allowed) {
      setMembers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await orgDb.rpc("get_performance_organization");
      if (result.error) throw result.error;
      setMembers(result.data || []);
    } catch (cause) {
      setMembers([]);
      const code = (cause as { code?: string }).code;
      setError(
        code === "PGRST202" || code === "42883"
          ? "組織架構服務尚未完成啟用，請由系統管理員完成資料庫更新後重試。"
          : "無法讀取組織架構，請確認主管權限與連線後重試。",
      );
    } finally {
      setLoading(false);
    }
  }, [allowed]);
  useEffect(() => {
    void load();
  }, [load]);
  const byId = useMemo(
    () => new Map(members.map((member) => [member.employee_id, member])),
    [members],
  );
  const managers = members.filter(
    (member) => member.is_manager && member.account_status === "active",
  );
  const departments = [
    ...new Set(members.map((member) => member.department).filter(Boolean)),
  ].sort();
  const sections = [
    ...new Set(members.map((member) => member.section).filter(Boolean)),
  ].sort();
  // Only server-authorized records supply status. A locked row is never
  // presented as missing, nor inferred from administrator status.
  const canInspect = (member: OrganizationMember) =>
    !!findOrganizationReview(member, reviews, cycle);
  const statusOf = (member: OrganizationMember) =>
    findOrganizationReview(member, reviews, cycle)?.status || "unavailable";
  const filtered = members.filter((member) => {
    const managerName = byId.get(member.manager_id || "")?.display_name || "";
    const matchesSearch = [
      member.display_name,
      member.username,
      member.department,
      member.section,
      member.job_title,
      LEVELS[member.org_level],
      managerName,
    ]
      .join(" ")
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase());
    return (
      matchesSearch &&
      (!status || statusOf(member) === status) &&
      (!manager ||
        (manager === "unassigned"
          ? !member.manager_id
          : member.manager_id === manager)) &&
      (!department || member.department === department) &&
      (!section || member.section === section)
    );
  });
  const chips = [
    { key: "orgSearch", value: search, label: `搜尋：${search}` },
    {
      key: "orgStatus",
      value: status,
      label: `考核狀態：${STATUS[status] || status}`,
    },
    {
      key: "orgManager",
      value: manager,
      label: `直屬主管：${manager === "unassigned" ? "未設定" : byId.get(manager)?.display_name || manager}`,
    },
    { key: "orgDepartment", value: department, label: `部門：${department}` },
    { key: "orgSection", value: section, label: `課別：${section}` },
  ].filter((chip) => chip.value);
  const openReview = (member: OrganizationMember) =>
    update({
      performanceTab: "manager",
      performanceSearch: member.display_name,
      performanceReview: null,
    });
  const edit = (member: OrganizationMember) => {
    setEditing({ ...member });
    setSaveError("");
  };
  const save = async () => {
    if (!editing || !administrator || saving) return;
    if (
      editing.org_level === "member" &&
      editing.performance_role === "manager"
    ) {
      setSaveError(
        "此帳號原有主管權限，請先指定部長或課長層級；若改為一般成員，請明確選擇員工自評權限。",
      );
      return;
    }
    const validation = validateOrganizationManager(
      members,
      editing.employee_id,
      editing.manager_id,
    );
    if (validation) {
      setSaveError(validation);
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const { error: failure } = await orgDb.rpc(
        "save_performance_organization_member",
        {
          p_employee_id: editing.employee_id,
          p_manager_id: editing.manager_id,
          p_department: editing.department,
          p_job_title: editing.job_title,
          p_expected_updated_at: editing.updated_at,
          p_performance_role: editing.performance_role,
          p_org_level: editing.org_level,
          p_section: editing.section,
        },
      );
      if (failure) throw failure;
      setEditing(null);
      setNotice("組織資料已儲存，未完成考核已同步至目前的直屬主管。");
      await load();
      onChanged();
    } catch (cause) {
      const code = (cause as { code?: string }).code;
      setSaveError(
        code === "40001"
          ? "組織資料已被其他人更新，請關閉視窗並重新整理後再編輯。"
          : "儲存失敗，請確認管理員權限與主管設定後重試。",
      );
    } finally {
      setSaving(false);
    }
  };
  if (!allowed)
    return <p role="alert">只有績效主管與管理員可以查看組織架構。</p>;
  const matchingIds = new Set(filtered.map((member) => member.employee_id));
  const treeMembers: OrganizationMember[] = organizationTreeMembers(
    members,
    matchingIds,
  );
  const treeIds = new Set(treeMembers.map((member) => member.employee_id));
  const renderNodes = (
    nodes: OrganizationMember[],
    ancestors = new Set<string>(),
  ): ReactNode => (
    <ul className="rd2-org-tree">
      {nodes
        .filter((member) => !ancestors.has(member.employee_id))
        .map((member) => {
          const children = treeMembers.filter(
            (child) => child.manager_id === member.employee_id,
          );
          return (
            <li key={member.employee_id}>
              <div
                className="rd2-org-node"
                data-context={!matchingIds.has(member.employee_id) || undefined}
              >
                <Users aria-hidden="true" />
                <div>
                  <strong>
                    {member.display_name}{" "}
                    <small>{LEVELS[member.org_level]}</small>
                  </strong>
                  <span>
                    {[
                      member.department || "未分配部門",
                      member.section,
                      member.job_title,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    {member.account_status !== "active" ? " · 未啟用" : ""}
                    {member.performance_role === "none" ? " · 未開通績效" : ""}
                  </span>
                </div>
                <small>
                  {children.length ? `${children.length} 位直屬` : ""}
                </small>
                <span>{STATUS[statusOf(member)] || ""}</span>
                {canInspect(member) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => openReview(member)}
                    aria-label={`查看 ${member.display_name} 考核`}
                  >
                    考核紀錄
                  </Button>
                )}
                {administrator && member.account_status === "active" && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => edit(member)}
                    aria-label={`編輯 ${member.display_name} 組織資料`}
                  >
                    <Pencil />
                    編輯
                  </Button>
                )}
              </div>
              {!!children.length &&
                renderNodes(
                  children,
                  new Set([...ancestors, member.employee_id]),
                )}
            </li>
          );
        })}
    </ul>
  );
  return (
    <section className="rd2-organization">
      <header className="rd2-section-heading rd2-org-header">
        <div>
          <h2>組織架構</h2>
          <p>
            部長 → 課長 → 一般成員；一個部可包含多個課。
            {administrator
              ? "從全站帳號設定績效層級與歸屬。"
              : "人員歸屬由管理員設定。"}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={loading}
          onClick={() => void load()}
        >
          <RefreshCw data-icon="inline-start" />
          重新整理組織
        </Button>
      </header>
      {notice && (
        <p role="status" className="rd2-hint">
          {notice}
        </p>
      )}
      <div className="rd2-org-summary">
        <span>
          <strong>{departments.length}</strong> 部
        </span>
        <span>
          <strong>
            {
              new Set(
                members
                  .filter((m) => m.section)
                  .map((m) => `${m.department}:${m.section}`),
              ).size
            }
          </strong>{" "}
          課
        </span>
        <span>
          <strong>{members.length}</strong> 全站帳號
        </span>
        <span>
          <strong>
            {
              members.filter(
                (m) =>
                  m.account_status === "active" &&
                  m.org_level !== "director" &&
                  !m.manager_id,
              ).length
            }
          </strong>{" "}
          待分配人員
        </span>
      </div>
      {error && (
        <p role="alert" className="rd2-error">
          {error}
        </p>
      )}
      <div className="rd2-card rd2-org-results">
        <div className="rd2-org-filters">
          <Field>
            <FieldLabel htmlFor="org-search">搜尋</FieldLabel>
            <Input
              id="org-search"
              value={search}
              placeholder="姓名、帳號、職務或部門"
              onChange={(e) => update({ orgSearch: e.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="org-status">考核狀態</FieldLabel>
            <select
              id="org-status"
              value={status}
              onChange={(e) => update({ orgStatus: e.target.value })}
            >
              <option value="">全部狀態</option>
              {Object.entries(STATUS).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="org-manager">直屬主管</FieldLabel>
            <select
              id="org-manager"
              value={manager}
              onChange={(e) => update({ orgManager: e.target.value })}
            >
              <option value="">全部主管</option>
              <option value="unassigned">未設定</option>
              {managers.map((m) => (
                <option key={m.employee_id} value={m.employee_id}>
                  {m.display_name}
                </option>
              ))}
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="org-department">部門</FieldLabel>
            <select
              id="org-department"
              value={department}
              onChange={(e) => update({ orgDepartment: e.target.value })}
            >
              <option value="">全部部門</option>
              {departments.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="org-section">課別</FieldLabel>
            <select
              id="org-section"
              value={section}
              onChange={(e) => update({ orgSection: e.target.value })}
            >
              <option value="">全部課別</option>
              {sections.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </Field>
          <ToggleGroup
            type="single"
            className="rd2-org-view"
            value={view}
            onValueChange={(value) => {
              if (value) update({ orgView: value === "tree" ? null : "list" });
            }}
            aria-label="組織檢視方式"
          >
            <ToggleGroupItem value="tree" aria-label="架構檢視">
              <GitBranch />
              架構
            </ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="清單檢視">
              <List />
              清單
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        {!!chips.length && (
          <div className="rd2-filter-chips">
            {chips.map((chip) => (
              <Button
                type="button"
                size="sm"
                variant="outline"
                key={chip.key}
                onClick={() => update({ [chip.key]: null })}
                aria-label={`清除${chip.label}`}
              >
                {chip.label}
                <X />
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() =>
                update({
                  orgSearch: null,
                  orgStatus: null,
                  orgManager: null,
                  orgDepartment: null,
                  orgSection: null,
                })
              }
            >
              全部清除
            </Button>
          </div>
        )}
        <p className="rd2-hint">
          顯示 {filtered.length} / {members.length} 位人員
          {view === "tree" && chips.length ? "；上層主管保留為架構參考。" : ""}
        </p>
        {loading ? (
          <p role="status">正在讀取組織架構…</p>
        ) : view === "tree" ? (
          <>
            {filtered.length ? (
              renderNodes(
                treeMembers.filter(
                  (member) =>
                    !member.manager_id || !treeIds.has(member.manager_id),
                ),
              )
            ) : (
              <p>目前篩選條件沒有符合的人員</p>
            )}
          </>
        ) : (
          <div className="rd2-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>人員</th>
                  <th>部／課</th>
                  <th>績效層級</th>
                  <th>直屬主管</th>
                  <th>本期考核</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((member) => (
                  <tr key={member.employee_id}>
                    <td>
                      {member.display_name}
                      <small className="rd2-org-account">
                        {member.username}
                        {member.account_status !== "active" ? " · 未啟用" : ""}
                      </small>
                    </td>
                    <td>
                      {[member.department, member.section]
                        .filter(Boolean)
                        .join("／") || "未分配"}
                    </td>
                    <td>
                      {LEVELS[member.org_level]}
                      {member.performance_role === "none" ? "（未開通）" : ""}
                    </td>
                    <td>
                      {byId.get(member.manager_id || "")?.display_name ||
                        "未設定"}
                    </td>
                    <td>{STATUS[statusOf(member)] || "—"}</td>
                    <td>
                      <div className="rd2-row-actions">
                        {canInspect(member) && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => openReview(member)}
                            aria-label={`查看 ${member.display_name} 考核`}
                          >
                            考核紀錄
                          </Button>
                        )}
                        {administrator &&
                          member.account_status === "active" && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => edit(member)}
                              aria-label={`編輯 ${member.display_name} 組織資料`}
                            >
                              編輯
                            </Button>
                          )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!filtered.length && (
                  <tr>
                    <td colSpan={6}>目前篩選條件沒有符合的人員</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open && !saving) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>編輯 {editing?.display_name} 的組織資料</DialogTitle>
            <DialogDescription>
              變更直屬主管後，未完成考核會交由新主管負責；已完成紀錄保留原考核人。
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <form
              className="rd2-org-edit"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="org-edit-level">績效層級</FieldLabel>
                  <select
                    id="org-edit-level"
                    value={editing.org_level}
                    disabled={saving}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        org_level: e.target
                          .value as OrganizationMember["org_level"],
                        manager_id: null,
                        performance_role:
                          e.target.value === "member" ? "employee" : "manager",
                      })
                    }
                  >
                    {Object.entries(LEVELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="org-edit-manager">直屬主管</FieldLabel>
                  <select
                    id="org-edit-manager"
                    disabled={saving || editing.org_level === "director"}
                    value={editing.manager_id || ""}
                    onChange={(e) => {
                      const parent = byId.get(e.target.value);
                      setEditing({
                        ...editing,
                        manager_id: parent?.employee_id || null,
                        department: parent?.department || editing.department,
                        section:
                          editing.org_level === "member"
                            ? parent?.section || ""
                            : editing.section,
                      });
                    }}
                  >
                    <option value="">
                      {editing.org_level === "director"
                        ? "部長為最上層"
                        : "待分配"}
                    </option>
                    {managers
                      .filter(
                        (m) =>
                          m.employee_id !== editing.employee_id &&
                          m.org_level ===
                            (editing.org_level === "section_chief"
                              ? "director"
                              : "section_chief"),
                      )
                      .map((m) => (
                        <option key={m.employee_id} value={m.employee_id}>
                          {m.display_name} · {m.department}
                          {m.section ? `／${m.section}` : ""}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="org-edit-dept">部名稱</FieldLabel>
                  <Input
                    id="org-edit-dept"
                    maxLength={100}
                    required={editing.org_level === "director"}
                    disabled={saving || !!editing.manager_id}
                    value={editing.department}
                    onChange={(e) =>
                      setEditing({ ...editing, department: e.target.value })
                    }
                  />
                </Field>
                {editing.org_level !== "director" && (
                  <Field>
                    <FieldLabel htmlFor="org-edit-section">課名稱</FieldLabel>
                    <Input
                      id="org-edit-section"
                      maxLength={100}
                      required={editing.org_level === "section_chief"}
                      disabled={
                        saving ||
                        (editing.org_level === "member" && !!editing.manager_id)
                      }
                      value={editing.section}
                      onChange={(e) =>
                        setEditing({ ...editing, section: e.target.value })
                      }
                    />
                  </Field>
                )}
                <Field>
                  <FieldLabel htmlFor="org-edit-title">職務</FieldLabel>
                  <Input
                    id="org-edit-title"
                    maxLength={100}
                    disabled={saving}
                    value={editing.job_title}
                    onChange={(e) =>
                      setEditing({ ...editing, job_title: e.target.value })
                    }
                  />
                </Field>
                {editing.org_level === "member" && (
                  <Field>
                    <FieldLabel htmlFor="org-edit-access">績效權限</FieldLabel>
                    <select
                      id="org-edit-access"
                      disabled={saving}
                      value={editing.performance_role}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          performance_role: e.target
                            .value as OrganizationMember["performance_role"],
                        })
                      }
                    >
                      {editing.performance_role === "manager" && (
                        <option value="manager" disabled>
                          原有主管（請指定組織層級）
                        </option>
                      )}
                      <option value="employee">開通員工自評</option>
                      <option value="none">不開通績效管理</option>
                    </select>
                  </Field>
                )}
                <p className="rd2-hint">
                  只調整績效權限，其他工作區與全站帳號角色維持原設定。部長可查看所屬各課；課長可查看課內成員。密碼保護仍適用。
                </p>
                {saveError && (
                  <p className="rd2-error" role="alert">
                    {saveError}
                  </p>
                )}
                <div className="rd2-actions">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={saving}
                    onClick={() => setEditing(null)}
                  >
                    取消
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? "儲存中…" : "儲存組織資料"}
                  </Button>
                </div>
              </FieldGroup>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
