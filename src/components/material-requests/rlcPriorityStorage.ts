import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { withReadDeadline } from "@/lib/readDeadline";
import { getRlcCandidateKey, getRlcSpecKey, isRlcPriorityRank, type RlcPriorityRule } from "./rlcPriority";

type RuleRow = {
  id: string; project_id: string; spec_key: string; kind: RlcPriorityRule["kind"]; spec: string;
  candidate_key: string; manufacturer: string; mpn: string;
  customer_approval: RlcPriorityRule["customerApproval"]; avl: RlcPriorityRule["avl"]; engineering: RlcPriorityRule["engineering"];
  rank: number | null; notes: string; evidence: string; updated_at: string; updated_by: string; version: number;
};
type RuleSchema = {
  Tables: { rlc_priority_rules: { Row: RuleRow; Insert: never; Update: never; Relationships: [] } };
  Views: Record<string, never>;
  Functions: { save_rlc_priority_rule: { Args: { p_actor: string; p_rule: RlcPriorityRule; p_expected_updated_at: string | null }; Returns: RuleRow } };
};
const client = supabase as unknown as SupabaseClient<{ workspace: RuleSchema }, "workspace">;
const COLUMNS = "id,project_id,spec_key,kind,spec,candidate_key,manufacturer,mpn,customer_approval,avl,engineering,rank,notes,evidence,updated_at,updated_by,version";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function assertId(value: string) { if (typeof value !== "string" || !UUID.test(value)) throw new Error("專案或帳號識別碼格式不正確。"); }
function fromRow(row: RuleRow): RlcPriorityRule {
  return { projectId: row.project_id, specKey: row.spec_key, kind: row.kind, spec: row.spec, candidateKey: row.candidate_key,
    manufacturer: row.manufacturer, mpn: row.mpn, customerApproval: row.customer_approval, avl: row.avl, engineering: row.engineering,
    rank: row.rank, notes: row.notes, evidence: row.evidence, updatedAt: row.updated_at, updatedBy: row.updated_by };
}
function fields(rule: RlcPriorityRule): RlcPriorityRule {
  assertId(rule?.projectId);
  for (const [field, limit] of [["spec", 6000], ["specKey", 36016], ["manufacturer", 500], ["mpn", 1000], ["candidateKey", 9010], ["notes", 6000], ["evidence", 6000]] as const) {
    if (typeof rule[field] !== "string" || rule[field].length > limit || rule[field].includes("\0")) throw new Error("RLC 規則欄位格式或長度不正確。");
  }
  if (!["R", "L", "C"].includes(rule.kind) || !rule.spec.trim() || !rule.manufacturer.trim() || !rule.mpn.trim()
    || rule.spec !== rule.spec.trim().replace(/\s+/g, " ")
    || rule.manufacturer !== rule.manufacturer.trim().replace(/\s+/g, " ") || rule.mpn !== rule.mpn.trim().replace(/\s+/g, " ")
    || rule.specKey !== getRlcSpecKey(rule.kind, rule.spec) || rule.candidateKey !== getRlcCandidateKey(rule.manufacturer, rule.mpn)) throw new Error("RLC 完整規格或候選料識別碼不一致。");
  for (const value of [rule.customerApproval, rule.avl, rule.engineering]) {
    if (!["pending", "approved", "not-required", "blocked"].includes(value)) throw new Error("RLC 使用資格狀態不正確。");
  }
  if (rule.rank !== null && !isRlcPriorityRank(rule.rank)) throw new Error("優先序必須是正整數或留空。");
  const { updatedAt: _at, updatedBy: _by, ...data } = rule;
  return data;
}

export async function loadRlcPriorityRules(projectId: string): Promise<RlcPriorityRule[]> {
  assertId(projectId);
  const rules: RlcPriorityRule[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await withReadDeadline(signal => client.from("rlc_priority_rules").select(COLUMNS).eq("project_id", projectId).order("id").range(start, start + 499).abortSignal(signal));
    if (error) throw new Error(error.message);
    if (!data) throw new Error("無法讀取 RLC 專案規則，請重新載入。");
    rules.push(...data.map(fromRow));
    if (data.length < 500) return rules;
  }
}

export async function saveRlcPriorityRule(actorId: string, rule: RlcPriorityRule): Promise<RlcPriorityRule> {
  assertId(actorId);
  const data = fields(rule);
  if (rule.updatedAt !== undefined && (!rule.updatedAt.trim() || !Number.isFinite(Date.parse(rule.updatedAt)))) throw new Error("規則版本時間不正確，請重新載入。");
  const result = await client.rpc("save_rlc_priority_rule", { p_actor: actorId, p_rule: data, p_expected_updated_at: rule.updatedAt ?? null });
  if (result.error) {
    if (["40001", "23505"].includes(result.error.code)) throw new Error("此規則已由其他人更新，請重新載入後核對再儲存。");
    if (result.error.code === "42501") throw new Error("帳號或物料編輯權限已變更，請重新登入確認。");
    throw new Error(result.error.message);
  }
  if (!result.data) throw new Error("無法確認規則是否儲存，請重新載入核對。");
  return fromRow(result.data);
}
