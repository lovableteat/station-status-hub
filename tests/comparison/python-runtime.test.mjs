import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import test from 'node:test';

const publicRoot = new URL('../../public/comparison/', import.meta.url);
const workerSource = await readFile(new URL('autocheck.worker.js', publicRoot), 'utf8');

function worker(load = () => { throw new Error('Validation must run before Python download'); }) {
  let next = 0;
  const pending = new Map();
  const messages = [];
  const self = {
    location: { href: 'https://autocheck.test/comparison/autocheck.worker.js' },
    postMessage(message) {
      message = structuredClone(message);
      messages.push(message);
      if (message.type !== 'progress') {
        pending.get(message.id)?.(message);
        pending.delete(message.id);
      }
    },
  };
  const context = vm.createContext({
    self, URL, ArrayBuffer, Uint8Array, TextEncoder, Set, Promise, crypto: webcrypto,
    importScripts: () => {}, loadPyodide: load,
    fetch: async url => {
      const relative = new URL(url).pathname.replace('/comparison/', '');
      return new Response(await readFile(new URL(relative, publicRoot)));
    },
  });
  vm.runInContext(workerSource, context);
  return {
    messages,
    prepare: vm.runInContext('(type, payload, FS) => writeInputs({ FS }, "/work/test", type, validateRequest(type, payload))', context),
    dispatch(type, payload) {
      const id = ++next;
      return new Promise(resolve => {
        pending.set(id, resolve);
        self.onmessage({ data: { id, type, payload } });
      });
    },
  };
}

const file = (path, text = '') => ({ path, bytes: new TextEncoder().encode(text).buffer });
const request = a => ({ a, b: [], aLabel: 'A', bLabel: 'B', options: {} });

test('Python worker rejects path traversal, absolute paths and duplicate names before downloading', async () => {
  for (const path of ['../pstxnet.dat', '/pstxnet.dat', 'C:\\pstxnet.dat', 'dir//pstxnet.dat', 'dir/./pstxnet.dat']) {
    const result = await worker().dispatch('run', request([file(path)]));
    assert.equal(result.type, 'error');
    assert.match(result.message, /路徑/);
  }
  const duplicate = await worker().dispatch('run', request([file('test.dat'), file('TEST.dat')]));
  assert.equal(duplicate.type, 'error');
  assert.match(duplicate.message, /重複/);
});

test('Python worker enforces file count, file bytes and YAML bounds', async () => {
  const count = await worker().dispatch('run', request(Array.from({ length: 1001 }, (_, i) => file(`${i}.dat`))));
  assert.match(count.message, /超過限制/);
  const large = await worker().dispatch('run', request([{ path: 'large.dat', bytes: new ArrayBuffer(64 * 1024 * 1024 + 1) }]));
  assert.match(large.message, /超過限制/);
  const total = await worker().dispatch('run', request(['a', 'b', 'c'].map(path => ({ path, bytes: new ArrayBuffer(44 * 1024 * 1024) }))));
  assert.match(total.message, /超過限制/);
  const yaml = await worker().dispatch('library', { yaml: 'a'.repeat(2 * 1024 * 1024 + 1) });
  assert.match(yaml.message, /大小無效/);
});

test('Folder datasheets preserve nested paths and duplicate basenames without weakening payload limits', () => {
  const fsFiles = new Map();
  const fs = { mkdirTree() {}, writeFile(path, bytes) { fsFiles.set(path, bytes); } };
  const instance = worker();
  const datasheets = [file('ICs/Vendor A/TMP9999.pdf', 'first'), file('ICs/Vendor B/TMP9999.PDF', 'second')];
  const prepared = instance.prepare('run', { ...request([file('EVT/pstxnet.dat')]), options: { datasheets } }, fs);
  assert.deepEqual(Array.from(prepared.options.datasheets), [
    '/work/test/datasheets/ICs/Vendor A/TMP9999.pdf',
    '/work/test/datasheets/ICs/Vendor B/TMP9999.PDF',
  ]);
  assert.equal(new TextDecoder().decode(fsFiles.get(prepared.options.datasheets[0])), 'first');
  assert.equal(new TextDecoder().decode(fsFiles.get(prepared.options.datasheets[1])), 'second');
  const prepare = sheets => instance.prepare('run', { ...request([]), options: { datasheets: sheets } }, fs);
  assert.throws(() => prepare([file('ICs/part.pdf'), file('ics/PART.PDF')]), /重複/);
  assert.throws(() => prepare([file('ICs/../part.pdf')]), /路徑/);
  assert.throws(() => instance.prepare('run', {
    ...request([file('EVT/pstxnet.dat')]),
    options: { datasheets: Array.from({ length: 1000 }, (_, i) => file(`ICs/${i}.PDF`)) },
  }, fs), /超過限制/);
  const large = new ArrayBuffer(64 * 1024 * 1024);
  assert.throws(() => instance.prepare('run', {
    a: [{ path: 'EVT/schematic.pdf', bytes: large }],
    b: [{ path: 'DVT/schematic.pdf', bytes: large }],
    options: { datasheets: [file('ICs/TMP9999.PDF', 'x')] },
  }, fs), /超過限制/);
});

test('Browser bridge discovers top-level and nested mixed-case PDF datasheets using original part matching', {
  skip: !process.env.AUTOCHECK_PYTHON && 'Set AUTOCHECK_PYTHON to a native Python 3 interpreter for this standard-library regression',
}, () => {
  const script = String.raw`
import ast
import json
from pathlib import Path
import re
import sys
import tempfile
from types import SimpleNamespace

bridge = ast.parse(Path(sys.argv[1]).read_text(encoding='utf-8'))
nodes = [node for node in bridge.body if isinstance(node, ast.FunctionDef) and node.name == '_folder_datasheets'
         or isinstance(node, ast.Assign) and any(isinstance(target, ast.Attribute) and isinstance(target.value, ast.Name)
                                                and target.value.id == 'i2c' and target.attr == 'matching_datasheets'
                                                for target in node.targets)]
i2c = SimpleNamespace(_norm=lambda value: re.sub(r'[^A-Z0-9]', '', (value or '').upper()))
scope = {'i2c': i2c}
exec(compile(ast.Module(body=nodes, type_ignores=[]), '<browser datasheet adapter>', 'exec'), scope)
assert i2c.matching_datasheets is scope['_folder_datasheets']
with tempfile.TemporaryDirectory() as temporary:
    root = Path(temporary)
    names = ['TMP9999.pdf', 'ICs/A/TMP9999.PDF', 'ICs/B/TMP9999.pdf', 'ICs/MATCH.pdf',
             'ICs/TMP9999.txt', 'ICs/AB12.pdf', 'ICs/TMP8888.pdf']
    for name in names:
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text('synthetic fixture', encoding='utf-8')
    (root / 'TMP9999-directory.PDF').mkdir()
    result = [path.relative_to(root).as_posix() for path in i2c.matching_datasheets(root, ['IC TMP-9999GF', 'AB12'])]
    assert result == ['ICs/A/TMP9999.PDF', 'ICs/B/TMP9999.pdf', 'TMP9999.pdf'], result
    assert i2c.matching_datasheets(root / 'absent', ['TMP9999']) == []
    assert i2c.matching_datasheets(root, ['TMP7777']) == []
    print(json.dumps(result))
`;
  const result = spawnSync(process.env.AUTOCHECK_PYTHON, ['-c', script, fileURLToPath(new URL('browser_bridge.py', publicRoot))], { encoding: 'utf8' });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(JSON.parse(result.stdout), ['ICs/A/TMP9999.PDF', 'ICs/B/TMP9999.pdf', 'TMP9999.pdf']);
});

test('Public engine manifest includes only original Python source and safe config', async () => {
  const manifest = JSON.parse(await readFile(new URL('engine/manifest.json', publicRoot), 'utf8'));
  assert.equal(manifest.version, '0.2.0');
  assert.equal(manifest.origin, 'User-provided AutoCheck_1022.zip');
  assert.equal(manifest.revision, '2026-10-22');
  assert.equal(manifest.files.length, 49);
  for (const { path, sha256 } of manifest.files) {
    assert.match(path, /^(autocheck\/.+\.py|config\/(default|i2c_devices|i2c_devices_user|power_parts)\.yaml)$/);
    const bytes = await readFile(new URL(`engine/${path}`, publicRoot));
    const digest = Buffer.from(await webcrypto.subtle.digest('SHA-256', bytes)).toString('hex');
    assert.equal(digest, sha256, path);
  }
  const userYaml = await readFile(new URL('engine/config/i2c_devices_user.yaml', publicRoot), 'utf8');
  assert.match(userYaml, /devices: \[\]/);
});

test('Original AutoCheck runs through worker and exports actual PDF/Excel/library/datasheet results', {
  skip: process.env.AUTOCHECK_PYODIDE !== '1', timeout: 180000,
}, async () => {
  const { loadPyodide } = await import(process.env.AUTOCHECK_PYODIDE_MODULE || new URL('../../tmp/autocheck-runtime/node_modules/pyodide/pyodide.mjs', import.meta.url));
  let python;
  const bridge = worker(async () => {
    python = await loadPyodide({ stdout: () => {} });
    return python;
  });
  const library = await bridge.dispatch('library', {});
  assert.equal(library.type, 'result', library.message);
  assert.ok(library.result.entries.length > 20);
  assert.deepEqual(library.result.errors, []);
  const invalidLibrary = await bridge.dispatch('library', { yaml: 'devices: [bad]' });
  assert.ok(invalidLibrary.result.errors.length);
  const circular = await bridge.dispatch('library', { yaml: 'devices: &a [*a]' });
  assert.match(circular.result.errors.join(' '), /循環/);
  const entry = { name: 'TMP9999', mpn: 'TMP9999', fixed: '0x4C', src: 'TMP9999.pdf p.1', fmax_khz: 400 };
  const accepted = await bridge.dispatch('library', { yaml: 'devices: []', entry, signedBy: 'Synthetic RD' });
  assert.deepEqual(accepted.result.errors, []);
  assert.equal(accepted.result.entries.find(item => item.name === 'TMP9999').verified, true);
  assert.match(accepted.result.yaml, /signed_by: Synthetic RD/);
  const acceptedYaml = await bridge.dispatch('library', { yaml: accepted.result.yaml, entryYaml: 'name: TMP9999\nmpn: TMP9999\nfixed: 0x4D\nsrc: TMP9999.pdf p.1', signedBy: 'Synthetic RD 2' });
  assert.deepEqual(acceptedYaml.result.errors, []);
  assert.match(acceptedYaml.result.yaml, /0x4D/);

  await python.runPythonAsync(`
from pathlib import Path
from autocheck.fakeschem import make_fake_schematic
from reportlab.pdfgen import canvas
Path('/fixture').mkdir(exist_ok=True)
make_fake_schematic(Path('/fixture/schematic.pdf'), {1:'POWER'}, {1:[('C1','1uF 6.3V'),('U1','TMP451'),('R1','2.2Kohm'),('R2','2.2Kohm')]})
c=canvas.Canvas('/fixture/datasheet.pdf')
c.drawString(40,800,'I2C Slave Address')
c.drawString(40,780,'A1 A0 Address')
c.drawString(40,760,'GND GND 0x48')
c.drawString(40,740,'GND VDD 0x49')
c.drawString(40,720,'VDD GND 0x4A')
c.drawString(40,700,'VDD VDD 0x4B')
c.save()
`);
  const parts = {
    C1: ['C_TX_C0402', '1uF 6.3V', [['1', 'P3V3'], ['2', 'GND']]],
    U1: ['TMP451', 'TMP451', [['VDD', 'P3V3'], ['GND', 'GND'], ['SDA', 'I2C_SDA'], ['SCL', 'I2C_SCL']]],
    R1: ['RES1', '2.2Kohm', [['1', 'I2C_SDA'], ['2', 'P3V3']]],
    R2: ['RES2', '2.2Kohm', [['1', 'I2C_SCL'], ['2', 'P3V3']]],
  };
  function revision(label, highVoltage) {
    const nets = new Map();
    const chips = [];
    const prts = [];
    for (const [ref, [primitive, value, pins]] of Object.entries(parts)) {
      const pinText = pins.map(([name], i) => `  '${name}':\n    PIN_NUMBER='(${i + 1})';`).join('\n');
      chips.push(`primitive '${primitive}';\npin\n${pinText}\nend_pin;\nbody\nVALUE='${value}';\nend_body;\nend_primitive;`);
      prts.push(`PART_NAME\n${ref} '${primitive}':;\nP_PATH=':page1_POWER';`);
      pins.forEach(([name, net], i) => {
        if (ref === 'C1' && name === '1' && highVoltage) net = 'P12V';
        const nodes = nets.get(net) || [];
        nodes.push(`NODE_NAME ${ref} ${i + 1}\n\n '${name}':;`);
        nets.set(net, nodes);
      });
    }
    const bom = 'Part Number,Description,Spec,Qty,Reference\n' + Object.entries(parts).map(([ref, [, value]]) => `PN_${ref},${ref === 'C1' ? 'MLCC ' : ''}${value},${value},1,${ref}`).join('\n');
    return [file(`${label}/pstchip.dat`, chips.join('\n')), file(`${label}/pstxprt.dat`, prts.join('\n')),
      file(`${label}/pstxnet.dat`, [...nets].map(([net, nodes]) => `NET_NAME\n'${net}'\n${nodes.join('\n')}`).join('\n')),
      file(`${label}/bom.csv`, bom)];
  }
  const a = revision('EVT', false);
  const b = revision('DVT', true);
  b.push({ path: 'DVT/schematic.pdf', bytes: python.FS.readFile('/fixture/schematic.pdf').slice().buffer });
  const run = await bridge.dispatch('run', { a, b, aLabel: 'EVT', bLabel: 'DVT', options: {} });
  assert.equal(run.type, 'result', run.message);
  assert.ok(run.result.findings.some(finding => finding.rule === 'MLCC_DERATING' && finding.status === 'NEW'));
  assert.ok(run.result.findings.some(finding => finding.status === 'CHANGE'));
  assert.ok(run.result.i2cMap.buses.length);
  assert.ok(run.result.rows.every(row => row.dest && row.key));
  const artifacts = new Map(run.result.artifacts.map(artifact => [artifact.key, artifact]));
  for (const key of ['power_drawio_a', 'power_drawio_b', 'i2c_drawio_a', 'i2c_drawio_b']) {
    const artifact = artifacts.get(key);
    assert.ok(artifact?.bytes.byteLength > 0, key);
    assert.equal(artifact.mime, 'application/vnd.jgraph.mxfile');
    assert.match(artifact.name, /\.drawio$/);
    assert.match(new TextDecoder().decode(artifact.bytes), /<mxfile\b/);
  }
  for (const key of ['pdf', 'xlsx', 'json', 'caps', 'todo', 'domains', 'circuit_a', 'circuit_b', 'ptree_html', 'i2c_html', 'i2c_block_html', 'i2c_csv', 'schematic', 'annotations']) {
    assert.ok(artifacts.get(key)?.bytes.byteLength > 0, key);
  }
  assert.equal(Buffer.from(artifacts.get('pdf').bytes).subarray(0, 4).toString(), '%PDF');
  assert.ok(Buffer.from(artifacts.get('pdf').bytes).includes(Buffer.from('MSung-Light')));
  assert.equal(Buffer.from(artifacts.get('xlsx').bytes).subarray(0, 2).toString(), 'PK');
  assert.ok(!artifacts.has('reviewDb'));
  const sidecar = JSON.parse(new TextDecoder().decode(artifacts.get('annotations').bytes));
  assert.ok(sidecar.summary.located > 0);
  assert.ok(!run.result.warnings.some(warning => warning.includes('未完整完成')));
  const invalidLabel = await bridge.dispatch('run', { a, b, aLabel: 'EVT', bLabel: 'DVT:2', options: {} });
  assert.equal(invalidLabel.type, 'error');
  assert.match(invalidLabel.message, /版次名稱/);
  const hostileNet = b.map(input => input.path.endsWith('.dat') ? file(input.path, new TextDecoder().decode(input.bytes).replaceAll('I2C_SDA', '=1+1')) : input);
  const hostileRun = await bridge.dispatch('run', { a, b: hostileNet, aLabel: 'EVT', bLabel: 'DVT', options: {} });
  assert.equal(hostileRun.type, 'result', hostileRun.message);
  python.FS.writeFile('/fixture/hostile.xlsx', new Uint8Array(hostileRun.result.artifacts.find(artifact => artifact.key === 'xlsx').bytes));
  assert.equal(python.runPython(`from openpyxl import load_workbook\nw=load_workbook('/fixture/hostile.xlsx')\nassert any(c.value == '=1+1' for s in w for row in s for c in row)\nassert all(c.data_type == 's' for s in w for row in s for c in row if c.value == '=1+1')\nassert any(c.data_type == 'f' for row in w['統計'] for c in row)\nTrue`), true);
  const key = run.result.rows[0].key;
  const tracker = await bridge.dispatch('tracker', {
    template: artifacts.get('xlsx').bytes, rows: run.result.rows, aLabel: 'EVT', bLabel: 'DVT',
    replies: { [key]: { disp: '修改', owner: 'Synthetic RD', target_rev: 'PVT', note: '=1+1', filled: '2026-10-12' } },
  });
  assert.equal(tracker.type, 'result', tracker.message);
  python.FS.writeFile('/fixture/replied.xlsx', new Uint8Array(tracker.result.bytes));
  assert.equal(python.runPython(`from openpyxl import load_workbook\nw=load_workbook('/fixture/replied.xlsx')\nassert any(row[18] == 'Synthetic RD' for row in w['追蹤表'].iter_rows(values_only=True))\nTrue`), true);
  assert.equal(python.runPython(`assert any(row[20].value == '=1+1' and row[20].data_type == 's' for row in w['追蹤表'].iter_rows())\nTrue`), true);
  const datasheet = await bridge.dispatch('datasheet', { file: { path: 'TMP9999.pdf', bytes: python.FS.readFile('/fixture/datasheet.pdf').slice().buffer }, name: 'TMP9999', mpn: 'TMP9999' });
  assert.equal(datasheet.type, 'result', datasheet.message);
  assert.equal(Object.keys(datasheet.result.entry.table).length, 4);
  assert.match(datasheet.result.entry_yaml, /0x48/);
  assert.equal(datasheet.result.pageTexts[0].page, 1);
  assert.match(datasheet.result.pageTexts[0].text, /I2C Slave Address/);
  const repeated = await bridge.dispatch('run', { a, b, aLabel: 'EVT', bLabel: 'DVT', options: {} });
  assert.deepEqual(repeated.result.rows.map(row => row.key), run.result.rows.map(row => row.key));
  await python.runPythonAsync(`
from openpyxl import Workbook
w = Workbook()
s = w.active
s.append(['Title Block', 'Synthetic Agile BOM'])
s.append(['BOM'])
s.append(['Level', 'Find Num', 'Main / Sub', 'Item Number', 'Item Description', 'Qty', 'Ref Des', 'Mfr. Name', 'Mfr. Part Number'])
for n, (ref, value) in enumerate([('C1', 'MLCC 1uF 6.3V'), ('U1', 'TMP451'), ('R1', '2.2Kohm'), ('R2', '2.2Kohm')], 1):
    s.append(['1', str(n), 'M', 'PN_' + ref, value, '1', ref, 'Synthetic', value])
s.append(['1', '5', 'M', 'PROGRAMMED_A', 'Synthetic programmed part', '1', 'FOR J99'])
s.append(['1', '6', 'M', 'PROGRAMMED_B', 'Synthetic programmed part', '1', 'FOR J98'])
w.save('/fixture/agile.xlsx')
`);
  const agileBom = { path: 'agile.xlsx', bytes: python.FS.readFile('/fixture/agile.xlsx').slice().buffer };
  const agileRun = await bridge.dispatch('run', {
    a: [...a.filter(input => !input.path.endsWith('bom.csv')), agileBom],
    b: [...b.filter(input => !input.path.endsWith('bom.csv')), agileBom], aLabel: 'EVT', bLabel: 'DVT',
    options: { config: 'power_tree:\n  library: /work/untrusted-power-parts.yaml\n' },
  });
  assert.equal(agileRun.type, 'result', agileRun.message);
  assert.ok(agileRun.result.findings.some(finding => finding.rule === 'MLCC_DERATING'));
  const unresolved = agileRun.result.rows.filter(row => row.rule === 'BOM_REF_UNRESOLVED');
  assert.equal(unresolved.length, 2);
  assert.equal(new Set(unresolved.map(row => row.key)).size, 2);
  assert.ok(unresolved.every(row => row.key.length > 'BOM_REF_UNRESOLVED|'.length && !row.key.includes('#')));
  assert.ok(!agileRun.result.inputIssues.some(([level]) => level === 'ERROR'));
  assert.ok(!agileRun.result.warnings.some(warning => /power tree skipped|未完整完成/.test(warning)));
  await python.runPythonAsync(`
w = load_workbook('/fixture/agile.xlsx')
s = w.active
for col in range(1, s.max_column + 1):
    s.cell(8, col).value, s.cell(9, col).value = s.cell(9, col).value, s.cell(8, col).value
w.save('/fixture/agile-reordered.xlsx')
`);
  const reordered = await bridge.dispatch('run', { a, b: [...b.filter(input => !input.path.endsWith('bom.csv')), { path: 'agile.xlsx', bytes: python.FS.readFile('/fixture/agile-reordered.xlsx').slice().buffer }], aLabel: 'EVT', bLabel: 'DVT', options: {} });
  assert.equal(reordered.type, 'result', reordered.message);
  assert.deepEqual(reordered.result.rows.filter(row => row.rule === 'BOM_REF_UNRESOLVED').map(row => [row.title, row.key]).sort(), unresolved.map(row => [row.title, row.key]).sort());
  const invalidPower = await bridge.dispatch('run', { a, b, options: { config: 'power_tree: []' } });
  assert.equal(invalidPower.type, 'error');
  assert.match(invalidPower.message, /power_tree 設定/);
  const missing = await bridge.dispatch('run', { a: [], b, options: {} });
  assert.match(missing.message, /缺少必要 netlist/);
  const ambiguous = await bridge.dispatch('run', { a: [...a, file('other/pstchip.dat')], b, options: {} });
  assert.match(ambiguous.message, /多個 pstchip/);
  const brokenPdf = await bridge.dispatch('run', { a, b: [...b.slice(0, -1), file('DVT/schematic.pdf', 'invalid PDF')], aLabel: 'EVT', bLabel: 'DVT', options: {} });
  assert.equal(brokenPdf.type, 'result', brokenPdf.message);
  assert.ok(brokenPdf.result.warnings.some(warning => warning.includes('未完整完成')));
  assert.ok(brokenPdf.result.artifacts.some(artifact => artifact.key === 'xlsx'));
  assert.ok(!brokenPdf.result.artifacts.some(artifact => artifact.key === 'schematic'));
  assert.ok(bridge.messages.some(message => message.type === 'progress'));
  assert.deepEqual(python.FS.readdir('/work'), ['.', '..']);
});
