import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function LoadingStatus({ label, className }: { label: string; className?: string }) {
  return (
    <span role="status" data-ui="loading-status" className={cn("platform-loading-status", className)}>
      <LoaderCircle aria-hidden="true" data-platform-spinner="" />
      <span>{label}</span>
    </span>
  );
}
