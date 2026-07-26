import type { PcbLibraryComponent, PcbProject, PcbTemplate } from "./types.ts";

let idSequence = 0;

export function createId(prefix = "pcb"): string {
  idSequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${idSequence.toString(36)}`;
}

function now(): string {
  return new Date().toISOString();
}

export function createBlankProject(name = "未命名 PCB 專案"): PcbProject {
  const timestamp = now();

  return {
    schemaVersion: 1,
    id: createId("project"),
    name,
    description: "",
    status: "draft",
    board: {
      width: 100,
      height: 80,
      gridSize: 1,
      showGrid: true,
      snapToGrid: true,
      background: "#0f766e",
    },
    components: [],
    keepouts: [],
    measurements: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

const componentDefinitions = [
  ["CPU", "Processor", "STMicroelectronics", "STM32F407VGT6", 14, 14, 1.6, "#f97316", "U"],
  ["DDR4", "Memory", "Micron", "MT40A512M16", 11, 9, 1.2, "#8b5cf6", "U"],
  ["USB-C Connector", "Connector", "Amphenol", "12401548E4", 9, 7, 3.2, "#0ea5e9", "J"],
  ["Resistor", "Resistor", "Yageo", "RC0603FR-0710KL", 1.6, 0.8, 0.55, "#facc15", "R"],
  ["Capacitor", "Capacitor", "Murata", "GRM188R71C104KA01", 1.6, 0.8, 0.9, "#22c55e", "C"],
  ["Inductor", "Inductor", "TDK", "VLS3012ET-2R2M", 3, 3, 1.4, "#a855f7", "L"],
  ["Power IC", "IC", "Texas Instruments", "TPS62130RGTR", 3, 3, 1, "#ef4444", "U"],
  ["Fan Header", "Connector", "Molex", "47053-1000", 10, 3, 5, "#06b6d4", "J"],
] as const;

export const BUILT_IN_COMPONENTS: PcbLibraryComponent[] = componentDefinitions.map(
  ([name, type, manufacturer, partNumber, width, height, maxHeight, color, reference]) => ({
    id: `builtin-${reference.toLowerCase()}-${partNumber.toLowerCase()}`,
    name,
    type,
    manufacturer,
    partNumber,
    width,
    height,
    maxHeight,
    color,
    source: "built-in",
    createdAt: "2026-07-26T00:00:00.000Z",
  }),
);

function createTemplate(id: string, name: string, category: string, description: string): PcbTemplate {
  const timestamp = "2026-07-26T00:00:00.000Z";
  const project = createBlankProject(name);
  project.id = `${id}-project`;
  project.createdAt = timestamp;
  project.updatedAt = timestamp;

  return {
    id,
    name,
    category,
    description,
    project,
    isBuiltIn: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export const BUILT_IN_TEMPLATES: PcbTemplate[] = [
  createTemplate("template-blank", "空白板", "通用", "從空白 PCB 板開始"),
  createTemplate("template-microcontroller", "微控制器板", "控制", "適合 MCU 控制應用"),
  createTemplate("template-sensor", "感測器板", "感測", "適合感測器介面應用"),
  createTemplate("template-power", "電源板", "電源", "適合電源轉換與供電應用"),
];
