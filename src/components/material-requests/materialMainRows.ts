import { hasMaterialPartNumber, type MaterialGroup, type MaterialRecord } from "./materialRequestUtils";

export interface MaterialMainGroup extends MaterialGroup {
  locations: MaterialGroup[];
}

export function sortMaterialAlternatives(group: MaterialGroup) {
  const priority = (record: MaterialRecord) => {
    if (/不建議使用.*ODM/i.test(record.partUsageStatus ?? "")) return 4;
    if (record.virtualAlternative?.trim()) return 0;
    if (record.partNumber?.trim()) return record.pcbFootprint?.trim() ? 1 : 2;
    return 3;
  };
  return [group.primaryRecord, ...group.records.filter(record => record.id !== group.primaryRecord.id)
    .sort((left, right) => priority(left) - priority(right) || left.manufacturer.localeCompare(right.manufacturer))];
}

export function getMaterialMainKey(group: MaterialGroup) {
  const primary = group.primaryRecord;
  const part = primary.partNumber?.trim().toUpperCase() ?? "";
  const virtual = primary.virtualAlternative?.trim().toUpperCase() ?? "";
  const mpn = primary.manufacturerPartNumber?.trim().toUpperCase() ?? "";
  return part || virtual || mpn || primary.name?.trim() ? `main::${JSON.stringify([part, virtual, primary.manufacturer.trim().toUpperCase(), mpn])}` : group.key;
}

export function getMaterialMarkKeys(group: MaterialGroup) {
  return ((group as MaterialMainGroup).locations ?? [group]).map(location => `record::${location.primaryRecord.id}`);
}

// This projection never changes the source groups or their per-location records.
export function buildMaterialMainGroups(groups: MaterialGroup[]): MaterialMainGroup[] {
  const merged = new Map<string, MaterialGroup[]>();
  groups.forEach(group => {
    const primary = group.primaryRecord;
    const key = JSON.stringify([getMaterialMainKey(group), primary.name, primary.virtualAlternative, primary.sourcingStatus,
      primary.partName, primary.partSpec, primary.schematicPart, primary.pcbFootprint, primary.phaseOutStatus, primary.partUsageStatus]);
    const locations = merged.get(key) ?? [];
    locations.push(group);
    merged.set(key, locations);
  });
  return [...merged].map(([key, locations]) => {
    const first = locations[0];
    const quantities = locations.map(location => Number(String(location.qty).replaceAll(",", "")));
    const qty = locations.length === 1 ? first.qty : quantities.every(Number.isFinite)
      ? String(Number(quantities.reduce((sum, value) => sum + value, 0).toPrecision(15))) : "—";
    return { ...first, key, locations, qty,
      name: first.primaryRecord.name,
      partName: first.primaryRecord.partName,
      partSpec: first.primaryRecord.partSpec,
      schematicPart: first.primaryRecord.schematicPart,
      footprint: first.primaryRecord.pcbFootprint,
      requiresApplication: locations.some(location => !location.primaryRecord.applicationExempt && !hasMaterialPartNumber(location.primaryRecord)),
      displayRef: [...new Set(locations.map(location => location.displayRef))].join(", "),
      records: locations.flatMap(location => location.records),
      searchText: locations.map(location => location.primaryRecord.searchText).join(" "),
    };
  });
}
