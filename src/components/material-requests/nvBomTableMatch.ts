import type { MaterialWorkbookRecord } from "./materialRequestUtils";
import type { NvBomChange, NvBomPart } from "./nvBomCompare";

export interface NvBomTableCandidate {
  id: string;
  workspaceId: string;
  refDes: string;
  mpn: string;
  manufacturer: string;
  physicalPartNumber: string;
  virtualPartNumber: string;
  sourceRow?: number;
  assemblyName?: string;
  sectionName?: string;
}

export interface NvBomTableLink {
  state: "matched" | "ambiguous" | "missing" | "unavailable";
  candidates: NvBomTableCandidate[];
  reason?: "manufacturer-mismatch";
}

export const NV_BOM_TABLE_LINK_LABELS = {
  matched: "已對應", ambiguous: "候選待核對", missing: "目前表格無相符項目", unavailable: "目前表格尚未載入",
};

export function currentBomCandidateLabel(candidate: NvBomTableCandidate) {
  return [candidate.physicalPartNumber && `實體 ${candidate.physicalPartNumber}`, candidate.virtualPartNumber && `虛擬 ${candidate.virtualPartNumber}`].filter(Boolean).join(" · ");
}

type TableRecord = Pick<MaterialWorkbookRecord, "id" | "refDes" | "refGroup" | "manufacturerPartNumber" | "manufacturerPartNumberAlt" | "manufacturer" | "partNumber" | "virtualAlternative">
  & Partial<Pick<MaterialWorkbookRecord, "name" | "sourceRow" | "assemblyName" | "sectionName">>;
type NvBomTableIndex = ReadonlyMap<string, ReadonlyMap<string, readonly NvBomTableCandidate[]>>;

const EMPTY_IDENTITIES = new Set(["", "-", "--", "–", "—", "N/A", "NA", "N.A.", "NONE", "NULL", "未提供", "未填寫", "未設定", "無"]);
const normalizeIdentity = (value: string | undefined) => (value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toUpperCase();
const knownText = (value: string | undefined) => EMPTY_IDENTITIES.has(normalizeIdentity(value)) ? "" : (value ?? "").trim();

function placementTokens(value: string) {
  const tokens = normalizeIdentity(value).split(/[\s,;、]+/).filter(Boolean);
  // A range or subassembly label cannot establish an individual placement.
  return tokens.every(token => /^[A-Z][A-Z0-9_]*\d[A-Z0-9_]*$/.test(token) && !token.startsWith("SBOM"))
    ? [...new Set(tokens)] : [];
}

function getTableReference(record: TableRecord) {
  const explicit = knownText(record.refDes);
  if (explicit) return explicit;
  // Legacy imports sometimes populate Ref Group from the label or internal PN.
  const fallback = knownText(record.refGroup);
  const fallbackIdentity = normalizeIdentity(fallback);
  return [record.name, record.partNumber, record.virtualAlternative].some(value => normalizeIdentity(value) === fallbackIdentity) ? "" : fallback;
}

export function buildNvBomTableIndex(workspaceId: string, records: readonly TableRecord[]): NvBomTableIndex {
  const index = new Map<string, Map<string, NvBomTableCandidate[]>>();
  for (const record of records) {
    const mpn = knownText(record.manufacturerPartNumber) || knownText(record.manufacturerPartNumberAlt);
    const refDes = getTableReference(record);
    const refs = placementTokens(refDes);
    if (!mpn || !refs.length) continue;

    const assemblyName = knownText(record.assemblyName);
    const sectionName = knownText(record.sectionName);
    const candidate: NvBomTableCandidate = {
      id: record.id, workspaceId, refDes, mpn,
      manufacturer: knownText(record.manufacturer),
      physicalPartNumber: knownText(record.partNumber),
      virtualPartNumber: knownText(record.virtualAlternative),
      ...(record.sourceRow ? { sourceRow: record.sourceRow } : {}),
      ...(assemblyName ? { assemblyName } : {}),
      ...(sectionName ? { sectionName } : {}),
    };
    const mpnKey = normalizeIdentity(mpn);
    const refIndex = index.get(mpnKey) ?? new Map<string, NvBomTableCandidate[]>();
    for (const ref of refs) {
      const candidates = refIndex.get(ref);
      if (candidates) candidates.push(candidate);
      else refIndex.set(ref, [candidate]);
    }
    index.set(mpnKey, refIndex);
  }
  return index;
}

function matchPart(part: NvBomPart | undefined, index: NvBomTableIndex) {
  if (!part || !knownText(part.mpn)) return [];
  const refs = placementTokens(part.refs);
  const byRef = index.get(normalizeIdentity(part.mpn));
  if (!byRef || refs.length === 0 || !refs.every(ref => byRef.has(ref))) return [];
  const manufacturer = normalizeIdentity(knownText(part.manufacturer));
  return refs.flatMap(ref => {
    const candidates = byRef.get(ref) ?? [];
    const sameManufacturer = manufacturer ? candidates.filter(candidate => normalizeIdentity(candidate.manufacturer) === manufacturer) : [];
    return (sameManufacturer.length ? sameManufacturer : candidates).map(candidate => ({
      candidate,
      manufacturerConflict: Boolean(manufacturer && candidate.manufacturer && normalizeIdentity(candidate.manufacturer) !== manufacturer),
    }));
  });
}

export function matchNvBomTableChange(change: NvBomChange, index: NvBomTableIndex | null): NvBomTableLink {
  if (!index) return { state: "unavailable", candidates: [] };
  const matchesById = new Map<string, ReturnType<typeof matchPart>[number]>();
  for (const part of [change.after, change.before]) {
    for (const match of matchPart(part, index)) {
      const existing = matchesById.get(match.candidate.id);
      if (!existing || (existing.manufacturerConflict && !match.manufacturerConflict)) matchesById.set(match.candidate.id, match);
    }
  }
  const matches = [...matchesById.values()];
  const candidates = matches.map(match => match.candidate);
  if (candidates.length > 1) return { state: "ambiguous", candidates };
  if (matches[0]?.manufacturerConflict) return { state: "ambiguous", candidates, reason: "manufacturer-mismatch" };
  return { state: candidates.length === 1 ? "matched" : "missing", candidates };
}
