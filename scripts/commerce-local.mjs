import { createServer } from 'node:http';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import SqliteD1 from './d1-sqlite.mjs';
import worker from '../commerce/worker.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assets = resolve(root, '_site');
const port = Number(process.env.PORT || 8766);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT must be between 1024 and 65535.');
await mkdir(resolve(root, '.local'), { recursive: true });
const db = new SqliteD1(resolve(root, '.local/orders.sqlite'));
await db.exec(await readFile(resolve(root, 'commerce/schema.sql'), 'utf8'));

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const env = {
  DB: db,
  STORE_MODE: 'preview',
  LOCAL_PREVIEW: 'true',
  PUBLIC_STORE_URL: `http://127.0.0.1:${port}`,
  // These are local-only preview identifiers, never production credentials.
  ORDER_TOKEN_SECRET: 'local-preview-only-not-a-production-secret',
  ASSETS: {
    async fetch(request) {
      let pathname;
      try { pathname = decodeURIComponent(new URL(request.url).pathname); } catch { return new Response('Bad request', { status: 400 }); }
      if (pathname === '/') pathname = '/index.html';
      if (pathname === '/admin') pathname = '/admin.html';
      if (pathname === '/checkout') pathname = '/checkout.html';
      if (pathname === '/order') pathname = '/order.html';
      const path = resolve(assets, `.${pathname}`);
      if (!path.startsWith(assets + sep)) return new Response('Not found', { status: 404 });
      try {
        if (!(await stat(path)).isFile()) return new Response('Not found', { status: 404 });
        return new Response(await readFile(path), { headers: { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' } });
      } catch { return new Response('Not found', { status: 404 }); }
    }
  }
};

const server = createServer(async (incoming, outgoing) => {
  try {
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(`http://${incoming.headers.host || ''}`).hostname)) {
      outgoing.writeHead(403).end('Local preview only.'); return;
    }
    let size = 0;
    const chunks = [];
    for await (const chunk of incoming) {
      size += chunk.length;
      if (size > 32_768) { outgoing.writeHead(413).end('Request too large.'); return; }
      chunks.push(chunk);
    }
    const request = new Request(`http://${incoming.headers.host}${incoming.url}`, {
      method: incoming.method,
      headers: incoming.headers,
      ...(['GET', 'HEAD'].includes(incoming.method) ? {} : { body: Buffer.concat(chunks) })
    });
    const response = await worker.fetch(request, env, { waitUntil(promise) { promise.catch(() => {}); } });
    outgoing.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    // Avoid logging customer fields, addresses or request bodies.
    outgoing.writeHead(500).end('The preview could not complete that request.');
  }
});
server.listen(port, '127.0.0.1', () => console.log(`Los Niños preview: http://127.0.0.1:${port}\nOwner dashboard: http://127.0.0.1:${port}/admin.html\nPreview only: no payments or emails. Use fictional customer details.`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
