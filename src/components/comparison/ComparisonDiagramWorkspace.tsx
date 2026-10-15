import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import ComparisonDiagramEditor, { type DiagramEditorProps } from "./ComparisonDiagramEditor";
import DrawioDiagramEditor from "./DrawioDiagramEditor";
import { createBlankDrawioDocument, validateDrawioXml, type DrawioDocument } from "./drawioDocument";
import { diagramToDrawioXml } from "./diagramDrawioExport";
import type { DiagramDocument } from "./diagramModel";

export default function ComparisonDiagramWorkspace(props: DiagramEditorProps) {
  const generated = useMemo(() => {
    if (!props.initialSource || !props.session) return undefined;
    const { kind, revision } = props.initialSource;
    const artifact = props.session.result.artifacts.find(item => item.key === `${kind === "power" ? "power" : "i2c"}_drawio_${revision}`);
    if (!artifact) return undefined;
    try {
      const xml = validateDrawioXml(new TextDecoder("utf-8", { fatal: true }).decode(artifact.bytes));
      return { ...createBlankDrawioDocument(`${props.session.projectName} · ${kind === "power" ? "Power Tree" : "I²C Map"} · ${props.session.result.meta[revision].label}`.slice(0, 240)), xml };
    } catch { return undefined; }
  }, [props.initialSource, props.session]);
  const [engine, setEngine] = useState<"drawio" | "quick">(() => props.initialSource && !generated ? "quick" : "drawio");
  const [converted, setConverted] = useState<DrawioDocument>();
  const [consumedSource, setConsumedSource] = useState<typeof props.initialSource>();
  // A new source navigation takes priority over the previously selected editor.
  const incoming = props.initialSource && props.initialSource !== consumedSource;
  const selected = incoming ? generated ? "drawio" : "quick" : engine;
  const openNative = (document: DiagramDocument) => {
    setConverted({ ...createBlankDrawioDocument(document.title), xml: diagramToDrawioXml(document) });
    setEngine("drawio");
  };
  const consume = () => { if (incoming) setEngine(generated ? "drawio" : "quick"); setConsumedSource(props.initialSource); props.onSourceConsumed?.(); };
  return <div className="comparison-diagram-workspace">
    {selected === "quick" && <div className="diagram-engine-tools"><span>快速繪圖</span><Button variant="outline" onClick={() => { setEngine("drawio"); setConsumedSource(props.initialSource); }}>DRAWIO 完整圖形庫</Button></div>}
    {selected === "drawio" ? <DrawioDiagramEditor key={props.accountId} accountId={props.accountId} canEdit={props.canEdit} capturePersistence={props.capturePersistence} initialDocument={incoming ? generated : converted} onInitialConsumed={() => { if (incoming) consume(); setConverted(undefined); }} onQuickEditor={() => { setEngine("quick"); setConsumedSource(props.initialSource); }} /> : <ComparisonDiagramEditor {...props} onSourceConsumed={consume} onOpenDrawio={openNative} />}
  </div>;
}
