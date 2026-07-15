import { AlertTriangle, CheckCircle2, ClipboardPenLine, ImagePlus, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type IssueContentField = "description" | "process_notes" | "solution";

interface IssueContentWorkspaceProps {
  description: string;
  processNotes: string;
  solution: string;
  onChange: (field: IssueContentField, content: string) => void;
  onImageUpload: (file: File) => Promise<string>;
  isImageUploading?: boolean;
}

const editorClassName = "min-h-[280px] border-[#2a526f] bg-[#071522]";

export function IssueContentWorkspace({
  description,
  processNotes,
  solution,
  onChange,
  onImageUpload,
  isImageUploading = false,
}: IssueContentWorkspaceProps) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#315b78] bg-[#0a1b2b] shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#294c66] bg-[#10263a] px-4 py-3.5">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-300/30 bg-amber-300/10 text-amber-100">
            <AlertTriangle className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-[#f3f8fc]">問題內容</h2>
            <p className="mt-0.5 text-xs leading-5 text-[#a9c0d1]">分開記錄現象、處理與驗證，圖片會保留在目前作用中的內容頁籤。</p>
          </div>
        </div>
        <Badge className="h-7 gap-1.5 border border-cyan-300/30 bg-cyan-300/10 px-2.5 text-cyan-50 hover:bg-cyan-300/10">
          {isImageUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> : <ImagePlus className="h-3.5 w-3.5" />}
          {isImageUploading ? "正在加入截圖" : "Ctrl+V 貼上截圖"}
        </Badge>
      </div>

      <Tabs defaultValue="description" className="p-3 sm:p-4">
        <TabsList className="grid h-auto w-full grid-cols-3 gap-1 rounded-xl border border-[#294c66] bg-[#071522] p-1.5">
          <TabsTrigger value="description" className="min-h-10 gap-2 rounded-lg text-[#9fb6c7] data-[state=active]:bg-amber-300/15 data-[state=active]:text-amber-50">
            <AlertTriangle className="h-3.5 w-3.5" />問題描述 <span className="text-amber-200">*</span>
          </TabsTrigger>
          <TabsTrigger value="process" className="min-h-10 gap-2 rounded-lg text-[#9fb6c7] data-[state=active]:bg-cyan-300/15 data-[state=active]:text-cyan-50">
            <ClipboardPenLine className="h-3.5 w-3.5" />處理過程
          </TabsTrigger>
          <TabsTrigger value="solution" className="min-h-10 gap-2 rounded-lg text-[#9fb6c7] data-[state=active]:bg-emerald-300/15 data-[state=active]:text-emerald-50">
            <CheckCircle2 className="h-3.5 w-3.5" />解決方案
          </TabsTrigger>
        </TabsList>

        <TabsContent value="description" className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.035] p-3">
          <div className="mb-2.5">
            <h3 className="text-sm font-semibold text-amber-50">問題現象與影響</h3>
            <p className="mt-0.5 text-xs text-[#9fb6c7]">記錄錯誤訊息、發生條件、影響範圍與重現步驟。</p>
          </div>
          <RichTextEditor
            content={description}
            onChange={(content) => onChange("description", content)}
            onImageUpload={onImageUpload}
            placeholder="記錄錯誤現象、發生條件、影響範圍與重現方式..."
            className={editorClassName}
          />
        </TabsContent>

        <TabsContent value="process" className="mt-3 rounded-xl border border-cyan-300/20 bg-cyan-300/[0.035] p-3">
          <div className="mb-2.5">
            <h3 className="text-sm font-semibold text-cyan-50">診斷與處理紀錄</h3>
            <p className="mt-0.5 text-xs text-[#9fb6c7]">依時間記錄檢查、操作步驟、測試結果與下一步。</p>
          </div>
          <RichTextEditor
            content={processNotes}
            onChange={(content) => onChange("process_notes", content)}
            onImageUpload={onImageUpload}
            placeholder="依時間記錄診斷、執行步驟、測試結果與待追蹤事項..."
            className={editorClassName}
          />
        </TabsContent>

        <TabsContent value="solution" className="mt-3 rounded-xl border border-emerald-300/20 bg-emerald-300/[0.035] p-3">
          <div className="mb-2.5">
            <h3 className="text-sm font-semibold text-emerald-50">最終修復與驗證</h3>
            <p className="mt-0.5 text-xs text-[#9fb6c7]">記錄採用方案、變更內容、驗證結果與預防措施。</p>
          </div>
          <RichTextEditor
            content={solution}
            onChange={(content) => onChange("solution", content)}
            onImageUpload={onImageUpload}
            placeholder="記錄採用方案、變更內容、驗證結果與預防措施..."
            className={editorClassName}
          />
        </TabsContent>
      </Tabs>
    </section>
  );
}
