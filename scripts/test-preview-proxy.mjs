// Teste do PROXY DE PRÉVIA — a cópia que o navegador consegue tocar.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(path.join(tmpdir(), 'edvid-proxy-'));

try {
  execFileSync(process.execPath, [
    path.join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
    path.join(projectRoot, 'src', 'preview-proxy.ts'),
    '--target', 'es2022', '--module', 'es2022', '--moduleResolution', 'bundler',
    '--skipLibCheck', '--outDir', outDir,
  ], { stdio: 'inherit' });
  const {
    precisaProxy,
    proxyArgs,
    proxyFileName,
    proxyProgress,
    planejarProxy,
    caixaDoProxy,
    PLANO_SOFTWARE,
    SEM_ACELERACAO,
    PROXY_LADO_MAIOR,
  } = await import(pathToFileURL(path.join(outDir, 'preview-proxy.js')).href);

  // --- 1. QUEM PRECISA DE PROXY --------------------------------------------
  assert.equal(precisaProxy('prores'), true, 'ProRes foi o caso real do palco preto');
  for (const codec of ['dnxhd', 'cineform', 'v210', 'rawvideo']) {
    assert.equal(precisaProxy(codec), true, `${codec} também não toca no navegador`);
  }
  for (const codec of ['h264', 'hevc', 'vp9', 'av1']) {
    assert.equal(precisaProxy(codec), false, `${codec} toca direto — proxy seria desperdício`);
  }
  assert.equal(precisaProxy('H264'), false);
  assert.equal(precisaProxy('codec_que_ninguem_previu'), true);
  assert.equal(precisaProxy(''), false);
  assert.equal(precisaProxy(null), false);
  assert.equal(precisaProxy(undefined), false);

  // --- 2. O NOME NO CACHE ---------------------------------------------------
  const a = proxyFileName('/p/Fill001_08270841_C462.mov', 'abc123');
  assert.match(a, /^Fill001_08270841_C462_abc123_p\d+\.mp4$/u);
  assert.notEqual(a, proxyFileName('/p/Fill001_08270841_C462.mov', 'def456'));
  const feio = proxyFileName('/p/../../etc/pa ss wd.mov', 'x');
  assert.ok(!feio.includes('/') && !feio.includes('..'), `nome inseguro: ${feio}`);

  // --- 3. FALLBACK POR SOFTWARE --------------------------------------------
  const args = proxyArgs({ entrada: 'a.mov', saida: 'b.mp4' });
  assert.equal(args[args.indexOf('-c:v') + 1], 'libx264');
  assert.equal(args[args.indexOf('-pix_fmt') + 1], 'yuv420p');
  assert.match(args[args.indexOf('-vf') + 1], new RegExp(`scale=w=${PROXY_LADO_MAIOR}`));
  assert.match(args[args.indexOf('-vf') + 1], /force_divisible_by=2/u);
  assert.ok(args.includes('-progress'));
  assert.ok(args.includes('+faststart'));
  assert.ok(!args.some((x) => String(x).includes('colorspace=')));
  assert.equal(Number(args[args.indexOf('-g') + 1]), 30);

  // --- 4. PLANEJAMENTO DE HARDWARE E ROTACAO -------------------------------
  assert.deepEqual(planejarProxy({
    hardware: SEM_ACELERACAO,
    largura: 3840,
    altura: 2160,
    rotacao: 0,
  }), PLANO_SOFTWARE, 'sem encoder, software continua sendo o fallback');

  assert.deepEqual(caixaDoProxy(3840, 2160), { largura: 1280, altura: 720 });
  assert.deepEqual(caixaDoProxy(1080, 1920), { largura: 720, altura: 1280 });
  assert.equal(caixaDoProxy(0, 1920), null);

  const apple = { encoder: 'h264_videotoolbox', hwaccel: 'videotoolbox', escalaNaGpu: 'scale_vt' };
  const gpu = planejarProxy({ hardware: apple, largura: 3840, altura: 2160, rotacao: 0 });
  assert.equal(gpu.rotulo, 'gpu');
  assert.equal(gpu.encoder, 'h264_videotoolbox');
  assert.equal(gpu.formatoDoHwaccel, 'videotoolbox_vld');
  assert.match(gpu.filtro, /scale_vt=w=1280:h=720/u);

  const girado = planejarProxy({ hardware: apple, largura: 3840, altura: 2160, rotacao: -90 });
  assert.equal(girado.rotulo, 'hardware', 'fonte girada não pode usar escala integral na GPU');
  assert.match(girado.filtro, /force_original_aspect_ratio=decrease/u);
  assert.equal(girado.formatoDoHwaccel, null);

  const argsGpu = proxyArgs({ entrada: 'a.mov', saida: 'b.mp4', plano: gpu });
  assert.ok(argsGpu.indexOf('-hwaccel') < argsGpu.indexOf('-i'), 'opção de entrada fica antes do -i');
  assert.ok(argsGpu.indexOf('-hwaccel_output_format') < argsGpu.indexOf('-i'));
  assert.equal(argsGpu[argsGpu.indexOf('-c:v') + 1], 'h264_videotoolbox');
  assert.equal(argsGpu.includes('-pix_fmt'), false, 'GPU integral não força download por pix_fmt');

  // --- 5. O ANDAMENTO -------------------------------------------------------
  assert.equal(proxyProgress('out_time_ms=80000000\n', 160), 0.5);
  assert.equal(proxyProgress('out_time_ms=999000000\n', 160), 1);
  assert.equal(proxyProgress('frame=12\n', 160), null);
  assert.equal(proxyProgress('out_time_ms=1000\n', 0), null);

  console.log('test:preview-proxy ok — ProRes seguro, fallback software e planejamento GPU protegido contra rotação.');
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
