import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../src/components/api-management/maintenanceKnowledge.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const knowledge = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

const projects = [
  { id: "p1", name: "Golden", status: "active" },
  { id: "p2", name: "Rack", status: "active" },
  { id: "p3", name: "Archive", status: "archived" },
];

test("maintenance scope defaults to current and preserves explicit multi selection", () => {
  const initial = knowledge.createMaintenanceScope("p1", projects);
  assert.deepEqual(initial, { selectedProjectIds: ["p1"], selectionMode: "default" });

  const multi = knowledge.toggleMaintenanceProject(initial, "p2", true, projects);
  assert.deepEqual(multi, { selectedProjectIds: ["p1", "p2"], selectionMode: "custom" });
  assert.deepEqual(knowledge.syncMaintenanceScope(multi, "p2", projects), multi);

  assert.deepEqual(
    knowledge.syncMaintenanceScope(initial, "p2", projects),
    { selectedProjectIds: ["p2"], selectionMode: "default" },
  );
});

test("maintenance scope supports current, all active, and clear", () => {
  const initial = knowledge.createMaintenanceScope("p1", projects);
  assert.deepEqual(
    knowledge.selectAllMaintenanceProjects(initial, projects).selectedProjectIds,
    ["p1", "p2"],
  );
  assert.deepEqual(
    knowledge.selectCurrentMaintenanceProject(initial, "p2", projects),
    { selectedProjectIds: ["p2"], selectionMode: "custom" },
  );
  assert.deepEqual(knowledge.clearMaintenanceProjects(initial), {
    selectedProjectIds: [],
    selectionMode: "custom",
  });
});

test("maintenance context numbers and bounds untrusted source text", () => {
  const citations = [
    {
      chunkId: "machine:1",
      sourceType: "machine",
      sourceId: "s1",
      projectId: "p1",
      projectName: "Golden",
      title: "GB300-01",
      content: `<script>alert(1)</script>\u0000\u0008${"x".repeat(5000)}`,
      sourceLabel: "機台",
      module: "test-tracker",
      routeParams: { system: "GB300-01" },
      updatedAt: "2026-08-03T00:00:00Z",
      rank: 100,
    },
  ];
  const context = knowledge.buildMaintenanceContext(citations);
  assert.match(context, /\[M1\] 機台 · GB300-01/);
  assert.doesNotMatch(context, /<script>/);
  assert.doesNotMatch(context, /\u0000|\u0008/);
  assert.ok(context.length < 4200);
  assert.match(context, /維修事實只能依據/);
});

test("maintenance context keeps the complete retrieval payload bounded", () => {
  const citations = Array.from({ length: 20 }, (_, index) => ({
    chunkId: `machine:${index}`,
    sourceType: "machine",
    sourceId: `s${index}`,
    projectId: "p1",
    projectName: "Golden",
    title: `GB300-${index}`,
    content: "測項進度與處理紀錄".repeat(1000),
    sourceLabel: "機台",
    module: "test-tracker",
    routeParams: { system: `GB300-${index}` },
    updatedAt: null,
    rank: 100 - index,
  }));
  const context = knowledge.buildMaintenanceContext(citations);
  assert.ok(context.length <= 24_000, `context was ${context.length} characters`);
  assert.match(context, /\[M1\]/);
});

test("citation links return to the exact maintenance project and record", () => {
  const base = {
    chunkId: "x",
    sourceType: "machine",
    sourceId: "s1",
    projectId: "project-1",
    projectName: "Golden",
    title: "GB300-01",
    content: "content",
    sourceLabel: "機台",
    module: "test-tracker",
    updatedAt: null,
    rank: 1,
  };
  const machine = knowledge.buildMaintenanceSourceHref({
    ...base,
    routeParams: { system: "GB300-01", station: "station-1" },
  });
  assert.match(machine, /^\/\?/);
  const params = new URL(`https://local${machine}`).searchParams;
  assert.equal(params.get("workspace"), "station-status");
  assert.equal(params.get("project"), "project-1");
  assert.equal(params.get("module"), "test-tracker");
  assert.equal(params.get("system"), "GB300-01");
  assert.equal(params.get("station"), "station-1");

  const issue = knowledge.buildMaintenanceSourceHref({
    ...base,
    sourceType: "issue",
    module: "issues",
    routeParams: { openIssue: "issue-9" },
  });
  assert.equal(new URL(`https://local${issue}`).searchParams.get("openIssue"), "issue-9");

  const asset = knowledge.buildMaintenanceSourceHref({
    ...base,
    sourceType: "asset",
    module: "tools",
    routeParams: { assetView: "code", assetId: "code-4" },
  });
  assert.equal(new URL(`https://local${asset}`).searchParams.get("assetId"), "code-4");
});

test("RPC adapter maps rows and propagates retrieval errors", async () => {
  const calls = [];
  const client = {
    async rpc(name, args) {
      calls.push({ name, args });
      return {
        data: [{
          chunk_id: "machine:1",
          source_type: "machine",
          source_id: "s1",
          project_id: "p1",
          project_name: "Golden",
          title: "GB300-01",
          content: "正常",
          source_label: "機台",
          module: "test-tracker",
          route_params: { system: "GB300-01" },
          updated_at: null,
          rank: 100,
        }],
        error: null,
      };
    },
  };
  const result = await knowledge.searchMaintenanceKnowledge(client, {
    query: "GB300-01",
    projectIds: ["p1"],
  });
  assert.deepEqual(calls, [{
    name: "search_maintenance_knowledge",
    args: { p_limit: 16, p_project_ids: ["p1"], p_query: "GB300-01" },
  }]);
  assert.equal(result[0].chunkId, "machine:1");
  assert.deepEqual(result[0].routeParams, { system: "GB300-01" });

  await assert.rejects(
    () => knowledge.searchMaintenanceKnowledge(
      { rpc: async () => ({ data: null, error: { message: "permission denied" } }) },
      { query: "x", projectIds: ["p1"] },
    ),
    /permission denied/,
  );
});

test("saved citation metadata rejects malformed entries", () => {
  assert.equal(knowledge.parseMaintenanceCitation({ title: "missing ids" }), null);
  assert.equal(knowledge.parseMaintenanceCitation({
    chunkId: "issue:1",
    sourceType: "issue",
    sourceId: "i1",
    projectId: "p1",
    projectName: "Golden",
    title: "Power fail",
    content: "details",
    sourceLabel: "問題追蹤",
    module: "issues",
    routeParams: { openIssue: "i1" },
    updatedAt: null,
    rank: 9,
  }).chunkId, "issue:1");
});
