import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const temp = mkdtempSync(path.join(os.tmpdir(), 'editai-browser-local-'));
const outfile = path.join(temp, 'browser-local.mjs');

try {
  buildSync({
    entryPoints: [path.join(root, 'src', 'browser-local.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile,
  });

  const {
    EDIT_AI_LOCAL_HOST,
    EDIT_AI_LOCAL_PORT,
    buildBrowserLocalConfig,
    isTrustedBrowserLocalOrigin,
  } = await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);

  assert.equal(EDIT_AI_LOCAL_HOST, '127.0.0.1');
  assert.equal(EDIT_AI_LOCAL_PORT, 4820);

  const defaults = buildBrowserLocalConfig();
  assert.equal(defaults.origin, 'http://127.0.0.1:4820');
  assert.equal(defaults.editorUrl, 'http://127.0.0.1:4820/');
  assert.equal(defaults.healthUrl, 'http://127.0.0.1:4820/api/health');
  assert.equal(defaults.secureToken, null);

  const localhost = buildBrowserLocalConfig({ host: 'localhost', port: 4931, secureToken: ' abc 123 ' });
  assert.equal(localhost.host, '127.0.0.1');
  assert.equal(localhost.editorUrl, 'http://127.0.0.1:4931/?token=abc%20123');
  assert.equal(localhost.secureToken, 'abc 123');

  assert.equal(isTrustedBrowserLocalOrigin('http://127.0.0.1:4820/editor', defaults), true);
  assert.equal(isTrustedBrowserLocalOrigin('http://localhost:4820', defaults), false);
  assert.equal(isTrustedBrowserLocalOrigin('https://example.com', defaults), false);
  assert.equal(isTrustedBrowserLocalOrigin('not-a-url', defaults), false);

  assert.throws(() => buildBrowserLocalConfig({ host: '0.0.0.0' }), /só pode escutar em 127\.0\.0\.1/u);
  assert.throws(() => buildBrowserLocalConfig({ host: '192.168.0.10' }), /só pode escutar em 127\.0\.0\.1/u);
  assert.throws(() => buildBrowserLocalConfig({ port: 80 }), /entre 1024 e 65535/u);
  assert.throws(() => buildBrowserLocalConfig({ port: 70000 }), /entre 1024 e 65535/u);

  console.log('browser-local: ok');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
