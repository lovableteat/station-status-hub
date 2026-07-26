export function PcbWorkspacePreview() {
  return (
    <div
      className="workspace-card-preview relative h-[122px] overflow-hidden rounded-2xl border border-emerald-300/15 bg-slate-950/55 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
      data-testid="pcb-workspace-preview"
      aria-hidden="true"
    >
      <div className="mb-2 flex items-center justify-between text-[9px] font-bold">
        <span className="tracking-[0.14em] text-emerald-200">PCB LAYOUT</span>
        <span className="font-mono text-slate-400">4 LAYERS</span>
      </div>

      <svg
        className="h-[84px] w-full"
        viewBox="0 0 240 84"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect
          x="1"
          y="1"
          width="238"
          height="82"
          rx="8"
          fill="#06291F"
          stroke="#34D399"
          strokeOpacity="0.42"
        />
        <path
          d="M18 24H48L62 38H96M18 61H54L70 45H106M135 26H170L184 40H222M136 58H176L188 47H222"
          stroke="#5EEAD4"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M18 42H40L52 30H94M145 43H167L180 58H222"
          stroke="#FBBF24"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect
          x="97"
          y="18"
          width="40"
          height="48"
          rx="5"
          fill="#0F172A"
          stroke="#A7F3D0"
          strokeOpacity="0.72"
        />
        {Array.from({ length: 6 }, (_, index) => {
          const y = 23 + index * 7.5;
          return (
            <g key={y}>
              <rect x="91" y={y} width="6" height="3" rx="1" fill="#94A3B8" />
              <rect x="137" y={y} width="6" height="3" rx="1" fill="#94A3B8" />
            </g>
          );
        })}
        <circle cx="18" cy="24" r="3" fill="#FBBF24" />
        <circle cx="18" cy="42" r="3" fill="#FBBF24" />
        <circle cx="18" cy="61" r="3" fill="#FBBF24" />
        <circle cx="222" cy="40" r="3" fill="#FBBF24" />
        <circle cx="222" cy="47" r="3" fill="#FBBF24" />
        <circle cx="222" cy="58" r="3" fill="#FBBF24" />
        <text
          x="117"
          y="44"
          fill="#D1FAE5"
          fontSize="7"
          fontWeight="700"
          textAnchor="middle"
        >
          U1
        </text>
      </svg>
    </div>
  );
}
