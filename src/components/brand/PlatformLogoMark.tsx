import { cn } from "@/lib/utils";

interface PlatformLogoMarkProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

/** Compact vector mark for the platform's machine/data/workflow identity. */
export function PlatformLogoMark({ className, size = "md" }: PlatformLogoMarkProps) {
  return (
    <svg
      aria-hidden="true"
      className={cn(
        "shrink-0",
        size === "sm" && "h-8 w-8",
        size === "md" && "h-10 w-10 sm:h-11 sm:w-11",
        size === "lg" && "h-14 w-14",
        className,
      )}
      data-testid="platform-logo-mark"
      fill="none"
      focusable="false"
      viewBox="0 0 48 48"
    >
      <rect
        x="3.75"
        y="3.75"
        width="40.5"
        height="40.5"
        rx="12"
        stroke="currentColor"
        strokeOpacity="0.38"
        strokeWidth="1.5"
      />
      <path
        d="M16 12.5h10a4 4 0 1 1 0 8h-4a4 4 0 1 0 0 8h4a4 4 0 1 1 0 8H16"
        stroke="#54E4F5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
      />
      <path
        d="M12.5 12.5h.01M35.5 20.5h.01M12.5 36.5h.01"
        stroke="#4C8DFF"
        strokeLinecap="round"
        strokeWidth="4"
      />
      <path
        d="M12.5 12.5h2.5M35.5 20.5h-2.5M12.5 36.5H15"
        stroke="#4C8DFF"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}
