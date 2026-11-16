import assert from "node:assert/strict";
import test from "node:test";
import { BUILT_IN_COMPONENTS, BUILT_IN_TEMPLATES, createBlankProject } from "../../src/components/pcb-designer/defaults.ts";
import {
  DEFAULT_BOARD_LIST_FILTERS,
  PCB_BOARD_QUERY_KEYS,
  UNASSIGNED_OWNER,
  boardOwnerOptions,
  buildBoardList,
  readBoardListLocation,
  relativeTimeLabel,
  writeBoardListLocation,
  statusChangeLabel,
  statusChangeRecord,
} from "../../src/components/pcb-designer/core/boardList.ts";
import { isPcbSaveState } from "../../src/components/pcb-designer/core/storage.ts";
import { normalizeBoardOwner, normalizeStatusChange, parseProjectJson } from "../../src/components/pcb-designer/core/validation.ts";
import { createWorkspaceState, isBlockedByApproval, reduceWorkspaceState } from "../../src/components/pcb-designer/core/workspace.ts";
import { initialProjectSettings, parseProjectSettings } from "../../src/components/pcb-designer/core/projectSettingsDraft.ts";
import type { PcbProject, PcbSaveState } from "../../src/components/pcb-designer/types.ts";

const board = (id: string, patch: Partial<PcbProject> = {}): PcbProject => ({
  ...createBlankProject(`板 ${id}`), id, boardFamilyId: id, updatedAt: "2026-11-10T00:00:00.000Z", ...patch,
});
const filters = { query: "", status: "all" as const, owner: "all", sort: "updated" as const };

test("boards group by 大專案 with 未分類 last; versions of one board collapse into one family led by the newest", () => {
  const projects = [
    board("a1", { name: "主板", projectGroup: "治具", boardFamilyId: "A", revision: "1", updatedAt: "2026-11-01T00:00:00.000Z" }),
    board("a2", { name: "主板", projectGroup: "治具", boardFamilyId: "A", revision: "2", updatedAt: "2026-11-05T00:00:00.000Z", status: "review" }),
    board("b1", { name: "電源板", projectGroup: "", updatedAt: "2026-11-09T00:00:00.000Z" }),
    board("c1", { name: "背板", projectGroup: "治具", updatedAt: "2026-11-08T00:00:00.000Z" }),
  ];
  const groups = buildBoardList(projects, filters, "a1");
  assert.deepEqual(groups.map(group => group.name), ["治具", "未分類"]);
  assert.deepEqual(groups[0].families.map(family => family.lead.id), ["c1", "a2"], "most recently updated family first");
  const family = groups[0].families[1];
  assert.deepEqual(family.versions.map(project => project.id), ["a2", "a1"]);
  assert.equal(family.containsActive, true);
  // Every board appears exactly once across the list.
  assert.deepEqual(groups.flatMap(group => group.families.flatMap(item => item.versions.map(project => project.id))).sort(), ["a1", "a2", "b1", "c1"]);
  assert.deepEqual(buildBoardList(projects, { ...filters, sort: "name" }, null)[0].families.map(item => item.lead.name), ["主板", "背板"]);
});

test("filters apply to versions: a family shows when any version matches, led by its newest match", () => {
  const projects = [
    board("a1", { boardFamilyId: "A", status: "approved", owner: { displayName: "王工程師" }, updatedAt: "2026-11-01T00:00:00.000Z" }),
    board("a2", { boardFamilyId: "A", status: "draft", lastEditedBy: "林工程師", updatedAt: "2026-11-05T00:00:00.000Z" }),
  ];
  const approved = buildBoardList(projects, { ...filters, status: "approved" }, null)[0].families[0];
  assert.equal(approved.lead.id, "a1");
  assert.equal(approved.matching.length, 1);
  assert.equal(approved.versions.length, 2);
  assert.equal(buildBoardList(projects, { ...filters, owner: "王工程師" }, null)[0].families[0].lead.id, "a1");
  assert.equal(buildBoardList(projects, { ...filters, owner: UNASSIGNED_OWNER }, null)[0].families[0].lead.id, "a2");
  assert.equal(buildBoardList(projects, { ...filters, query: "林工程" }, null)[0].families[0].lead.id, "a2", "search includes the last editor");
  assert.deepEqual(buildBoardList(projects, { ...filters, query: "不存在" }, null), []);
  assert.deepEqual(boardOwnerOptions(projects), ["王工程師", UNASSIGNED_OWNER]);
});

test("board list filters round-trip through the URL, keep defaults out and reject unknown values", () => {
  const url = new URL("https://example.test/?module=pcb-designer&workspace=x");
  writeBoardListLocation(url, { query: "主板 v2", status: "approved", owner: "王工程師", sort: "name" });
  assert.equal(url.searchParams.get("module"), "pcb-designer", "other parameters stay");
  assert.deepEqual(readBoardListLocation(url.search), { query: "主板 v2", status: "approved", owner: "王工程師", sort: "name" });
  writeBoardListLocation(url, DEFAULT_BOARD_LIST_FILTERS);
  for (const key of PCB_BOARD_QUERY_KEYS) assert.equal(url.searchParams.has(key), false, `${key} cleared`);
  assert.deepEqual(readBoardListLocation("?pcbStatus=hacked&pcbSort=size&pcbOwner=%20"), DEFAULT_BOARD_LIST_FILTERS);
  assert.equal(readBoardListLocation(`?pcbOwner=${"名".repeat(80)}`).owner.length, 60);
  writeBoardListLocation(url, { ...DEFAULT_BOARD_LIST_FILTERS, query: "   " });
  assert.equal(url.searchParams.has("pcbQ"), false, "a blank search is not a filter");
});

test("relative time reads in Traditional Chinese and falls back to a date after a week", () => {
  const now = Date.parse("2026-11-15T12:00:00+08:00");
  assert.equal(relativeTimeLabel("2026-11-15T11:59:40+08:00", now), "剛剛");
  assert.equal(relativeTimeLabel("2026-11-15T11:15:00+08:00", now), "45 分鐘前");
  assert.equal(relativeTimeLabel("2026-11-15T09:00:00+08:00", now), "3 小時前");
  assert.equal(relativeTimeLabel("2026-11-14T08:00:00+08:00", now), "昨天");
  assert.equal(relativeTimeLabel("2026-11-11T08:00:00+08:00", now), "4 天前");
  assert.match(relativeTimeLabel("2026-10-01T08:00:00+08:00", now), /^2026\/10\/1$/);
  assert.equal(relativeTimeLabel("not a date", now), "");
});

test("負責人 is kept through validation and storage; a malformed value is dropped instead of rejecting the workspace", () => {
  const project = board("p", { owner: { userId: "u-1", displayName: " 王工程師 " } });
  const parsed = parseProjectJson(JSON.stringify(project));
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.ok && parsed.value.owner, { userId: "u-1", displayName: "王工程師" });
  const broken = parseProjectJson(JSON.stringify({ ...project, owner: { displayName: 42 } }));
  assert.ok(broken.ok, "the board itself still loads");
  assert.equal(broken.ok && "owner" in broken.value, false);
  assert.equal(normalizeBoardOwner({ displayName: "x".repeat(80) })?.displayName.length, 60);
  assert.equal(normalizeBoardOwner({ displayName: "名", userId: "" })?.userId, undefined);
  const state: PcbSaveState = {
    projects: [{ ...project, owner: { displayName: "林工程師" } }], templates: [], library: BUILT_IN_COMPONENTS,
    activeProjectId: "p", updatedAt: project.updatedAt,
  };
  assert.equal(isPcbSaveState(JSON.parse(JSON.stringify(state))), true);
});

test("board settings read, set and clear the owner; an old draft without owner fields keeps nothing it never had", () => {
  const project = board("p", { owner: { userId: "u-1", displayName: "王工程師" } });
  const draft = initialProjectSettings(project);
  assert.equal(draft.values.ownerName, "王工程師");
  assert.equal(draft.values.ownerId, "u-1");
  const set = parseProjectSettings({ ...draft.values, ownerId: "", ownerName: "陳工程師" });
  assert.ok(typeof set !== "string");
  assert.deepEqual(typeof set !== "string" && set.owner, { displayName: "陳工程師" });
  const cleared = parseProjectSettings({ ...draft.values, ownerId: "", ownerName: "" });
  assert.equal(typeof cleared !== "string" && cleared.owner, undefined);
  assert.equal(parseProjectSettings({ ...draft.values, status: "x" }), "請選擇有效的狀態。");
});

test("an approved board refuses content edits, keeps 建立新版, and only a status change away from 已核准 is applied", () => {
  const approved = board("p", { status: "approved", name: "已核准板" });
  const state = createWorkspaceState({ projects: [approved], templates: BUILT_IN_TEMPLATES, library: BUILT_IN_COMPONENTS, activeProjectId: "p", updatedAt: approved.updatedAt }, true);
  const commit = reduceWorkspaceState(state, { type: "project/commit", update: { ...state.activeProject, description: "偷改" } });
  assert.equal(commit.activeProject.description, approved.description);
  assert.equal(isBlockedByApproval(state, { type: "history/undo" }), true);
  assert.equal(isBlockedByApproval(state, { type: "project/rename", projectId: "p", name: "x" }), true);
  assert.equal(isBlockedByApproval(state, { type: "project/rename", projectId: "other", name: "x" }), false);
  const keep = reduceWorkspaceState(state, { type: "project/settings", requestToken: "t1", projectId: "p",
    baselineRevision: initialProjectSettings(state.activeProject).baselineRevision,
    settings: { ...parseProjectSettings({ ...initialProjectSettings(state.activeProject).values, name: "改名" }) as Exclude<ReturnType<typeof parseProjectSettings>, string> } });
  assert.equal(keep.projectSettingsReceipt?.accepted, false);
  assert.equal(keep.activeProject.name, "已核准板");
  const back = reduceWorkspaceState(state, { type: "project/settings", requestToken: "t2", projectId: "p",
    baselineRevision: initialProjectSettings(state.activeProject).baselineRevision,
    settings: { ...parseProjectSettings({ ...initialProjectSettings(state.activeProject).values, status: "draft" }) as Exclude<ReturnType<typeof parseProjectSettings>, string> } });
  assert.equal(back.projectSettingsReceipt?.accepted, true);
  assert.equal(back.activeProject.status, "draft");
  const version = reduceWorkspaceState(state, { type: "project/duplicate", projectId: "p", newRevision: true });
  assert.notEqual(version.activeProject.id, "p");
  assert.equal(version.activeProject.status, "draft");
  assert.equal(version.data.projects.find(project => project.id === "p")?.status, "approved", "the approved version stays as it was");
});

test("a 狀態 change records who made it and when; other settings leave the record alone", () => {
  const draft = board("p", { status: "draft" });
  const state = createWorkspaceState({ projects: [draft], templates: BUILT_IN_TEMPLATES, library: BUILT_IN_COMPONENTS, activeProjectId: "p", updatedAt: draft.updatedAt }, true);
  const settings = (values: Record<string, string>) => parseProjectSettings({ ...initialProjectSettings(state.activeProject).values, ...values }) as Exclude<ReturnType<typeof parseProjectSettings>, string>;
  const actor = { at: "2026-11-17T06:20:00.000Z", name: "王工程師", id: "u-1" };
  const approved = reduceWorkspaceState(state, { type: "project/settings", requestToken: "a", projectId: "p",
    baselineRevision: initialProjectSettings(state.activeProject).baselineRevision, settings: settings({ status: "approved" }), actor });
  assert.equal(approved.projectSettingsReceipt?.accepted, true);
  assert.deepEqual(approved.activeProject.statusChange, { status: "approved", at: actor.at, byName: "王工程師", byId: "u-1" });
  assert.match(statusChangeLabel(approved.activeProject), /^王工程師 \d{4}\/\d{2}\/\d{2} \d{2}:\d{2} 改為已核准$/, "the record reads to the minute");
  assert.equal(statusChangeRecord(approved.activeProject)?.by, "王工程師");
  // Changing anything but 狀態 writes no record, and keeps an existing one as it was.
  const renamed = reduceWorkspaceState(state, { type: "project/settings", requestToken: "b", projectId: "p",
    baselineRevision: initialProjectSettings(state.activeProject).baselineRevision, settings: settings({ name: "新名稱" }), actor: { ...actor, name: "別人" } });
  assert.equal(renamed.activeProject.statusChange, undefined, "no status change, no record");
  const reviewRecord = { status: "review" as const, at: "2026-11-16T01:00:00.000Z", byName: "林工程師" };
  const inReview = createWorkspaceState({ projects: [board("r", { status: "review", statusChange: reviewRecord })], templates: BUILT_IN_TEMPLATES, library: BUILT_IN_COMPONENTS, activeProjectId: "r", updatedAt: draft.updatedAt }, true);
  const reviewRenamed = reduceWorkspaceState(inReview, { type: "project/settings", requestToken: "c", projectId: "r",
    baselineRevision: initialProjectSettings(inReview.activeProject).baselineRevision,
    settings: parseProjectSettings({ ...initialProjectSettings(inReview.activeProject).values, name: "審核中改名" }) as Exclude<ReturnType<typeof parseProjectSettings>, string>, actor });
  assert.equal(reviewRenamed.activeProject.name, "審核中改名");
  assert.deepEqual(reviewRenamed.activeProject.statusChange, reviewRecord, "the 林工程師 record is kept, not replaced by 王工程師");
  // A record for another status (an older client changed it) is not shown as the current one.
  assert.equal(statusChangeLabel({ status: "draft", statusChange: approved.activeProject.statusChange }), "");
  assert.equal(statusChangeLabel(board("q")), "");
});

test("undo and redo never switch the 狀態: approving again has to go through 板子設定 and its record", () => {
  const start = board("p", { status: "review" });
  let state = createWorkspaceState({ projects: [start], templates: BUILT_IN_TEMPLATES, library: BUILT_IN_COMPONENTS, activeProjectId: "p", updatedAt: start.updatedAt }, true);
  const apply = (status: PcbProject["status"], at: string, name: string) => {
    state = reduceWorkspaceState(state, { type: "project/settings", requestToken: at, projectId: "p",
      baselineRevision: initialProjectSettings(state.activeProject).baselineRevision,
      settings: parseProjectSettings({ ...initialProjectSettings(state.activeProject).values, status }) as Exclude<ReturnType<typeof parseProjectSettings>, string>,
      actor: { at, name } });
  };
  apply("approved", "2026-11-17T01:00:00.000Z", "王工程師");
  apply("draft", "2026-11-17T02:00:00.000Z", "李工程師");
  const moved = reduceWorkspaceState(state, { type: "project/commit", update: { ...state.activeProject, description: "改了描述" } });
  const undone = reduceWorkspaceState(reduceWorkspaceState(moved, { type: "history/undo" }), { type: "history/undo" });
  assert.equal(undone.activeProject.description, start.description, "the edits themselves are undone");
  assert.equal(undone.activeProject.status, "draft", "the board does not become 已核准 again through undo");
  assert.deepEqual(undone.activeProject.statusChange, { status: "draft", at: "2026-11-17T02:00:00.000Z", byName: "李工程師" });
  const redone = reduceWorkspaceState(undone, { type: "history/redo" });
  assert.equal(redone.activeProject.status, "draft");
  assert.equal(statusChangeLabel(redone.activeProject).startsWith("李工程師"), true);
});

test("the 狀態 record survives saving and loading; a malformed one is dropped, never the board", () => {
  const project = board("p", { status: "approved", statusChange: { status: "approved", at: "2026-11-17T06:20:00.000Z", byName: " 王工程師 ", byId: "u-1" } });
  const parsed = parseProjectJson(JSON.stringify(project));
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.ok && parsed.value.statusChange, { status: "approved", at: "2026-11-17T06:20:00.000Z", byName: "王工程師", byId: "u-1" });
  for (const statusChange of [{ status: "x", at: "2026-11-17T06:20:00.000Z" }, { status: "approved", at: "not a date" }, "approved", null]) {
    const broken = parseProjectJson(JSON.stringify({ ...project, statusChange }));
    assert.ok(broken.ok, JSON.stringify(statusChange));
    assert.equal(broken.ok && "statusChange" in broken.value, false, JSON.stringify(statusChange));
  }
  assert.equal(normalizeStatusChange({ status: "review", at: "2026-11-17T00:00:00.000Z", byName: "x".repeat(90) })?.byName?.length, 60);
});

test("copies, imports and template boards never inherit an approval", () => {
  const approved = board("p", { status: "approved", owner: { displayName: "王工程師" } });
  const template = { ...BUILT_IN_TEMPLATES[0], project: { ...BUILT_IN_TEMPLATES[0].project, status: "approved" as const } };
  const state = createWorkspaceState({ projects: [approved], templates: [template], library: BUILT_IN_COMPONENTS, activeProjectId: "p", updatedAt: approved.updatedAt }, true);
  const copy = reduceWorkspaceState(state, { type: "project/duplicate", projectId: "p" });
  assert.equal(copy.activeProject.status, "draft");
  assert.equal(copy.activeProject.boardFamilyId, copy.activeProject.id, "a plain copy is its own board, not a version");
  assert.deepEqual(copy.activeProject.owner, { displayName: "王工程師" });
  const imported = reduceWorkspaceState(state, { type: "project/import", project: approved });
  assert.equal(imported.activeProject.status, "draft");
  assert.equal(imported.activeProject.boardFamilyId, imported.activeProject.id);
  const fromTemplate = reduceWorkspaceState(state, { type: "template/apply", templateId: template.id });
  assert.equal(fromTemplate.activeProject.status, "draft");
  assert.match(fromTemplate.activeProject.name, /新板子$/);
  // The 核准 record stays with the approved board; nothing made from it carries it.
  const record = { status: "approved" as const, at: "2026-11-17T06:20:00.000Z", byName: "王工程師" };
  const recorded = createWorkspaceState({ projects: [{ ...approved, statusChange: record }], templates: [{ ...template, project: { ...template.project, statusChange: record } }], library: BUILT_IN_COMPONENTS, activeProjectId: "p", updatedAt: approved.updatedAt }, true);
  for (const action of [
    { type: "project/duplicate" as const, projectId: "p" },
    { type: "project/duplicate" as const, projectId: "p", newRevision: true },
    { type: "project/import" as const, project: { ...approved, statusChange: record } },
    { type: "template/apply" as const, templateId: template.id },
  ]) {
    const next = reduceWorkspaceState(recorded, action);
    assert.equal(next.activeProject.statusChange, undefined, action.type);
    assert.deepEqual(next.data.projects.find(project => project.id === "p")?.statusChange, record, "the approved board keeps its record");
  }
  const created = reduceWorkspaceState(state, { type: "project/create", input: { name: "新板", owner: { userId: "u-9", displayName: "我" } } });
  assert.deepEqual(created.activeProject.owner, { userId: "u-9", displayName: "我" });
});
