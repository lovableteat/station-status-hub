import { placementRefs, type NvBomChange, type NvBomDiff, type NvBomPart, type NvBomPartMetadata } from "./nvBomCompare.ts";

export const NV_BOM_SCOPE_LABELS = {
  component: "元件", board: "PCB 裸板", assembly: "組件", other: "其他資料", unknown: "類別待確認",
} as const;

export const NV_BOM_INTERPRETATION_LABELS = {
  added: "新增項目", removed: "移除項目", mount: "改為上件", unmount: "改為不上件",
  replacement: "換料", refs: "位號變更", qty: "用量變更", sourceAdded: "新增替代來源",
  sourceRemoved: "移除替代來源", sourceChanged: "來源變更", other: "其他資料變更",
} as const;

export type NvBomInterpretationKind = keyof typeof NV_BOM_INTERPRETATION_LABELS;
export type NvBomInterpretationScope = keyof typeof NV_BOM_SCOPE_LABELS;
type MainPlacement = Pick<NonNullable<NvBomPartMetadata["relatedPlacement"]>, "sourceRow" | "partNumber" | "mpn" | "manufacturer" | "refs">;

export interface NvBomInterpretedChange {
  change: NvBomChange;
  kind: NvBomInterpretationKind;
  scope: NvBomInterpretationScope;
  summary: string;
  removedRefs: string[];
  addedRefs: string[];
  mountedRefs: string[];
  unmountedRefs: string[];
  relatedSourceRows: { before: number[]; after: number[] };
  relatedMain: { before?: MainPlacement; after?: MainPlacement };
}

const normalize = (value?: string) => (value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toUpperCase();
const knownIdentifier = (value?: string) => {
  const normalized = normalize(value);
  return /^(?:[-–—]+|N\/?A|N\.A\.|NONE|NULL|未提供|未填寫)$/.test(normalized) ? "" : normalized;
};

export function nvBomSourceListDelta(before: string, after: string) {
  // A comma can be part of a manufacturer's name. NV lists use semicolons or line breaks.
  const members = (value: string) => {
    const result = new Map<string, string>();
    for (const entry of value.split(/[;；\r\n]+/)) {
      const key = knownIdentifier(entry);
      if (key && !result.has(key)) result.set(key, entry.trim());
    }
    return result;
  };
  const previous = members(before), current = members(after);
  const difference = (left: Map<string, string>, right: Map<string, string>) =>
    [...left].filter(([key]) => !right.has(key)).map(([, value]) => value);
  return { added: difference(current, previous), removed: difference(previous, current) };
}
const differentIdentifier = (before: string, after: string) => {
  const a = knownIdentifier(before), b = knownIdentifier(after);
  return Boolean(a && b && a !== b);
};
type ScopeEvidence = Pick<NvBomPartMetadata, "level" | "materialCategory" | "mountMethod" | "itemType" | "refs"> & { description: string };

function evidenceScope({ level, materialCategory, mountMethod, itemType, refs, description }: ScopeEvidence): NvBomInterpretationScope {
  const locations = placementRefs(refs);
  const label = normalize(description);
  const category = normalize(materialCategory);
  const type = normalize(itemType);
  if (/^(?:PCBA|PCA|ASSY|ASSEMBLY|SUB[ -]?BOM)(?:\b|$)|^(?:PCB|PWB|BOARD)\s+(?:ASSY|ASSEMBLY)\b/.test(label)
    || /^(?:PCB ASSEMBLY|ASSEMBLY|SUB[ -]?BOM|PCBA)$/.test(category)
    || type === "PROJECT PART" && /^[01]$/.test(normalize(level)) && !locations.length) return "assembly";
  if (/^(?:BARE PCB|BARE BOARD|BARE PRINTED CIRCUIT BOARD|PCB|PWB|PRINTED CIRCUIT BOARD)$/.test(category)
    || !locations.length && /^(?:BARE BOARD|BARE PCB|PCB|PWB|PRINTED CIRCUIT BOARD)\b/.test(label)) return "board";
  if (/^(?:DOCUMENT|MANUFACTURER DOCUMENT|FIRMWARE|PACKAGING|MECHANICAL)(?:\b|$)/.test(type)
    || /^(?:DOCUMENT|FIRMWARE|PACKAGING|MECHANICAL|FASTENER|LABEL)$/.test(category)
    || /^(?:DOCUMENT|FIRMWARE|LABEL|SCREW|WASHER|NUT|BRACKET|STANDOFF|HEAT[ -]?SINK|PACKAGING)\b/.test(label)) return "other";
  if (/^(?:NVIDIA SILICON PART|ELECTRONIC COMPONENT|COMPONENT)$/.test(type)
    || /^(?:RESISTOR|CAPACITOR|INDUCTOR|TRANSISTOR|DIODE|CONNECTOR|IC|INTEGRATED CIRCUIT)$/.test(category)
    || locations.length && (/(?:^|\b)(?:SMT|DIP|SMD|THT)(?:\b|$)/.test(normalize(mountMethod)) || locations.every(ref => /^(?:R|C|L|U|D|Q|J|F|FB|Y|X|LED|SW|CN|VR|TVS)\d/.test(ref)))) return "component";
  return "unknown";
}

function summarizeScope(scopes: NvBomInterpretationScope[]): NvBomInterpretationScope {
  const supported = [...new Set(scopes.filter(scope => scope !== "unknown"))];
  return supported.length === 1 ? supported[0] : "unknown";
}

function partScope(part: NvBomPart | undefined): NvBomInterpretationScope {
  if (!part) return "unknown";
  if (!part.metadata?.length) return evidenceScope(part);
  return summarizeScope(part.metadata.map(row => {
    const direct = evidenceScope({ ...row, description: part.description });
    if (direct !== "unknown" || !row.relatedPlacement) return direct;
    return evidenceScope(row.relatedPlacement);
  }));
}

const doNotMount = /^(?:DNP|DNI|DNM|DO NOT (?:POPULATE|INSTALL|MOUNT|FIT|STUFF)|NOT (?:FITTED|MOUNTED|POPULATED|INSTALLED)|NO (?:POP|STUFF)|UNPOPULATED|不上件|不打件|不實裝|不裝|不安裝)$/;
const mounted = /^(?:MOUNT(?:ED)?|POPULATE(?:D)?|FIT(?:TED)?|INSTALL(?:ED)?|STUFF(?:ED)?|上件|實裝|打件|安裝)$/;

function mountState(row: Pick<NvBomPartMetadata, "population" | "primary" | "sourceRole" | "qty">): "mounted" | "unmounted" | undefined {
  if (row.sourceRole === "alternate") return undefined;
  const population = normalize(row.population);
  if (doNotMount.test(population)) return "unmounted";
  if (mounted.test(population)) return "mounted";
  if (row.sourceRole === "aml" || !/^\+?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(normalize(row.qty))) return undefined;
  const qty = Number(normalize(row.qty).replace(/,/g, ""));
  if (qty === 0) return "unmounted";
  if (!/^(?:FALSE|NO|N|0)$/.test(normalize(row.primary))) return "mounted";
}

function statesByRef(part: NvBomPart | undefined) {
  const states = new Map<string, { state: ReturnType<typeof mountState>; parent: string } | undefined>();
  if (!part) return states;
  const rows = part.metadata?.length ? part.metadata : [{ refs: part.refs, qty: part.qty, parentNumber: "" }];
  for (const row of rows) {
    const state = { state: mountState(row), parent: knownIdentifier(row.parentNumber) };
    for (const ref of placementRefs(row.refs)) states.set(ref, states.has(ref) ? undefined : state);
  }
  return states;
}

function isSource(part?: NvBomPart) {
  return Boolean(part?.metadata?.length && part.metadata.every(row => row.sourceRole === "alternate" || row.sourceRole === "aml"));
}

function relatedSourceRows(part?: NvBomPart) {
  const own = new Set(part?.sourceRows);
  return [...new Set(part?.metadata?.flatMap(row => row.relatedSourceRows ?? []))].filter(row => !own.has(row)).sort((a, b) => a - b);
}

function relatedMain(part?: NvBomPart): MainPlacement | undefined {
  const linked = part?.metadata?.map(row => row.relatedPlacement) ?? [];
  const anchor = linked[0];
  if (!anchor || !linked.every(row => row?.sourceRow === anchor.sourceRow)) return undefined;
  const { sourceRow, partNumber, mpn, manufacturer, refs } = anchor;
  return { sourceRow, partNumber, mpn, manufacturer, refs };
}

function describeChange(change: NvBomChange): NvBomInterpretedChange {
  const { before, after, changedFields, changedMetadata = [] } = change;
  const scope = summarizeScope([partScope(before), partScope(after)]);
  const scopeLabel = scope === "unknown" ? "項目" : NV_BOM_SCOPE_LABELS[scope];
  const oldRefs = placementRefs(before?.refs ?? ""), newRefs = placementRefs(after?.refs ?? "");
  const oldRefSet = new Set(oldRefs), newRefSet = new Set(newRefs);
  const removedRefs = oldRefs.filter(ref => !newRefSet.has(ref));
  const addedRefs = newRefs.filter(ref => !oldRefSet.has(ref));
  const oldStates = statesByRef(before), newStates = statesByRef(after);
  const commonRefs = oldRefs.filter(ref => {
    const old = oldStates.get(ref), newer = newStates.get(ref);
    return old && newer && (!old.parent || !newer.parent || old.parent === newer.parent);
  });
  const mountedRefs: string[] = [], unmountedRefs: string[] = [];
  if (scope === "component" && before && after && !differentIdentifier(before.partNumber, after.partNumber) && !differentIdentifier(before.mpn, after.mpn)) {
    for (const ref of commonRefs) {
      if (oldStates.get(ref)?.state === "unmounted" && newStates.get(ref)?.state === "mounted") mountedRefs.push(ref);
      if (oldStates.get(ref)?.state === "mounted" && newStates.get(ref)?.state === "unmounted") unmountedRefs.push(ref);
    }
  }
  const base = { change, scope, removedRefs, addedRefs, mountedRefs, unmountedRefs,
    relatedSourceRows: { before: relatedSourceRows(before), after: relatedSourceRows(after) },
    relatedMain: { before: relatedMain(before), after: relatedMain(after) } };

  if (change.kind === "added") return isSource(after)
    ? { ...base, kind: "sourceAdded", summary: `${scopeLabel}新增替代來源` }
    : { ...base, kind: "added", summary: `新版 BOM 新增${scopeLabel}` };
  if (change.kind === "removed") return isSource(before)
    ? { ...base, kind: "sourceRemoved", summary: `${scopeLabel}移除替代來源` }
    : { ...base, kind: "removed", summary: `新版 BOM 移除${scopeLabel}` };
  if (mountedRefs.length || unmountedRefs.length) return {
    ...base, kind: mountedRefs.length ? "mount" : "unmount",
    summary: [mountedRefs.length ? `${mountedRefs.length} 個位號由不上件改為上件` : "", unmountedRefs.length ? `${unmountedRefs.length} 個位號由上件改為不上件` : ""].filter(Boolean).join("，"),
  };

  const oldSourceNumber = knownIdentifier(before?.partNumber);
  const sameSourceNumber = Boolean(oldSourceNumber && oldSourceNumber === knownIdentifier(after?.partNumber));
  const sourceChanged = changedFields.includes("mpn") || changedFields.includes("manufacturer");
  if (sourceChanged && (isSource(before) && isSource(after) || sameSourceNumber && (commonRefs.length > 0 || scope === "board") && !removedRefs.length && !addedRefs.length)) {
    return { ...base, kind: "sourceChanged", summary: `${scopeLabel}的廠商或廠商料號變更` };
  }
  if (scope === "component" && commonRefs.length && before && after && (differentIdentifier(before.partNumber, after.partNumber) || differentIdentifier(before.mpn, after.mpn))) {
    return { ...base, kind: "replacement", summary: `${commonRefs.length} 個相同位號更換料件` };
  }
  const qtySummary = changedFields.includes("qty") ? `用量 ${before?.qty || "未提供"} → ${after?.qty || "未提供"}` : "";
  if (changedFields.includes("refs") && (removedRefs.length || addedRefs.length)) {
    const refsSummary = [removedRefs.length ? `移除 ${removedRefs.length} 個位號` : "", addedRefs.length ? `增加 ${addedRefs.length} 個位號` : "", qtySummary];
    return { ...base, kind: "refs", summary: refsSummary.filter(Boolean).join("，") };
  }
  if (qtySummary) return { ...base, kind: "qty", summary: qtySummary };
  if (changedMetadata.includes("source")) return { ...base, kind: "sourceChanged", summary: "來源策略變更" };
  return { ...base, kind: "other", summary: changedMetadata.includes("population") || changedMetadata.includes("primary") ? "上件欄位有變動，位號或狀態仍待確認" : `${scopeLabel}資料有變更` };
}

export function interpretNvBomDiff(diff: NvBomDiff) {
  const entries = diff.changes.map(describeChange);
  const counts = Object.fromEntries(Object.keys(NV_BOM_INTERPRETATION_LABELS).map(kind => [kind, 0])) as Record<NvBomInterpretationKind, number>;
  for (const entry of entries) counts[entry.kind]++;
  const componentCount = entries.filter(entry => entry.scope === "component").length;
  return { entries, counts, componentCount, otherCount: entries.length - componentCount };
}
