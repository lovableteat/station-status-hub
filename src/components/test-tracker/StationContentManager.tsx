
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
  contentPanel: "border-border/70 bg-card/95",
  contentHeader: "border-border/70 bg-background/35",
  contentSurface: "border-border/70 bg-background/35",
  contentForm: "border-border/70 bg-background/35",
  contentCard: "border-border/70 bg-card/85 hover:border-primary/25 hover:bg-primary/[0.03]",
  contentEmpty: "border-border/70 bg-background/25",
  contentButton: "border-primary/25 bg-primary/15 text-primary hover:bg-primary/22",
  contentButtonGhost: "border-border/70 bg-background/55 text-foreground hover:bg-secondary/80",
  contentIcon: "border-primary/25 bg-primary/10 text-primary",
  contentBadge: "border-primary/25 bg-primary/10 text-primary",
};

export function StationContentManager({ 
  stationId, 
  stationName, 
  contents, 
  theme,
  onUpdate 
}: StationContentManagerProps) {
  const { toast } = useToast();
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
        const maxOrder = contents.length > 0 ? Math.max(...contents.map((content) => content.order_num)) : 0;

        const { error } = await supabase
          .from("station_contents")
          .insert({
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
    <Card className={activeTheme.contentPanel}>
      <CardHeader className={cn("border-b", activeTheme.contentHeader)}>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-3 text-lg sm:text-lg">
            <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl border", activeTheme.contentIcon)}>
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
            className={cn("text-sm shadow-sm", activeTheme.contentButton)}
          >
            <Plus className="h-4 w-4 mr-2" />
            新增內容
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
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
                <Card key={content.id} className={cn("relative transition-colors", activeTheme.contentCard)}>
                  <CardContent className="p-4">
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <HoverCard openDelay={120} closeDelay={80}>
                          <HoverCardTrigger asChild>
                            <div className="min-w-0 flex-1 cursor-pointer rounded-2xl border border-transparent px-2 py-2 transition-all duration-200 hover:border-white/10 hover:bg-white/[0.04]">
                              <div className="flex min-w-0 items-center gap-2">
                                <Badge variant="outline" className={cn("shrink-0 text-xs", activeTheme.contentBadge)}>
                                  {index + 1}
                                </Badge>
                                <h4 className="truncate text-sm font-medium">{content.title}</h4>
                              </div>
                              <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                                {fullContent}
                              </p>
                              <div className="mt-3 inline-flex rounded-full border border-amber-200/10 bg-amber-300/[0.08] px-2.5 py-1 text-[11px] text-slate-300/80">
                                移入查看完整內容
                              </div>
                            </div>
                          </HoverCardTrigger>
                          <HoverCardContent
                            side="top"
                            align="start"
                            className={cn(
                              "w-[min(42rem,calc(100vw-2rem))] overflow-hidden rounded-3xl border border-amber-200/75 bg-[linear-gradient(180deg,rgba(255,251,235,0.98),rgba(255,237,213,0.96))] p-0 text-slate-800 shadow-[0_28px_70px_-34px_rgba(180,83,9,0.38)] backdrop-blur-xl"
                            )}
                          >
                            <div className="border-b border-amber-200/80 bg-white/55 px-5 py-4">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge
                                  variant="outline"
                                  className="border-amber-300 bg-amber-100 px-2.5 text-xs font-medium text-amber-700"
                                >
                                  段落 {index + 1}
                                </Badge>
                                <h5 className="text-sm font-semibold text-amber-950">{content.title}</h5>
                              </div>
                            </div>
                            <div className="space-y-3 px-5 py-5">
                              <div className="rounded-2xl border border-amber-200/70 bg-white/75 px-4 py-3">
                                <p className="text-xs font-medium tracking-[0.18em] text-amber-700/80">
                                  完整內容
                                </p>
                              </div>
                              <p className="whitespace-pre-wrap text-sm leading-7 text-amber-950/90">
                                {fullContent}
                              </p>
                            </div>
                          </HoverCardContent>
                        </HoverCard>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            onClick={() => openEditDialog(content)}
                            variant="outline"
                            size="sm"
                            className={cn("h-8 w-8 p-0", activeTheme.contentButtonGhost)}
                            title={`編輯 ${content.title}`}
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button
                            onClick={() => handleDelete(content.id)}
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                            title={`刪除 ${content.title}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </CardContent>

      <Dialog open={isEditorOpen} onOpenChange={handleDialogChange}>
        <DialogContent className={cn("overflow-hidden border p-0 sm:max-w-2xl", activeTheme.contentPanel)}>
          <DialogHeader className={cn("border-b px-6 py-5", activeTheme.contentHeader)}>
            <div className="flex items-start gap-3">
              <span className={cn("mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl border", activeTheme.contentIcon)}>
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
                className="h-11 text-sm"
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
                className="min-h-[320px] resize-y text-sm leading-7"
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
