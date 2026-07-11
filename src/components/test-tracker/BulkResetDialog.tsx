import { useState } from "react";
import { RotateCcw } from "lucide-react";

import { useTestProject } from "@/components/test-projects/TestProjectProvider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface BulkResetDialogProps {
  onReset: () => void;
}

export function BulkResetDialog({ onReset }: BulkResetDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [confirmationName, setConfirmationName] = useState("");
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const { activeProject, activeProjectId } = useTestProject();

  const handleResetAllProgress = async () => {
    try {
      setIsLoading(true);

      if (!activeProjectId) {
        throw new Error("No active project");
      }

      const { data: projectSystems, error: projectSystemsError } = await supabase
        .from("test_systems")
        .select("id")
        .eq("project_id", activeProjectId);

      if (projectSystemsError) {
        throw projectSystemsError;
      }

      const systemIds = (projectSystems ?? []).map((system) => system.id);
      if (systemIds.length === 0) {
        onReset();
        return;
      }

      const { error: progressError } = await supabase
        .from("test_progress")
        .update({
          actual_hours: 0,
          completed_at: null,
          notes: null,
          progress_percent: 0,
          started_at: null,
          status: "Not Start",
        })
        .eq("project_id", activeProjectId)
        .in("system_id", systemIds);

      if (progressError) {
        throw progressError;
      }

      const { error: systemError } = await supabase
        .from("test_systems")
        .update({
          actual_completed_at: null,
          actual_started_at: null,
          current_station: "Not Start",
          overall_progress: 0,
          status: "Not Start",
        })
        .eq("project_id", activeProjectId);

      if (systemError) {
        throw systemError;
      }

      toast({
        title: "專案進度已重置",
        description: `${activeProject?.name ?? "目前專案"} 已回到未開始，其他專案未受影響。`,
      });

      onReset();
      setOpen(false);
      setConfirmationName("");
    } catch (error) {
      console.error("Error during project reset:", error);
      toast({
        title: "專案重置失敗",
        description: "無法重置目前專案的測試進度。",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setConfirmationName("");
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 rounded-lg border-amber-300/35 bg-amber-300/10 px-3 text-sm font-semibold text-amber-100 hover:bg-amber-300/18 hover:text-amber-50"
        >
          <RotateCcw className="mr-2 h-4 w-4 shrink-0" />
          重置專案
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-amber-100">
            重置目前專案全部進度？
          </AlertDialogTitle>
          <AlertDialogDescription>
            只會重置 <strong>{activeProject?.name ?? "目前專案"}</strong> 的機台與測項進度，其他專案資料不會改變。
          </AlertDialogDescription>
          <div className="mt-4 space-y-2">
            <label htmlFor="reset-project-confirmation" className="text-sm font-medium">
              輸入專案名稱以確認
            </label>
            <Input
              id="reset-project-confirmation"
              value={confirmationName}
              onChange={(event) => setConfirmationName(event.target.value)}
              placeholder={activeProject?.name ?? "專案名稱"}
            />
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleResetAllProgress}
            disabled={isLoading || confirmationName !== activeProject?.name}
            className="bg-red-600 hover:bg-red-700"
          >
            {isLoading ? "重置中..." : "確認重置"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
