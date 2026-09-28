// Local server that mirrors Vercel: static files from the repo root + /api/* functions.
// Member data goes to .data/dev-store.json (or $GB_DATA_DIR) unless Upstash env vars are set.
//   node tools/dev-server.mjs            -> http://127.0.0.1:3000
//   PORT=0 node tools/dev-server.mjs     -> random free port (printed on stdout)
import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API_DIR = path.join(ROOT, 'api');
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT ?? 3000);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
};

async function exists(p) { try { return (await fs.stat(p)).isFile(); } catch { return false; } }

async function serveApi(req, res, pathname) {
  const file = path.join(API_DIR, pathname.replace(/^\/api\//, '').replace(/\/$/, '') + '.js');
  if (!file.startsWith(API_DIR + path.sep) || !(await exists(file))) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'NOT_FOUND' }));
  }
  const mod = await import(pathToFileURL(file).href);
  return mod.default(req, res);
}

async function serveStatic(res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  let file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || /[\\/](\.git|\.data|node_modules|lib|api|tests|tools)([\\/]|$)/.test(file.slice(ROOT.length))) {
    res.writeHead(404); return res.end('Not found');
  }
  if (!path.extname(file) && (await exists(file + '.html'))) file += '.html'; // cleanUrls, like vercel.json
  if (!(await exists(file))) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  res.end(await fs.readFile(file));
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://local');
  try {
    if (pathname.startsWith('/api/')) return await serveApi(req, res, pathname);
    return await serveStatic(res, pathname);
  } catch (e) {
    console.error('[dev-server]', req.method, req.url, e);
    if (!res.headersSent) res.writeHead(500);
    res.end('Server error');
  }
});

server.listen(PORT, HOST, () => {
  const { port } = server.address();
  console.log(`gobaesong dev server listening on http://${HOST}:${port}`);
});
