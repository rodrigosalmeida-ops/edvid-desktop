import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(path.join(tmpdir(), 'editai-diagnostics-'));

try {
  execFileSync(process.execPath, [
    path.join(root, 'node_modules', 'typescript', 'bin', 'tsc'),
    path.join(root, 'src', 'editai', 'diagnostics.ts'),
    '--target', 'es2022',
    '--module', 'es2022',
    '--moduleResolution', 'bundler',
    '--skipLibCheck',
    '--outDir', out,
  ], { stdio: 'inherit' });

  const {
    redactSecrets,
    anonymizeHome,
    diagnosticWarnings,
    buildDiagnosticReport,
    diagnosticFileName,
  } = await import(pathToFileURL(path.join(out, 'diagnostics.js')).href);

  const fakeKey = `sk-${'proj'}-${'a'.repeat(28)}`;
  const fakeJwt = `eyJ${'abcdefgh'}.eyJ${'ijklmnop'}.${'qrstuvwx'}`;
  const redacted = redactSecrets(`Authorization: Bearer abcdefghijklmnop ${fakeKey} ${fakeJwt}`);
  assert.ok(!redacted.includes('abcdefghijklmnop'));
  assert.ok(!redacted.includes(fakeKey));
  assert.ok(!redacted.includes(fakeJwt));
  assert.ok(redacted.includes('[removed]'));

  assert.equal(
    anonymizeHome('erro em C:\\Users\\Rodrigo\\AppData\\Roaming\\EDIT AI', 'C:\\Users\\Rodrigo'),
    'erro em ~\\AppData\\Roaming\\EDIT AI',
  );

  const base = {
    app: { name: 'EDIT AI', version: '1.0.0-editai.2' },
    machine: { platform: 'win32', arch: 'x64', memoryGb: 16 },
    runtimes: [{ name: 'ffmpeg', ready: true, version: '8.1.2' }],
    runtimePackStatus: 'ready',
    whisperStatus: 'ready',
    freeDiskGb: 120,
    aiConnected: true,
    hardwareFallback: false,
    project: { open: true, name: 'Teste', path: 'C:\\Users\\Rodrigo\\Videos\\Teste', sources: [] },
    events: [],
  };
  assert.deepEqual(diagnosticWarnings(base), []);

  const unhealthy = {
    ...base,
    machine: { ...base.machine, memoryGb: 6 },
    runtimes: [{ name: 'ffmpeg', ready: true }, { name: 'whisperx', ready: false }],
    runtimePackStatus: 'downloading',
    whisperStatus: 'error',
    freeDiskGb: 3.2,
    aiConnected: false,
    hardwareFallback: true,
    project: {
      ...base.project,
      sources: [{ name: 'take.mov', codec: 'prores', needsProxy: true, proxyReady: false }],
    },
    events: [{ at: '2026-08-27T17:00:00Z', source: 'provider', message: `falhou com ${fakeKey} em C:\\Users\\Rodrigo\\Videos` }],
  };
  const warnings = diagnosticWarnings(unhealthy);
  assert.ok(warnings.some((warning) => warning.includes('whisperx')));
  assert.ok(warnings.some((warning) => warning.includes('3.2 GB')));
  assert.ok(warnings.some((warning) => warning.includes('proxy')));

  const report = buildDiagnosticReport(unhealthy, 'C:\\Users\\Rodrigo');
  assert.ok(report.includes('# Diagnóstico do EDIT AI 1.0.0-editai.2'));
  assert.ok(report.includes('## O que parece errado'));
  assert.ok(report.includes('~\\Videos\\Teste'));
  assert.ok(!report.includes(fakeKey));
  assert.ok(!report.includes('C:\\Users\\Rodrigo'));

  assert.equal(
    diagnosticFileName('1.0.0-editai.2', '2026-08-27T17:05:06.123Z'),
    'edit-ai-diagnostico-1.0.0-editai.2-2026-08-27T17-05-06-123.md',
  );

  // O QA fat embute perto de 1 GB de runtimes. O cold-start do Windows 2025
  // ja ultrapassou 120 s mesmo com verify:editai verde; esse contrato impede
  // reintroduzir um timeout que mede o I/O do runner em vez do aplicativo.
  const smokeScript = readFileSync(path.join(root, 'scripts', 'editai-smoke-windows.ps1'), 'utf8');
  const timeout = /\[int\]\$TimeoutSeconds\s*=\s*(\d+)/u.exec(smokeScript);
  assert.ok(timeout, 'smoke Windows precisa declarar TimeoutSeconds');
  assert.ok(Number(timeout[1]) >= 240, 'smoke do pacote fat precisa tolerar cold-start de pelo menos 240 s');
  assert.match(smokeScript, /Smoke test excedeu \$\{TimeoutSeconds\}s\./u);

  console.log('test:editai-diagnostics ok — diagnóstico seguro e timeout do smoke fat protegidos.');
} finally {
  rmSync(out, { recursive: true, force: true });
}
