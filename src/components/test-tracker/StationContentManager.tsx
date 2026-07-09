
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Save, Trash2, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useTestProject } from "@/components/test-projects/TestProjectProvider";

interface StationContent {
  id: string;
  title: string;
  content: string;
  order_num: number;
}

interface StationContentTheme {
  contentPanel: string;
  contentHeader: string;
  contentSurface: string;
  contentForm: string;
  contentCard: string;
  contentEmpty: string;
  contentButton: string;
  contentButtonGhost: string;
  contentIcon: string;
  contentBadge: string;
}

interface StationContentManagerProps {
  stationId: string;
  stationName: string;
  contents: StationContent[];
  theme?: StationContentTheme;
  onUpdate: () => void;
}

const defaultTheme: StationContentTheme = {
  contentPanel: "border-sky-200/38 bg-gradient-to-br from-slate-900/96 via-sky-950/88 to-cyan-500/[0.16] shadow-[0_24px_70px_-38px_rgba(56,189,248,0.76)]",
  contentHeader: "border-sky-200/30 bg-gradient-to-r from-sky-400/[0.20] via-slate-900/74 to-cyan-400/[0.14]",
  contentSurface: "border-sky-200/26 bg-sky-400/[0.10]",
  contentForm: "border-sky-200/26 bg-sky-400/[0.10]",
  contentCard: "border-sky-200/30 bg-gradient-to-br from-sky-400/[0.12] via-slate-900/86 to-cyan-400/[0.08] hover:border-sky-100/55 hover:bg-sky-300/[0.18]",
  contentEmpty: "border-sky-200/26 bg-sky-400/[0.10]",
  contentButton: "border-cyan-100/45 bg-cyan-300/[0.28] text-white hover:bg-cyan-300/[0.38]",
  contentButtonGhost: "border-sky-200/34 bg-sky-300/[0.12] text-sky-50 hover:border-cyan-100/55 hover:bg-cyan-300/[0.22] hover:text-white",
  contentIcon: "border-cyan-100/55 bg-cyan-300/[0.28] text-white",
  contentBadge: "border-cyan-100/55 bg-cyan-300/[0.28] text-white",
};

export function StationContentManager({ 
  stationId, 
  stationName, 
  contents, 
  theme,
  onUpdate 
}: StationContentManagerProps) {
  const { toast } = useToast();
  const { activeProjectId } = useTestProject();
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingContent, setEditingContent] = useState<StationContent | null>(null);
  const [formValues, setFormValues] = useState({ title: "", content: "" });
  const activeTheme = theme ?? defaultTheme;
  const isEditing = Boolean(editingContent);
  const sortedContents = [...contents].sort((a, b) => a.order_num - b.order_num);

  const resetForm = () => {
    setFormValues({ title: "", content: "" });
  };

  const closeEditor = () => {
    setIsEditorOpen(false);
    setEditingContent(null);
    resetForm();
  };

  const handleDialogChange = (open: boolean) => {
    if (!open) {
      closeEditor();
      return;
    }

    setIsEditorOpen(true);
  };

  const openAddDialog = () => {
    setEditingContent(null);
    resetForm();
    setIsEditorOpen(true);
  };

  const openEditDialog = (content: StationContent) => {
    setEditingContent(content);
    setFormValues({ title: content.title, content: content.content });
    setIsEditorOpen(true);
  };

  const handleSubmit = async () => {
    if (!formValues.title.trim()) {
      toast({
        title: "請填寫標題",
        variant: "destructive"
      });
      return;
    }

    try {
      if (editingContent) {
        const { error } = await supabase
          .from("station_contents")
          .update({
            title: formValues.title.trim(),
            content: formValues.content.trim()
          })
          .eq("id", editingContent.id);

        if (error) throw error;

        toast({
          title: "更新成功",
          description: "流程內容已更新"
        });
      } else {
        if (!activeProjectId) {
          throw new Error("No active project");
        }

        const maxOrder = contents.length > 0 ? Math.max(...contents.map((content) => content.order_num)) : 0;

        const { error } = await supabase
          .from("station_contents")
          .insert({
            project_id: activeProjectId,
            station_id: stationId,
            title: formValues.title.trim(),
            content: formValues.content.trim(),
            order_num: maxOrder + 1
          });

        if (error) throw error;

        toast({
          title: "新增成功",
          description: "流程內容已新增"
        });
      }

      closeEditor();
      onUpdate();
    } catch (error) {
      console.error("Error saving content:", error);
      toast({
        title: isEditing ? "更新失敗" : "新增失敗",
        description: "請稍後再試",
        variant: "destructive"
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('確定要刪除這個流程內容嗎？')) return;

    try {
      const { error } = await supabase
        .from('station_contents')
        .delete()
        .eq('id', id);

      if (error) throw error;

      onUpdate();
      
      toast({
        title: "刪除成功",
        description: "流程內容已刪除"
      });
    } catch (error) {
      console.error('Error deleting content:', error);
      toast({
        title: "刪除失敗",
        description: "請稍後再試",
        variant: "destructive"
      });
    }
  };

  return (
    <Card className={cn("overflow-hidden rounded-[1.35rem] backdrop-blur-xl", activeTheme.contentPanel)}>
      <CardHeader className={cn("border-b px-5 py-4", activeTheme.contentHeader)}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-3 text-lg sm:text-lg">
            <span className={cn("flex h-11 w-11 items-center justify-center rounded-2xl border shadow-[0_12px_28px_-18px_rgba(34,211,238,0.8)]", activeTheme.contentIcon)}>
              <FileText className="h-5 w-5" />
            </span>
            <div className="flex flex-col">
              <span>{stationName} - 流程內容管理</span>
              <span className="text-sm font-normal text-muted-foreground">{contents.length} 個流程段落</span>
            </div>
          </CardTitle>
          <Button
            onClick={openAddDialog}
            variant="outline"
            size="sm"
            className={cn("h-10 rounded-xl px-4 text-sm font-semibold shadow-[0_14px_34px_-22px_rgba(34,211,238,0.72)] transition-all duration-200 hover:-translate-y-0.5 active:translate-y-px", activeTheme.contentButton)}
          >
            <Plus className="h-4 w-4 mr-2" />
            新增內容
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="relative space-y-3 before:absolute before:left-[1.15rem] before:top-4 before:bottom-4 before:w-px before:bg-gradient-to-b before:from-cyan-200/50 before:via-sky-400/20 before:to-transparent">
          {contents.length === 0 ? (
            <div className={cn("rounded-2xl border p-8 text-center text-muted-foreground", activeTheme.contentEmpty)}>
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-sm">尚未新增任何流程內容</p>
              <p className="mt-1 text-sm">點擊上方「新增內容」開始建立</p>
            </div>
          ) : (
            sortedContents.map((content, index) => {
              const fullContent = content.content?.trim() || "尚未填寫流程內容";

              return (
                <Card
                  key={content.id}
                  className={cn(
                    "group relative overflow-hidden rounded-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_24px_64px_-38px_rgba(56,189,248,0.95),inset_0_1px_0_rgba(255,255,255,0.08)] active:translate-y-px",
                    "before:absolute before:inset-y-0 before:left-0 before:w-1.5 before:bg-gradient-to-b before:from-cyan-100 before:via-sky-300 before:to-cyan-400/30",
                    activeTheme.contentCard
                  )}
                  style={{ animationDelay: `${index * 45}ms` }}
                >
                  <CardContent className="p-4 pl-5 sm:p-5 sm:pl-6">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 rounded-2xl border border-transparent px-2 py-1">
                          <div className="flex min-w-0 items-center gap-2">
                            <Badge variant="outline" className={cn("grid h-8 min-w-8 shrink-0 place-items-center rounded-full px-2 text-xs font-bold shadow-[0_0_0_1px_rgba(255,255,255,0.10),0_10px_26px_-14px_rgba(34,211,238,0.95)]", activeTheme.contentBadge)}>
                              {index + 1}
                            </Badge>
                            <h4 className="truncate text-[15px] font-semibold tracking-[0.01em] text-slate-50">{content.title}</h4>
                          </div>
                          <p className="mt-3 line-clamp-4 whitespace-pre-wrap rounded-xl border border-sky-200/12 bg-slate-950/42 px-3 py-2 text-[13px] leading-6 text-slate-200/95 transition-colors duration-200 group-hover:border-cyan-100/28 group-hover:bg-slate-950/58 group-hover:text-white">
                            {fullContent}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <Button
                            onClick={() => openEditDialog(content)}
                            variant="outline"
                            size="sm"
                            className={cn("h-9 w-9 rounded-xl p-0 shadow-[0_10px_24px_-18px_rgba(125,211,252,0.75)] transition-all duration-200 hover:-translate-y-0.5 active:translate-y-px", activeTheme.contentButtonGhost)}
                            title={`編輯 ${content.title}`}
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button
                            onClick={() => handleDelete(content.id)}
                            variant="ghost"
                            size="sm"
                            className="h-9 w-9 rounded-xl border border-red-200/34 bg-red-400/[0.14] p-0 text-red-100 shadow-[0_10px_24px_-18px_rgba(248,113,113,0.65)] transition-all duration-200 hover:-translate-y-0.5 hover:border-red-100/55 hover:bg-red-400/[0.24] hover:text-white active:translate-y-px"
                            title={`刪除 ${content.title}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <HoverCard openDelay={120} closeDelay={90}>
                        <HoverCardTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex rounded-full border border-cyan-200/15 bg-cyan-300/[0.07] px-3 py-1 text-[11px] font-medium text-cyan-50/82 transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-200/30 hover:bg-cyan-300/[0.12] hover:text-cyan-50 active:translate-y-px"
                          >
                            移入查看完整內容
                          </button>
                        </HoverCardTrigger>
                        <HoverCardContent
                          side="right"
                          align="start"
                          sideOffset={12}
                          className={cn(
                            "w-[min(26rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/10 p-0 text-slate-100 shadow-[0_28px_72px_-34px_rgba(2,6,23,0.82)] backdrop-blur-2xl",
                            activeTheme.contentPanel
                          )}
                        >
                          <div className={cn("border-b border-white/8 px-4 py-3", activeTheme.contentHeader)}>
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge
                                variant="outline"
                                className={cn("px-2 py-0.5 text-[11px] font-medium", activeTheme.contentBadge)}
                              >
                                段落 {index + 1}
                              </Badge>
                              <h5 className="text-[13px] font-semibold tracking-[0.01em] text-slate-50">
                                {content.title}
                              </h5>
                            </div>
                          </div>
                          <div className="px-4 py-4">
                            <p className="whitespace-pre-wrap text-[13px] leading-6 text-slate-100/92">
                              {fullContent}
                            </p>
                          </div>
                        </HoverCardContent>
                      </HoverCard>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </CardContent>

      <Dialog open={isEditorOpen} onOpenChange={handleDialogChange}>
        <DialogContent className={cn("overflow-hidden rounded-[1.35rem] border p-0 shadow-[0_30px_90px_-46px_rgba(56,189,248,0.72)] backdrop-blur-2xl sm:max-w-2xl", activeTheme.contentPanel)}>
          <DialogHeader className={cn("border-b px-6 py-5", activeTheme.contentHeader)}>
            <div className="flex items-start gap-3">
              <span className={cn("mt-0.5 flex h-11 w-11 items-center justify-center rounded-2xl border shadow-[0_12px_28px_-18px_rgba(34,211,238,0.8)]", activeTheme.contentIcon)}>
                {isEditing ? <Edit className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
              </span>
              <div className="space-y-1">
                <DialogTitle className="text-left text-xl text-foreground">
                  {isEditing ? `編輯 ${stationName} 流程內容` : `新增 ${stationName} 流程內容`}
                </DialogTitle>
                <DialogDescription className="text-left text-sm text-muted-foreground">
                  {isEditing
                    ? "原本資料已自動帶入，你可以在視窗內完整檢視後再修改。"
                    : "在這裡新增新的流程段落，儲存後會直接更新到目前站點。"}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-5 px-6 py-5">
            {editingContent && (
              <div className={cn("rounded-2xl border px-4 py-3", activeTheme.contentSurface)}>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant="outline" className={cn("text-xs", activeTheme.contentBadge)}>
                    段落 {editingContent.order_num}
                  </Badge>
                  <span className="text-muted-foreground">目前正在編輯</span>
                  <span className="font-medium text-foreground">{editingContent.title}</span>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="station-content-title">標題</Label>
              <Input
                id="station-content-title"
                placeholder="請輸入流程段落標題"
                value={formValues.title}
                onChange={(e) => setFormValues({ ...formValues, title: e.target.value })}
                className="h-11 rounded-xl border-sky-300/18 bg-slate-950/70 text-sm text-slate-50 placeholder:text-slate-500 focus-visible:ring-cyan-300/45"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="station-content-body">內容描述</Label>
                <span className="text-xs text-muted-foreground">{formValues.content.length} 字元</span>
              </div>
              <Textarea
                id="station-content-body"
                placeholder="請輸入詳細流程內容"
                value={formValues.content}
                onChange={(e) => setFormValues({ ...formValues, content: e.target.value })}
                rows={12}
                className="min-h-[320px] resize-y rounded-xl border-sky-300/18 bg-slate-950/70 text-sm leading-7 text-slate-50 placeholder:text-slate-500 focus-visible:ring-cyan-300/45"
              />
            </div>
          </div>

          <DialogFooter className={cn("border-t px-6 py-4", activeTheme.contentHeader)}>
            <Button
              type="button"
              variant="outline"
              onClick={closeEditor}
              className={cn("w-full sm:w-auto", activeTheme.contentButtonGhost)}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleSubmit}
              className={cn("w-full sm:w-auto shadow-sm", activeTheme.contentButton)}
            >
              <Save className="mr-2 h-4 w-4" />
              {isEditing ? "儲存變更" : "新增內容"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
