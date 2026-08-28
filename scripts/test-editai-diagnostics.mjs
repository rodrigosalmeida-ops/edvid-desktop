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

  // O smoke de boot deve usar o pacote THIN. O pacote fat (~894 MB) e
  // preservado como artefato, mas seus runtimes sao exercitados depois no app
  // instalado e no E2E real, evitando medir antivirus/I/O como se fosse boot.
  const smokeScript = readFileSync(path.join(root, 'scripts', 'editai-smoke-windows.ps1'), 'utf8');
  const timeout = /\[int\]\$TimeoutSeconds\s*=\s*(\d+)/u.exec(smokeScript);
  assert.ok(timeout, 'smoke Windows precisa declarar TimeoutSeconds');
  assert.ok(Number(timeout[1]) >= 240, 'smoke runtime precisa manter margem para Windows frio');
  assert.match(smokeScript, /\[switch\]\$BootOnly/u);
  assert.match(smokeScript, /--editai-smoke-boot-only/u);

  const buildScript = readFileSync(path.join(root, 'scripts', 'editai-build-windows.ps1'), 'utf8');
  assert.doesNotMatch(buildScript, /9\/12 smoke do pacote fat/u);
  const mediaSmokeScript = readFileSync(path.join(root, 'scripts', 'editai-media-smoke-windows.ps1'), 'utf8');
  assert.doesNotMatch(mediaSmokeScript, /Resolve-Path\s+\$SmokeReportPath/u, 'media smoke nao pode exigir relatorio futuro');
  assert.match(mediaSmokeScript, /Test-Path\s+\$SmokeReportPath\s+-PathType\s+Leaf/u);
  assert.match(mediaSmokeScript, /if \(\$ffmpegEntry -and \$ffmpegEntry\.available -and \$ffmpegEntry\.executablePath -and[\s\S]*\$ffprobeEntry -and \$ffprobeEntry\.available -and \$ffprobeEntry\.executablePath\)/u,
    'relatorio BootOnly sem runtimes precisa cair no fallback staged');
  assert.match(mediaSmokeScript, /if \(-not \$ffmpeg -or -not \$ffprobe\)/u,
    'fallback staged precisa funcionar mesmo quando o smoke report ja existe');
  assert.match(mediaSmokeScript, /smoke report sem runtimes utilizaveis; usando FFmpeg\/FFprobe staged/u);
  assert.match(mediaSmokeScript, /resources\\runtimes\\win32-x64/u);
  assert.match(mediaSmokeScript, /Get-ChildItem[\s\S]*ffmpeg\.exe/u);
  assert.match(mediaSmokeScript, /Get-ChildItem[\s\S]*ffprobe\.exe/u);

  const workflow = readFileSync(path.join(root, '.github', 'workflows', 'editai-rc2-windows.yml'), 'utf8');
  assert.match(workflow, /out\\EDIT AI-win32-x64\\EDIT AI\.exe.*-BootOnly/u);
  assert.doesNotMatch(workflow, /Smoke packaged EDIT AI executable[\s\S]{0,250}?EDIT AI-fat-win32-x64/u);

  const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const packageLock = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  assert.equal(packageJson.devDependencies?.['@electron-forge/plugin-vite'], '^7.11.2',
    'Forge Vite plugin precisa estar declarado no package.json para npm ci nao poda-lo');
  assert.equal(packageLock.packages?.['']?.devDependencies?.['@electron-forge/plugin-vite'], '^7.11.2',
    'package-lock precisa manter o Forge Vite plugin alinhado ao manifesto');
  assert.ok(packageLock.packages?.['node_modules/@electron-forge/plugin-vite'],
    'package-lock precisa conter o pacote @electron-forge/plugin-vite resolvido');

  const mainSource = readFileSync(path.join(root, 'src', 'main.ts'), 'utf8');
  const splitPromptHandlers = mainSource.match(/(?:ipcMain\.handle|registerIpcHandle)\('preview:suggest-split-prompt'/gu) ?? [];
  assert.equal(splitPromptHandlers.length, 1, 'preview:suggest-split-prompt deve ser registrado uma unica vez');
  assert.match(mainSource, /--editai-smoke-boot-only/u);

  console.log('test:editai-diagnostics ok — diagnostico seguro, smoke thin, fallback BootOnly, dependencias Forge e IPC unico protegidos.');
} finally {
  rmSync(out, { recursive: true, force: true });
}
