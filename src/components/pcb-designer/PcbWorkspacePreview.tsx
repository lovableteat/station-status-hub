import { CircuitBoard } from "lucide-react";

export function PcbWorkspacePreview() {
  return (
    <div className="workspace-preview workspace-preview--pcb-designer" data-testid="pcb-workspace-preview" data-workspace-preview="pcb-designer" aria-hidden="true">
      <div className="workspace-preview-caption"><CircuitBoard /><span>板形、元件與走線</span><span className="ml-auto">2D / 3D</span></div>
      <svg className="preview-pcb-board" viewBox="0 0 320 104" fill="none">
        <rect x="10" y="8" width="194" height="88" rx="10" fill="currentColor" fillOpacity=".07" stroke="currentColor" strokeOpacity=".5" />
        {[20,194].flatMap(x => [18,86].map(y => <circle key={`${x}-${y}`} cx={x} cy={y} r="4" stroke="currentColor" strokeOpacity=".65" fill="hsl(var(--background))" />))}
        <path d="M32 30H58L73 45H87M32 52H65L74 60H87M32 74H55L72 66H87M121 36H143L159 29H182M121 52H144L159 60H182M121 68H144L156 77H182" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <rect x="88" y="31" width="34" height="43" rx="4" fill="hsl(var(--secondary))" stroke="currentColor" strokeOpacity=".8" />
        {[0,1,2,3,4].map(pin => <g key={pin}><path d={`M83 ${37+pin*7}H88M122 ${37+pin*7}H127`} stroke="hsl(var(--muted-foreground))" strokeWidth="3" /></g>)}
        {[30,52,74].map(y => <rect key={y} x="28" y={y-3} width="7" height="6" rx="1" fill="hsl(var(--platform-amber))" />)}
        {[29,60,77].map(y => <circle key={y} cx="182" cy={y} r="3" fill="hsl(var(--platform-amber))" />)}
        <path d="M224 74L262 54L306 74L268 94Z" fill="currentColor" fillOpacity=".08" stroke="currentColor" strokeOpacity=".3" />
        <path d="M224 65L262 45L306 65L268 85Z" fill="currentColor" fillOpacity=".12" stroke="currentColor" strokeOpacity=".4" />
        <path d="M224 56L262 36L306 56L268 76Z" fill="currentColor" fillOpacity=".17" stroke="currentColor" strokeOpacity=".6" />
        <path d="M250 47L266 39L282 47V56L266 64L250 56Z" fill="hsl(var(--secondary))" stroke="currentColor" />
        <path d="M250 47L266 55L282 47M266 55V64" stroke="currentColor" />
      </svg>
    </div>
  );
}
