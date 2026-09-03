import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  GitBranch,
  List,
  Pencil,
  Plus,
  RefreshCw,
  UserMinus,
  X,
} from "lucide-react";
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
  availableOrganizationMembers,
  isOrganizationAssigned,
} from "./organizationData.mjs";
import { PERFORMANCE_STATUS } from "./performanceData.mjs";
import type { PerformanceReview } from "./assessmentTypes";
import { PerformanceOrganizationTree } from "./PerformanceOrganizationTree";

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
export interface OrganizationAddOptions {
  org_level?: OrganizationMember["org_level"];
  section?: string;
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
const blankMember = (): OrganizationMember => ({
  employee_id: "",
  username: "",
  display_name: "",
  account_status: "active",
  is_manager: false,
  manager_id: null,
  department: "",
  job_title: "",
  org_level: "director",
  section: "",
  performance_role: "manager",
  updated_at: null,
});

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
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<OrganizationMember | null>(null);
  const [removalError, setRemovalError] = useState("");
  const [removalSaving, setRemovalSaving] = useState(false);
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
  const assignedMembers = members.filter(isOrganizationAssigned);
  const availableMembers: OrganizationMember[] =
    availableOrganizationMembers(members);
  const managers = assignedMembers.filter(
    (member) => member.is_manager && member.account_status === "active",
  );
  const departments = [
    ...new Set(
      assignedMembers.map((member) => member.department).filter(Boolean),
    ),
  ].sort();
  const sections = [
    ...new Set(assignedMembers.map((member) => member.section).filter(Boolean)),
  ].sort();
  // Only server-authorized records supply status. A locked row is never
  // presented as missing, nor inferred from administrator status.
  const canInspect = (member: OrganizationMember) =>
    !!findOrganizationReview(member, reviews, cycle);
  const statusOf = (member: OrganizationMember) =>
    findOrganizationReview(member, reviews, cycle)?.status || "unavailable";
  const filtered = assignedMembers.filter((member) => {
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
  const addMember = (
    parent?: OrganizationMember,
    options: OrganizationAddOptions = {},
  ) => {
    if (!administrator || loading || error || !availableMembers.length) return;
    const org_level =
      options.org_level ||
      (parent
        ? parent.org_level === "director"
          ? "section_chief"
          : "member"
        : "director");
    setAdding(true);
    setEditing({
      ...blankMember(),
      org_level,
      manager_id: parent?.employee_id || null,
      department: parent?.department || "",
      section:
        options.section ??
        (org_level === "member" ? parent?.section || "" : ""),
      performance_role: org_level === "member" ? "employee" : "manager",
    });
    setSaveError("");
  };
  const edit = (member: OrganizationMember) => {
    setAdding(false);
    setEditing({ ...member });
    setSaveError("");
  };
  const save = async () => {
    if (!editing || !administrator || saving) return;
    if (
      !editing.employee_id ||
      (adding &&
        !availableMembers.some(
          (member) => member.employee_id === editing.employee_id,
        ))
    ) {
      setSaveError("請從尚未分類的人員選單選擇帳號。");
      return;
    }
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
    if (
      editing.org_level === "member" &&
      byId.get(editing.manager_id || "")?.org_level === "director" &&
      !editing.section.trim()
    ) {
      setSaveError("請填寫由部長代理的課名稱。");
      return;
    }
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
      if (adding && code === "40001") {
        await load();
        setEditing((current) =>
          current
            ? { ...current, employee_id: "", username: "", display_name: "" }
            : null,
        );
      }
      setSaveError(
        code === "40001"
          ? adding
            ? "此人員已被加入組織，選單已更新，請重新選擇。"
            : "組織資料已被其他人更新，請關閉視窗並重新整理後再編輯。"
          : "儲存失敗，請確認管理員權限與主管設定後重試。",
      );
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!administrator || !removing || removalSaving) return;
    setRemovalSaving(true);
    setRemovalError("");
    try {
      const result = await orgDb.rpc("remove_performance_organization_member", {
        p_employee_id: removing.employee_id,
        p_expected_updated_at: removing.updated_at,
      });
      if (result.error) throw result.error;
      setRemoving(null);
      setNotice(
        "已移除組織分類；啟用中的帳號已重新加入人員選單。考核內容與密碼保護保留。",
      );
      await load();
      onChanged();
    } catch (cause) {
      const code = (cause as { code?: string }).code;
      setRemovalError(
        code === "23503"
          ? "此人員仍有下屬，請先調整或移除下屬分類。"
          : code === "40001"
            ? "組織資料已更新，請關閉視窗並重新整理後再移除。"
            : "移除失敗，請確認管理員權限與連線後重試。",
      );
    } finally {
      setRemovalSaving(false);
    }
  };
  const removeButton = (member: OrganizationMember) =>
    administrator && (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-label={`移除 ${member.display_name} 組織分類`}
        onClick={() => {
          setRemoving(member);
          setRemovalError("");
        }}
      >
        <UserMinus />
        移除分類
      </Button>
    );
  if (!allowed)
    return <p role="alert">只有績效主管與管理員可以查看組織架構。</p>;
  const matchingIds = new Set(filtered.map((member) => member.employee_id));
  const treeMembers: OrganizationMember[] = organizationTreeMembers(
    assignedMembers,
    matchingIds,
  );
  return (
    <section className="rd2-organization">
      <header className="rd2-section-heading rd2-org-header">
        <div>
          <h2>組織架構樹狀圖</h2>
          <p>
            部長 → 課長 → 一般成員；沒有課長時，可由部長代理並直接管理該課同仁。
            {administrator
              ? "從全站帳號設定績效層級與歸屬。"
              : "人員歸屬由管理員設定。"}
          </p>
        </div>
        <div className="rd2-actions">
          {administrator && (
            <Button
              type="button"
              disabled={loading || !!error || !availableMembers.length}
              onClick={() => addMember()}
            >
              <Plus />
              新增組織人員
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => void load()}
          >
            <RefreshCw data-icon="inline-start" />
            重新整理組織
          </Button>
        </div>
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
                assignedMembers
                  .filter((m) => m.section)
                  .map((m) => `${m.department}:${m.section}`),
              ).size
            }
          </strong>{" "}
          課
        </span>
        <span>
          <strong>{assignedMembers.length}</strong> 已分類人員
        </span>
        <span>
          <strong>{availableMembers.length}</strong> 可新增人員
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
            <ToggleGroupItem value="tree" aria-label="樹狀圖檢視">
              <GitBranch />
              樹狀圖
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
          顯示 {filtered.length} / {assignedMembers.length} 位已分類人員
          {view === "tree" && chips.length ? "；上層主管保留為架構參考。" : ""}
        </p>
        {loading ? (
          <p role="status">正在讀取組織架構…</p>
        ) : error ? (
          <p role="status">組織資料暫時無法顯示，請重新整理組織。</p>
        ) : view === "tree" ? (
          <PerformanceOrganizationTree
            members={treeMembers}
            matchingIds={matchingIds}
            administrator={administrator}
            canAdd={availableMembers.length > 0}
            filtering={chips.length > 0}
            emptyOrganization={
              assignedMembers.length === 0 && chips.length === 0
            }
            statusOf={(member) => STATUS[statusOf(member)] || ""}
            canInspect={canInspect}
            onInspect={openReview}
            onEdit={edit}
            onRemove={(member) => {
              setRemovalError("");
              setRemoving(member);
            }}
            onAdd={addMember}
          />
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
                        {removeButton(member)}
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
            <DialogTitle>
              {adding
                ? "新增組織人員"
                : `編輯 ${editing?.display_name} 的組織資料`}
            </DialogTitle>
            <DialogDescription>
              {adding
                ? "選擇層級與尚未分類的人員，再設定所屬部門及主管。"
                : "變更直屬主管後，未完成考核會交由新主管負責；已完成紀錄保留原考核人。"}
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
                {adding && (
                  <Field>
                    <FieldLabel htmlFor="org-edit-person">
                      選擇
                      {editing.org_level === "member"
                        ? "一般成員"
                        : LEVELS[editing.org_level]}{" "}
                      *
                    </FieldLabel>
                    <select
                      id="org-edit-person"
                      required
                      disabled={saving}
                      value={editing.employee_id}
                      onChange={(event) => {
                        const account = availableMembers.find(
                          (member) => member.employee_id === event.target.value,
                        );
                        setEditing({
                          ...editing,
                          employee_id: account?.employee_id || "",
                          username: account?.username || "",
                          display_name: account?.display_name || "",
                        });
                        setSaveError("");
                      }}
                    >
                      <option value="">請選擇尚未分類的人員</option>
                      {availableMembers.map((account) => (
                        <option
                          key={account.employee_id}
                          value={account.employee_id}
                        >
                          {account.display_name}（{account.username}）
                        </option>
                      ))}
                    </select>
                    <p className="rd2-hint">
                      已分類者不會重複出現；尚有 {availableMembers.length}{" "}
                      位啟用帳號可選。
                    </p>
                  </Field>
                )}
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
                          editing.org_level === "member" &&
                          parent?.org_level === "section_chief"
                            ? parent.section
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
                          editing.org_level !== "director" &&
                          m.employee_id !== editing.employee_id &&
                          (editing.org_level === "section_chief"
                            ? m.org_level === "director"
                            : m.org_level === "section_chief" ||
                              m.org_level === "director"),
                      )
                      .map((m) => (
                        <option key={m.employee_id} value={m.employee_id}>
                          {m.display_name} · {m.department}
                          {m.section ? `／${m.section}` : ""}
                          {editing.org_level === "member" &&
                          m.org_level === "director"
                            ? "（部長代理）"
                            : ""}
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
                      required={
                        editing.org_level === "section_chief" ||
                        byId.get(editing.manager_id || "")?.org_level ===
                          "director"
                      }
                      disabled={
                        saving ||
                        (editing.org_level === "member" &&
                          byId.get(editing.manager_id || "")?.org_level ===
                            "section_chief")
                      }
                      value={editing.section}
                      onChange={(e) =>
                        setEditing({ ...editing, section: e.target.value })
                      }
                    />
                    {editing.org_level === "member" &&
                      byId.get(editing.manager_id || "")?.org_level ===
                        "director" && (
                        <p className="rd2-hint">
                          此課由部長代理。填寫課名稱後，同課同仁會集中顯示在「部長代理」節點下，考核交由該部長負責。
                        </p>
                      )}
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
                  只調整績效權限，其他工作區與全站帳號角色維持原設定。課長只評核直屬職員，部長只評核直屬課長及審閱課長彙整；代理課同仁由部長直接評核。密碼保護仍適用。
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
                  <Button
                    type="submit"
                    disabled={saving || !editing.employee_id}
                  >
                    {saving ? "儲存中…" : adding ? "加入組織" : "儲存組織資料"}
                  </Button>
                </div>
              </FieldGroup>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!removing}
        onOpenChange={(open) => {
          if (!open && !removalSaving) setRemoving(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              移除 {removing?.display_name} 的組織分類？
            </DialogTitle>
            <DialogDescription>
              移除後，啟用中的帳號會重新出現在人員下拉選單。全站帳號、自評與既有密碼保護會保留，績效主管身分會解除。若仍有下屬，請先調整下屬分類。
            </DialogDescription>
          </DialogHeader>
          {removalError && (
            <p role="alert" className="rd2-error">
              {removalError}
            </p>
          )}
          <div className="rd2-actions">
            <Button
              variant="outline"
              disabled={removalSaving}
              onClick={() => setRemoving(null)}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={removalSaving}
              onClick={() => void remove()}
            >
              {removalSaving ? "移除中…" : "確認移除分類"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
