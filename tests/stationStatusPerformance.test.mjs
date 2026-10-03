import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/hooks/useStationStatus.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source.replace("import { useMemo } from 'react';", ''), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { calculateStationStatuses } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const withoutTime = rows => rows.map(({ last_update, ...row }) => row);

// Deliberately simple reference: independent full scans preserve the pre-index semantics.
function reference(systems, stations, progress) {
  if (!systems.length || !stations.length) return [];
  return stations.map(station => {
    const current = systems.filter(s => s.current_station === station.station_name);
    const counts = system => {
      const rows = progress.filter(p => p.system_id === system.id && p.station_id === station.id);
      return { total: rows.length, done: rows.filter(p => p.status === 'Done').length };
    };
    const rates = current.map(s => { const c = counts(s); return c.total ? c.done / c.total * 100 : 0; });
    const average = rates.length ? rates.reduce((sum, value) => sum + value, 0) / rates.length : 0;
    return {
      id: station.id, name: station.station_name,
      status: !current.length ? 'idle' : average < 50 ? 'warning' : average < 100 ? 'working' : 'complete',
      current_system: current[0]?.system_name, current_systems: current,
      efficiency: Math.max(0, Math.min(100, Math.round(average))), total_systems: systems.length,
      completed_systems: systems.filter(s => { const c = counts(s); return c.total > 0 && c.done === c.total; }).length,
      ongoing_systems: current.length,
      system_progress: current.map(system => { const c = counts(system); return { system,
        progress: c.total ? c.done === c.total ? 100 : Math.round(c.done / c.total * 100) : 0,
        status: system.status, test_items_completed: c.done, test_items_total: c.total }; }),
    };
  });
}

test('indexed status matches independent reference, including unknown and duplicate rows', () => {
  let seed = 42;
  const rand = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
  for (let run = 0; run < 80; run++) {
    const stations = Array.from({length: rand(8)}, (_, i) => ({ id: `st:${i}`, station_name: `Station ${i % 4}`, station_order: i }));
    const systems = Array.from({length: rand(25)}, (_, i) => ({ id: `sys:${i}`, system_name: `System ${i}`, current_station: `Station ${rand(7)}`, status: `state-${rand(3)}`, assigned_engineer: '', overall_progress: rand(101) }));
    const progress = Array.from({length: rand(350)}, (_, i) => ({ id: `p${i}`, system_id: `sys:${rand(30)}`, station_id: `st:${rand(10)}`, status: ['Done', 'On-going', 'Pending'][rand(3)], progress_percent: 0, item_id: `item${i}`, notes: '' }));
    const original = JSON.stringify({ systems, stations, progress });
    assert.deepEqual(withoutTime(calculateStationStatuses(systems, stations, progress)), reference(systems, stations, progress));
    assert.equal(JSON.stringify({ systems, stations, progress }), original, 'inputs must not mutate');
  }
});

test('new snapshots recompute rather than retain stale indexed status', () => {
  const systems = [{ id: 's', system_name: 'System', current_station: 'Station', status: 'active' }];
  const stations = [{ id: 'st', station_name: 'Station' }];
  const pending = [{ id: 'p', system_id: 's', station_id: 'st', status: 'Pending' }];
  assert.equal(calculateStationStatuses(systems, stations, pending)[0].efficiency, 0);
  const done = pending.map(p => ({ ...p, status: 'Done' }));
  assert.equal(calculateStationStatuses(systems, stations, done)[0].efficiency, 100);
  assert.equal(calculateStationStatuses(systems, stations, [])[0].completed_systems, 0);
});

test('unrelated workspaces do not schedule a timed BOM preload', async () => {
  const index = await readFile(new URL('../src/pages/Index.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(index, /void loadMaterialRequestPage\(\)/);
  assert.match(index, /loadMaterialRequestPage\(\)\.then/);
});
