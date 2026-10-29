import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir, stat, lstat } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const folder = '機台管理系統.md';
const output = path.join(root, folder);
const check = process.argv.includes('--check');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).trim();
const sha = value => createHash('sha256').update(value).digest('hex');
const excludedFolders = [folder, 'node_modules', 'dist', 'dist-ssr', 'tmp', 'output', '.git', '.claude', '.preview-current', '.playwright-cli'];
const sources = [...new Set(git('ls-files', '-z', '--cached', '--others', ...excludedFolders.map(name => `--exclude=${name}/`), '--', ':(icase)*.md').split('\0'))]
  .filter(file => /\.md$/i.test(file) && !excludedFolders.some(name => file.startsWith(`${name}/`)))
  .sort((a, b) => a.localeCompare(b, 'en'));
const revision = git('rev-parse', 'HEAD');
const remote = git('remote', 'get-url', 'origin');
// shortcut: Source/asset web links support this project's GitHub remote, not arbitrary Git hosting.
const github = remote.match(/^(?:https:\/\/github\.com\/|git@github\.com:)(.+?)(?:\.git)?$/)?.[1];
const names = new Map(sources.map(file => [file, file === 'docs/文件包導讀.md' ? '00_閱讀指南.md' : file.replaceAll('/', '__')]));
if (new Set([...names.values()].map(name => name.toLowerCase())).size !== names.size || [...names.values()].some(name => name.toLowerCase() === '99_原始文件對照索引.md')) {
  throw new Error('Markdown filename collision; no output written.');
}
const tracked = new Set(git('ls-files', '-z').split('\0'));
const issues = [];
const expected = new Map();
const rows = [];
const credentials = /sbp_[A-Za-z0-9]{32,}|sb_secret_[A-Za-z0-9_-]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{32,}|AIza[A-Za-z0-9_-]{30,}|eyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/;

async function rewrite(source, body) {
  const target = async (raw, image) => {
    const value = raw.startsWith('<') ? raw.slice(1, -1) : raw;
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value)) return raw;
    const boundary = value.search(/[#?]/);
    const pathname = boundary < 0 ? value : value.slice(0, boundary);
    const suffix = boundary < 0 ? '' : value.slice(boundary);
    let decoded;
    try { decoded = decodeURIComponent(pathname); } catch { decoded = pathname; }
    const relative = path.posix.normalize(path.posix.join(path.posix.dirname(source), decoded));
    const destination = names.get(relative);
    if (destination) return `./${encodeURI(destination)}${suffix}`;
    const resolved = path.resolve(root, relative);
    const within = resolved.startsWith(`${root}${path.sep}`);
    const exists = within && await stat(resolved).catch(() => null);
    if (exists && tracked.has(relative) && github) {
      return image
        ? `https://raw.githubusercontent.com/${github}/${revision}/${encodeURI(relative)}${suffix}`
        : `https://github.com/${github}/blob/${revision}/${encodeURI(relative)}${suffix}`;
    }
    if (exists?.isDirectory() && github && [...tracked].some(file => file.startsWith(`${relative}/`))) {
      return `https://github.com/${github}/tree/${revision}/${encodeURI(relative)}${suffix}`;
    }
    issues.push({ source, target: value });
    return null;
  };
  let fence = '';
  const rendered = [];
  for (const line of body.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = '';
      rendered.push(line);
      continue;
    }
    if (fence) { rendered.push(line); continue; }
    // shortcut: Rewrite this repo's inline/reference links; use a Markdown parser if HTML or complex nested links are introduced.
    const codeSpans = [...line.matchAll(/(`+).*?\1(?!`)/g)];
    const matches = [...line.matchAll(/(!?\[[^\]\r\n]*\]\()(<[^>\r\n]+>|[^\s)]+)(\))/g)];
    let updated = line;
    for (const match of matches.reverse()) {
      if (codeSpans.some(span => match.index >= span.index && match.index < span.index + span[0].length)) continue;
      const rewritten = await target(match[2], match[1].startsWith('!'));
      const replacement = rewritten ? `${match[1]}${rewritten})` : `${match[1].slice(match[1].startsWith('!') ? 2 : 1, -2)}（未收錄參照：\`${match[2]}\`）`;
      updated = updated.slice(0, match.index) + replacement + updated.slice(match.index + match[0].length);
    }
    const reference = updated.match(/^(\s*\[[^\]]+\]:\s*)(<[^>]+>|\S+)(.*)$/);
    if (reference) {
      const rewritten = await target(reference[2], false);
      updated = rewritten ? `${reference[1]}${rewritten}${reference[3]}` : `\`${updated.replaceAll('`', '')}\`（未收錄參照）`;
    }
    rendered.push(updated);
  }
  return rendered.join('\n');
}

for (const source of sources) {
  if (!(await lstat(path.join(root, source))).isFile()) throw new Error(`Non-regular source preserved: ${source}`);
  const bytes = await readFile(path.join(root, source));
  const body = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (credentials.test(body)) throw new Error(`Potential credential in ${source}; value not printed; no output written.`);
  const rendered = `> 集中副本；原始路徑：\`${source}\`；程式參考基準：\`${revision}\`。歷史文件保留當時語意，先以 00_閱讀指南.md 與現行手冊判定適用範圍。\n\n${await rewrite(source, body)}`;
  expected.set(names.get(source), rendered);
  rows.push(`| \`${source}\` | [${names.get(source)}](./${encodeURI(names.get(source))}) | \`${sha(bytes)}\` | \`${sha(rendered)}\` |`);
}
const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
expected.set('99_原始文件對照索引.md', `# 原始文件對照索引\n\n整理日期：${date}（Asia/Taipei）。程式參考基準：\`${revision}\`。\n\n收錄 ${sources.length} 份專案 Markdown，加本索引共 ${expected.size + 1} 份。所有原檔保留；不包含套件、build、暫存、憑證、資料庫與附件。\n\n來源與輸出雜湊不同通常來自加入出處及重新寫入連結，不代表原檔被修改。\n\n| 原始路徑 | 集中檔案 | 原始 SHA-256 | 輸出 SHA-256 |\n| --- | --- | --- | --- |\n${rows.join('\n')}\n\n## 未隨包提供的參照\n\n${issues.length ? issues.map(issue => `- \`${issue.source}\` → \`${issue.target.replaceAll('`', '')}\``).join('\n') : '無'}\n\n以上可能是舊截圖、暫存、失效檔名或未收錄來源；不能解讀成已附帶這些檔案。程式／資產的固定版本 GitHub 連結需要網路與必要的存取權。此索引不包含自己的雜湊，避免自我雜湊循環。\n`);

const outputInfo = await lstat(output).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
if (outputInfo && !outputInfo.isDirectory()) throw new Error('Output must be a regular directory, not a symlink or file.');
const entries = await readdir(output, { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
if (entries.some(entry => !entry.isFile())) throw new Error('Non-regular output entries preserved without writing.');
const existing = entries.map(entry => entry.name);
const extra = existing.filter(name => !expected.has(name));
if (extra.length) throw new Error(`Unexpected files in output; preserved without deletion: ${extra.join(', ')}`);
if (!check) await mkdir(output, { recursive: true });
for (const [name, content] of expected) {
  const destination = path.join(output, name);
  if (check) {
    if (await readFile(destination, 'utf8').catch(() => null) !== content) throw new Error(`Stale or missing document: ${name}`);
  } else await writeFile(destination, content, 'utf8');
}
console.log(JSON.stringify({ mode: check ? 'verified' : 'exported', folder, sources: sources.length, files: expected.size, unresolvedReferences: issues.length }));
