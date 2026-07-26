import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  LockKeyhole,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { Database } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";

import type { SystemFieldType } from "./systemMetadata";

type SystemFieldRow =
  Database["public"]["Tables"]["test_project_system_fields"]["Row"];

export type SystemFieldCategory = "software" | "statistics";

export type MetadataFieldDefinition = Omit<
  SystemFieldRow,
  "category" | "field_type"
> & {
  category: SystemFieldCategory;
  field_type: SystemFieldType;
};

export interface MetadataFieldDraft {
  category: SystemFieldCategory;
  field_key: string;
  field_type: SystemFieldType;
  is_required: boolean;
  label: string;
  options: string[];
  optionsText: string;
  placeholder: string;
}

export type SystemMetadataFieldErrors = Record<
  string,
  Record<string, string | undefined> | undefined
>;

interface SystemMetadataFieldsEditorProps {
  fields: MetadataFieldDefinition[];
  values: Record<string, unknown>;
  errors: SystemMetadataFieldErrors;
  onCreateField: (draft: MetadataFieldDraft) => Promise<boolean>;
  onUpdateField: (
    field: MetadataFieldDefinition,
    draft: MetadataFieldDraft,
  ) => Promise<boolean>;
  onDeleteField: (field: MetadataFieldDefinition) => Promise<boolean>;
  onReorderFields: (fields: MetadataFieldDefinition[]) => Promise<boolean>;
  onValueChange: (fieldId: string, value: unknown) => void;
}

const inputClass =
  "h-11 rounded-lg border-[#315b7b] bg-[#10263a] text-slate-50 placeholder:text-[#7893a8] focus-visible:border-cyan-300/70 focus-visible:ring-1 focus-visible:ring-cyan-300/35";
const selectClass =
  "h-11 rounded-lg border-[#315b7b] bg-[#10263a] text-slate-50 focus:border-cyan-300/70 focus:ring-1 focus:ring-cyan-300/35";

const emptyDraft = (): MetadataFieldDraft => ({
  category: "software",
  field_key: "",
  field_type: "text",
  is_required: false,
  label: "",
  options: [],
  optionsText: "",
  placeholder: "",
});

const toDraft = (field: MetadataFieldDefinition): MetadataFieldDraft => {
  const options = Array.isArray(field.options)
    ? field.options.filter((option): option is string => typeof option === "string")
    : [];
  return {
    category: field.category,
    field_key: field.field_key,
    field_type: field.field_type,
    is_required: field.is_required,
    label: field.label,
    options,
    optionsText: options.join("\n"),
    placeholder: field.placeholder ?? "",
  };
};

const selectOptions = (text: string) =>
  text
    .split(/\r?\n|,/)
    .map((option) => option.trim())
    .filter(Boolean);

export function SystemMetadataFieldsEditor({
  fields,
  values,
  errors,
  onCreateField,
  onUpdateField,
  onDeleteField,
  onReorderFields,
  onValueChange,
}: SystemMetadataFieldsEditorProps) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createDraft, setCreateDraft] = useState<MetadataFieldDraft>(emptyDraft);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<MetadataFieldDraft | null>(null);
  const [pendingAction, setPendingAction] = useState("");

  useEffect(() => {
    if (editingFieldId && !fields.some((field) => field.id === editingFieldId)) {
      setEditingFieldId(null);
      setEditDraft(null);
    }
  }, [editingFieldId, fields]);

  const fieldsByCategory = useMemo(
    () => ({
      software: fields.filter((field) => field.category === "software"),
      statistics: fields.filter((field) => field.category === "statistics"),
    }),
    [fields],
  );

  const beginEdit = (field: MetadataFieldDefinition) => {
    setEditingFieldId(field.id);
    setEditDraft(toDraft(field));
  };

  const cancelEdit = () => {
    setEditingFieldId(null);
    setEditDraft(null);
  };

  const handleCreate = async () => {
    setPendingAction("create");
    const created = await onCreateField(createDraft);
    setPendingAction("");
    if (created) {
      setCreateDraft(emptyDraft());
      setShowCreateForm(false);
    }
  };

  const handleUpdate = async (field: MetadataFieldDefinition) => {
    if (!editDraft) return;
    setPendingAction(`update:${field.id}`);
    const updated = await onUpdateField(field, editDraft);
    setPendingAction("");
    if (updated) cancelEdit();
  };

  const handleDeleteField = async (field: MetadataFieldDefinition) => {
    if (field.is_system) return;
    const confirmed = window.confirm(
      `確定刪除「${field.label}」嗎？同一專案所有機台的這個欄位值都會一併刪除。`,
    );
    if (!confirmed) return;
    setPendingAction(`delete:${field.id}`);
    await onDeleteField(field);
    setPendingAction("");
  };

  const moveField = async (field: MetadataFieldDefinition, direction: -1 | 1) => {
    const categoryFields = fieldsByCategory[field.category];
    const categoryIndex = categoryFields.findIndex((item) => item.id === field.id);
    const sibling = categoryFields[categoryIndex + direction];
    if (!sibling) return;

    const nextFields = [...fields];
    const fieldIndex = nextFields.findIndex((item) => item.id === field.id);
    const siblingIndex = nextFields.findIndex((item) => item.id === sibling.id);
    [nextFields[fieldIndex], nextFields[siblingIndex]] = [
      nextFields[siblingIndex],
      nextFields[fieldIndex],
    ];
    setPendingAction(`reorder:${field.id}`);
    await onReorderFields(nextFields);
    setPendingAction("");
  };

  const renderValueControl = (field: MetadataFieldDefinition) => {
    const value = values[field.id];

    if (field.field_type === "number") {
      return (
        <Input
          type="number"
          value={typeof value === "number" || typeof value === "string" ? value : ""}
          onChange={(event) => onValueChange(field.id, event.target.value)}
          placeholder={field.placeholder ?? undefined}
          className={inputClass}
        />
      );
    }

    if (field.field_type === "boolean") {
      return (
        <div className="flex h-11 items-center gap-3 rounded-lg border border-[#315b7b] bg-[#10263a] px-3">
          <Switch
            checked={value === true}
            onCheckedChange={(checked) => onValueChange(field.id, checked)}
            aria-label={`${field.label}：${value === true ? "是" : "否"}`}
          />
          <span className="text-sm text-slate-200">{value === true ? "是" : "否"}</span>
        </div>
      );
    }

    if (field.field_type === "select") {
      const options = Array.isArray(field.options)
        ? field.options.filter((option): option is string => typeof option === "string")
        : [];
      return (
        <div className="flex gap-2">
          <Select
            value={typeof value === "string" && value ? value : undefined}
            onValueChange={(nextValue) => onValueChange(field.id, nextValue)}
          >
            <SelectTrigger className={cn(selectClass, "min-w-0 flex-1")}>
              <SelectValue placeholder={field.placeholder || "請選擇"} />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            className="h-11 shrink-0 border-[#315b7b] bg-[#10263a] px-3 text-[#a9c0d1]"
            disabled={!value}
            onClick={() => onValueChange(field.id, "")}
            aria-label={`清除 ${field.label} 選擇`}
          >
            清除選擇
          </Button>
        </div>
      );
    }

    return (
      <Input
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onValueChange(field.id, event.target.value)}
        placeholder={field.placeholder ?? undefined}
        className={inputClass}
      />
    );
  };

  const renderDefinitionForm = (
    draft: MetadataFieldDraft,
    setDraft: (draft: MetadataFieldDraft) => void,
    keyLocked: boolean,
    definitionLocked: boolean,
    typeLocked: boolean,
  ) => (
    <div className="grid gap-3 border-t border-[#25465f] bg-[#0a1c2e] p-4 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <Label className="mb-2 block text-sm text-[#dceaf3]">分類</Label>
        <Select
          value={draft.category}
          disabled={definitionLocked}
          onValueChange={(category: SystemFieldCategory) =>
            setDraft({ ...draft, category })
          }
        >
          <SelectTrigger className={selectClass}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="software">軟體資訊</SelectItem>
            <SelectItem value="statistics">統計資訊</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="mb-2 block text-sm text-[#dceaf3]">欄位類型</Label>
        <Select
          value={draft.field_type}
          disabled={typeLocked}
          onValueChange={(field_type: SystemFieldType) =>
            setDraft({
              ...draft,
              field_type,
              options: field_type === "select" ? draft.options : [],
              optionsText: field_type === "select" ? draft.optionsText : "",
            })
          }
        >
          <SelectTrigger className={selectClass}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="text">文字</SelectItem>
            <SelectItem value="number">數字</SelectItem>
            <SelectItem value="boolean">是／否</SelectItem>
            <SelectItem value="select">下拉選單</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="mb-2 block text-sm text-[#dceaf3]">欄位名稱</Label>
        <Input
          value={draft.label}
          onChange={(event) => setDraft({ ...draft, label: event.target.value })}
          placeholder="例如 BIOS 版本"
          className={inputClass}
        />
      </div>
      <div>
        <Label className="mb-2 block text-sm text-[#dceaf3]">穩定欄位代碼</Label>
        <Input
          value={draft.field_key}
          onChange={(event) => setDraft({ ...draft, field_key: event.target.value })}
          placeholder="例如 bios_version"
          disabled={keyLocked}
          className={inputClass}
        />
      </div>
      <div className="sm:col-span-2">
        <Label className="mb-2 block text-sm text-[#dceaf3]">輸入提示</Label>
        <Input
          value={draft.placeholder}
          onChange={(event) =>
            setDraft({ ...draft, placeholder: event.target.value })
          }
          placeholder="顯示在空白欄位中的提示"
          className={inputClass}
        />
      </div>
      {draft.field_type === "select" && (
        <div className="sm:col-span-2">
          <Label className="mb-2 block text-sm text-[#dceaf3]">
            Select options／選項（每行或逗號分隔）
          </Label>
          <Textarea
            value={draft.optionsText}
            onChange={(event) =>
              setDraft({
                ...draft,
                options: selectOptions(event.target.value),
                optionsText: event.target.value,
              })
            }
            className="min-h-24 rounded-lg border-[#315b7b] bg-[#10263a] text-slate-50"
          />
        </div>
      )}
      <label className="flex items-center gap-3 text-sm text-slate-200">
        <Switch
          checked={draft.is_required}
          onCheckedChange={(is_required) => setDraft({ ...draft, is_required })}
        />
        必填欄位
      </label>
    </div>
  );

  const renderErrors = (errorKey: string) => {
    const fieldErrors = errors[errorKey];
    if (!fieldErrors) return null;
    const messages = Object.values(fieldErrors).filter(
      (message): message is string => Boolean(message),
    );
    if (!messages.length) return null;

    return (
      <div role="alert" className="space-y-1 px-4 pb-3 text-xs text-rose-200">
        {messages.map((message) => (
          <p key={message}>{message}</p>
        ))}
      </div>
    );
  };

  return (
    <div data-testid="system-metadata-fields-editor">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#25465f] bg-[#0c2032] px-4 py-3.5">
        <div>
          <p className="text-sm text-[#b4cad8]">
            定義為同一專案共用；目前輸入的值只屬於每台機台。
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 border-emerald-300/40 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/20"
          onClick={() => setShowCreateForm((visible) => !visible)}
        >
          <Plus className="h-4 w-4" />
          新增欄位
        </Button>
      </div>

      {showCreateForm && (
        <div>
          {renderDefinitionForm(createDraft, setCreateDraft, false, false, false)}
          {renderErrors("__new__")}
          <div className="flex justify-end gap-2 bg-[#0a1c2e] px-4 pb-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setShowCreateForm(false);
                setCreateDraft(emptyDraft());
              }}
            >
              <X className="mr-1.5 h-4 w-4" />
              取消
            </Button>
            <Button
              type="button"
              onClick={handleCreate}
              disabled={pendingAction === "create"}
              className="bg-emerald-400 text-[#06111f] hover:bg-emerald-300"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              建立專案欄位
            </Button>
          </div>
        </div>
      )}

      {(["software", "statistics"] as const).map((category) => (
        <div key={category}>
          <div className="border-y border-[#25465f] bg-[#071522] px-4 py-2 text-xs font-semibold tracking-[0.12em] text-cyan-200">
            {category === "software" ? "SOFTWARE 軟體資訊" : "STATISTICS 統計資訊"}
          </div>
          <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4">
            {fieldsByCategory[category].map((field, categoryIndex, categoryFields) => (
              <div
                key={field.id}
                className={cn(
                  "overflow-hidden rounded-lg border border-[#274963] bg-[#0b1e30]",
                  editingFieldId === field.id && "sm:col-span-2 lg:col-span-4",
                )}
              >
                <div className="p-3">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Label className="flex flex-wrap items-center gap-1.5 text-sm text-[#dceaf3]">
                        <span>{field.label}</span>
                        {field.is_required && <span className="text-rose-300">*</span>}
                        {field.is_system && (
                          <Badge className="gap-1 border border-cyan-300/25 bg-cyan-300/10 text-[10px] text-cyan-100">
                            <LockKeyhole className="h-3 w-3" />
                            系統保留
                          </Badge>
                        )}
                      </Label>
                      <p className="mt-1 truncate font-mono text-[10px] text-[#7893a8]">
                        {field.field_key} · {field.field_type}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => moveField(field, -1)}
                        disabled={categoryIndex === 0 || pendingAction.startsWith("reorder:")}
                        aria-label={`上移 ${field.label}`}
                        className="rounded p-1 text-[#8eaabd] hover:bg-cyan-300/10 hover:text-cyan-100 disabled:opacity-30"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveField(field, 1)}
                        disabled={
                          categoryIndex === categoryFields.length - 1 ||
                          pendingAction.startsWith("reorder:")
                        }
                        aria-label={`下移 ${field.label}`}
                        className="rounded p-1 text-[#8eaabd] hover:bg-cyan-300/10 hover:text-cyan-100 disabled:opacity-30"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => beginEdit(field)}
                        aria-label={`編輯 ${field.label} 欄位`}
                        className="rounded p-1 text-[#8eaabd] hover:bg-cyan-300/10 hover:text-cyan-100"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {!field.is_system && (
                        <button
                          type="button"
                          onClick={() => handleDeleteField(field).then(() => undefined)}
                          disabled={pendingAction === `delete:${field.id}`}
                          aria-label={`刪除 ${field.label} 欄位`}
                          className="rounded p-1 text-rose-300/80 hover:bg-rose-300/10 hover:text-rose-200"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  {renderValueControl(field)}
                </div>

                {editingFieldId === field.id && editDraft && (
                  <>
                    {renderDefinitionForm(
                      editDraft,
                      setEditDraft,
                      true,
                      field.is_system,
                      true,
                    )}
                    {renderErrors(field.id)}
                    <div className="flex justify-end gap-2 bg-[#0a1c2e] px-4 pb-4">
                      <Button type="button" variant="ghost" onClick={cancelEdit}>
                        <X className="mr-1.5 h-4 w-4" />
                        取消
                      </Button>
                      <Button
                        type="button"
                        onClick={() => handleUpdate(field)}
                        disabled={pendingAction === `update:${field.id}`}
                        className="bg-cyan-300 text-[#06111f] hover:bg-cyan-200"
                      >
                        <Check className="mr-1.5 h-4 w-4" />
                        儲存欄位設定
                      </Button>
                    </div>
                  </>
                )}
                {editingFieldId !== field.id && renderErrors(field.id)}
              </div>
            ))}
            {fieldsByCategory[category].length === 0 && (
              <p className="text-sm text-[#7893a8]">尚未建立此分類的欄位。</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
