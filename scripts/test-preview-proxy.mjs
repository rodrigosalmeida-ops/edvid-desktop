// Teste do PROXY DE PRÉVIA — a cópia que o navegador consegue tocar.
//
// O defeito que originou isto: palco PRETO num projeto gravado em ProRes
// Apple Log. Medido no próprio Chromium do app, com o arquivo real:
// canPlayType('video/quicktime') devolve vazio, e ao carregar o elemento
// reporta readyState 4 (pronto!), videoWidth 0, ZERO quadros decodificados e
// error: null. Ele toca o áudio e descarta o vídeo em silêncio — não há erro
// para mostrar nem evento para escutar, só o preto.
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
  const { precisaProxy, proxyArgs, proxyFileName, proxyProgress, PROXY_LADO_MAIOR } =
    await import(pathToFileURL(path.join(outDir, 'preview-proxy.js')).href);

  // --- 1. QUEM PRECISA DE PROXY --------------------------------------------
  assert.equal(precisaProxy('prores'), true, 'ProRes foi o caso real do palco preto');
  for (const codec of ['dnxhd', 'cineform', 'v210', 'rawvideo']) {
    assert.equal(precisaProxy(codec), true, `${codec} também não toca no navegador`);
  }
  for (const codec of ['h264', 'hevc', 'vp9', 'av1']) {
    assert.equal(precisaProxy(codec), false, `${codec} toca direto — proxy seria desperdício`);
  }
  assert.equal(precisaProxy('H264'), false, 'a comparação não pode ser sensível a caixa');
  // LISTA BRANCA: codec desconhecido vira proxy (lento porém correto) em vez
  // de tela preta (rápido e mudo).
  assert.equal(precisaProxy('codec_que_ninguem_previu'), true, 'o desconhecido vai pelo caminho seguro');
  // Sem codec não dá para afirmar que quebra: segue como antes.
  assert.equal(precisaProxy(''), false);
  assert.equal(precisaProxy(null), false);
  assert.equal(precisaProxy(undefined), false);

  // --- 2. O NOME NO CACHE ---------------------------------------------------
  // A impressão entra no nome: fonte trocada gera proxy novo em vez de a
  // prévia mostrar o material antigo.
  const a = proxyFileName('/p/Fill001_08270841_C462.mov', 'abc123');
  // O sufixo de versao faz parte do contrato: receita nova => nome novo, e o
  // cache do formato antigo deixa de ser reaproveitado sozinho.
  assert.match(a, /^Fill001_08270841_C462_abc123_p\d+\.mp4$/u);
  assert.notEqual(a, proxyFileName('/p/Fill001_08270841_C462.mov', 'def456'));
  // Nome hostil não escapa do diretório do cache.
  const feio = proxyFileName('/p/../../etc/pa ss wd.mov', 'x');
  assert.ok(!feio.includes('/') && !feio.includes('..'), `nome inseguro: ${feio}`);

  // --- 3. OS ARGUMENTOS -----------------------------------------------------
  const args = proxyArgs({ entrada: 'a.mov', saida: 'b.mp4' });
  assert.equal(args[args.indexOf('-c:v') + 1], 'libx264', 'o denominador comum do navegador');
  assert.equal(args[args.indexOf('-pix_fmt') + 1], 'yuv420p', '10 bits não toca em toda máquina');
  assert.match(args[args.indexOf('-vf') + 1], new RegExp(`scale=w=${PROXY_LADO_MAIOR}`), 'reduz para a prévia');
  assert.match(args[args.indexOf('-vf') + 1], /force_divisible_by=2/u, 'dimensão ímpar quebra o x264');
  assert.ok(args.includes('-progress'), 'o andamento vem do próprio ffmpeg');
  assert.ok(args.includes('+faststart'), 'o navegador precisa do índice na frente para buscar');
  // NADA de conversão de cor: o corte limpo preserva as tags do original, e
  // uma prévia com cor diferente do render é pior que uma prévia chapada.
  assert.ok(!args.some((x) => String(x).includes('colorspace=')), 'sem conversão de cor');
  // GOP curto: com o keyint padrão do x264 (250), cada seek da prévia mapeada
  // decodificava até 8 s de vídeo para mostrar UM quadro — a "travada".
  assert.equal(Number(args[args.indexOf('-g') + 1]), 30, 'IDR a cada 1 s para o seek ser barato');

  // --- 4. O ANDAMENTO -------------------------------------------------------
  // out_time_ms vem em MICROssegundos apesar do nome.
  assert.equal(proxyProgress('out_time_ms=80000000\n', 160), 0.5);
  assert.equal(proxyProgress('out_time_ms=999000000\n', 160), 1, 'nunca passa de 100%');
  assert.equal(proxyProgress('frame=12\n', 160), null, 'linha que não é tempo não move a barra');
  assert.equal(proxyProgress('out_time_ms=1000\n', 0), null, 'sem duração não há fração');

  console.log('test:preview-proxy ok — ProRes vai por proxy, lista branca no seguro, x264 yuv420p com GOP de 1 s e andamento do próprio ffmpeg.');
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
