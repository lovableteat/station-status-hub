import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const publicRoot = new URL('../../public/comparison/', import.meta.url);
const fixtureRoot = new URL('fixtures/', import.meta.url);
const nativePython = process.env.AUTOCHECK_PYTHON;
const nativeOnly = { skip: !nativePython && 'Set AUTOCHECK_PYTHON and PYTHONPATH for the native AutoCheck draw.io regression' };

test('AutoCheck 1015 manifest includes both original draw.io renderers and verifies every deployed source', async () => {
  const manifest = JSON.parse(await readFile(new URL('engine/manifest.json', publicRoot), 'utf8'));
  assert.equal(manifest.origin, 'User-provided AutoCheck_1015.zip');
  assert.equal(manifest.revision, '2026-10-15');
  assert.equal(manifest.sourceSha256, 'dd6ab9090ebb60fe86575a6c349355f0a0a4b3a5acca31e29df624d264ac2e35');
  const paths = manifest.files.map(file => file.path);
  assert.equal(new Set(paths).size, paths.length);
  for (const renderer of ['power_tree_drawio.py', 'i2c_block_drawio.py']) {
    assert.ok(paths.includes(`autocheck/report/${renderer}`));
  }
  for (const file of manifest.files) {
    assert.match(file.path, /^(autocheck\/.*\.py|config\/[\w-]+\.yaml)$/);
    const bytes = await readFile(new URL(`engine/${file.path}`, publicRoot));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path);
  }
});

const setup = String.raw`
import json
from pathlib import Path
import runpy
import sys
import tempfile
import xml.etree.ElementTree as ET
sys.dont_write_bytecode = True
root = Path(sys.argv[1])
sys.path.insert(0, str(root / 'engine'))
runpy.run_path(str(root / 'browser_compat.py'))
runpy.run_path(str(root / 'power_tree_compat.py'))
bridge = runpy.run_path(str(root / 'browser_bridge.py'))
fixtures = Path(sys.argv[2])
`;

function runPython(script) {
  const result = spawnSync(nativePython, ['-c', setup + script, fileURLToPath(publicRoot), fileURLToPath(fixtureRoot)], {
    encoding: 'utf8', timeout: 60_000, env: { ...process.env, PYTHONUTF8: '1' },
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test('Browser engine returns independent editable Power Tree and I²C A/B files with stable artifact keys', nativeOnly, () => {
  runPython(String.raw`
with tempfile.TemporaryDirectory() as temporary:
    work = Path(temporary)
    payload = {
        'a': [str(path) for path in (fixtures / 'A').iterdir() if path.is_file()],
        'b': [str(path) for path in (fixtures / 'B').iterdir() if path.is_file()],
        'aLabel': 'EVT&舊', 'bLabel': 'DVT&新', 'options': {},
    }
    result = bridge['_run'](payload, work, lambda _: None)
    artifacts = {item['key']: item for item in result['artifacts']}
    keys = {'power_drawio_a', 'power_drawio_b', 'i2c_drawio_a', 'i2c_drawio_b'}
    assert keys <= artifacts.keys(), artifacts.keys()
    assert len({artifacts[key]['path'] for key in keys}) == 4
    for key in keys:
        artifact = artifacts[key]
        assert artifact['mime'] == 'application/vnd.jgraph.mxfile'
        assert artifact['name'].endswith('.drawio')
        xml = Path(artifact['path']).read_text(encoding='utf-8')
        assert '/__autocheck_local__/' not in xml
        document = ET.fromstring(xml)
        assert document.tag == 'mxfile'
        for page in document.findall('diagram'):
            ids = [item.get('id') for item in page.iter() if item.tag in {'mxCell', 'object'} and item.get('id')]
            assert len(ids) == len(set(ids))
            assert {'0', '1'} <= set(ids)
            for edge in page.iter('mxCell'):
                if edge.get('edge') != '1':
                    continue
                assert edge.get('source') in ids
                assert edge.get('target') in ids or edge.find("mxGeometry/mxPoint[@as='targetPoint']") is not None
                assert edge.find('mxGeometry').get('relative') == '1'
        if key.startswith('i2c'):
            assert 'stencil(' in xml and 'jumpStyle=arc' in xml
    assert {'xlsx', 'pdf', 'json', 'ptree_html', 'i2c_html', 'i2c_block_html'} <= artifacts.keys()
    assert not {'ptree_drawio', 'i2c_block_drawio'} & artifacts.keys()
print('A/B draw.io artifacts, XML topology, original reports, MIME and local PDF links verified')
`);
});

test('A draw.io generation never overwrites B and a renderer failure preserves successful reports', nativeOnly, () => {
  runPython(String.raw`
from types import SimpleNamespace
from unittest.mock import patch
from autocheck.report import power_tree_drawio

with tempfile.TemporaryDirectory() as temporary:
    out = Path(temporary)
    b_file = out / 'power_tree_EVT_A.drawio'
    b_file.write_text('<mxfile>B original</mxfile>', encoding='utf-8')
    rail = {'v': 12.0, 'members': ['VIN'], 'loads': [], 'conns': []}
    tree = {'rows': [{'level': 0, 'tree': 'VIN', 'kind': 'input'}], 'orphans': [], 'edges': [], 'rails': {'VIN': rail}}
    result = SimpleNamespace(a=SimpleNamespace(label='EVT'), b=SimpleNamespace(label='EVT_A'), generated='test',
                             power_tree_a=tree, i2c_map_a={}, warnings=[])
    paths = {'ptree_drawio': b_file}
    bridge['_drawio_outputs'](result, out, paths)
    a_file = paths['power_drawio_a']
    assert a_file != b_file and a_file.name == 'power_tree_EVT_A_2.drawio'
    assert paths['power_drawio_b'] == b_file
    assert b_file.read_text(encoding='utf-8') == '<mxfile>B original</mxfile>'
    previous_a = a_file.read_text(encoding='utf-8')
    with patch.object(power_tree_drawio, 'render_drawio', side_effect=RuntimeError('synthetic renderer failure')):
        bridge['_drawio_outputs'](result, out, {})
    assert a_file.read_text(encoding='utf-8') == previous_a
    assert b_file.read_text(encoding='utf-8') == '<mxfile>B original</mxfile>'
    assert not (out / 'power_tree_EVT_A_3.drawio').exists()
    assert any('synthetic renderer failure' in warning for warning in result.warnings)
print('A/B filename collision and isolated draw.io failure verified')
`);
});

test('Browser partial-report fallback keeps old report keys and both draw.io revisions', nativeOnly, () => {
  runPython(String.raw`
namespace = bridge['_run'].__globals__
original = namespace['write_outputs']
def partial_output(*args, **kwargs):
    original(*args, **kwargs)
    raise RuntimeError('synthetic late report failure')
namespace['write_outputs'] = partial_output
with tempfile.TemporaryDirectory() as temporary:
    result = bridge['_run']({
        'a': [str(path) for path in (fixtures / 'A').iterdir() if path.is_file()],
        'b': [str(path) for path in (fixtures / 'B').iterdir() if path.is_file()],
        'aLabel': 'EVT', 'bLabel': 'DVT', 'options': {},
    }, Path(temporary), lambda _: None)
    keys = {item['key'] for item in result['artifacts']}
    assert {'power_drawio_a', 'power_drawio_b', 'i2c_drawio_a', 'i2c_drawio_b',
            'xlsx', 'pdf', 'json', 'ptree_html', 'i2c_html', 'i2c_block_html'} <= keys, keys
    assert any('synthetic late report failure' in warning for warning in result['warnings'])
print('partial-report artifacts retain all stable names after A draw.io generation')
`);
});
