import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import path from 'node:path';
import { buildBrowserLocalConfig, type BrowserLocalOptions } from './browser-local';

export type BrowserLocalEvent = { channel: string; payload: unknown };

export type BrowserLocalServerOptions = BrowserLocalOptions & {
  staticRoot: string;
  invoke?: (channel: string, args: unknown[]) => Promise<unknown> | unknown;
  subscribe?: (listener: (event: BrowserLocalEvent) => void) => (() => void);
  resolveMediaPath?: (requestPath: string) => string | null;
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
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
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

function json(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify(payload));
}

function authorized(request: IncomingMessage, token: string | null, origin: string, queryToken?: string | null): boolean {
  if (!token) return false;
  const supplied = request.headers['x-edit-ai-token'] ?? queryToken ?? '';
  if (supplied !== token) return false;
  const requestOrigin = request.headers.origin;
  return !requestOrigin || requestOrigin === origin;
}

async function readJsonBody(request: IncomingMessage, limit = 8 * 1024 * 1024): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limit) throw new Error('Payload local maior que o limite permitido.');
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

function serveMedia(request: IncomingMessage, response: ServerResponse, filePath: string): void {
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Media not found');
    return;
  }

  const info = statSync(filePath);
  const total = info.size;
  const type = contentTypes[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
  const range = request.headers.range;
  if (!range) {
    response.writeHead(200, {
      'content-type': type,
      'content-length': total,
      'accept-ranges': 'bytes',
      'cache-control': 'no-store',
    });
    if (request.method === 'HEAD') response.end();
    else createReadStream(filePath).pipe(response);
    return;
  }

  const match = /^bytes=(\d*)-(\d*)$/u.exec(range.trim());
  if (!match) {
    response.writeHead(416, { 'content-range': `bytes */${total}` });
    response.end();
    return;
  }
  const requestedStart = match[1] ? Number(match[1]) : null;
  const requestedEnd = match[2] ? Number(match[2]) : null;
  let start: number;
  let end: number;
  if (requestedStart === null) {
    const suffix = Math.max(0, requestedEnd ?? 0);
    start = Math.max(0, total - suffix);
    end = Math.max(0, total - 1);
  } else {
    start = requestedStart;
    end = requestedEnd === null ? total - 1 : Math.min(requestedEnd, total - 1);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= total || end < start) {
    response.writeHead(416, { 'content-range': `bytes */${total}` });
    response.end();
    return;
  }
  response.writeHead(206, {
    'content-type': type,
    'content-length': end - start + 1,
    'content-range': `bytes ${start}-${end}/${total}`,
    'accept-ranges': 'bytes',
    'cache-control': 'no-store',
  });
  if (request.method === 'HEAD') response.end();
  else createReadStream(filePath, { start, end }).pipe(response);
}

export async function startBrowserLocalServer(options: BrowserLocalServerOptions): Promise<BrowserLocalServerHandle> {
  const config = buildBrowserLocalConfig(options);
  const staticRoot = path.resolve(options.staticRoot);
  const secureToken = config.secureToken;

  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? '/', config.origin);

      if (requestUrl.pathname === '/api/health') {
        json(response, 200, { ok: true, app: 'EDIT AI', mode: 'browser-local' });
        return;
      }

      if (requestUrl.pathname === '/api/rpc') {
        if (request.method !== 'POST' || !authorized(request, secureToken, config.origin)) {
          json(response, request.method === 'POST' ? 403 : 405, { ok: false, error: 'RPC local não autorizado.' });
          return;
        }
        if (!String(request.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
          json(response, 415, { ok: false, error: 'RPC local exige JSON.' });
          return;
        }
        const body = await readJsonBody(request) as { channel?: unknown; args?: unknown };
        const channel = typeof body.channel === 'string' ? body.channel : '';
        const args = Array.isArray(body.args) ? body.args : [];
        if (!channel || !options.invoke) {
          json(response, 400, { ok: false, error: 'Canal RPC inválido.' });
          return;
        }
        try {
          const value = await options.invoke(channel, args);
          json(response, 200, { ok: true, value: value ?? null });
        } catch (error) {
          json(response, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }

      if (requestUrl.pathname === '/api/events') {
        if (request.method !== 'GET' || !authorized(request, secureToken, config.origin, requestUrl.searchParams.get('token'))) {
          json(response, 403, { ok: false, error: 'Eventos locais não autorizados.' });
          return;
        }
        response.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-store',
          connection: 'keep-alive',
          'x-accel-buffering': 'no',
        });
        response.write(': EDIT AI local events\n\n');
        const unsubscribe = options.subscribe?.((event) => {
          if (!response.destroyed) response.write(`data: ${JSON.stringify(event)}\n\n`);
        }) ?? (() => undefined);
        const keepAlive = setInterval(() => {
          if (!response.destroyed) response.write(': keepalive\n\n');
        }, 15_000);
        request.once('close', () => {
          clearInterval(keepAlive);
          unsubscribe();
        });
        return;
      }

      if (requestUrl.pathname.startsWith('/api/media/') || requestUrl.pathname.startsWith('/edvid-preview/')) {
        const mediaPath = options.resolveMediaPath?.(requestUrl.pathname) ?? null;
        if (!mediaPath) {
          response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
          response.end('Media not authorized');
          return;
        }
        serveMedia(request, response, mediaPath);
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
        'content-security-policy': `default-src 'self'; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'`,
      });
      createReadStream(candidate).pipe(response);
    } catch (error) {
      if (!response.headersSent) json(response, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
      else response.end();
    }
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
