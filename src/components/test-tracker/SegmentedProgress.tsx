import { cn } from "@/lib/utils";

interface SegmentedProgressProps {
  className?: string;
  label?: string;
  segments?: number;
  value: number;
}

export function SegmentedProgress({
  className,
  label,
  segments = 16,
  value,
}: SegmentedProgressProps) {
  const safeValue = Math.min(100, Math.max(0, value));
  const filledSegments = safeValue > 0 ? Math.max(1, Math.round((safeValue / 100) * segments)) : 0;
  const filledClass =
    safeValue >= 80
      ? "bg-emerald-400 shadow-[0_0_7px_rgba(52,211,153,0.72)]"
      : safeValue >= 34
        ? "bg-amber-300 shadow-[0_0_7px_rgba(252,211,77,0.68)]"
        : "bg-red-400 shadow-[0_0_7px_rgba(248,113,113,0.72)]";

  return (
    <div
      className={cn(
        "flex h-3.5 w-full items-center rounded-md border border-[#294968] bg-[#071629] px-1",
        className
      )}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={safeValue}
    >
      <div
        className="grid h-1.5 w-full gap-1"
        style={{ gridTemplateColumns: `repeat(${segments}, minmax(0, 1fr))` }}
        aria-hidden="true"
      >
        {Array.from({ length: segments }, (_, index) => (
          <span
            key={index}
            className={cn(
              "min-w-0 rounded-full transition-colors duration-200 motion-reduce:transition-none",
              index < filledSegments
                ? filledClass
                : "bg-[#18324d]"
            )}
          />
        ))}
      </div>
    </div>
  );
}
