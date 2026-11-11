import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('scheduled keep-alive calls only the constant database healthcheck and fails on errors', () => {
  const workflow = read('.github/workflows/keep_alive.yml');
  assert.match(workflow, /\/rest\/v1\/rpc\/database_healthcheck/);
  assert.match(workflow, /Accept-Profile: public/);
  assert.match(workflow, /--fail-with-body/);
  assert.match(workflow, /--connect-timeout 10 --max-time 30 --retry 2/);
  assert.match(workflow, /test "\$response" = 'true'/);
  assert.doesNotMatch(workflow, /keep_alive_check\?|service.role/i);
});

test('anonymous access regression runs on pull requests and main', () => {
  for (const file of ['.github/workflows/audit-regression.yml', '.github/workflows/audit-on-main.yml']) {
    assert.match(read(file), /node tests\/anonymousExposure\.integration\.mjs/);
  }
});
