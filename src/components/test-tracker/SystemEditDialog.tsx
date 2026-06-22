import { useEffect, useState } from "react";
import { Edit, Network, Save, Server, Settings2, X } from "lucide-react";

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
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

interface SystemEditDialogProps {
  systemId: string;
  systemName: string;
  assignedEngineer: string;
  model?: string;
  serialNumber?: string;
  onUpdate: () => void;
  variant?: "button" | "icon";
}

export function SystemEditDialog({
  systemId,
  systemName,
  assignedEngineer,
  model,
  serialNumber,
  onUpdate,
  variant = "icon",
}: SystemEditDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
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
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const panelClass =
    "rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(15,23,42,0.82))] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";
  const sectionClass =
    "rounded-[26px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.78),rgba(15,23,42,0.62))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]";
  const fieldLabelClass = cn(
    "mb-2 block text-sm font-medium text-slate-100",
    isMobile && "text-base"
  );
  const inputClass = cn(
    "h-11 rounded-2xl border-white/10 bg-slate-900/55 text-slate-50 placeholder:text-slate-400 focus-visible:ring-1 focus-visible:ring-sky-300/40",
    isMobile && "h-12 text-base"
  );
  const selectTriggerClass = cn(
    "h-11 rounded-2xl border-white/10 bg-slate-900/55 text-slate-50 focus:ring-1 focus:ring-sky-300/40",
    isMobile && "h-12 text-base"
  );

  useEffect(() => {
    const loadSystemDetails = async () => {
      const { data } = await supabase
        .from("test_systems")
        .select("*")
        .eq("id", systemId)
        .maybeSingle();

      if (data) {
        setEditValues({
          system_name: data.system_name,
          assigned_engineer: data.assigned_engineer || "",
          model: data.model || "GB300",
          serial_number: data.serial_number || "",
          cabinet: (data as any).cabinet || "",
          os_mac_address: data.os_mac_address || "",
          bmc_address: data.bmc_address || "",
          old_bmc_address: (data as any).old_bmc_address || "",
          bom_90: data.bom_90 || "",
          ubuntu_version: data.ubuntu_version || "",
          cuda_version: data.cuda_version || "",
          exclude_from_dashboard: data.exclude_from_dashboard || false,
          team: (data as any).team || "",
        });
      }
    };

    loadSystemDetails();
  }, [systemId]);

  const handleSave = async () => {
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

      toast({
        title: "更新成功",
        description: "系統資料已完成更新。",
      });

      setIsOpen(false);
      onUpdate();
    } catch (error) {
      toast({
        title: "更新失敗",
        description: "無法更新系統資料，請稍後再試。",
        variant: "destructive",
      });
    }
  };

  return (
    <MobileDialog open={isOpen} onOpenChange={setIsOpen}>
      <MobileDialogTrigger asChild>
        {variant === "button" ? (
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

      <MobileDialogContent
        className={cn(
          "border-white/10 bg-[linear-gradient(180deg,rgba(2,6,23,0.96),rgba(15,23,42,0.95))] p-0 text-slate-50",
          isMobile
            ? "rounded-t-[28px]"
            : "sm:max-h-[92vh] sm:max-w-[min(94vw,72rem)] sm:overflow-y-auto sm:rounded-[30px]"
        )}
      >
        <MobileDialogHeader className="space-y-4 border-b border-white/8 px-6 py-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-300/16 bg-sky-300/[0.08] px-3 py-1 text-xs font-medium tracking-[0.16em] text-sky-100/90">
                <Server className="h-3.5 w-3.5" />
                SYSTEM EDITOR
              </div>
              <div className="space-y-2">
                <MobileDialogTitle
                  className={cn(
                    "text-left text-3xl font-semibold tracking-tight",
                    isMobile && "text-2xl"
                  )}
                >
                  編輯系統資料
                </MobileDialogTitle>
                <MobileDialogDescription className="max-w-2xl text-left text-sm text-slate-300/78">
                  移除較少使用的欄位後，重新依照資料類型分區，讓每個區塊更集中也更好編輯。
                </MobileDialogDescription>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs text-slate-100">
                {editValues.model || "GB300"}
              </Badge>
              <Badge className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs text-slate-100">
                {editValues.system_name || "未命名機台"}
              </Badge>
              {editValues.serial_number && (
                <Badge className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs text-slate-100">
                  SN {editValues.serial_number}
                </Badge>
              )}
            </div>
          </div>
        </MobileDialogHeader>

        <div className="space-y-5 px-6 py-6">
          <div className={cn(panelClass, "p-4 sm:p-5")}>
            <div className="grid gap-5 lg:grid-cols-12">
              <section className={cn(sectionClass, "lg:col-span-7")}>
                <div className="mb-5 flex items-start gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-sky-300/16 bg-sky-300/[0.08] text-sky-100">
                    <Server className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold text-slate-50">
                      系統識別
                    </h3>
                    <p className="text-sm text-slate-300/72">
                      放最常一起查看的識別資料，讓機台基本資訊集中在同一區。
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Label className={fieldLabelClass}>機台編號</Label>
                    <Input
                      value={editValues.system_name}
                      onChange={(e) =>
                        setEditValues({
                          ...editValues,
                          system_name: e.target.value,
                        })
                      }
                      placeholder="請輸入機台編號..."
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <Label className={fieldLabelClass}>型號</Label>
                    <Input
                      value={editValues.model}
                      onChange={(e) =>
                        setEditValues({ ...editValues, model: e.target.value })
                      }
                      placeholder="請輸入型號..."
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <Label className={fieldLabelClass}>序號</Label>
                    <Input
                      value={editValues.serial_number}
                      onChange={(e) =>
                        setEditValues({
                          ...editValues,
                          serial_number: e.target.value,
                        })
                      }
                      placeholder="請輸入序號..."
                      className={inputClass}
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <Label className={fieldLabelClass}>位置</Label>
                    <Input
                      value={editValues.team}
                      onChange={(e) =>
                        setEditValues({ ...editValues, team: e.target.value })
                      }
                      placeholder="請輸入機台位置..."
                      className={inputClass}
                    />
                  </div>
                </div>
              </section>

              <section className={cn(sectionClass, "lg:col-span-5")}>
                <div className="mb-5 flex items-start gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-violet-300/16 bg-violet-300/[0.08] text-violet-100">
                    <Network className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold text-slate-50">
                      網路位址
                    </h3>
                    <p className="text-sm text-slate-300/72">
                      只保留目前會用到的網路資料，畫面更乾淨，編輯時也不會分心。
                    </p>
                  </div>
                </div>

                <div className="grid gap-4">
                  <div>
                    <Label className={fieldLabelClass}>NIC MAC Address</Label>
                    <Input
                      value={editValues.os_mac_address}
                      onChange={(e) =>
                        setEditValues({
                          ...editValues,
                          os_mac_address: e.target.value,
                        })
                      }
                      placeholder="請輸入 NIC MAC Address..."
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <Label className={fieldLabelClass}>BMC Address</Label>
                    <Input
                      value={editValues.bmc_address}
                      onChange={(e) =>
                        setEditValues({
                          ...editValues,
                          bmc_address: e.target.value,
                        })
                      }
                      placeholder="請輸入 BMC Address..."
                      className={inputClass}
                    />
                  </div>
                </div>
              </section>

              <section className={cn(sectionClass, "lg:col-span-12")}>
                <div className="mb-5 flex items-start gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-300/16 bg-emerald-300/[0.08] text-emerald-100">
                    <Settings2 className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold text-slate-50">
                      軟體與統計
                    </h3>
                    <p className="text-sm text-slate-300/72">
                      將版本與報表控制放在同一排，方便一次檢查與修改。
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <Label className={fieldLabelClass}>90BOM</Label>
                    <Input
                      value={editValues.bom_90}
                      onChange={(e) =>
                        setEditValues({ ...editValues, bom_90: e.target.value })
                      }
                      placeholder="請輸入 90BOM..."
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <Label className={fieldLabelClass}>Ubuntu 版本</Label>
                    <Input
                      value={editValues.ubuntu_version}
                      onChange={(e) =>
                        setEditValues({
                          ...editValues,
                          ubuntu_version: e.target.value,
                        })
                      }
                      placeholder="例如：22.04、20.04"
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <Label className={fieldLabelClass}>CUDA 版本</Label>
                    <Input
                      value={editValues.cuda_version}
                      onChange={(e) =>
                        setEditValues({
                          ...editValues,
                          cuda_version: e.target.value,
                        })
                      }
                      placeholder="例如：12.2、11.8"
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
                        <SelectItem
                          value="true"
                          className={isMobile ? "h-12 text-base" : ""}
                        >
                          列入統計
                        </SelectItem>
                        <SelectItem
                          value="false"
                          className={isMobile ? "h-12 text-base" : ""}
                        >
                          不列入統計
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>

        <MobileDialogFooter className="border-t border-white/8 bg-slate-950/70 px-6 py-4 backdrop-blur-xl">
          <Button
            variant="outline"
            onClick={() => setIsOpen(false)}
            className={cn(
              "rounded-2xl border-white/10 bg-white/[0.04] text-slate-100 hover:bg-white/[0.08]",
              isMobile ? "h-12 text-base font-medium" : "h-11 px-5"
            )}
          >
            <X className={isMobile ? "mr-2 h-4 w-4" : "mr-2 h-3 w-3"} />
            取消
          </Button>

          <Button
            onClick={handleSave}
            className={cn(
              "rounded-2xl bg-[linear-gradient(135deg,rgba(96,165,250,0.92),rgba(99,102,241,0.9))] text-slate-950 shadow-[0_18px_38px_-24px_rgba(96,165,250,0.72)] hover:brightness-110",
              isMobile ? "h-12 text-base font-medium" : "h-11 px-5"
            )}
          >
            <Save className={isMobile ? "mr-2 h-4 w-4" : "mr-2 h-3 w-3"} />
            儲存
          </Button>
        </MobileDialogFooter>
      </MobileDialogContent>
    </MobileDialog>
  );
}
