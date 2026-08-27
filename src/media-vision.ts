// O QUE O EDVID ENXERGA NO MATERIAL DO ALUNO.
//
// O agente lia so o NOME do arquivo e adivinhava. Relato real: ele mesmo
// escreveu "nao consigo visualizar os quadros diretamente, mas os nomes dos
// clipes ja sao descritivos" — e com isso montou uma edicao apoiada em
// palpite. O modelo de chat e de texto puro, e mesmo um multimodal nao
// resolveria sozinho: o agente conversa com o projeto por ARQUIVOS, nao
// recebe imagem anexada.
//
// A saida e a mesma do "Gerar automaticamente": o APLICATIVO enxerga e o
// agente decide. O app tira um quadro de cada insumo, manda para um modelo com
// visao e grava a descricao num arquivo que o agente le junto com a
// transcricao.
//
// MEDIDO no deepseek-v4-flash-vision-exp com um quadro real do b-roll:
//   reasoning desligado -> 2,1 s, US$ 0,0001, "A man wearing glasses works at
//     a desk, editing an audio waveform on a computer monitor in a studio."
//   reasoning ligado    -> 7,5 s, US$ 0,0005, mesma qualidade.
// Por isso o pedido vai com raciocinio DESLIGADO: o modelo e de reasoning e,
// sem desligar, os primeiros 160 tokens de saida foram inteiros para o
// raciocinio e a resposta voltou VAZIA.
//
// Modulo PURO: prompt, corpo do pedido, leitura da resposta e chave de cache.
// O que toca disco e rede fica no main.

// O modelo com visao da MESMA familia do agente de texto: mesma conta, mesma
// chave, sem provedor novo. O "-exp" e literal — e experimental, e pode sair
// do ar; por isso quem chama trata falha como "sem descricao", nunca como
// erro na cara do aluno.
export const VISION_MODEL = 'deepseek/deepseek-v4-flash-vision-exp';

// Um quadro de 512px vira ~350 tokens de entrada. Maior nao descreve melhor
// b-roll e so encarece.
export const VISION_FRAME_WIDTH = 512;
// Teto de insumos por projeto. Passando disso o custo continua irrisorio, mas
// a espera nao: 40 arquivos ja sao ~80 s em serie.
export const VISION_MAX_ITEMS = 40;

export type MediaDescription = {
  arquivo: string;
  descricao: string;
  // Impressao do arquivo no momento da descricao: muda o arquivo, refaz.
  fingerprint: string;
};

// O arquivo mudou desde a ultima descricao? Tamanho + mtime bastam: reescrever
// um clipe mantendo os dois e coisa que nao acontece em uso real, e um hash
// completo de 40 videos custaria mais que a propria descricao.
export function visionFingerprint(size: number, mtimeMs: number): string {
  return `${size}:${Math.round(mtimeMs)}`;
}

export function precisaDescrever(
  arquivo: string,
  fingerprint: string,
  jaDescritos: readonly MediaDescription[],
): boolean {
  const anterior = jaDescritos.find((item) => item.arquivo === arquivo);
  return !anterior || anterior.fingerprint !== fingerprint;
}

// UMA frase, catalogo de b-roll. O agente precisa saber o que APARECE para
// casar com o que esta sendo dito — nao de uma redacao sobre a cena.
export function visionPrompt(ehVideo: boolean): string {
  return [
    `Describe this ${ehVideo ? 'video frame' : 'image'} in ONE short English sentence,`,
    'as an entry in a b-roll catalogue: what is visible, the setting and the action.',
    'Be concrete and factual. No preamble, no interpretation, no camera jargon.',
  ].join(' ');
}

export function visionRequestBody(input: {
  base64: string;
  mime: string;
  ehVideo: boolean;
}): Record<string, unknown> {
  return {
    model: VISION_MODEL,
    max_tokens: 120,
    // DESLIGADO de proposito — ver o cabecalho. Com raciocinio ligado a
    // resposta volta vazia dentro de um teto baixo de tokens.
    reasoning: { enabled: false },
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: visionPrompt(input.ehVideo) },
        { type: 'image_url', image_url: { url: `data:${input.mime};base64,${input.base64}` } },
      ],
    }],
  };
}

// A frase da resposta, ou null quando o modelo devolveu vazio (acontece se o
// raciocinio comer o teto de tokens, e e o motivo de ele vir desligado).
export function visionDescription(payload: unknown): string | null {
  const escolha = (payload as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0];
  const texto = String(escolha?.message?.content ?? '').trim();
  if (!texto) return null;
  // Uma frase, sem aspas de enfeite e sem quebra de linha.
  return texto.split(/\r?\n/u)[0].replace(/^["']|["']$/gu, '').trim() || null;
}

// Argumentos do ffmpeg para o quadro. Video: um quadro a 25% da duracao —
// o comeco costuma ser fade ou claquete. Imagem: so a reducao.
export function frameArgs(input: {
  entrada: string;
  saida: string;
  emSegundos: number | null;
}): string[] {
  return [
    '-v', 'error', '-y',
    ...(input.emSegundos !== null ? ['-ss', input.emSegundos.toFixed(2)] : []),
    '-i', input.entrada,
    '-frames:v', '1',
    '-vf', `scale=${VISION_FRAME_WIDTH}:-2`,
    input.saida,
  ];
}
