const assert = require('node:assert/strict');
const test = require('node:test');
const { React, create, act, loader } = require('./support/renderHarness.cjs');

test('compact workflow shows current progress, closes after selection and follows the next step without changing callbacks', async () => {
  const load = loader({ mocks: { './dailyWorkReports': { WORK_REPORT_STATUSES: [] } } });
  const { WorkflowStrip } = load('src/components/data-center/DataCenterWorkOverview.tsx');
  const steps = ['projects', 'facility', 'plan', 'rack', 'reports'].map((id, index) => ({ id, title: id, value: `QA ${index + 1}`, done: index < 3 }));
  const calls = [];
  const render = (compact, nextStepId, currentSteps = steps) => React.createElement(WorkflowStrip, { compact, nextStepId, steps: currentSteps, onStep: id => calls.push(id), help: 'QA 說明' });
  let tree;
  await act(async () => { tree = create(render(true, 'rack')); });
  try {
    const summary = () => tree.root.findByProps({ className: 'dc-flow-current' });
    const popover = () => tree.root.find(node => node.type === 'stub' && typeof node.props.open === 'boolean');
    assert.match(summary().props['aria-label'], /3／5 已完成，下一步 rack/);
    await act(async () => popover().props.onOpenChange(true));
    assert.equal(popover().props.open, true);
    await act(async () => tree.root.findByProps({ 'data-step': 'rack' }).props.onClick());
    assert.deepEqual(calls, ['rack']);
    assert.equal(popover().props.open, false);
    await act(async () => tree.update(render(true, 'reports', steps.map(step => ({ ...step, done: step.id !== 'reports' })))));
    assert.match(summary().props['aria-label'], /4／5 已完成，下一步 reports/);
    await act(async () => tree.update(render(true, null, steps.map(step => ({ ...step, done: true })))));
    assert.match(summary().props['aria-label'], /5／5 已完成/);
    assert.doesNotMatch(summary().props['aria-label'], /下一步/);
    await act(async () => tree.update(render(false, 'rack')));
    assert.equal(tree.root.findByProps({ className: 'dc-flow' }).props.children.length, 5);
    assert.equal(tree.root.findAllByProps({ className: 'dc-flow-current' }).length, 0);
    await act(async () => tree.root.findByProps({ 'data-step': 'projects' }).props.onClick());
    assert.deepEqual(calls, ['rack', 'projects']);
  } finally { await act(async () => tree.unmount()); }
});
