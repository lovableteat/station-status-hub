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
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface BulkResetDialogProps {
  onReset: () => void;
}

export function BulkResetDialog({ onReset }: BulkResetDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
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
        title: "Project reset complete",
        description: `${activeProject?.name ?? "Current project"} progress was reset without touching other projects.`,
      });

      onReset();
    } catch (error) {
      console.error("Error during project reset:", error);
      toast({
        title: "Project reset failed",
        description: "Unable to reset progress for the active project.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="destructive"
          className="h-11 rounded-xl border-red-600 bg-red-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-red-700"
        >
          <RotateCcw className="mr-2 h-4 w-4 shrink-0" />
          Reset Project
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-red-600">
            Reset the active project?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This only resets systems inside{" "}
            <strong>{activeProject?.name ?? "the active project"}</strong>.
            Other projects keep their existing data.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleResetAllProgress}
            disabled={isLoading}
            className="bg-red-600 hover:bg-red-700"
          >
            {isLoading ? "Resetting..." : "Reset Project"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
