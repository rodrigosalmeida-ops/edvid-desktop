// PROXY DE PREVIA: o arquivo que o navegador CONSEGUE tocar.
//
// O palco ficava PRETO, sem mensagem nenhuma, num projeto gravado em ProRes
// Apple Log. A cadeia, medida:
//
//   1. o corte limpo sai em H.264 e toca normalmente;
//   2. ao editar (trim, excluir) a previa deixa de tocar o corte e passa a
//      mapear a timeline nos ARQUIVOS-FONTE;
//   3. a fonte era ProRes — e o Chromium nao decodifica ProRes.
//
// O que torna isso traicoeiro e o modo de falhar. Medido no proprio Chromium
// do app: `canPlayType('video/quicktime')` devolve VAZIO, e ao carregar o
// arquivo o elemento reporta `readyState: 4` (pronto!), `videoWidth: 0`, zero
// quadros decodificados e **`error: null`**. Ele carrega a faixa de AUDIO, se
// declara pronto e descarta a faixa de video em silencio. Nao ha erro para
// mostrar, nao ha evento para escutar: so o preto.
//
// A regra que sai disso: o aplicativo nunca entrega ao navegador um arquivo
// que ele nao decodifica. Quando a fonte esta fora da lista, o Edvid gera uma
// copia leve em H.264 e a previa usa ela. O original nao e tocado, e o corte
// final continua saindo dele.
//
// Modulo PURO: a lista, a decisao e os argumentos. Quem transcodifica e o main.

// O QUE O CHROMIUM TOCA. Lista branca de proposito: codec novo que ninguem
// previu vira proxy (lento, porem correto) em vez de tela preta (rapido e
// mudo). "hevc" entra porque o Chromium do Electron no macOS e no Windows
// decodifica H.265 por hardware.
const CODECS_QUE_O_NAVEGADOR_TOCA = new Set([
  'h264', 'avc1', 'hevc', 'h265', 'vp8', 'vp9', 'av1', 'theora', 'mpeg4', 'mjpeg',
]);

export function precisaProxy(codecName: string | null | undefined): boolean {
  const codec = String(codecName ?? '').trim().toLowerCase();
  // Sem codec conhecido nao da para afirmar que quebra: o caminho normal
  // segue, e no pior caso o aluno ve o mesmo que via antes desta mudanca.
  if (!codec) return false;
  return !CODECS_QUE_O_NAVEGADOR_TOCA.has(codec);
}

// O maior lado da previa. 1280 cobre o palco em qualquer layout do app com
// folga; a fonte de 4K entra em 720x1280 no vertical.
export const PROXY_LADO_MAIOR = 1280;

// Versao do FORMATO do proxy, gravada no nome — mudou a receita, muda o
// nome, e o cache antigo deixa de ser reaproveitado (e regenerado ja no
// formato novo; quem constroi varre o irmao velho). p2: GOP curto.
export const PROXY_VERSAO = 'p2';

// Nome no CACHE, nao no projeto do aluno. Duas razoes: proxy e regeneravel e
// nao merece backup junto com o material; e dentro de edit/ ele seria varrido
// como midia do projeto — descrito pela visao, oferecido como b-roll, e ate
// disputando a escolha do "clean-cut" mais recente.
export function proxyFileName(absolutePath: string, fingerprint: string): string {
  const base = absolutePath.split(/[\\/]/u).pop() ?? 'fonte';
  const limpo = base.replace(/\.[^.]*$/u, '').replace(/[^\w.-]+/gu, '_').slice(0, 48);
  return `${limpo}_${fingerprint}_${PROXY_VERSAO}.mp4`;
}

// H.264 yuv420p, que e o denominador comum. `-progress pipe:1` da o andamento
// em linhas simples (out_time_ms=...), sem parse de stderr.
//
// As tags de cor NAO sao convertidas de proposito: o corte limpo tambem
// preserva as do original (medido: bt2020nc num projeto Apple Log) e o
// Chromium pinta os dois igual. Converter aqui deixaria a previa com cor
// diferente do render, que e pior que uma previa chapada.
export function proxyArgs(input: { entrada: string; saida: string }): string[] {
  return [
    '-v', 'error', '-y',
    '-progress', 'pipe:1', '-nostats',
    '-i', input.entrada,
    '-vf', `scale=w=${PROXY_LADO_MAIOR}:h=${PROXY_LADO_MAIOR}:force_original_aspect_ratio=decrease:force_divisible_by=2`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-pix_fmt', 'yuv420p',
    // GOP CURTO (1 s). O keyint padrao do x264 e 250 quadros (~8 s): um seek
    // da previa mapeada aterrissava no meio do GOP e decodificava ate 250
    // quadros para mostrar UM — era a "travada" de segundos por corte e por
    // arrasto da agulha. Com IDR a cada 30, o pior seek decodifica 29 quadros
    // (~50 ms) e custa poucos por cento a mais de arquivo.
    '-g', '30', '-keyint_min', '30',
    '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart',
    input.saida,
  ];
}

// O andamento sai do proprio ffmpeg: `out_time_ms=` em microssegundos (o nome
// mente, e conhecido). Devolve 0..1, ou null quando a linha nao e de tempo.
export function proxyProgress(linha: string, duracaoSegundos: number): number | null {
  const match = /^out_time_ms=(\d+)/mu.exec(linha);
  if (!match || duracaoSegundos <= 0) return null;
  const segundos = Number(match[1]) / 1_000_000;
  if (!Number.isFinite(segundos)) return null;
  return Math.max(0, Math.min(1, segundos / duracaoSegundos));
}
