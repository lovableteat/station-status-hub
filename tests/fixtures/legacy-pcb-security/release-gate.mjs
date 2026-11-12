// Test-only helper. Never imported by application or deployment code.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const gate=JSON.parse(await readFile(new URL('release-gate.json',import.meta.url),'utf8'));
const gateSha='32d951b69930d11c9d8c3cb37063f69740964a1839b9b3e016d9961f4fbaa5c8';
export function isolatedEnforcementBody(enforcement) {
 assert.equal(gate.sha256,gateSha);
 assert.equal(createHash('sha256').update(gate.text).digest('hex'),gateSha);
 assert.equal(enforcement.split(gate.text).length,2,'exactly one pinned release gate');
 return enforcement.replace(gate.text,'-- ISOLATED REHEARSAL ONLY: fixed gate removed by test harness.\n');
}
