import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('./pcbLegacyRecovery.browser.cjs', import.meta.url), 'utf8');
const context = vm.createContext({
  require(name) {
    if (name === 'node:assert/strict') return require(name);
    if (name.endsWith('protectedReadBrowserHarness.cjs')) return { runProtectedReadBrowser: async () => undefined };
    if (name.endsWith('pcbRecoveryBrowser.cjs')) return { buildPcbRecoveryFixture() { throw new Error('No browser or bundle execution in assertion unit tests'); } };
    throw new Error(`Unexpected assertion test import ${name}`);
  }, console, process: { exitCode: 0 },
});
vm.runInContext(`${source}\nglobalThis.check = assertRecoverySnapshot;`, context);
const data = {
  projects: [{ id: 'active', description: '保留原 bytes\t\u0000🧪', board: { holes: [[{ x: 1, y: 2 }]] }, components: [{ id: 'component', rotation: 90 }] }, { id: 'inactive', description: 'other board' }],
  activeProjectId: 'active', templates: [{ id: 'template', project: { components: [] } }], library: [{ id: 'library' }],
  modelAssets: { model: { id: 'model', fileName: 'synthetic.step' } }, pendingPlacementsByProject: { active: [{ quantity: 2 }] },
  remoteDeletions: { projects: ['deleted'], templates: [], library: [] }, updatedAt: '2026-11-12T10:01:00.000Z',
};
const recovery = () => ({ version: 1, savedRevision: '2026-11-12T10:00:00.000Z', state: structuredClone(data) });
const attributed = () => {
  const value = recovery();
  Object.assign(value.state.projects[0], { lastEditedBy: 'Synthetic editor', lastEditedById: '10000000-0000-4000-8000-000000000001' });
  return value;
};
// Inputs share the assertion's realm, as Playwright results do in the runner.
// No normalization drops fields.
function run(value, allowed = false) {
  context.json = JSON.stringify({ value, data, allowed });
  return vm.runInContext('var input = JSON.parse(json); check(input.value, input.data, input.allowed);', context);
}

test('legacy browser recovery assertion accepts unchanged content and only the two exact active-project attribution fields', () => {
  const original = JSON.stringify(data);
  run(recovery()); run(recovery(), true); run(attributed(), true);
  assert.equal(JSON.stringify(data), original);
  assert.throws(() => run(attributed()), /Recovery retains/);
});

test('legacy browser recovery assertion rejects wrong, partial, inactive or additional attribution', () => {
  for (const mutate of [
    value => { value.state.projects[0].lastEditedBy = 'Wrong editor'; },
    value => { value.state.projects[0].lastEditedById = 'wrong-owner'; },
    value => { delete value.state.projects[0].lastEditedBy; },
    value => { delete value.state.projects[0].lastEditedById; },
    value => { value.state.projects[1].lastEditedBy = 'Synthetic editor'; },
    value => { value.state.projects[0].extraMetadata = 'not allowed'; },
  ]) {
    const value = attributed(); mutate(value);
    assert.throws(() => run(value, true));
  }
});

test('legacy browser recovery assertion rejects loss or mutation anywhere in the complete workspace', () => {
  for (const mutate of [
    value => { value.state.projects[0].description = 'changed'; },
    value => { value.state.projects[0].board.holes[0][0].x = 10; },
    value => { value.state.projects[0].components[0].rotation = 0; },
    value => { value.state.projects.pop(); },
    value => { value.state.templates = []; },
    value => { value.state.library = []; },
    value => { value.state.modelAssets = {}; },
    value => { value.state.pendingPlacementsByProject = {}; },
    value => { value.state.remoteDeletions.projects = []; },
    value => { value.state.activeProjectId = 'inactive'; },
    value => { value.state.updatedAt = '2026-11-12T10:00:00.000Z'; },
    value => { value.savedRevision = value.state.updatedAt; },
    value => { value.version = 2; },
  ]) {
    const value = attributed(); mutate(value);
    assert.throws(() => run(value, true));
  }
});
