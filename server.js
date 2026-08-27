const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const { URL } = require('node:url');
const crypto = require('node:crypto');

const root = __dirname;
const port = Number(process.env.PORT || 8443);
const dataFile = process.env.DATA_FILE || path.join(root, 'data.csv');
const username = process.env.PORTAL_USER;
const password = process.env.PORTAL_PASSWORD;
if (!username || !password) throw new Error('Set PORTAL_USER and PORTAL_PASSWORD before starting the server.');
const options = { pfx: fs.readFileSync(path.join(root, 'cert', 'portal.pfx')), passphrase: process.env.PORTAL_CERT_PASSWORD || 'local-only' };
const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const allowedFiles = new Set(['index.html', 'app.js', 'styles.css']);
const securityHeaders = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};
const failedLogins = new Map();
const maxFailures = 10;
const retryWindow = 15 * 60 * 1000;
const isAuthorized = request => {
  const header = request.headers.authorization || '';
  if (!header.startsWith('Basic ')) return false;
  let supplied;
  try { supplied = Buffer.from(header.slice(6), 'base64').toString('utf8'); } catch { return false; }
  const separator = supplied.indexOf(':');
  if (separator < 1) return false;
  const suppliedUser = Buffer.from(supplied.slice(0, separator));
  const suppliedPassword = Buffer.from(supplied.slice(separator + 1));
  const expectedUser = Buffer.from(username);
  const expectedPassword = Buffer.from(password);
  return suppliedUser.length === expectedUser.length && suppliedPassword.length === expectedPassword.length && crypto.timingSafeEqual(suppliedUser, expectedUser) && crypto.timingSafeEqual(suppliedPassword, expectedPassword);
};
const clientAddress = request => request.socket.remoteAddress || 'unknown';
const records = fs.readFileSync(dataFile, 'utf8').split(/\r?\n/).slice(1).filter(Boolean).map(line => {
  const columns = line.match(/(?:^|,)\s*(?:"((?:[^"]|"")*)"|([^,]*))/g) || [];
  const values = columns.map(column => column.replace(/^,/, '').trim().replace(/^"|"$/g, '').replace(/""/g, ''));
  return { brn: values[0] || '', company_name: values[1] || '', date_of_deregistration: values[2] || '' };
}).filter(record => record.brn);
const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const score = (record, query) => {
  if (!query) return 0;
  const name = normalize(record.company_name);
  const brn = normalize(record.brn);
  if (name === query || brn === query) return 1000;
  if (name.startsWith(query)) return 800 - Math.min(name.length, 200);
  if (name.includes(query) || brn.includes(query)) return 600 - Math.min(name.length, 200);
  let position = 0;
  for (const character of query) { const found = name.indexOf(character, position); if (found < 0) return 0; position = found + 1; }
  return 300;
};

https.createServer(options, (request, response) => {
  const address = clientAddress(request);
  const login = failedLogins.get(address);
  if (login && login.until > Date.now()) { response.writeHead(429, { ...securityHeaders, 'Retry-After': Math.ceil((login.until - Date.now()) / 1000) }); response.end('Too many failed authentication attempts'); return; }
  if (!isAuthorized(request)) {
    const attempts = login && login.until <= Date.now() ? 1 : (login ? login.attempts + 1 : 1);
    failedLogins.set(address, { attempts, until: attempts >= maxFailures ? Date.now() + retryWindow : 0 });
    response.writeHead(attempts >= maxFailures ? 429 : 401, { ...securityHeaders, 'WWW-Authenticate': 'Basic realm="Deregistered Companies", charset="UTF-8"', 'Cache-Control': 'no-store' });
    response.end('Authentication required');
    return;
  }
  failedLogins.delete(address);
  if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405, securityHeaders); response.end('Method not allowed'); return; }
  const requestPath = new URL(request.url, `https://${request.headers.host}`).pathname;
  if (requestPath === '/search') {
    const params = new URL(request.url, `https://${request.headers.host}`).searchParams;
    const query = normalize(params.get('q')).slice(0, 100);
    const date = params.get('date') || '';
    const limit = Math.min(Math.max(Number(params.get('limit') || 25), 1), 100);
    const matching = records.filter(record => !date || record.date_of_deregistration === date)
      .map(record => ({ record, score: score(record, query) })).filter(item => !query || item.score > 0)
      .sort((a, b) => b.score - a.score || a.record.company_name.localeCompare(b.record.company_name));
    const payload = JSON.stringify({ total: matching.length, results: matching.slice(0, limit).map(item => item.record) });
    response.writeHead(200, { ...securityHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(payload);
    return;
  }
  const file = requestPath === '/' ? 'index.html' : requestPath.slice(1);
  const filePath = path.resolve(root, file);
  if (!allowedFiles.has(file) || !filePath.startsWith(root + path.sep) || !fs.existsSync(filePath)) { response.writeHead(404, securityHeaders); response.end('Not found'); return; }
  response.writeHead(200, { ...securityHeaders, 'Content-Type': contentTypes[path.extname(filePath)], 'Cache-Control': 'no-store' });
  if (request.method === 'HEAD') { response.end(); return; }
  fs.createReadStream(filePath).pipe(response);
}).listen(port, '0.0.0.0', () => console.log(`Deregistered companies portal: https://localhost:${port}`));