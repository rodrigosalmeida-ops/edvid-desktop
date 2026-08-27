// PEDIDO DE MIDIA GERADA: as regras que tiram trabalho mecanico do agente.
//
// O contrato antigo pedia cinco campos ao agente — arquivo, prompt, uso,
// segundos — e ainda cobrava dele, num SEGUNDO turno, copiar o arquivo para
// public/ e escrever a colocacao no edit-data. Dessas etapas, uma unica nao
// tem como sair dele: escrever o prompt a partir da fala. Todo o resto ou o
// aplicativo ja sabia, ou conseguia derivar.
//
// O custo de nao derivar foi medido em uso real: oito clipes gerados e pagos
// que nunca entraram na edicao, porque o agente escreveu a colocacao no array
// errado; e um clipe cujo prompt foi direto para o modelo sem o enquadramento
// e sem o "nada de texto" que o caminho manual anexa — o mesmo pedido saindo
// pior pelo agente do que pelo botao.
//
// O contrato novo tem TRES campos:
//
//   [{"prompt": "...", "inicio": 35.4, "fim": 40.5}]
//
// Com a janela no pedido, o aplicativo coloca a midia sozinho assim que o
// arquivo chega — sem segundo turno, e com um unico escritor do edit-data.
// Os campos antigos continuam valendo: pedidos.json de sessoes anteriores
// (e o do botao de gerar faixa) passam por aqui sem mudar de comportamento.
//
// Modulo PURO, como generation-tier e image-format: estas regras precisam ser
// conferiveis sem rede, sem Electron e sem gastar credito.

import { type ImageUse, imageUse } from './image-format';

export type MediaKind = 'imagem' | 'video';

export type MediaRequest = {
  arquivo: string;
  prompt: string;
  uso: ImageUse | null;
  // So o video usa; a imagem ignora.
  segundos: number;
  // A JANELA na timeline. Quando vem, o aplicativo coloca a midia sozinho.
  // Quando falta, o agente ainda e quem coloca — pedidos antigos continuam
  // funcionando exatamente como funcionavam.
  janela: { inicio: number; fim: number } | null;
};

const EXTENSAO = { imagem: '.png', video: '.mp4' } as const;
const EXTENSOES_OK = {
  imagem: /\.(png|jpg|jpeg|webp)$/iu,
  video: /\.(mp4|mov|webm)$/iu,
} as const;

// Sem duracao declarada nem janela, o padrao e o que a maioria dos b-rolls do
// Edvid ocupa: um trecho curto atras da legenda.
const SEGUNDOS_PADRAO = 4;
// Janela menor que isto e engano de digitacao, nao pedido: um clipe de 0,2s
// custa o mesmo de um de 5s e nao da tempo de ser visto.
const JANELA_MINIMA = 0.5;

// Nome do arquivo a partir do PROMPT. O agente nao precisa inventar nome, e o
// nome derivado tem uma propriedade util de graca: o mesmo pedido gera o mesmo
// nome, entao pedir duas vezes o mesmo clipe encontra o arquivo no disco e nao
// gasta credito de novo.
export function arquivoDoPrompt(prompt: string, kind: MediaKind): string {
  const base = prompt
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .split('-')
    .filter(Boolean)
    .slice(0, 6)
    .join('-');
  return `${base || 'midia'}${EXTENSAO[kind]}`;
}

function numero(valor: unknown): number | null {
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

// A janela aceita os nomes dos dois lados: o agente escreve em portugues
// (inicio/fim, como o resto do pedido), o edit-data usa start/end. Aceitar os
// quatro custa uma linha e evita um pedido descartado por sinonimo.
function janelaDe(item: Record<string, unknown>): { inicio: number; fim: number } | null {
  const inicio = numero(item.inicio) ?? numero(item.start);
  const fim = numero(item.fim) ?? numero(item.end);
  if (inicio === null || fim === null) return null;
  if (inicio < 0 || fim - inicio < JANELA_MINIMA) return null;
  return { inicio, fim };
}

// Um pedido cru (do agente ou do botao) vira um pedido completo. O que o
// agente nao escreveu, sai daqui.
export function parseMediaRequests(raw: unknown, kind: MediaKind): MediaRequest[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry): MediaRequest[] => {
    if (!entry || typeof entry !== 'object') return [];
    const item = entry as Record<string, unknown>;
    const prompt = String(item.prompt ?? '').trim();
    // Sem prompt nao ha pedido: e a unica parte que so o agente escreve.
    if (!prompt) return [];

    const janela = janelaDe(item);
    // Nome achatado (nada de ../) e sempre com extensao. Sem nome, deriva do
    // prompt.
    const declarado = String(item.arquivo ?? '').trim().split(/[\\/]/u).pop() ?? '';
    let arquivo = declarado && !declarado.startsWith('.') ? declarado : arquivoDoPrompt(prompt, kind);
    if (!EXTENSOES_OK[kind].test(arquivo)) arquivo = `${arquivo}${EXTENSAO[kind]}`;

    // A duracao SAI DA JANELA quando ela existe: pedir "segundos" ao agente
    // era pedir uma conta que o proprio pedido ja continha, e as duas
    // discordarem deixava um buraco no video.
    const declarados = numero(item.segundos) ?? numero(item.duracao);
    const segundos = janela
      ? Math.max(1, Math.round((janela.fim - janela.inicio) * 100) / 100)
      : declarados !== null && declarados > 0 ? declarados : SEGUNDOS_PADRAO;

    return [{
      arquivo,
      prompt,
      // "proporcao" continua aceito: pedidos.json de sessoes anteriores vem
      // com ele no lugar de "uso".
      uso: imageUse(String(item.uso ?? item.proporcao ?? '')),
      segundos,
      janela,
    }];
  });
}

export type Colocacao =
  | { tipo: 'insert'; src: string; start: number; end: number; kind: 'image' | 'video'; fullscreen: boolean }
  | { tipo: 'faixa'; index: number; src: string; kind: 'image' | 'video' };

type SplitLido = { start?: unknown; end?: unknown; dur?: unknown };

// ONDE a midia entra, decidido pelo aplicativo.
//
// A regra padrao e TELA CHEIA, e nao o cartao arredondado: com a janela vinda
// de uma marcacao In&Out, o pedido e "cobre este trecho". O cartao continua
// existindo para quem passa `uso` de cartao, e a faixa da tela dividida ganha
// precedencia quando o pedido e de faixa E existe um split naquele tempo —
// sem split, uma midia enquadrada para faixa na tela cheia sairia esticada,
// entao ela vira cartao.
export function colocacaoPara(
  request: MediaRequest,
  pasta: 'clipes' | 'imagens',
  splits: readonly unknown[] = [],
): Colocacao | null {
  if (!request.janela) return null;
  const kind: 'image' | 'video' = pasta === 'clipes' ? 'video' : 'image';
  const src = `${pasta}/${request.arquivo}`;
  const ehFaixa = request.uso === 'tela-dividida' || request.uso === 'tela-dividida-base';
  if (ehFaixa) {
    const index = splits.findIndex((item) => {
      const split = item as SplitLido;
      const start = Number(split?.start);
      const fim = Number.isFinite(Number(split?.end))
        ? Number(split?.end)
        : start + Number(split?.dur);
      if (!Number.isFinite(start) || !Number.isFinite(fim)) return false;
      // Sobreposicao, nao continencia: a janela do pedido e a do split foram
      // escritas por lados diferentes e raramente batem no milesimo.
      return start < request.janela!.fim && fim > request.janela!.inicio;
    });
    if (index >= 0) return { tipo: 'faixa', index, src, kind };
    return { tipo: 'insert', src, start: request.janela.inicio, end: request.janela.fim, kind, fullscreen: false };
  }
  return {
    tipo: 'insert',
    src,
    start: request.janela.inicio,
    end: request.janela.fim,
    kind,
    fullscreen: true,
  };
}
