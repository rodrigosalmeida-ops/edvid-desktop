import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';

const temp = await mkdtemp(path.join(os.tmpdir(), 'editai-browser-launcher-'));
const TEST_PORT = 4938;
try {
  const outfile = path.join(temp, 'browser-local-launcher.mjs');
  await build({
    entryPoints: ['src/browser-local-launcher.ts'],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
  });
  const { launchBrowserLocalEditor } = await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);

  await writeFile(path.join(temp, 'index.html'), '<!doctype html><title>EDIT AI</title>', 'utf8');
  const opened = [];
  const handle = await launchBrowserLocalEditor({
    staticRoot: temp,
    port: TEST_PORT,
    openExternal: async (url) => opened.push(url),
    healthTimeoutMs: 3000,
    healthPollMs: 20,
  });
  try {
    assert.equal(opened.length, 1);
    assert.equal(opened[0], handle.editorUrl);
    assert.equal(handle.origin, `http://127.0.0.1:${TEST_PORT}`);
    const health = await fetch(handle.healthUrl).then((response) => response.json());
    assert.deepEqual(health, { ok: true, app: 'EDIT AI', mode: 'browser-local' });
  } finally {
    await handle.close();
  }

  await assert.rejects(
    () => launchBrowserLocalEditor({
      staticRoot: temp,
      port: TEST_PORT,
      openExternal: async () => { throw new Error('browser unavailable'); },
      healthTimeoutMs: 3000,
      healthPollMs: 20,
    }),
    /browser unavailable/u,
  );

  console.log('test:browser-local-launcher ok');
} finally {
  await rm(temp, { recursive: true, force: true });
}
