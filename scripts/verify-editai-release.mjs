#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const release = process.argv.includes('--release');
const errors = [];
const warnings = [];
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));

for (const file of ['package.json','package-lock.json','forge.config.ts','src/main.ts','LICENSE','EDITAI_THIRD_PARTY_NOTICE.txt','docs/legal/DEPENDENCY_LICENSE_AUDIT.md','docs/releases/EDITAI_RC2_SOURCE.md','resources/runtime-manifest.json','resources/editai-distribution.json','scripts/editai-inspect-windows-artifacts.ps1','scripts/editai-smoke-windows.ps1','scripts/editai-install-smoke-windows.ps1','scripts/editai-media-smoke-windows.ps1','scripts/editai-e2e-real-video-windows.ps1','scripts/test-editai-commercial-evidence.mjs','.github/workflows/editai-rc2-windows.yml']) {
  if (!exists(file)) errors.push(`arquivo obrigatório ausente: ${file}`);
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }

const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
if (pkg.name !== '@editai/desktop') errors.push(`package name inesperado: ${pkg.name}`);
if (pkg.productName !== 'EDIT AI') errors.push(`productName inesperado: ${pkg.productName}`);
if (!['1.0.0-editai.1','1.0.0-editai.2'].includes(String(pkg.version))) errors.push(`versão V1.0 RC esperada, encontrada: ${pkg.version}`);
if (lock.name !== pkg.name || lock.version !== pkg.version || lock.packages?.['']?.name !== pkg.name || lock.packages?.['']?.version !== pkg.version) {
  errors.push('package-lock não corresponde à identidade/versão do package.json');
}
for (const legacyScript of ['publish:update','publish:runtimes','make:signed']) {
  if (pkg.scripts?.[legacyScript]) errors.push(`script legado ainda habilitado: ${legacyScript}`);
}
for (const obsolete of [
  'scripts/publish-update.mjs','scripts/publish-runtimes.mjs',
  'src/brand/edvid-icon.png','src/brand/edvid-icon.ico','src/brand/edvid-icon.icns','src/brand/edvid-logo.png','src/brand/dmg-background.png',
]) {
  if (exists(obsolete)) errors.push(`arquivo legado não deve entrar no release: ${obsolete}`);
}

const main = read('src/main.ts');
const forge = read('forge.config.ts');
for (const file of ['src/App.tsx','src/codex-app-server.ts','src/mcp-hub.ts','src/claude-agent.ts','src/gemini-agent.ts','src/renderer.tsx','src/chat-language.ts']) {
  if (/Edvid|Creator Factory|IA Edit Pro/u.test(read(file))) {
    errors.push(`marca antiga ainda aparece em superfície executável: ${file}`);
  }
}
const forbidden = [
  ['Creator Factory', /Creator Factory/iu],
  ['IA Edit Pro', /IA Edit Pro/iu],
  ['R2 original', /pub-89ee05cdaf26477c8984a36be2b373fa\.r2\.dev/iu],
  ['Supabase original', /pvefvoskgqthaazucuol\.supabase\.co/iu],
  ['bundle id original', /com\.creatorfactory\.edvid/iu],
];
for (const [label, regex] of forbidden) {
  if (regex.test(main) || regex.test(forge)) errors.push(`referência proibida no release: ${label}`);
}
if (!/title:\s*'EDIT AI'/u.test(main)) errors.push('BrowserWindow não está com título EDIT AI');
if (!/appBundleId:\s*'com\.editai\.desktop'/u.test(forge)) errors.push('appBundleId EDIT AI ausente');
if (!forge.includes('EDITAI_BUNDLE_RUNTIMES')) errors.push('modo QA fat não configurado');
if (!main.includes('editAiRuntimePack(process.platform, process.arch)')) errors.push('runtime distribution EDIT AI não integrado');
if (!main.includes('editAiUpdateFeedUrl()')) errors.push('update feed EDIT AI não integrado');
if (main.includes('expectedDigest &&')) errors.push('SHA-256 ainda é opcional no downloader');
const qaWorkflow = read('.github/workflows/editai-rc2-windows.yml');
if (!qaWorkflow.includes('windows-latest')) errors.push('workflow Windows QA não usa runner Windows');
if (!qaWorkflow.includes('npm run build:editai:win:qa')) errors.push('workflow Windows QA não executa o build QA');
if (!qaWorkflow.includes('actions/upload-artifact@v4')) errors.push('workflow Windows QA não publica artefatos');
if (!qaWorkflow.includes('npm run smoke:editai:win')) errors.push('workflow Windows QA não executa smoke do executável');
if (!qaWorkflow.includes('npm run smoke:editai:install')) errors.push('workflow Windows QA não executa smoke do Setup instalado');
if (!qaWorkflow.includes('npm run smoke:editai:media')) errors.push('workflow Windows QA não executa media smoke');
if (!qaWorkflow.includes('npm run smoke:editai:e2e')) errors.push('workflow Windows QA não executa E2E com vídeo real');
if (!qaWorkflow.includes('EDIT-AI-Setup.exe')) errors.push('workflow não exige o nome canônico EDIT-AI-Setup.exe');
if (!main.includes('runEditAiSmokeIfRequested')) errors.push('modo --editai-smoke não integrado no main process');
if (!main.includes('runEditAiE2eIfRequested')) errors.push('modo --editai-e2e não integrado no main process');

const license = read('LICENSE');
if (!/MIT License/iu.test(license) && !/permission is hereby granted/iu.test(license)) warnings.push('LICENSE não parece conter o texto MIT completo nesta cópia.');
const notice = read('EDITAI_THIRD_PARTY_NOTICE.txt');
if (!/Edvid Desktop/iu.test(notice) || !/MIT/iu.test(notice)) errors.push('Third-party notice não preserva referência MIT do upstream');

const dist = JSON.parse(read('resources/editai-distribution.json'));
if (release) {
  const base = String(dist.runtimePackBaseUrl || '');
  if (!/^https:\/\//iu.test(base)) errors.push('runtimePackBaseUrl HTTPS ausente no release');
  if (!/^https:\/\/[^\s]+\/feed\.json$/iu.test(String(dist.updateFeedUrl || ''))) errors.push('updateFeedUrl HTTPS/feed.json ausente no release');
  const target = 'win32-x64';
  const item = dist.runtimePacks?.[target];
  if (!item) errors.push(`runtimePacks.${target} ausente`);
  else {
    const manifest = JSON.parse(read('resources/runtime-manifest.json'));
    const key = createHash('sha256').update(JSON.stringify(manifest.runtimes)).digest('hex').slice(0, 12);
    if (item.key !== key) errors.push(`runtime key stale: ${item.key} != ${key}`);
    if (!/^[a-f0-9]{64}$/iu.test(String(item.sha256 || ''))) errors.push('runtime sha256 inválido');
    if (item.file !== `runtimes-${target}-${key}.tar.gz`) errors.push('runtime filename incompatível com manifest');
  }
  if (!process.env.EDITAI_WIN_SIGNTOOL || !process.env.EDITAI_WIN_SIGN_PARAMS) {
    warnings.push('assinatura Windows não está presente no ambiente desta verificação');
  }
} else if (!dist.runtimePackBaseUrl) {
  warnings.push('distribuição thin não configurada ainda; esperado em desenvolvimento/QA fat.');
}

for (const w of warnings) console.warn(`[WARN] ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`[ERRO] ${e}`);
  process.exit(1);
}
console.log(`[EDIT AI] release gate OK (${release ? 'release' : 'dev/qa'}).`);
