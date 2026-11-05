import { hasMaterialPartNumber, type MaterialGroup, type MaterialRecord } from "./materialRequestUtils";

interface MaterialDisplayLocation extends MaterialGroup {
  /** Keep personal marks attached to the imported location when its display main changes. */
  sourcePrimaryRecord?: MaterialRecord;
}

export interface MaterialMainGroup extends MaterialGroup {
  locations: MaterialDisplayLocation[];
}

function hasFootprint(value: string | undefined) {
  const normalized = (value ?? "").normalize("NFKC").trim().toUpperCase();
  return Boolean(normalized) && !["-", "—", "--", "N/A", "NA", "NONE", "NULL", "無", "未提供", "未設定", "待確認"].includes(normalized);
}

function presentationPriority(record: MaterialRecord) {
  if (record.isRisk || /不建議使用.*ODM/i.test(record.partUsageStatus ?? "")) return 4;
  if (record.virtualAlternative?.trim()) return 0;
  if (record.partNumber?.trim()) return hasFootprint(record.pcbFootprint) ? 1 : 2;
  return 3;
}

export function sortMaterialAlternatives(group: MaterialGroup) {
  // The source's first row is a tie-breaker, not an exemption from the same
  // virtual / physical+footprint / physical-only priority used for alternatives.
  return [group.primaryRecord, ...group.records.filter(record => record.id !== group.primaryRecord.id)]
    .sort((left, right) => presentationPriority(left) - presentationPriority(right)
      || Number(right.id === group.primaryRecord.id) - Number(left.id === group.primaryRecord.id)
      || left.manufacturer.localeCompare(right.manufacturer));
}

function projectDisplayLocation(group: MaterialGroup): MaterialDisplayLocation {
  const primaryRecord = sortMaterialAlternatives(group)[0];
  if (primaryRecord.id === group.primaryRecord.id) return group;
  return { ...group, sourcePrimaryRecord: group.primaryRecord, primaryRecord,
    name: primaryRecord.name, partName: primaryRecord.partName, partSpec: primaryRecord.partSpec,
    schematicPart: primaryRecord.schematicPart, footprint: primaryRecord.pcbFootprint,
  };
}

export function getMaterialMainKey(group: MaterialGroup) {
  const primary = group.primaryRecord;
  const part = primary.partNumber?.trim().toUpperCase() ?? "";
  const virtual = primary.virtualAlternative?.trim().toUpperCase() ?? "";
  const mpn = primary.manufacturerPartNumber?.trim().toUpperCase() ?? "";
  return part || virtual || mpn || primary.name?.trim() ? `main::${JSON.stringify([part, virtual, primary.manufacturer.trim().toUpperCase(), mpn])}` : group.key;
}

export function getMaterialMarkKeys(group: MaterialGroup) {
  return ((group as MaterialMainGroup).locations ?? [group as MaterialDisplayLocation])
    .map(location => `record::${(location.sourcePrimaryRecord ?? location.primaryRecord).id}`);
}

// This projection never changes the source groups or their per-location records.
export function buildMaterialMainGroups(groups: MaterialGroup[]): MaterialMainGroup[] {
  const merged = new Map<string, MaterialDisplayLocation[]>();
  groups.forEach(sourceGroup => {
    const group = projectDisplayLocation(sourceGroup);
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
