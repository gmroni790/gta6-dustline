// Dustline local server (Node 22, standard library only): serves the game/
// folder on http://localhost:8080 so the game can be played with no build
// step. Run it with `node serve.ts`; pass --port N to pick another port.
// A development convenience only — it serves local files, nothing more.
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const gameRoot = resolve(fileURLToPath(new URL('./game', import.meta.url)));

const args = process.argv.slice(2);
const flagAt = args.indexOf('--port');
const wanted = flagAt === -1 ? 8080 : Number(args[flagAt + 1]);
const port = Number.isInteger(wanted) && wanted > 0 && wanted < 65536 ? wanted : 8080;

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

const server = createServer((req, res) => {
  let name;
  try {
    name = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end('bad path');
    return;
  }
  if (name.endsWith('/')) name += 'index.html';
  const file = resolve(join(gameRoot, name));
  if (file !== gameRoot && !file.startsWith(gameRoot + sep)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  let body;
  try {
    if (!statSync(file).isFile()) throw new Error('not a file');
    body = readFileSync(file);
  } catch {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, {
    'content-type': types[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'content-length': body.length,
    'cache-control': 'no-store',
  });
  res.end(body);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Dustline is on http://localhost:${port}`);
});
