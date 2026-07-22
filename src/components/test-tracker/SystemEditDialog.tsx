import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Edit,
  MapPin,
  Network,
  Plus,
  Router,
  Save,
  Server,
  Settings2,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MobileDialog,
  MobileDialogContent,
  MobileDialogDescription,
  MobileDialogFooter,
  MobileDialogHeader,
  MobileDialogTitle,
  MobileDialogTrigger,
} from "@/components/ui/mobile-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";

type AddressField =
  Database["public"]["Tables"]["test_project_address_fields"]["Row"];

interface SystemEditDialogProps {
  systemId: string;
  systemName: string;
  assignedEngineer: string;
  model?: string;
  onOpenChange?: (open: boolean) => void;
  serialNumber?: string;
  open?: boolean;
  onUpdate: () => void;
  showTrigger?: boolean;
  variant?: "button" | "icon" | "menu";
}

export function SystemEditDialog({
  systemId,
  systemName,
  assignedEngineer,
  model,
  serialNumber,
  open,
  onOpenChange,
  onUpdate,
  showTrigger = true,
  variant = "icon",
}: SystemEditDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const setIsOpen = (nextOpen: boolean) => {
    if (open === undefined) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };
  const [editValues, setEditValues] = useState({
    system_name: systemName,
    assigned_engineer: assignedEngineer,
    model: model || "GB300",
    serial_number: serialNumber || "",
    cabinet: "",
    os_mac_address: "",
    bmc_address: "",
    old_bmc_address: "",
    bom_90: "",
    ubuntu_version: "",
    cuda_version: "",
    exclude_from_dashboard: false,
    team: "",
  });
  const [projectId, setProjectId] = useState("");
  const [addressFields, setAddressFields] = useState<AddressField[]>([]);
  const [addressValues, setAddressValues] = useState<Record<string, string>>({});
  const [newAddressLabel, setNewAddressLabel] = useState("");
  const [newAddressPlaceholder, setNewAddressPlaceholder] = useState("");
  const [newAddressValue, setNewAddressValue] = useState("");
  const [showNewAddressForm, setShowNewAddressForm] = useState(false);
  const [isAddingAddress, setIsAddingAddress] = useState(false);
  const [addressLoadError, setAddressLoadError] = useState("");
  const [editingAddressFieldId, setEditingAddressFieldId] = useState<string | null>(null);
  const [editingAddressLabel, setEditingAddressLabel] = useState("");
  const [editingAddressPlaceholder, setEditingAddressPlaceholder] = useState("");
  const [isUpdatingAddress, setIsUpdatingAddress] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const sectionClass =
    "overflow-hidden rounded-xl border border-[#274963] bg-[#091827] shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]";
  const fieldLabelClass = cn(
    "mb-2 block text-sm font-medium text-[#dceaf3]",
    isMobile && "text-base"
  );
  const inputClass = cn(
    "h-11 rounded-lg border-[#315b7b] bg-[#10263a] text-slate-50 placeholder:text-[#7893a8] focus-visible:border-cyan-300/70 focus-visible:ring-1 focus-visible:ring-cyan-300/35",
    isMobile && "h-12 text-base"
  );
  const selectTriggerClass = cn(
    "h-11 rounded-lg border-[#315b7b] bg-[#10263a] text-slate-50 focus:border-cyan-300/70 focus:ring-1 focus:ring-cyan-300/35",
    isMobile && "h-12 text-base"
  );

  useEffect(() => {
    const loadSystemDetails = async () => {
      const { data, error } = await supabase
        .from("test_systems")
        .select("*")
        .eq("id", systemId)
        .maybeSingle();

      if (error || !data) return;

      setProjectId(data.project_id);
      setEditValues({
        system_name: data.system_name,
        assigned_engineer: data.assigned_engineer || "",
        model: data.model || "GB300",
        serial_number: data.serial_number || "",
        cabinet: data.cabinet || "",
        os_mac_address: data.os_mac_address || "",
        bmc_address: data.bmc_address || "",
        old_bmc_address: data.old_bmc_address || "",
        bom_90: data.bom_90 || "",
        ubuntu_version: data.ubuntu_version || "",
        cuda_version: data.cuda_version || "",
        exclude_from_dashboard: data.exclude_from_dashboard || false,
        team: data.team || "",
      });

      const [fieldResult, valueResult] = await Promise.all([
        supabase
          .from("test_project_address_fields")
          .select("*")
          .eq("project_id", data.project_id)
          .order("sort_order")
          .order("created_at"),
        supabase
          .from("test_system_address_values")
          .select("field_id,value")
          .eq("system_id", systemId),
      ]);

      const addressError = fieldResult.error || valueResult.error;
      setAddressLoadError(addressError?.message || "");
      setAddressFields(fieldResult.data ?? []);
      setAddressValues(
        Object.fromEntries(
          (valueResult.data ?? []).map((entry) => [entry.field_id, entry.value])
        )
      );
      setEditingAddressFieldId(null);
      setShowNewAddressForm(false);
      setNewAddressLabel("");
      setNewAddressPlaceholder("");
      setNewAddressValue("");
    };

    if (isOpen) void loadSystemDetails();
  }, [isOpen, systemId]);

  const closeNewAddressForm = () => {
    setShowNewAddressForm(false);
    setNewAddressLabel("");
    setNewAddressPlaceholder("");
    setNewAddressValue("");
  };

  const handleAddAddressField = async () => {
    const label = newAddressLabel.trim();
    if (!projectId || !label) {
      toast({
        title: "請輸入位址名稱",
        description: "例如 Management IP、Storage IP 或 Switch Port。",
        variant: "destructive",
      });
      return;
    }

    setIsAddingAddress(true);
    const { data, error } = await supabase
      .from("test_project_address_fields")
      .insert({
        label,
        placeholder: newAddressPlaceholder.trim() || `請輸入 ${label}...`,
        project_id: projectId,
        sort_order: addressFields.length,
      })
      .select("*")
      .single();

    if (error || !data) {
      setIsAddingAddress(false);
      toast({
        title: "新增位址欄位失敗",
        description:
          error?.code === "23505"
            ? "同一專案已經有相同名稱的位址欄位。"
            : error?.message || "請稍後再試，既有機台資料不會受影響。",
        variant: "destructive",
      });
      return;
    }

    const { error: valueError } = await supabase
      .from("test_system_address_values")
      .upsert(
        {
          field_id: data.id,
          system_id: systemId,
          value: newAddressValue.trim(),
        },
        { onConflict: "field_id,system_id" }
      );

    if (valueError) {
      await supabase
        .from("test_project_address_fields")
        .delete()
        .eq("id", data.id)
        .eq("project_id", projectId);
      setIsAddingAddress(false);
      toast({
        title: "新增位址欄位失敗",
        description: `位址內容未儲存：${valueError.message}`,
        variant: "destructive",
      });
      return;
    }

    setIsAddingAddress(false);
    setAddressFields((current) => [...current, data]);
    setAddressValues((current) => ({
      ...current,
      [data.id]: newAddressValue.trim(),
    }));
    closeNewAddressForm();
    toast({
      title: "位址欄位已新增",
      description: `${label} 已套用到同專案所有機台，目前機台的位址也已儲存。`,
    });
  };

  const beginAddressFieldEdit = (field: AddressField) => {
    setEditingAddressFieldId(field.id);
    setEditingAddressLabel(field.label);
    setEditingAddressPlaceholder(field.placeholder || "");
  };

  const cancelAddressFieldEdit = () => {
    setEditingAddressFieldId(null);
    setEditingAddressLabel("");
    setEditingAddressPlaceholder("");
  };

  const handleUpdateAddressField = async (field: AddressField) => {
    const label = editingAddressLabel.trim();
    if (!projectId || !label) {
      toast({
        title: "請輸入位址名稱",
        description: "位址欄位名稱不能留白。",
        variant: "destructive",
      });
      return;
    }

    setIsUpdatingAddress(true);
    const { data, error } = await supabase
      .from("test_project_address_fields")
      .update({
        label,
        placeholder: editingAddressPlaceholder.trim() || `請輸入 ${label}...`,
      })
      .eq("id", field.id)
      .eq("project_id", projectId)
      .select("*")
      .single();
    setIsUpdatingAddress(false);

    if (error || !data) {
      toast({
        title: "更新位址欄位失敗",
        description:
          error?.code === "23505"
            ? "同一專案已經有相同名稱的位址欄位。"
            : error?.message || "請稍後再試，既有機台位址內容不會受影響。",
        variant: "destructive",
      });
      return;
    }

    setAddressFields((current) =>
      current.map((item) => (item.id === data.id ? data : item))
    );
    cancelAddressFieldEdit();
    toast({
      title: "位址欄位已更新",
      description: `${label} 已同步套用到同專案機台，原有位址內容保持不變。`,
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("test_systems")
        .update({
          system_name: editValues.system_name,
          assigned_engineer: editValues.assigned_engineer,
          model: editValues.model,
          serial_number: editValues.serial_number,
          cabinet: editValues.cabinet,
          os_mac_address: editValues.os_mac_address,
          bmc_address: editValues.bmc_address,
          old_bmc_address: editValues.old_bmc_address,
          bom_90: editValues.bom_90,
          ubuntu_version: editValues.ubuntu_version,
          cuda_version: editValues.cuda_version,
          exclude_from_dashboard: editValues.exclude_from_dashboard,
          team: editValues.team,
        })
        .eq("id", systemId);

      if (error) throw error;

      if (addressFields.length) {
        const { error: addressError } = await supabase
          .from("test_system_address_values")
          .upsert(
            addressFields.map((field) => ({
              field_id: field.id,
              system_id: systemId,
              value: addressValues[field.id]?.trim() || "",
            })),
            { onConflict: "field_id,system_id" }
          );
        if (addressError) throw addressError;
      }

      toast({
        title: "更新成功",
        description: "機台識別、網路位址與軟體版本已完成更新。",
      });
      setIsOpen(false);
      onUpdate();
    } catch (error) {
      const message =
        typeof error === "object" && error && "message" in error
          ? String(error.message)
          : "無法更新系統資料，請稍後再試。";
      toast({
        title: "更新失敗",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <MobileDialog open={isOpen} onOpenChange={setIsOpen}>
      {showTrigger && (
        <MobileDialogTrigger asChild>
          {variant === "menu" ? (
            <Button
              variant="outline"
              size="sm"
              className="h-10 w-full justify-start rounded-xl border-sky-300/30 bg-sky-300/[0.08] px-3 font-semibold text-sky-100 hover:border-sky-200/50 hover:bg-sky-300/15 hover:text-sky-50"
            >
              <Edit className="mr-2 h-4 w-4" />
              編輯機台資料
            </Button>
          ) : variant === "button" ? (
            <Button
              variant="outline"
              size={isMobile ? "default" : "sm"}
              className={cn(
                "cursor-pointer rounded border bg-muted px-2 py-1 text-sm hover:bg-accent",
                isMobile && "h-10 px-4 text-base"
              )}
            >
              {assignedEngineer}
            </Button>
          ) : (
            <Button
              variant="ghost"
              size={isMobile ? "default" : "sm"}
              className={isMobile ? "h-10 px-4" : ""}
            >
              <Edit className={isMobile ? "mr-2 h-4 w-4" : "h-3 w-3"} />
              {isMobile && "編輯"}
            </Button>
          )}
        </MobileDialogTrigger>
      )}

      <MobileDialogContent
        className={cn(
          "border-[#2a526f] bg-[#06111f] p-0 text-slate-50 shadow-[0_32px_90px_-42px_rgba(34,211,238,0.55)]",
          isMobile
            ? "rounded-t-2xl"
            : "sm:flex sm:max-h-[92vh] sm:max-w-[min(95vw,74rem)] sm:flex-col sm:overflow-hidden sm:rounded-2xl"
        )}
      >
        <MobileDialogHeader className="shrink-0 border-b border-[#25465f] bg-[#081827] px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-300/30 bg-cyan-300/10 text-cyan-100">
                <Server className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <div className="text-[0.68rem] font-semibold tracking-[0.18em] text-cyan-200/80">
                  SYSTEM EDITOR
                </div>
                <MobileDialogTitle className="text-left text-2xl font-semibold tracking-tight">
                  編輯系統資料
                </MobileDialogTitle>
                <MobileDialogDescription className="text-left text-sm text-[#9fb8ca]">
                  依序完成基本資料、網路位址與軟體版本，所有變更由底部按鈕統一儲存。
                </MobileDialogDescription>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 sm:max-w-[22rem] sm:justify-end">
              <Badge className="rounded-md border border-cyan-300/25 bg-cyan-300/[0.08] px-2.5 py-1 text-xs text-cyan-50">
                {editValues.model || "未設定型號"}
              </Badge>
              <Badge className="rounded-md border border-[#315b7b] bg-[#10263a] px-2.5 py-1 text-xs text-slate-100">
                {editValues.system_name || "未命名機台"}
              </Badge>
              {editValues.serial_number && (
                <Badge className="rounded-md border border-[#315b7b] bg-[#10263a] px-2.5 py-1 text-xs text-slate-100">
                  SN {editValues.serial_number}
                </Badge>
              )}
            </div>
          </div>
        </MobileDialogHeader>

        <div
          data-testid="system-editor-workspace"
          className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5"
        >
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.02fr)_minmax(24rem,0.98fr)]">
            <section className={sectionClass}>
              <div className="flex items-center gap-3 border-b border-[#25465f] bg-[#0c2032] px-4 py-3.5">
                <span className="font-mono text-xs font-semibold text-cyan-300">01</span>
                <Server className="h-4 w-4 text-cyan-200" />
                <div>
                  <h3 className="font-semibold text-slate-50">基本資料</h3>
                  <p className="text-xs text-[#8eaabd]">機台識別與實體位置</p>
                </div>
              </div>

              <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
                <div className="sm:col-span-2">
                  <Label className={fieldLabelClass}>機台 ID</Label>
                  <Input
                    value={editValues.system_name}
                    onChange={(event) =>
                      setEditValues({ ...editValues, system_name: event.target.value })
                    }
                    placeholder="請輸入機台 ID..."
                    className={inputClass}
                  />
                </div>
                <div>
                  <Label className={fieldLabelClass}>型號</Label>
                  <Input
                    value={editValues.model}
                    onChange={(event) =>
                      setEditValues({ ...editValues, model: event.target.value })
                    }
                    placeholder="例如 GB300、VR200"
                    className={inputClass}
                  />
                </div>
                <div>
                  <Label className={fieldLabelClass}>序號</Label>
                  <Input
                    value={editValues.serial_number}
                    onChange={(event) =>
                      setEditValues({ ...editValues, serial_number: event.target.value })
                    }
                    placeholder="請輸入序號..."
                    className={inputClass}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label className={cn(fieldLabelClass, "flex items-center gap-1.5")}>
                    <MapPin className="h-3.5 w-3.5 text-cyan-300" />
                    機台位置
                  </Label>
                  <Input
                    data-testid="system-location-input"
                    value={editValues.team}
                    onChange={(event) =>
                      setEditValues({ ...editValues, team: event.target.value })
                    }
                    placeholder="例如 PTY 2F EE Lab / Rack A03"
                    className={inputClass}
                  />
                </div>
              </div>
            </section>

            <section data-testid="network-address-manager" className={sectionClass}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#25465f] bg-[#0c2032] px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs font-semibold text-blue-300">02</span>
                  <Router className="h-4 w-4 text-blue-200" />
                  <div>
                    <h3 className="font-semibold text-slate-50">網路位址</h3>
                    <p className="text-xs text-[#8eaabd]">專案共用欄位，機台各自保存內容</p>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="h-9 rounded-lg border border-cyan-200/40 bg-cyan-300 text-[#06111f] hover:bg-cyan-200"
                  onClick={() => setShowNewAddressForm(true)}
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  新增位址
                </Button>
              </div>

              <div className="space-y-3 p-4 sm:p-5">
                {addressLoadError && (
                  <div className="flex gap-2 rounded-lg border border-amber-300/35 bg-amber-300/10 px-3 py-2.5 text-sm text-amber-100">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>位址欄位載入失敗：{addressLoadError}</span>
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className={fieldLabelClass}>NIC MAC Address</Label>
                    <Input
                      value={editValues.os_mac_address}
                      onChange={(event) =>
                        setEditValues({
                          ...editValues,
                          os_mac_address: event.target.value,
                        })
                      }
                      placeholder="輸入 NIC MAC Address"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <Label className={fieldLabelClass}>BMC Address</Label>
                    <Input
                      value={editValues.bmc_address}
                      onChange={(event) =>
                        setEditValues({ ...editValues, bmc_address: event.target.value })
                      }
                      placeholder="輸入 BMC Address"
                      className={inputClass}
                    />
                  </div>
                </div>

                {addressFields.map((field) => {
                  const isEditing = editingAddressFieldId === field.id;
                  return (
                    <div
                      key={field.id}
                      className="border-t border-[#203e54] pt-3 first:border-t-0 first:pt-0"
                    >
                      {isEditing ? (
                        <div className="grid gap-3 rounded-lg border border-cyan-300/30 bg-cyan-300/[0.055] p-3 sm:grid-cols-2">
                          <div>
                            <Label className={fieldLabelClass}>欄位名稱</Label>
                            <Input
                              value={editingAddressLabel}
                              onChange={(event) => setEditingAddressLabel(event.target.value)}
                              className={inputClass}
                              autoFocus
                            />
                          </div>
                          <div>
                            <Label className={fieldLabelClass}>輸入提示</Label>
                            <Input
                              value={editingAddressPlaceholder}
                              onChange={(event) =>
                                setEditingAddressPlaceholder(event.target.value)
                              }
                              placeholder={`請輸入 ${editingAddressLabel || field.label}...`}
                              className={inputClass}
                            />
                          </div>
                          <div className="flex justify-end gap-2 sm:col-span-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-9 text-[#a9c0d1]"
                              onClick={cancelAddressFieldEdit}
                            >
                              取消
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              className="h-9 bg-cyan-300 text-[#06111f] hover:bg-cyan-200"
                              disabled={isUpdatingAddress}
                              onClick={() => handleUpdateAddressField(field)}
                            >
                              <Save className="mr-1.5 h-3.5 w-3.5" />
                              儲存欄位設定
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                          <div>
                            <div className="mb-2 flex items-center gap-2">
                              <Label className="text-sm font-medium text-[#dceaf3]">
                                {field.label}
                              </Label>
                              <Badge className="rounded border border-blue-300/20 bg-blue-300/[0.07] px-1.5 py-0 text-[0.62rem] font-medium text-blue-100">
                                專案共用
                              </Badge>
                            </div>
                            <Input
                              value={addressValues[field.id] || ""}
                              onChange={(event) =>
                                setAddressValues((current) => ({
                                  ...current,
                                  [field.id]: event.target.value,
                                }))
                              }
                              placeholder={field.placeholder || `請輸入 ${field.label}...`}
                              className={inputClass}
                            />
                          </div>
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            aria-label={`編輯 ${field.label} 位址欄位`}
                            className="h-11 w-11 rounded-lg border-[#315b7b] bg-[#10263a] text-[#a9c0d1] hover:border-cyan-300/45 hover:bg-cyan-300/10 hover:text-cyan-100"
                            onClick={() => beginAddressFieldEdit(field)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}

                {showNewAddressForm && (
                  <div className="rounded-xl border border-cyan-300/35 bg-[#0b2233] p-4 shadow-[0_16px_36px_-28px_rgba(34,211,238,0.8)]">
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div>
                        <h4 className="font-semibold text-cyan-50">建立專案共用位址</h4>
                        <p className="mt-1 text-xs text-[#9fb8ca]">
                          欄位會出現在同專案所有機台，目前輸入的值只屬於這台機台。
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-[#9fb8ca]"
                        onClick={closeNewAddressForm}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label className={fieldLabelClass}>欄位名稱 *</Label>
                        <Input
                          value={newAddressLabel}
                          onChange={(event) => setNewAddressLabel(event.target.value)}
                          placeholder="例如 Management IP"
                          className={inputClass}
                          autoFocus
                        />
                      </div>
                      <div>
                        <Label className={fieldLabelClass}>輸入提示</Label>
                        <Input
                          value={newAddressPlaceholder}
                          onChange={(event) => setNewAddressPlaceholder(event.target.value)}
                          placeholder="例如 10.20.30.40"
                          className={inputClass}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Label className={fieldLabelClass}>目前機台位址值</Label>
                        <Input
                          value={newAddressValue}
                          onChange={(event) => setNewAddressValue(event.target.value)}
                          placeholder="可直接填入這台機台的 IP、MAC 或連接埠"
                          className={inputClass}
                        />
                      </div>
                    </div>
                    <div className="mt-4 flex justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-9 text-[#a9c0d1]"
                        onClick={closeNewAddressForm}
                      >
                        取消
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="h-9 bg-cyan-300 px-4 text-[#06111f] hover:bg-cyan-200"
                        disabled={isAddingAddress}
                        onClick={handleAddAddressField}
                      >
                        <Plus className="mr-1.5 h-4 w-4" />
                        {isAddingAddress ? "正在新增..." : "新增至專案"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className={cn(sectionClass, "lg:col-span-2")}>
              <div className="flex items-center gap-3 border-b border-[#25465f] bg-[#0c2032] px-4 py-3.5">
                <span className="font-mono text-xs font-semibold text-emerald-300">03</span>
                <Settings2 className="h-4 w-4 text-emerald-200" />
                <div>
                  <h3 className="font-semibold text-slate-50">軟體版本與統計</h3>
                  <p className="text-xs text-[#8eaabd]">部署版本及儀表板納入設定</p>
                </div>
              </div>
              <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4">
                <div>
                  <Label className={fieldLabelClass}>90BOM</Label>
                  <Input
                    value={editValues.bom_90}
                    onChange={(event) =>
                      setEditValues({ ...editValues, bom_90: event.target.value })
                    }
                    placeholder="請輸入 90BOM"
                    className={inputClass}
                  />
                </div>
                <div>
                  <Label className={fieldLabelClass}>Ubuntu 版本</Label>
                  <Input
                    value={editValues.ubuntu_version}
                    onChange={(event) =>
                      setEditValues({ ...editValues, ubuntu_version: event.target.value })
                    }
                    placeholder="例如 22.04"
                    className={inputClass}
                  />
                </div>
                <div>
                  <Label className={fieldLabelClass}>CUDA 版本</Label>
                  <Input
                    value={editValues.cuda_version}
                    onChange={(event) =>
                      setEditValues({ ...editValues, cuda_version: event.target.value })
                    }
                    placeholder="例如 12.2"
                    className={inputClass}
                  />
                </div>
                <div>
                  <Label className={fieldLabelClass}>系統儀表板統計</Label>
                  <Select
                    value={editValues.exclude_from_dashboard ? "false" : "true"}
                    onValueChange={(value) =>
                      setEditValues({
                        ...editValues,
                        exclude_from_dashboard: value === "false",
                      })
                    }
                  >
                    <SelectTrigger className={selectTriggerClass}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">列入統計</SelectItem>
                      <SelectItem value="false">不列入統計</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>
          </div>
        </div>

        <MobileDialogFooter className="shrink-0 border-t border-[#25465f] bg-[#081827] px-5 py-3.5 sm:px-6">
          <div className="mr-auto hidden items-center gap-2 text-xs text-[#8eaabd] sm:flex">
            <Network className="h-3.5 w-3.5 text-cyan-300" />
            新增欄位同步至專案；位址值只儲存在目前機台
          </div>
          <Button
            variant="outline"
            onClick={() => setIsOpen(false)}
            className={cn(
              "rounded-lg border-[#315b7b] bg-[#10263a] text-slate-100 hover:bg-[#15344d]",
              isMobile ? "h-12 text-base font-medium" : "h-11 px-5"
            )}
          >
            <X className="mr-2 h-4 w-4" />
            取消
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className={cn(
              "rounded-lg border border-cyan-200/40 bg-cyan-300 text-[#06111f] shadow-none hover:bg-cyan-200",
              isMobile ? "h-12 text-base font-medium" : "h-11 px-5"
            )}
          >
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? "儲存中..." : "儲存全部變更"}
          </Button>
        </MobileDialogFooter>
      </MobileDialogContent>
    </MobileDialog>
  );
}
