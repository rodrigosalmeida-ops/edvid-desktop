import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const temp = mkdtempSync(path.join(os.tmpdir(), 'editai-browser-server-'));
const bundle = path.join(temp, 'server.mjs');
const staticRoot = path.join(temp, 'www');

try {
  await import('node:fs/promises').then(({ mkdir }) => mkdir(staticRoot, { recursive: true }));
  writeFileSync(path.join(staticRoot, 'index.html'), '<!doctype html><title>EDIT AI</title><div id="root">ok</div>');
  writeFileSync(path.join(staticRoot, 'app.js'), 'window.__EDIT_AI__ = true;');
  const mediaFile = path.join(temp, 'sample.mp4');
  writeFileSync(mediaFile, Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]));

  buildSync({
    entryPoints: [path.join(root, 'src', 'browser-local-server.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
  });

  const { startBrowserLocalServer } = await import(`${pathToFileURL(bundle).href}?t=${Date.now()}`);
  const port = 4937;
  const token = 'editai-test-token';
  const handle = await startBrowserLocalServer({
    staticRoot, port, secureToken: token,
    invoke: async (channel, args) => ({ channel, args }),
    resolveMediaPath: (requestPath) => requestPath === '/api/media/local/demo' ? mediaFile : null,
  });

  try {
    assert.equal(handle.origin, `http://127.0.0.1:${port}`);

    const health = await fetch(`${handle.origin}/api/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true, app: 'EDIT AI', mode: 'browser-local' });

    const index = await fetch(`${handle.origin}/`);
    assert.equal(index.status, 200);
    assert.match(await index.text(), /EDIT AI/u);
    assert.equal(index.headers.get('x-frame-options'), 'DENY');

    const asset = await fetch(`${handle.origin}/app.js`);
    assert.equal(asset.status, 200);
    assert.match(await asset.text(), /__EDIT_AI__/u);

    const spa = await fetch(`${handle.origin}/projeto/demo`);
    assert.equal(spa.status, 200);
    assert.match(await spa.text(), /EDIT AI/u);



const deniedRpc = await fetch(`${handle.origin}/api/rpc`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ channel: 'desktop:get-info', args: [] }) });
assert.equal(deniedRpc.status, 403);

const rpc = await fetch(`${handle.origin}/api/rpc`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-edit-ai-token': token, origin: handle.origin }, body: JSON.stringify({ channel: 'desktop:get-info', args: [{ ok: true }] }) });
assert.equal(rpc.status, 200);
assert.deepEqual(await rpc.json(), { ok: true, value: { channel: 'desktop:get-info', args: [{ ok: true }] } });

const media = await fetch(`${handle.origin}/api/media/local/demo?token=${encodeURIComponent(token)}`, { headers: { range: 'bytes=1-3' } });
assert.equal(media.status, 206);
assert.equal(media.headers.get('content-range'), 'bytes 1-3/8');
assert.deepEqual([...new Uint8Array(await media.arrayBuffer())], [1, 2, 3]);
// secure RPC + Range

    const traversal = await fetch(`${handle.origin}/%2e%2e/package.json`);
    assert.ok([403, 404].includes(traversal.status));
  } finally {
    await handle.close();
  }

  console.log('browser-local-server: ok');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
