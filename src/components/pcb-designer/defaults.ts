import type {
  PcbLibraryComponent,
  PcbPlacedComponent,
  PcbProject,
  PcbTemplate,
} from "./types.ts";

let idSequence = 0;

export const DEFAULT_PCB_BOARD_BACKGROUND = "#0f766e";
export const DEFAULT_PCB_TOP_LAYER_COLOR = "#1aa39a";
export const DEFAULT_PCB_BOTTOM_LAYER_COLOR = "#3157d5";

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
      background: DEFAULT_PCB_BOARD_BACKGROUND,
      layerColors: {
        top: DEFAULT_PCB_TOP_LAYER_COLOR,
        bottom: DEFAULT_PCB_BOTTOM_LAYER_COLOR,
      },
      cuts: [],
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
    shape: "rectangle",
    source: "built-in",
    createdAt: "2026-07-26T00:00:00.000Z",
  }),
);

BUILT_IN_COMPONENTS.push({
  id: "builtin-screw-hole",
  name: "Screw Hole / 螺絲孔",
  type: "Screw Hole",
  manufacturer: "",
  partNumber: "",
  width: 3.2,
  height: 3.2,
  maxHeight: 1.6,
  color: "#f59e0b",
  shape: "circle",
  source: "built-in",
  createdAt: "2026-07-26T00:00:00.000Z",
});

type TemplatePlacement = {
  componentName: string;
  reference: string;
  x: number;
  y: number;
  rotation?: number;
  layer?: PcbPlacedComponent["layer"];
};

function templateComponent(placement: TemplatePlacement): PcbPlacedComponent {
  const component = BUILT_IN_COMPONENTS.find(
    (item) => item.name === placement.componentName,
  );
  if (!component) throw new Error(`Unknown built-in component: ${placement.componentName}`);

  return {
    ...structuredClone(component),
    instanceId: `template-${placement.reference.toLocaleLowerCase()}`,
    reference: placement.reference,
    x: placement.x,
    y: placement.y,
    rotation: placement.rotation ?? 0,
    layer: placement.layer ?? "top",
    locked: false,
  };
}

function createTemplate(
  id: string,
  name: string,
  category: string,
  description: string,
  options: {
    width?: number;
    height?: number;
    background?: string;
    placements?: TemplatePlacement[];
  } = {},
): PcbTemplate {
  const timestamp = "2026-07-26T00:00:00.000Z";
  const project = createBlankProject(name);
  project.id = `${id}-project`;
  project.board = {
    ...project.board,
    width: options.width ?? project.board.width,
    height: options.height ?? project.board.height,
    background: options.background ?? project.board.background,
  };
  project.components = (options.placements ?? []).map(templateComponent);
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
  createTemplate(
    "template-microcontroller",
    "微控制器板",
    "控制",
    "含 MCU、記憶體、USB 與基礎被動元件的控制板起始配置",
    {
      width: 100,
      height: 80,
      background: "#176b68",
      placements: [
        { componentName: "USB-C Connector", reference: "J1", x: 6, y: 40, rotation: 90 },
        { componentName: "DDR4", reference: "U1", x: 30, y: 40 },
        { componentName: "CPU", reference: "U2", x: 52, y: 40 },
        { componentName: "Resistor", reference: "R1", x: 66, y: 35 },
        { componentName: "Capacitor", reference: "C1", x: 66, y: 45 },
        { componentName: "Fan Header", reference: "J2", x: 50, y: 72 },
      ],
    },
  ),
  createTemplate(
    "template-sensor",
    "感測器板",
    "感測",
    "含介面、電源與被動元件的精簡感測器板起始配置",
    {
      width: 70,
      height: 50,
      background: "#17645f",
      placements: [
        { componentName: "USB-C Connector", reference: "J1", x: 6, y: 25, rotation: 90 },
        { componentName: "Power IC", reference: "U1", x: 24, y: 25 },
        { componentName: "CPU", reference: "U2", x: 42, y: 25 },
        { componentName: "Resistor", reference: "R1", x: 57, y: 20 },
        { componentName: "Capacitor", reference: "C1", x: 57, y: 30 },
      ],
    },
  ),
  createTemplate(
    "template-power",
    "電源板",
    "電源",
    "含電源 IC、電感、輸入輸出電容與接頭的電源板起始配置",
    {
      width: 90,
      height: 60,
      background: "#1a6663",
      placements: [
        { componentName: "USB-C Connector", reference: "J1", x: 7, y: 30, rotation: 90 },
        { componentName: "Capacitor", reference: "C1", x: 25, y: 30 },
        { componentName: "Power IC", reference: "U1", x: 40, y: 30 },
        { componentName: "Inductor", reference: "L1", x: 53, y: 30 },
        { componentName: "Capacitor", reference: "C2", x: 66, y: 30 },
        { componentName: "Fan Header", reference: "J2", x: 80, y: 30, rotation: 90 },
      ],
    },
  ),
  createTemplate(
    "template-l10-design",
    "L10 Design",
    "L10",
    "Built-in isolated starter layout for L10 boards.",
    {
      width: 120,
      height: 90,
      background: "#165e5a",
    },
  ),
];
