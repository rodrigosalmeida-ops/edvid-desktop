import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(path.join(tmpdir(), 'editai-commercial-evidence-'));
const require = createRequire(import.meta.url);

try {
  execFileSync(process.execPath, [
    path.join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
    path.join(projectRoot, 'src', 'editai', 'tiktok-shop-engine.ts'),
    path.join(projectRoot, 'src', 'editai', 'retention-engine.ts'),
    '--target', 'es2022', '--module', 'commonjs', '--moduleResolution', 'node',
    '--skipLibCheck', '--outDir', outDir,
  ], { stdio: 'inherit' });

  const { buildTikTokShopVariants } = require(path.join(outDir, 'editai', 'tiktok-shop-engine.js'));
  const { retentionReport } = require(path.join(outDir, 'editai', 'retention-engine.js'));

  const transcript = [
    { text: 'Pare agora e olha esse organizador portatil.', start: 0, end: 2.8 },
    { text: 'Ele ajuda a organizar seus produtos e economiza espaco.', start: 3.1, end: 6.2 },
    { text: 'Eu testei e o resultado apareceu no mesmo dia.', start: 6.6, end: 9.5 },
    { text: 'Hoje custa trinta e nove reais e noventa centavos.', start: 9.9, end: 13.2 },
    { text: 'Clique no carrinho e garanta o seu agora.', start: 13.6, end: 16.2 },
  ];
  const report = retentionReport(transcript, 16.2, [], 'tiktok_shop');
  assert.equal(report.signals.priceDetected, true, 'preco falado precisa contar como evidencia factual');
  const variants = buildTikTokShopVariants({
    transcript,
    silences: [],
    report,
    plan: { version: 1, preset: 'tiktok_shop', operations: [], overlays: [] },
  });
  const price = variants.evidence.find((item) => item.kind === 'price');
  assert.ok(price, 'a engine A/B precisa materializar o preco falado');
  assert.equal(price.text, 'trinta e nove reais e noventa centavos');
  for (const kind of ['hook', 'benefit', 'proof', 'cta']) {
    assert.ok(variants.evidence.some((item) => item.kind === kind), `evidencia ausente: ${kind}`);
  }
  assert.ok(variants.variants.every((variant) =>
    variant.plan.overlays?.some((overlay) => overlay.type === 'price' && overlay.text === price.text)
  ));

  const noPriceTranscript = [{ text: 'Este produto ajuda a organizar a casa.', start: 0, end: 3 }];
  const noPriceReport = retentionReport(noPriceTranscript, 3, [], 'tiktok_shop');
  const noPrice = buildTikTokShopVariants({
    transcript: noPriceTranscript,
    silences: [],
    report: noPriceReport,
    plan: { version: 1, preset: 'tiktok_shop', operations: [], overlays: [] },
  });
  assert.equal(noPrice.evidence.some((item) => item.kind === 'price'), false, 'nunca inventar preco ausente');
  assert.ok(noPrice.warnings.some((warning) => /Preço não encontrado/u.test(warning)));

  console.log('test:editai-commercial-evidence ok — preco numerico/falado e evidencias A/B continuam factuais.');
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
