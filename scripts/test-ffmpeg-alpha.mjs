// Teste do VP9 COM ALPHA no ffmpeg empacotado (0.25.0).
//
// A validacao completa mora no build (scripts/build-ffmpeg.mjs) e roda quando
// o binario e compilado. Este teste roda na SUITE, contra o binario que esta
// em resources/ — e pega o caso que o build nao pega: alguem trocar o binario
// staged sem passar pelo build (restaurar de um backup, copiar de outra
// maquina) e a previa perder o alpha sem ninguem ver ate o quadrado preto
// aparecer por cima do video de um aluno.
//
// Aprendido a força: o WebM guarda o alpha do VP9 num canal LATERAL. O ffprobe
// com o decodificador nativo responde pix_fmt=yuv420p (sem o "a") e marca a
// presenca em TAG:alpha_mode=1; extrair o canal exige decodificar com
// -c:v libvpx-vp9. A primeira sonda perguntava pelo pix_fmt e condenou um
// binario perfeitamente bom.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = `${process.platform}-${process.arch}`;
const bin = (name) => path.join(
  projectRoot, 'resources', 'runtimes', target, 'ffmpeg', 'bin',
  `${name}${process.platform === 'win32' ? '.exe' : ''}`,
);

if (!existsSync(bin('ffmpeg'))) {
  console.log(`test:ffmpeg-alpha pulado — sem runtime staged para ${target} (rode npm run build:ffmpeg).`);
  process.exit(0);
}

const run = (command, args) => execFileSync(command, args, { encoding: 'utf8' });
const outDir = mkdtempSync(path.join(tmpdir(), 'edvid-alpha-'));

try {
  // --- 1. O encoder existe e o ProRes continua existindo --------------------
  const encoders = run(bin('ffmpeg'), ['-hide_banner', '-encoders']);
  assert.match(encoders, /\blibvpx-vp9\b/u, 'encoder libvpx-vp9 ausente do binário staged');
  // O ProRes 4444 é o formato do render final (efeito atrás do sujeito e a
  // camada cheia do gráfico); ganhar VP9 não pode custar o ProRes.
  assert.match(encoders, /\bprores_ks\b/u, 'prores_ks sumiu do binário staged');

  // --- 2. Volta completa: codifica meio-transparente e relê o canal ---------
  const video = path.join(outDir, 'alpha.webm');
  run(bin('ffmpeg'), [
    '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi',
    '-i', 'color=red:size=320x180:rate=30,format=rgba,geq=r=r(X\\,Y):g=g(X\\,Y):b=b(X\\,Y):a=if(lt(X\\,160)\\,255\\,0)',
    '-t', '0.5',
    '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '500k',
    video,
  ]);
  const probe = run(bin('ffprobe'), [
    '-v', 'error',
    '-show_entries', 'stream=codec_name:stream_tags=alpha_mode',
    '-of', 'csv=p=0', video,
  ]).trim();
  assert.ok(probe.includes('vp9') && probe.includes('1'), `WebM sem vp9+alpha_mode=1: ${probe}`);

  const frame = path.join(outDir, 'canal.png');
  run(bin('ffmpeg'), [
    '-hide_banner', '-loglevel', 'error',
    '-c:v', 'libvpx-vp9',
    '-i', video,
    '-vf', 'alphaextract', '-frames:v', '1', frame,
  ]);
  const extremos = run(bin('ffprobe'), [
    '-v', 'error',
    '-f', 'lavfi', '-i', `movie=${frame},signalstats`,
    '-show_entries', 'frame_tags=lavfi.signalstats.YMIN,lavfi.signalstats.YMAX',
    '-of', 'csv=p=0',
  ]).trim();
  const [ymin, ymax] = extremos.split(',').map(Number);
  assert.ok(ymin <= 16, `lado transparente sumiu (YMIN=${ymin})`);
  assert.ok(ymax >= 230, `lado opaco sumiu (YMAX=${ymax})`);

  console.log('test:ffmpeg-alpha ok — VP9 com alpha faz a volta completa e o ProRes continua no lugar.');
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
