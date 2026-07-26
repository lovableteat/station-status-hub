import type { PcbPlacedComponent, PcbProject } from "../types.ts";

export interface BomExportRow {
  reference: string;
  name: string;
  type: string;
  manufacturer: string;
  partNumber: string;
  quantity: number;
  width: number;
  height: number;
  maxHeight: number;
  layer: string;
}

const referenceSorter = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function compareBomRows(first: BomExportRow, second: BomExportRow): number {
  return first.manufacturer.localeCompare(second.manufacturer)
    || first.partNumber.localeCompare(second.partNumber)
    || first.width - second.width
    || first.height - second.height
    || first.maxHeight - second.maxHeight;
}

export function aggregateBom(components: readonly PcbPlacedComponent[]): BomExportRow[] {
  const grouped = new Map<string, { row: BomExportRow; references: string[]; layers: Set<string> }>();
  for (const component of components) {
    const key = [component.manufacturer, component.partNumber, component.width, component.height, component.maxHeight].join("\u0000");
    const existing = grouped.get(key);
    if (existing) {
      existing.row.quantity += 1;
      existing.references.push(component.reference);
      existing.layers.add(component.layer);
      continue;
    }
    grouped.set(key, {
      row: {
        reference: "", name: component.name, type: component.type, manufacturer: component.manufacturer,
        partNumber: component.partNumber, quantity: 1, width: component.width, height: component.height,
        maxHeight: component.maxHeight, layer: component.layer,
      },
      references: [component.reference],
      layers: new Set([component.layer]),
    });
  }
  return [...grouped.values()]
    .map(({ row, references, layers }) => ({
      ...row,
      reference: references.sort(referenceSorter.compare).join(", "),
      layer: layers.size === 1 ? [...layers][0] : "mixed",
    }))
    .sort(compareBomRows);
}

function escapeCsv(value: unknown): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function exportBomCsv(components: readonly PcbPlacedComponent[]): string {
  const columns = ["Reference", "Name", "Type", "Manufacturer", "Part Number", "Quantity", "Width", "Height", "Max Height", "Layer"];
  const lines = aggregateBom(components).map((row) => [
    row.reference, row.name, row.type, row.manufacturer, row.partNumber, row.quantity,
    row.width, row.height, row.maxHeight, row.layer,
  ].map(escapeCsv).join(","));
  return `\uFEFF${columns.join(",")}\n${lines.join("\n")}`;
}

export function exportProjectJson(project: PcbProject): string {
  return JSON.stringify({ ...project, schemaVersion: 1 }, null, 2);
}
