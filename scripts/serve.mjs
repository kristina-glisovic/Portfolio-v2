import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.env.PORT || 4173);
const mimeTypes = {
  '.avif': 'image/avif', '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp', '.xml': 'application/xml; charset=utf-8'
};

createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let filePath = resolve(rootDir, `.${pathname}`);
    if (filePath !== rootDir && !filePath.startsWith(`${rootDir}${sep}`)) throw new Error('Invalid path');
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = resolve(filePath, 'index.html');
    const fileInfo = await stat(filePath);
    response.writeHead(200, {
      'Content-Type': mimeTypes[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': fileInfo.size
    });
    createReadStream(filePath).pipe(response);
  } catch {
    const fallback = await readFile(resolve(rootDir, '404.html')).catch(() => null);
    response.writeHead(404, {
      'Content-Type': fallback ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8',
      'Content-Length': fallback ? fallback.length : 9
    });
    response.end(fallback || 'Not found');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Portfolio available at http://127.0.0.1:${port}/`);
});
