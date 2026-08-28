// Codecs que o FFmpeg principal do EDIT AI consegue identificar via probe,
// mas pode não conseguir DECODIFICAR em todas as máquinas.
//
// AV1 é o caso medido no upstream público: quando o binário principal só tem
// o decoder nativo/hardware, a extração de quadro pode falhar em máquinas sem
// aceleração AV1. O runtime do Remotion traz um FFmpeg com libdav1d e é o
// fallback seguro para visão de mídia/B-roll.
//
// Módulo puro: decide quando desviar e produz uma mensagem útil. A resolução
// do binário alternativo fica no main.

const CODECS_QUE_PEDEM_FALLBACK = new Set(['av1']);

export function precisaDeOutroFfmpeg(codecName: string | null | undefined): boolean {
  const codec = String(codecName ?? '').trim().toLowerCase();
  if (!codec) return false;
  return CODECS_QUE_PEDEM_FALLBACK.has(codec);
}

export function avisoDeCodecSemLeitor(nomeDoArquivo: string, codecName: string): string {
  return `Não consegui ler um quadro de "${nomeDoArquivo}" (${codecName.toUpperCase()}): `
    + 'o decodificador desse formato fica disponível quando o motor de render do EDIT AI está preparado. '
    + 'Prepare o motor de render e tente novamente.';
}
