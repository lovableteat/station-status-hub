import type { DiagramShape } from "./diagramModel";
import { diagramSymbolGraphics } from "./diagramSymbols";

function SymbolIcon({ shape }: { shape: DiagramShape }) {
  return <svg viewBox="0 0 100 100" fill="none" aria-hidden="true">{diagramSymbolGraphics(shape)?.paths.map((path, index) => <path key={index} d={path} fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />)}</svg>;
}
export const ResistorIcon = () => <SymbolIcon shape="resistor" />;
export const CapacitorIcon = () => <SymbolIcon shape="capacitor" />;
export const GroundIcon = () => <SymbolIcon shape="ground" />;
export const NetNameIcon = () => <SymbolIcon shape="netlabel" />;
