import type { MaterialGroup, MaterialRecord } from "./materialRequestUtils";

export type RlcKind = "R" | "L" | "C";
export type RlcQualification = "pending" | "approved" | "not-required" | "blocked";

/** Identities are scoped to one project and complete source Name; no BOM values are rewritten. */
export interface RlcPriorityRule {
  projectId: string;
  specKey: string;
  kind: RlcKind;
  spec: string;
  candidateKey: string;
  manufacturer: string;
  mpn: string;
  customerApproval: RlcQualification;
  avl: RlcQualification;
  engineering: RlcQualification;
  rank: number | null;
  notes: string;
  evidence: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface RlcPriorityCandidate {
  key: string;
  manufacturer: string;
  mpn: string;
  records: MaterialRecord[];
  realPartNumbers: string[];
  virtualPartNumbers: string[];
  sourceRestrictions: string[];
  inCurrentBom: boolean;
  eligible: boolean;
  exclusionReasons: string[];
  rule: RlcPriorityRule;
}

export type RlcRecommendationStatus = "unassigned" | "needs-qualification" | "needs-ranking" | "tied" | "recommended";
export interface RlcPrioritySpecGroup {
  key: string;
  kind: RlcKind;
  spec: string;
  refs: string[];
  sourceGroupKeys: string[];
  manufacturerCount: number;
  candidates: RlcPriorityCandidate[];
  recommendation: { status: RlcRecommendationStatus; candidateKey?: string; rank?: number };
}

const text = (value: string | undefined) => (value ?? "").trim().replace(/\s+/g, " ");
const unique = (values: string[]) => [...new Set(values.filter(Boolean))];

// Keep unit case and all rating/package text: 10m and 10M must not become the same spec.
export function getRlcSpecKey(kind: RlcKind, spec: string): string {
  return JSON.stringify([kind, text(spec)]);
}

export function getRlcCandidateKey(manufacturer: string, mpn: string): string {
  return JSON.stringify([text(manufacturer).toUpperCase(), text(mpn).toUpperCase()]);
}

export function getRlcKind(group: MaterialGroup): RlcKind | null {
  const refs = unique(group.records.map(record => text(record.refDes)).filter(Boolean));
  const tokens = (refs.join(",") || text(group.displayRef)).split(/[,;\s、/]+/).filter(Boolean);
  const kinds = tokens.map(token => {
    const match = token.toUpperCase().match(/^P?([RLC])\d+(?:_[A-Z0-9]+)*(?:[-~](?:P?([RLC]))?\d+(?:_[A-Z0-9]+)*)?$/);
    return match && (!match[2] || match[1] === match[2]) ? match[1] as RlcKind : undefined;
  });
  return kinds.length > 0 && kinds.every(kind => kind && kind === kinds[0]) ? kinds[0]! : null;
}

export function createRlcPriorityRule(
  projectId: string,
  spec: Pick<RlcPrioritySpecGroup, "key" | "kind" | "spec">,
  candidate: Pick<RlcPriorityCandidate, "key" | "manufacturer" | "mpn">,
): RlcPriorityRule {
  return {
    projectId, specKey: spec.key, kind: spec.kind, spec: spec.spec,
    candidateKey: candidate.key, manufacturer: candidate.manufacturer, mpn: candidate.mpn,
    customerApproval: "pending", avl: "pending", engineering: "pending", rank: null, notes: "", evidence: "",
  };
}

export function isRlcPriorityRank(rank: unknown): rank is number {
  return typeof rank === "number" && Number.isSafeInteger(rank) && rank > 0;
}

const RESTRICTION = /禁用|不建議(?:使用|用料|採用)|\b(?:nrnd|obsolete|disqualified|eol|not recommended|do not use)\b/i;
const QUALIFICATION_LABELS = { customerApproval: "客戶承認", avl: "AVL", engineering: "工程確認" } as const;

/** Reads only the supplied project's rules. Missing current-BOM candidates remain visible and ineligible. */
export function buildRlcPriorityGroups(
  groups: readonly MaterialGroup[], projectId: string | null, rules: readonly RlcPriorityRule[],
): RlcPrioritySpecGroup[] {
  const specs = new Map<string, RlcPrioritySpecGroup>();
  const ensureSpec = (kind: RlcKind, spec: string) => {
    const key = getRlcSpecKey(kind, spec);
    let item = specs.get(key);
    if (!item) {
      item = { key, kind, spec: text(spec), refs: [], sourceGroupKeys: [], manufacturerCount: 0, candidates: [], recommendation: { status: "needs-qualification" } };
      specs.set(key, item);
    }
    return item;
  };
  const ensureCandidate = (spec: RlcPrioritySpecGroup, manufacturer: string, mpn: string) => {
    const key = getRlcCandidateKey(manufacturer, mpn);
    let candidate = spec.candidates.find(item => item.key === key);
    if (!candidate) {
      candidate = { key, manufacturer: text(manufacturer), mpn: text(mpn), records: [], realPartNumbers: [], virtualPartNumbers: [], sourceRestrictions: [], inCurrentBom: false, eligible: false, exclusionReasons: [], rule: undefined! };
      candidate.rule = createRlcPriorityRule(projectId || "", spec, candidate);
      spec.candidates.push(candidate);
    }
    return candidate;
  };
  for (const group of groups) {
    const kind = getRlcKind(group);
    if (!kind || !text(group.name)) continue;
    const spec = ensureSpec(kind, group.name);
    spec.sourceGroupKeys.push(group.key);
    spec.refs.push(text(group.displayRef));
    for (const record of group.records) {
      const candidate = ensureCandidate(spec, record.manufacturer, record.manufacturerPartNumber);
      candidate.records.push(record);
      candidate.inCurrentBom = true;
      candidate.realPartNumbers.push(text(record.partNumber));
      candidate.virtualPartNumbers.push(text(record.virtualAlternative));
      candidate.sourceRestrictions.push(...[record.partUsageStatus, record.phaseOutStatus, record.sourcingStatus].map(text).filter(value => RESTRICTION.test(value)));
    }
  }
  for (const rule of rules) {
    if (!projectId || rule.projectId !== projectId || !["R", "L", "C"].includes(rule.kind) || !text(rule.spec)) continue;
    if (rule.specKey !== getRlcSpecKey(rule.kind, rule.spec) || rule.candidateKey !== getRlcCandidateKey(rule.manufacturer, rule.mpn)) continue;
    const spec = ensureSpec(rule.kind, rule.spec);
    ensureCandidate(spec, rule.manufacturer, rule.mpn).rule = { ...rule };
  }
  for (const spec of specs.values()) {
    spec.refs = unique(spec.refs);
    spec.sourceGroupKeys = unique(spec.sourceGroupKeys);
    spec.manufacturerCount = new Set(spec.candidates.filter(candidate => candidate.inCurrentBom && candidate.manufacturer).map(candidate => candidate.manufacturer.toUpperCase())).size;
    for (const candidate of spec.candidates) {
      candidate.realPartNumbers = unique(candidate.realPartNumbers);
      candidate.virtualPartNumbers = unique(candidate.virtualPartNumbers);
      candidate.sourceRestrictions = unique(candidate.sourceRestrictions);
      const reasons: string[] = [];
      if (!projectId) reasons.push("尚未指派專案");
      if (!candidate.inCurrentBom) reasons.push("目前 BOM 未包含此候選料");
      if (!candidate.manufacturer || !candidate.mpn) reasons.push("缺少廠商或 MPN，無法識別候選料");
      reasons.push(...candidate.sourceRestrictions.map(value => `來源限制：${value}`));
      for (const field of ["customerApproval", "avl", "engineering"] as const) {
        const value = candidate.rule[field];
        if (value !== "approved" && value !== "not-required") reasons.push(`${QUALIFICATION_LABELS[field]}${value === "blocked" ? "未通過" : "待確認"}`);
      }
      candidate.exclusionReasons = reasons;
      candidate.eligible = reasons.length === 0;
    }
    const eligible = spec.candidates.filter(candidate => candidate.eligible);
    const ranked = eligible.filter(candidate => isRlcPriorityRank(candidate.rule.rank));
    if (!projectId) spec.recommendation = { status: "unassigned" };
    else if (!eligible.length) spec.recommendation = { status: "needs-qualification" };
    else if (!ranked.length) spec.recommendation = { status: "needs-ranking" };
    else {
      const rank = Math.min(...ranked.map(candidate => candidate.rule.rank!));
      const best = ranked.filter(candidate => candidate.rule.rank === rank);
      spec.recommendation = best.length === 1 ? { status: "recommended", candidateKey: best[0].key, rank } : { status: "tied", rank };
    }
  }
  return [...specs.values()];
}
