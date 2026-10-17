import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.glb': 'model/gltf-binary', '.ico': 'image/x-icon',
};

/** Serves a built directory on 127.0.0.1 with no caching, so two bundles on one port never mix. Resolves to the server. */
export function serveDirectory(root, port) {
  const resolvedRoot = path.resolve(root);
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    let relative = decodeURIComponent(url.pathname);
    if (relative.endsWith('/')) relative += 'index.html';
    const file = path.join(resolvedRoot, relative);
    if (!file.startsWith(resolvedRoot) || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404).end('not found');
      return;
    }
    response.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    createReadStream(file).pipe(response);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}
