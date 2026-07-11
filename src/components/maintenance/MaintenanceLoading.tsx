export function MaintenanceLoading({ label = "載入專案資料" }: { label?: string }) {
  return (
    <div className="maintenance-page space-y-3" aria-live="polite" aria-busy="true">
      <div className="flex h-12 items-center gap-3">
        <div className="h-10 w-10 animate-pulse rounded-lg bg-[#10263a]" />
        <div className="space-y-2">
          <div className="h-4 w-44 animate-pulse rounded bg-[#10263a]" />
          <div className="h-3 w-28 animate-pulse rounded bg-[#10263a]" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-16 animate-pulse rounded-xl bg-[#0b1b2d]" />
        ))}
      </div>
      <div className="h-[420px] animate-pulse rounded-xl bg-[#0b1b2d]" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
