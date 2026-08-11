import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("data query workspace supplies active and available maintenance projects", async () => {
  const source = await readSource("src/components/api-management/ApiChatWorkspacePage.tsx");

  assert.match(source, /useTestProject/);
  assert.match(source, /allProjects/);
  assert.match(source, /activeProjectId/);
  assert.match(source, /maintenanceProjects=/);
  assert.match(source, /currentMaintenanceProjectId=/);
});

test("chat console retrieves maintenance evidence before calling the provider", async () => {
  const source = await readSource("src/components/api-management/ApiChatConsole.tsx");

  assert.match(source, /MaintenanceSourceSelector/);
  assert.match(source, /searchMaintenanceKnowledge/);
  assert.match(source, /buildMaintenanceContext/);
  assert.match(source, /ephemeralSystemContext/);
  assert.match(
    source,
    /await searchMaintenanceKnowledge[\s\S]*await runProviderRequest/,
    "retrieval must finish before provider invocation",
  );
  assert.match(source, /citations\.length[\s\S]*buildMaintenanceContext/);
  assert.match(source, /不得捏造/);
  assert.match(source, /沒有找到相符紀錄/);
  assert.match(source, /useState\(false\)/);
  assert.match(source, /MAX_PROVIDER_HISTORY_MESSAGES/);
});

test("maintenance source explains the difference from normal AI chat", async () => {
  const source = await readSource("src/components/api-management/MaintenanceSourceSelector.tsx");

  assert.match(source, /data-testid="maintenance-source-help"/);
  assert.match(source, /一般 AI 對話/);
  assert.match(source, /專案搜尋/);
});

test("hidden maintenance context is never added to the visible user message", async () => {
  const source = await readSource("src/components/api-management/ApiChatConsole.tsx");

  assert.match(source, /buildProviderMessages\(history, target\.provider, ephemeralSystemContext\)/);
  assert.match(source, /providerMessages\.push\(\{ role: "system", text: ephemeralSystemContext\.trim\(\) \}\)/);
  assert.doesNotMatch(source, /createMessage\("user",\s*buildMaintenanceContext/);
});

test("assistant citations are persisted, validated and always rendered", async () => {
  const source = await readSource("src/components/api-management/ApiChatConsole.tsx");

  assert.match(source, /citations\?: MaintenanceCitation\[\]/);
  assert.match(source, /citations: message\.citations/);
  assert.match(source, /parseMaintenanceCitation/);
  assert.match(source, /MaintenanceCitationList citations=\{message\.citations/);
  assert.match(source, /createMessage\("assistant", reply\.text, "normal", reply\.images, \[\], citations\)/);
});
