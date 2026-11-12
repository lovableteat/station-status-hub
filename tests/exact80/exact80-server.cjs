// Research server. This file is not imported by the app or deployment workflow.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { createHash } = require('node:crypto');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const BASE = '/station-status-hub/';
const {BLOCKED_OLD,REVOKED_HASHES}=require('./exact80-paths.cjs');
const REVOKED = new Set(REVOKED_HASHES);
function safePath(value) {
 if (typeof value !== 'string' || value.startsWith('/') || /[\\\0]/.test(value) || value.split('/').some(x => !x || x === '.' || x === '..')) return false;
 return !/(?:materialRequestSeed|MaterialRequestPage)/i.test(value) && !value.endsWith('.map');
}
function readVerified(root, filename, hash) {
 assert.ok(safePath(filename), `Unsafe/forbidden path: ${filename}`);
 const bytes = fs.readFileSync(path.join(root, filename));
 assert.equal(sha(bytes), hash, `Changed content at pinned path: ${filename}`);
 return bytes;
}
function loadInventory(root, inventory) {
 const result = new Map();
 for (const [filename, meta] of Object.entries(inventory)) {
   if (!safePath(filename)) continue; // BOM output never served, even from candidate.
   result.set(filename, readVerified(root, filename, typeof meta === 'string' ? meta : meta.sha256));
 }
 return result;
}
function createResearchServer({ oldFiles, candidateFiles, extras, blockedOld = BLOCKED_OLD }) {
 const blockedHashes = new Set(REVOKED);
 for (const filename of blockedOld) if (oldFiles.has(filename)) blockedHashes.add(sha(oldFiles.get(filename)));
 // A changed filename cannot be used to smuggle an excluded executable back.
 for (const [filename, bytes] of candidateFiles) assert.ok(!blockedHashes.has(sha(bytes)), `Revoked bytes in candidate: ${filename}`);
 for (const [filename, bytes] of extras) {
   assert.ok(safePath(filename) && !blockedOld.includes(filename), `Forbidden retained path: ${filename}`);
   assert.ok(!blockedHashes.has(sha(bytes)), `Forbidden retained content: ${filename}`);
   assert.ok(oldFiles.has(filename) && sha(oldFiles.get(filename)) === sha(bytes), 'Retained bytes must be the exact original');
   assert.ok(!candidateFiles.has(filename) || sha(candidateFiles.get(filename)) === sha(bytes), 'Same path/hash rewriting is forbidden');
 }
 let phase = 'old';
 const responses = [];
 const server = http.createServer((req, res) => {
   let pathname;
   try { pathname = decodeURIComponent(new URL(req.url, 'http://synthetic.invalid').pathname); } catch { res.writeHead(400).end(); return; }
   const filename = pathname === BASE || pathname === BASE + 'index.html' ? 'index.html' : pathname.startsWith(BASE) ? pathname.slice(BASE.length) : null;
   let bytes, source = 'denied';
   if (req.method === 'GET' && filename && safePath(filename)) {
     if (phase === 'old') { bytes = oldFiles.get(filename); source = 'exact80'; }
     else if (!blockedOld.includes(filename)) {
       bytes = candidateFiles.get(filename); source = 'candidate';
       if (!bytes) { bytes = extras.get(filename); source = 'research-extra'; }
     }
   }
   if (phase === 'candidate' && bytes && blockedHashes.has(sha(bytes))) bytes = undefined;
   const status = bytes ? 200 : 404;
   responses.push({ phase, filename, status, source: bytes ? source : 'denied', sha256: bytes ? sha(bytes) : null });
   const extension = filename?.split('.').pop();
   const type = ({ html:'text/html; charset=utf-8',js:'text/javascript',css:'text/css',svg:'image/svg+xml',webp:'image/webp',png:'image/png',ico:'image/x-icon',wasm:'application/wasm' })[extension] || 'application/octet-stream';
   res.writeHead(status, { 'Content-Type': bytes ? type : 'text/plain', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
   res.end(bytes || 'Unavailable in isolated release');
 });
 return { server, responses, cutover() { phase = 'candidate'; }, get phase() { return phase; }, blockedHashes };
}
// A transport backstop, never a forwarding proxy. No target names or headers
// are retained: the browser context owns synthetic request classification.
function createNetworkSink() {
 const attempts = [];
 const server = http.createServer((req, res) => {
   attempts.push({ kind: 'http', method: req.method, blocked: true });
   res.writeHead(403, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }).end('Blocked by isolated research transport');
 });
 server.on('connect', (req, socket) => {
   attempts.push({ kind: 'connect', method: req.method, blocked: true });
   socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
 });
 server.on('clientError', (_, socket) => socket.destroy());
 return { server, attempts };
}
function redactEvidence(value) {
 return String(value)
   .replace(/(?:https?|wss?):\/\/[^\s"'<>\\]+/gi, '[redacted-url]')
   .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[redacted-token]')
   .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [redacted-credential]')
   .replace(/(["']?(?:api[-_]?key|authorization|access_token|refresh_token)["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/gi, '$1"[redacted-credential]"')
   .replace(/\b(api[-_]?key|authorization|access_token|refresh_token)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted-credential]');
}
function sanitizeEvidence(value) {
 if (typeof value === 'string') return redactEvidence(value);
 if (Array.isArray(value)) return value.map(sanitizeEvidence);
 if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) =>
   [key, /^(?:api[-_]?key|authorization|access_token|refresh_token)$/i.test(key) ? '[redacted-credential]' : sanitizeEvidence(item)]));
 return value;
}
module.exports = { createNetworkSink, redactEvidence, sanitizeEvidence, BASE, BLOCKED_OLD, REVOKED, sha, safePath, readVerified, loadInventory, createResearchServer };
