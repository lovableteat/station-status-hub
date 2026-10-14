/* The user's AutoCheck runs in this worker; engineering inputs stay in its in-memory filesystem. */
const PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v0.29.3/full/';
const LIMITS = { count: 1000, file: 64 * 1024 * 1024, total: 128 * 1024 * 1024 };
let runtime;
let sequence = 0;
let queue = Promise.resolve();

function progress(id, message) {
  self.postMessage({ id, type: 'progress', message });
}

function validPath(path) {
  if (typeof path !== 'string' || !path || path.length > 4096 || /[\x00-\x1f:]/.test(path)) {
    throw new Error('檔案路徑無效');
  }
  const normalized = path.replaceAll('\\', '/').normalize('NFC');
  if (normalized.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('檔案路徑不可包含絕對路徑或上層目錄');
  }
  return normalized;
}

function validateFiles(files, totals) {
  if (!Array.isArray(files)) throw new Error('檔案清單格式無效');
  const seen = new Set();
  return files.map(file => {
    const path = validPath(file?.path);
    if (!(file.bytes instanceof ArrayBuffer)) throw new Error(`${path} 缺少檔案內容`);
    const key = path.toLowerCase();
    if (seen.has(key)) throw new Error(`重複檔案路徑：${path}`);
    seen.add(key);
    totals.count += 1;
    totals.bytes += file.bytes.byteLength;
    if (file.bytes.byteLength > LIMITS.file || totals.bytes > LIMITS.total || totals.count > LIMITS.count) {
      throw new Error('輸入超過限制（1000 個檔案、單檔 64 MiB、總計 128 MiB）');
    }
    return { path, bytes: file.bytes };
  });
}

function validateRequest(type, payload) {
  if (!payload || typeof payload !== 'object') throw new Error('工作內容格式無效');
  const totals = { count: 0, bytes: 0 };
  if (type === 'run') {
    const a = validateFiles(payload.a, totals);
    const b = validateFiles(payload.b, totals);
    const options = payload.options || {};
    const out = { ...options, datasheets: validateFiles(options.datasheets || [], totals) };
    for (const key of ['config', 'railMap', 'railDomain', 'i2cDeclared', 'library']) {
      if (options[key] == null) continue;
      if (typeof options[key] === 'string') {
        const size = new TextEncoder().encode(options[key]).length;
        if (!['config', 'library'].includes(key) || size > 2 * 1024 * 1024) {
          throw new Error(`${key} 格式或大小無效`);
        }
        totals.count += 1;
        totals.bytes += size;
        if (totals.count > LIMITS.count || totals.bytes > LIMITS.total) throw new Error('輸入超過限制（1000 個檔案、總計 128 MiB）');
      } else out[key] = validateFiles([options[key]], totals)[0];
    }
    return { ...payload, a, b, options: out };
  }
  if (type === 'datasheet') return { ...payload, file: validateFiles([payload.file], totals)[0] };
  if (type === 'tracker') {
    if (!(payload.template instanceof ArrayBuffer) || payload.template.byteLength > LIMITS.file) {
      throw new Error('Excel 範本格式或大小無效');
    }
    if (!Array.isArray(payload.rows) || payload.rows.length > 100000) throw new Error('追蹤列格式或數量無效');
    return payload;
  }
  if (type === 'library') {
    for (const key of ['yaml', 'entryYaml']) {
      if (payload[key] != null && (typeof payload[key] !== 'string' || new TextEncoder().encode(payload[key]).length > 2 * 1024 * 1024)) {
        throw new Error('使用者位址 YAML 格式或大小無效');
      }
    }
    return payload;
  }
  throw new Error('不支援的 AutoCheck 工作');
}

async function initialize(id) {
  if (!runtime) runtime = (async () => {
    progress(id, '首次載入 Python 執行環境');
    importScripts(`${PYODIDE_URL}pyodide.js`);
    const pyodide = await loadPyodide({ indexURL: PYODIDE_URL });
    progress(id, '載入原始引擎所需的解析與報表套件');
    await pyodide.loadPackage(['pandas', 'lxml', 'pyyaml', 'pillow', 'cryptography', 'xlrd', 'sqlite3', 'micropip']);
    await pyodide.runPythonAsync(`
import micropip
await micropip.install(['openpyxl==3.1.5', 'olefile==0.47', 'reportlab==4.4.10', 'pypdf==6.1.1', 'pdfminer.six==20251230', 'charset-normalizer==3.4.4'])
await micropip.install('pdfplumber==0.11.7', deps=False)
`);
    const base = new URL('.', self.location.href);
    const manifestResponse = await fetch(new URL('engine/manifest.json', base), { cache: 'no-cache' });
    if (!manifestResponse.ok) throw new Error('無法載入 AutoCheck 原始碼清單');
    const manifest = await manifestResponse.json();
    await Promise.all(manifest.files.map(async file => {
      const relative = validPath(file.path);
      const response = await fetch(new URL(`engine/${relative}`, base), { cache: 'no-cache' });
      if (!response.ok) throw new Error(`無法載入 AutoCheck ${relative}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const hash = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
      if (hash !== file.sha256) throw new Error(`AutoCheck 原始碼完整性驗證失敗：${relative}`);
      const path = `/engine/${relative}`;
      pyodide.FS.mkdirTree(path.slice(0, path.lastIndexOf('/')));
      pyodide.FS.writeFile(path, bytes);
    }));
    const adapters = await Promise.all(['browser_compat.py', 'power_tree_compat.py', 'browser_bridge.py'].map(async name => {
      const response = await fetch(new URL(name, base), { cache: 'no-cache' });
      if (!response.ok) throw new Error(`無法載入 Python 瀏覽器橋接：${name}`);
      return response.text();
    }));
    await pyodide.runPythonAsync(`import sys\nsys.path.insert(0, '/engine')`);
    for (const source of adapters) await pyodide.runPythonAsync(source);
    return pyodide;
  })().catch(error => { runtime = undefined; throw error; });
  return runtime;
}

function writeInputs(pyodide, root, type, payload) {
  const write = (file, folder) => {
    const path = `${root}/${folder}/${file.path}`;
    pyodide.FS.mkdirTree(path.slice(0, path.lastIndexOf('/')));
    pyodide.FS.writeFile(path, new Uint8Array(file.bytes));
    return path;
  };
  if (type === 'run') {
    const options = { ...payload.options };
    for (const key of ['config', 'railMap', 'railDomain', 'i2cDeclared', 'library']) {
      if (options[key] && typeof options[key] !== 'string') options[key] = { file: write(options[key], `options/${key}`) };
    }
    options.datasheets = options.datasheets.map(file => write(file, 'datasheets'));
    return { ...payload, a: payload.a.map(file => write(file, 'a')), b: payload.b.map(file => write(file, 'b')), options, root };
  }
  if (type === 'datasheet') return { ...payload, file: write(payload.file, 'datasheets'), root };
  if (type === 'tracker') {
    const template = write({ path: 'template.xlsx', bytes: payload.template }, 'tracker');
    return { ...payload, template, root };
  }
  return { ...payload, root };
}

function removeWork(fs, path) {
  for (const name of fs.readdir(path)) {
    if (name === '.' || name === '..') continue;
    const child = `${path}/${name}`;
    if (fs.isDir(fs.stat(child).mode)) removeWork(fs, child);
    else fs.unlink(child);
  }
  fs.rmdir(path);
}

async function execute({ id, type, payload }) {
  let pyodide;
  let root;
  try {
    const validated = validateRequest(type, payload);
    pyodide = await initialize(id);
    root = `/work/request-${++sequence}`;
    pyodide.FS.mkdirTree(root);
    const prepared = writeInputs(pyodide, root, type, validated);
    pyodide.globals.set('_autocheck_request', JSON.stringify({ type, payload: prepared }));
    pyodide.globals.set('_autocheck_progress', message => progress(id, message));
    const result = JSON.parse(await pyodide.runPythonAsync('autocheck_dispatch(_autocheck_request, _autocheck_progress)'));
    const transfers = [];
    const artifact = ({ path, ...rest }) => {
      const bytes = pyodide.FS.readFile(path).slice().buffer;
      transfers.push(bytes);
      return { ...rest, bytes };
    };
    let returned = result;
    if (type === 'run') returned = { ...result, artifacts: result.artifacts.map(artifact) };
    if (type === 'tracker') returned = artifact(result);
    self.postMessage({ id, type: 'result', result: returned }, transfers);
  } catch (error) {
    self.postMessage({ id, type: 'error', message: error instanceof Error ? error.message : String(error) });
  } finally {
    if (pyodide && root) removeWork(pyodide.FS, root);
    if (pyodide) {
      pyodide.globals.delete('_autocheck_request');
      pyodide.globals.delete('_autocheck_progress');
    }
  }
}

self.onmessage = event => {
  queue = queue.then(() => execute(event.data));
};
