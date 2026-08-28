import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import path from 'node:path';
import { buildBrowserLocalConfig, type BrowserLocalOptions } from './browser-local';

export type BrowserLocalServerOptions = BrowserLocalOptions & {
  staticRoot: string;
};

export type BrowserLocalServerHandle = {
  server: Server;
  origin: string;
  editorUrl: string;
  close: () => Promise<void>;
};

const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

function safeStaticPath(root: string, requestPath: string): string | null {
  const cleanPath = decodeURIComponent(requestPath.split('?')[0] || '/');
  const relative = cleanPath === '/' ? 'index.html' : cleanPath.replace(/^\/+/, '');
  const absolute = path.resolve(root, relative);
  const rel = path.relative(root, absolute);
  if (!rel || rel === 'index.html') return absolute;
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return absolute;
}

export async function startBrowserLocalServer(options: BrowserLocalServerOptions): Promise<BrowserLocalServerHandle> {
  const config = buildBrowserLocalConfig(options);
  const staticRoot = path.resolve(options.staticRoot);

  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', config.origin);

    if (requestUrl.pathname === '/api/health') {
      response.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      });
      response.end(JSON.stringify({ ok: true, app: 'EDIT AI', mode: 'browser-local' }));
      return;
    }

    const filePath = safeStaticPath(staticRoot, requestUrl.pathname);
    if (!filePath) {
      response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Forbidden');
      return;
    }

    const requestedExists = existsSync(filePath) && statSync(filePath).isFile();
    const requestedExtension = path.extname(requestUrl.pathname);
    const candidate = requestedExists
      ? filePath
      : requestedExtension
        ? null
        : path.join(staticRoot, 'index.html');

    if (!candidate || !existsSync(candidate) || !statSync(candidate).isFile()) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('EDIT AI web asset not found');
      return;
    }

    response.writeHead(200, {
      'content-type': contentTypes[path.extname(candidate).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': path.basename(candidate) === 'index.html' ? 'no-store' : 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
    });
    createReadStream(candidate).pipe(response);
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(config.port, config.host);
  });

  return {
    server,
    origin: config.origin,
    editorUrl: config.editorUrl,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}
