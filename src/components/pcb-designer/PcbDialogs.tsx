import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { TabularImportError } from "./core/tabular.ts";
import type { NewProjectInput, TemplateInput } from "./core/workspace.ts";
import type {
  ImportedComponent,
  PcbLibraryComponent,
  PcbProject,
  PcbTemplate,
} from "./hooks/usePcbWorkspace.ts";

export type PcbDialogState =
  | { kind: "new-project" }
  | { kind: "project-settings"; project: PcbProject }
  | { kind: "save-template" }
  | { kind: "rename-template"; template: PcbTemplate }
  | { kind: "component"; component?: PcbLibraryComponent }
  | {
    kind: "project-import-preview";
    title: string;
    validCount: number;
    errors: TabularImportError[];
    onCommit: () => void;
  }
  | {
    kind: "confirm";
    title: string;
    description: string;
    confirmLabel?: string;
    onConfirm: () => void;
  }
  | {
    kind: "import-preview";
    title: string;
    importKind: "library" | "bom";
    validCount: number;
    totalCount: number;
    errors: TabularImportError[];
    placementCount?: number;
    onCommit: () => void;
  };

interface PcbDialogsProps {
  dialog: PcbDialogState | null;
  onClose: () => void;
  onCreateProject: (input: NewProjectInput) => void;
  onUpdateProject: (project: PcbProject) => void;
  onSaveTemplate: (input: TemplateInput) => void;
  onRenameTemplate: (templateId: string, name: string) => void;
  onSaveComponent: (
    input: ImportedComponent,
    componentId?: string,
  ) => void;
}

const emptyComponent: ImportedComponent = {
  name: "",
  type: "Other",
  manufacturer: "",
  partNumber: "",
  width: 10,
  height: 10,
  maxHeight: 1,
  color: "#39c6e8",
};

function positiveNumber(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function PcbDialogs({
  dialog,
  onClose,
  onCreateProject,
  onUpdateProject,
  onSaveTemplate,
  onRenameTemplate,
  onSaveComponent,
}: PcbDialogsProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  useEffect(() => {
    setError("");
    if (!dialog) {
      setValues({});
      return;
    }
    if (dialog.kind === "new-project") {
      setValues({ name: "", description: "", width: "100", height: "80" });
    } else if (dialog.kind === "project-settings") {
      setValues({
        name: dialog.project.name,
        description: dialog.project.description,
        width: String(dialog.project.board.width),
        height: String(dialog.project.board.height),
        status: dialog.project.status,
      });
    } else if (dialog.kind === "save-template") {
      setValues({ name: "", category: "", description: "" });
    } else if (dialog.kind === "rename-template") {
      setValues({ name: dialog.template.name });
    } else if (dialog.kind === "component") {
      const component = dialog.component ?? emptyComponent;
      setValues({
        name: component.name,
        type: component.type,
        manufacturer: component.manufacturer,
        partNumber: component.partNumber,
        width: String(component.width),
        height: String(component.height),
        maxHeight: String(component.maxHeight),
        color: component.color,
      });
    }
  }, [dialog]);

  const update = (field: string, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!dialog) return;
    const name = values.name?.trim();
    if (!name) {
      setError("名稱為必填欄位。");
      return;
    }

    if (dialog.kind === "new-project") {
      const width = positiveNumber(values.width);
      const height = positiveNumber(values.height);
      if (!width || !height || width < 20 || width > 1000 || height < 20 || height > 1000) {
        setError("板寬與板高需介於 20 至 1000 mm。");
        return;
      }
      onCreateProject({
        name,
        description: values.description,
        width,
        height,
      });
      onClose();
    } else if (dialog.kind === "project-settings") {
      const width = positiveNumber(values.width);
      const height = positiveNumber(values.height);
      if (!width || !height || width < 20 || width > 1000 || height < 20 || height > 1000) {
        setError("板寬與板高需介於 20 至 1000 mm。");
        return;
      }
      onUpdateProject({
        ...dialog.project,
        name,
        description: values.description ?? "",
        status: values.status as PcbProject["status"],
        board: { ...dialog.project.board, width, height },
      });
      onClose();
    } else if (dialog.kind === "save-template") {
      const category = values.category?.trim();
      const description = values.description?.trim();
      if (!category || !description) {
        setError("分類與描述皆為必填欄位。");
        return;
      }
      onSaveTemplate({ name, category, description });
      onClose();
    } else if (dialog.kind === "rename-template") {
      onRenameTemplate(dialog.template.id, name);
      onClose();
    } else if (dialog.kind === "component") {
      const width = positiveNumber(values.width);
      const height = positiveNumber(values.height);
      const maxHeight = positiveNumber(values.maxHeight);
      if (!width || !height || !maxHeight) {
        setError("尺寸與最大高度必須是大於 0 的有限數。");
        return;
      }
      onSaveComponent({
        name,
        type: values.type?.trim() || "Other",
        manufacturer: values.manufacturer?.trim() ?? "",
        partNumber: values.partNumber?.trim() ?? "",
        width,
        height,
        maxHeight,
        color: values.color || "#39c6e8",
      }, dialog.component?.id);
      onClose();
    }
  };

  const confirm = () => {
    if (!dialog || (dialog.kind !== "confirm" && dialog.kind !== "import-preview" && dialog.kind !== "project-import-preview")) return;
    if (dialog.kind === "confirm") dialog.onConfirm();
    else if (dialog.kind === "project-import-preview") dialog.onCommit();
    else dialog.onCommit();
    onClose();
  };

  const isForm = dialog && [
    "new-project",
    "project-settings",
    "save-template",
    "rename-template",
    "component",
  ].includes(dialog.kind);

  return (
    <Dialog open={Boolean(dialog)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        data-dialog-tone={dialog?.kind === "confirm" ? "danger" : "engineering"}
        className="pcb-dialog max-h-[88vh] max-w-xl gap-4 overflow-y-auto p-5 text-slate-100"
      >
        {dialog?.kind === "confirm" && (
          <>
            <DialogHeader>
              <DialogTitle>{dialog.title}</DialogTitle>
              <DialogDescription className="text-slate-300">
                {dialog.description}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>取消</Button>
              <Button type="button" variant="destructive" onClick={confirm}>
                {dialog.confirmLabel ?? "刪除"}
              </Button>
            </DialogFooter>
          </>
        )}

        {dialog?.kind === "project-import-preview" && (
          <div data-testid="project-import-preview">
            <DialogHeader>
              <DialogTitle>{dialog.title}</DialogTitle>
              <DialogDescription className="text-slate-300">
                解析完成後才會寫入；取消不會改動目前資料。
              </DialogDescription>
            </DialogHeader>
            <div className="my-4 flex gap-3 text-sm">
              <span className="rounded-md bg-emerald-400/10 px-2 py-1 text-emerald-200">
                有效 {dialog.validCount} 筆
              </span>
              <span className="rounded-md bg-rose-400/10 px-2 py-1 text-rose-200">
                無效 {dialog.errors.length} 筆
              </span>
            </div>
            {dialog.errors.length > 0 && (
              <div className="max-h-52 overflow-auto rounded-lg border border-rose-300/25 bg-rose-950/20 p-3">
                <ul className="space-y-1 font-mono text-xs text-rose-100">
                  {dialog.errors.map((item, index) => (
                    <li key={`${item.row}-${index}`}>
                      第 {item.row} 列：{item.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={onClose}>取消</Button>
              <Button type="button" disabled={dialog.validCount === 0} onClick={confirm}>
                匯入專案
              </Button>
            </DialogFooter>
          </div>
        )}

        {dialog?.kind === "import-preview" && (
          <div data-testid="import-preview">
            <DialogHeader>
              <DialogTitle>{dialog.title}</DialogTitle>
              <DialogDescription className="text-slate-300">
                {dialog.importKind === "bom"
                  ? "BOM 匯入會建立左側待放置清單，不會直接放到畫布。"
                  : "請先確認有效資料與錯誤摘要，確認後才會匯入元件庫。"}
              </DialogDescription>
            </DialogHeader>
            <div className="my-4 flex flex-wrap gap-3 text-sm">
              <span className="rounded-md bg-slate-400/10 px-2 py-1 text-slate-200">
                總列數 {dialog.totalCount} 筆
              </span>
              <span className="rounded-md bg-emerald-400/10 px-2 py-1 text-emerald-200">
                有效 {dialog.validCount} 筆
              </span>
              <span className="rounded-md bg-rose-400/10 px-2 py-1 text-rose-200">
                錯誤 {dialog.errors.length} 筆
              </span>
              {dialog.importKind === "bom" && (
                <span className="rounded-md bg-sky-400/10 px-2 py-1 text-sky-200">
                  待放置 {dialog.placementCount ?? 0} 筆
                </span>
              )}
            </div>
            {dialog.errors.length > 0 && (
              <div className="max-h-52 overflow-auto rounded-lg border border-rose-300/25 bg-rose-950/20 p-3">
                <ul className="space-y-1 font-mono text-xs text-rose-100">
                  {dialog.errors.slice(0, 100).map((item, index) => (
                    <li key={`${item.row}-${index}`}>
                      第 {item.row} 列：{item.message}
                    </li>
                  ))}
                </ul>
                {dialog.errors.length > 100 && (
                  <p className="mt-3 text-xs text-rose-200">
                    尚有 {dialog.errors.length - 100} 筆錯誤未顯示。
                  </p>
                )}
              </div>
            )}
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={onClose}>取消</Button>
              <Button type="button" disabled={dialog.validCount === 0} onClick={confirm}>
                {dialog.importKind === "library" ? "匯入元件庫" : "建立待放置項目"}
              </Button>
            </DialogFooter>
          </div>
        )}

        {isForm && (
          <form onSubmit={submit} className="workspace-dialog-section workspace-dialog-section--violet rounded-2xl p-4">
            <DialogHeader>
              <DialogTitle>
                {dialog.kind === "new-project" && "新增 PCB 專案"}
                {dialog.kind === "project-settings" && "專案設定"}
                {dialog.kind === "save-template" && "儲存為模板"}
                {dialog.kind === "rename-template" && "重新命名模板"}
                {dialog.kind === "component" && (dialog.component ? "編輯自訂元件" : "新增自訂元件")}
              </DialogTitle>
              <DialogDescription className="text-slate-300">
                儲存前會檢查必要欄位與數值範圍。
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 space-y-3">
              <label className="block text-xs text-slate-300">
                名稱
                <Input
                  value={values.name ?? ""}
                  onChange={(event) => update("name", event.target.value)}
                  className="mt-1 h-9 border-[#356985] bg-[#10263a]"
                  autoFocus
                />
              </label>

              {(dialog.kind === "new-project" || dialog.kind === "project-settings") && (
                <>
                  <label className="block text-xs text-slate-300">
                    描述
                    <Input
                      value={values.description ?? ""}
                      onChange={(event) => update("description", event.target.value)}
                      className="mt-1 h-9 border-[#356985] bg-[#10263a]"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <NumberField label="板寬 (mm)" value={values.width} onChange={(value) => update("width", value)} />
                    <NumberField label="板高 (mm)" value={values.height} onChange={(value) => update("height", value)} />
                  </div>
                  {dialog.kind === "project-settings" && (
                    <label className="block text-xs text-slate-300">
                      狀態
                      <select
                        value={values.status}
                        onChange={(event) => update("status", event.target.value)}
                        className="mt-1 h-9 w-full rounded-md border border-[#356985] bg-[#10263a] px-3 text-sm"
                      >
                        <option value="draft">草稿</option>
                        <option value="review">審核中</option>
                        <option value="approved">已核准</option>
                      </select>
                    </label>
                  )}
                </>
              )}

              {dialog.kind === "save-template" && (
                <>
                  <label className="block text-xs text-slate-300">
                    分類
                    <Input value={values.category ?? ""} onChange={(event) => update("category", event.target.value)} className="mt-1 h-9 border-[#356985] bg-[#10263a]" />
                  </label>
                  <label className="block text-xs text-slate-300">
                    描述
                    <Input value={values.description ?? ""} onChange={(event) => update("description", event.target.value)} className="mt-1 h-9 border-[#356985] bg-[#10263a]" />
                  </label>
                </>
              )}

              {dialog.kind === "component" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <TextField label="類型" value={values.type} onChange={(value) => update("type", value)} />
                    <TextField label="顏色" value={values.color} onChange={(value) => update("color", value)} />
                    <TextField label="製造商" value={values.manufacturer} onChange={(value) => update("manufacturer", value)} />
                    <TextField label="料號" value={values.partNumber} onChange={(value) => update("partNumber", value)} />
                    <NumberField label="板寬 (mm)" value={values.width} onChange={(value) => update("width", value)} />
                    <NumberField label="板高 (mm)" value={values.height} onChange={(value) => update("height", value)} />
                    <NumberField label="最大高度 (mm)" value={values.maxHeight} onChange={(value) => update("maxHeight", value)} />
                  </div>
                </>
              )}
            </div>

            {error && <p className="mt-3 text-sm text-rose-300" role="alert">{error}</p>}
            <DialogFooter className="mt-5">
              <Button type="button" variant="outline" onClick={onClose}>取消</Button>
              <Button type="submit">儲存</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs text-slate-300">
      {label}
      <Input
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-9 border-[#356985] bg-[#10263a]"
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs text-slate-300">
      {label}
      <Input
        type="number"
        min="0.1"
        step="0.1"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-9 border-[#356985] bg-[#10263a] font-mono"
      />
    </label>
  );
}
