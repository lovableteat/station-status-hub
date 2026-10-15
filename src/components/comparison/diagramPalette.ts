import { Circle, Diamond, Square, StickyNote } from "lucide-react";
import { ResistorIcon, CapacitorIcon, GroundIcon, NetNameIcon } from "./DiagramPaletteIcons";

export const diagramPalette = [
  { shape: "rectangle", name: "方框", Icon: Square, color: "#79a9e8", width: 180, height: 90, group: "basic" },
  { shape: "ellipse", name: "圓形", Icon: Circle, color: "#63c8b7", width: 180, height: 90, group: "basic" },
  { shape: "diamond", name: "判斷", Icon: Diamond, color: "#b59bdf", width: 180, height: 120, group: "basic" },
  { shape: "note", name: "備註", Icon: StickyNote, color: "#d6ad65", width: 180, height: 90, group: "basic" },
  { shape: "resistor", name: "電阻", Icon: ResistorIcon, color: "#79a9e8", width: 180, height: 120, group: "electrical" },
  { shape: "capacitor", name: "電容", Icon: CapacitorIcon, color: "#63c8b7", width: 180, height: 120, group: "electrical" },
  { shape: "ground", name: "接地", Icon: GroundIcon, color: "#a4adb9", width: 100, height: 100, group: "electrical" },
  { shape: "netlabel", name: "Net Name", Icon: NetNameIcon, color: "#d6ad65", width: 180, height: 60, group: "electrical" },
] as const;
