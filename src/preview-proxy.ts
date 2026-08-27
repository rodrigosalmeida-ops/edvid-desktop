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
// A regra: o aplicativo nunca entrega ao navegador um arquivo que ele nao
// decodifica. Quando a fonte esta fora da lista, gera uma copia leve em H.264
// para a previa; o render final continua usando o original.

const CODECS_QUE_O_NAVEGADOR_TOCA = new Set([
  'h264', 'avc1', 'hevc', 'h265', 'vp8', 'vp9', 'av1', 'theora', 'mpeg4', 'mjpeg',
]);

export function precisaProxy(codecName: string | null | undefined): boolean {
  const codec = String(codecName ?? '').trim().toLowerCase();
  if (!codec) return false;
  return !CODECS_QUE_O_NAVEGADOR_TOCA.has(codec);
}

export const PROXY_LADO_MAIOR = 1280;
export const PROXY_VERSAO = 'p2';

export function proxyFileName(absolutePath: string, fingerprint: string): string {
  const base = absolutePath.split(/[\\/]/u).pop() ?? 'fonte';
  const limpo = base.replace(/\.[^.]*$/u, '').replace(/[^\w.-]+/gu, '_').slice(0, 48);
  return `${limpo}_${fingerprint}_${PROXY_VERSAO}.mp4`;
}

// Planejamento puro da aceleracao. O main pode detectar o encoder disponivel
// e passar o plano; sem plano, proxyArgs continua 100% compativel com o
// caminho por software ja validado no EDIT AI.
export type ProxyHardware = {
  encoder: string | null;
  hwaccel: string | null;
  escalaNaGpu: string | null;
};

export const SEM_ACELERACAO: ProxyHardware = {
  encoder: null,
  hwaccel: null,
  escalaNaGpu: null,
};

export const PROXY_QUALIDADE_VT = '45';
export const PROXY_CRF_SOFTWARE = '26';
export const PROXY_BITRATE_HARDWARE = '2500k';

export type ProxyPlano = {
  rotulo: 'software' | 'hardware' | 'gpu';
  hwaccel: string | null;
  formatoDoHwaccel: string | null;
  filtro: string;
  encoder: string;
  ajustes: string[];
};

const filtroDeEscalaNaCpu =
  `scale=w=${PROXY_LADO_MAIOR}:h=${PROXY_LADO_MAIOR}:force_original_aspect_ratio=decrease:force_divisible_by=2`;

export const PLANO_SOFTWARE: ProxyPlano = {
  rotulo: 'software',
  hwaccel: null,
  formatoDoHwaccel: null,
  filtro: filtroDeEscalaNaCpu,
  encoder: 'libx264',
  ajustes: ['-preset', 'veryfast', '-crf', PROXY_CRF_SOFTWARE, '-pix_fmt', 'yuv420p'],
};

export function caixaDoProxy(
  largura: number,
  altura: number,
): { largura: number; altura: number } | null {
  if (!Number.isFinite(largura) || !Number.isFinite(altura)) return null;
  if (largura < 2 || altura < 2) return null;
  const escala = Math.min(1, PROXY_LADO_MAIOR / Math.max(largura, altura));
  const par = (valor: number) => Math.max(2, Math.round((valor * escala) / 2) * 2);
  return { largura: par(largura), altura: par(altura) };
}

export function planejarProxy(input: {
  hardware: ProxyHardware;
  largura: number;
  altura: number;
  rotacao: number;
}): ProxyPlano {
  const { hardware } = input;
  if (!hardware.encoder) return PLANO_SOFTWARE;

  const qualidade = hardware.encoder === 'h264_videotoolbox'
    ? ['-q:v', PROXY_QUALIDADE_VT]
    : ['-b:v', PROXY_BITRATE_HARDWARE, '-maxrate', PROXY_BITRATE_HARDWARE, '-bufsize', '5000k'];
  const caixa = caixaDoProxy(input.largura, input.altura);
  const girada = Math.round(Math.abs(input.rotacao)) % 360 !== 0;

  // O caminho integralmente na GPU so e seguro sem rotacao. Alguns filtros de
  // hardware pulam o autorotate; com fonte girada mantemos escala na CPU para
  // preservar orientacao e usamos apenas o encoder acelerado.
  if (hardware.escalaNaGpu && hardware.hwaccel && caixa && !girada) {
    return {
      rotulo: 'gpu',
      hwaccel: hardware.hwaccel,
      formatoDoHwaccel: `${hardware.hwaccel}_vld`,
      filtro: `${hardware.escalaNaGpu}=w=${caixa.largura}:h=${caixa.altura}`,
      encoder: hardware.encoder,
      ajustes: qualidade,
    };
  }

  return {
    rotulo: 'hardware',
    hwaccel: hardware.hwaccel,
    formatoDoHwaccel: null,
    filtro: filtroDeEscalaNaCpu,
    encoder: hardware.encoder,
    ajustes: [...qualidade, '-pix_fmt', 'yuv420p'],
  };
}

export function proxyArgs(input: {
  entrada: string;
  saida: string;
  plano?: ProxyPlano;
}): string[] {
  const plano = input.plano ?? PLANO_SOFTWARE;
  return [
    '-v', 'error', '-y',
    '-progress', 'pipe:1', '-nostats',
    ...(plano.hwaccel ? ['-hwaccel', plano.hwaccel] : []),
    ...(plano.formatoDoHwaccel ? ['-hwaccel_output_format', plano.formatoDoHwaccel] : []),
    '-i', input.entrada,
    '-vf', plano.filtro,
    '-c:v', plano.encoder,
    ...plano.ajustes,
    '-g', '30', '-keyint_min', '30',
    '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart',
    input.saida,
  ];
}

export function proxyProgress(linha: string, duracaoSegundos: number): number | null {
  const match = /^out_time_ms=(\d+)/mu.exec(linha);
  if (!match || duracaoSegundos <= 0) return null;
  const segundos = Number(match[1]) / 1_000_000;
  if (!Number.isFinite(segundos)) return null;
  return Math.max(0, Math.min(1, segundos / duracaoSegundos));
}
