// O QUE O APLICATIVO ESCREVE SOZINHO NA EDICAO.
//
// Ate a 0.30.2 dois botoes do formulario de estilos nao faziam nada sem um
// agente conectado, e o pior: o app dizia que tinham funcionado. "Tela
// dividida" gravava `splits: []` (writeEditData preservava o que ja existia e
// nunca criava nada) e "Flash na transicao" nao chegava a lugar nenhum do
// edit-data — as duas escolhas so viravam TEXTO no prompt do agente. Sem
// agente, a edicao saia limpa e a mensagem no chat dizia "Estilos aplicados".
//
// A regra que ficou: se o formulario oferece, o aplicativo entrega. O que o
// agente ainda decide e o CONTEUDO (o que a imagem mostra); o RITMO — onde a
// tela divide, onde o clarao cai — e geometria da propria fala e sai daqui.
//
// Modulo puro, sem disco e sem rede: a mesma fala sempre gera o mesmo plano.
// Mesma disciplina do music-brief.ts, que ja tirou a trilha das maos do
// agente pelo mesmo motivo.

export type PlanSegment = { start: number; dur: number };

// A tela dividida como o template a le (Split em Main.tsx). `src` vazio e um
// estado legitimo: e o espaco esperando o aluno apontar o arquivo ou mandar
// gerar. `kind` vai junto mesmo vazio — e ele que diz ao espaco vazio se o
// botao oferece imagem ou clipe.
export type PlannedSplit = {
  kind?: 'image' | 'video';
  src: string;
  start: number;
  end: number;
  position: 'top' | 'bottom';
};

// O clarao entra como ANIMACAO com kind "flash", nao como `transitions`. As
// duas formas funcionam no CustomGraphics, mas so a lista de animacoes vira
// chip na timeline — e chip e o que o aluno seleciona e apaga. Um flash que
// nao da para tirar e um flash que ele vai ter de aguentar ate o fim.
export type PlannedFlash = {
  start: number;
  end: number;
  kind: 'flash';
  label: string;
};

// Bloco curto demais para virar espaco de tela dividida. O fade do template
// leva 7 quadros para entrar e 6 para sair (~0,43s a 30fps): abaixo de 1,5s
// sobra menos de um segundo de midia visivel, e a divisa passa a ler como
// falha de render em vez de corte.
export const MIN_BLOCO = 1.5;

// 9 casas, como o segments_for_remotion.py e pelo MESMO motivo: um tempo
// quantizado em quadro (121/30 = 4,0333333...) truncado em milissegundos vira
// 4,033 — 0,99 de um quadro — e a agulha (que anda em quadros) nunca mais
// coincide com a borda do chip. Visto em uso real com zoom na timeline.
const round3 = (value: number): number => Math.round(value * 1e9) / 1e9;

/**
 * UMA JANELA DE TELA DIVIDIDA POR CORTE.
 *
 * O primeiro desenho adivinhava: fatiava o video em partes iguais e escolhia
 * uma frase no meio de cada fatia. Em uso real isso entregou UMA janela num
 * reel de 14s, caida no meio de dois blocos — e no lugar errado por
 * construcao, porque a fala e as fronteiras do CORTE sao coisas diferentes.
 *
 * O corte ja e a decisao de ritmo do video: cada bloco do EDL e uma tomada
 * inteira, e e nele que uma troca de layout le como intencao. Entao o plano
 * deixou de inventar janela e passou a acompanhar o corte: um espaco em cada
 * bloco, para o aluno apagar o que nao quiser, apontar um arquivo ou mandar a
 * IA gerar. O aplicativo propoe, ele poda — nao o contrario.
 *
 * Nao ha teto de quantidade: espaco vazio nao gasta credito nenhum, e o
 * numero de blocos e a escolha de edicao que ele ja aprovou no corte limpo.
 */
export function planSplits(input: {
  // Os blocos do corte (segments.json), a mesma lista que o template usa para
  // trocar o zoom a cada corte e que a timeline mostra como "Bloco NN".
  segments: readonly PlanSegment[];
  durationSec: number;
  // A headline ocupa o alto do quadro no comeco; dividir a tela por baixo dela
  // empilha dois elementos fortes na mesma respirada. O bloco que cai INTEIRO
  // debaixo dela nao recebe espaco; o que so comeca ali entra aparado.
  hookEndSec: number;
  position: 'top' | 'bottom';
  kind?: 'image' | 'video';
  // 'corte' (padrao): um espaco por bloco do corte — o desenho para quando um
  // AGENTE vai preencher os espacos com conteudo por trecho de fala.
  // 'inteiro': UM espaco de ponta a ponta, para o aluno recortar com a
  // tesoura onde quiser e preencher cada pedaco. E o desenho sem agente (e o
  // da origem "nenhum"): pre-picotar por corte impunha um ritmo que ninguem
  // pediu, e apagar espaco por espaco era trabalho — pedido de uso real.
  mode?: 'corte' | 'inteiro';
}): PlannedSplit[] {
  const durationSec = Number(input.durationSec);
  if (!Number.isFinite(durationSec) || durationSec <= 0) return [];

  if (input.mode === 'inteiro') {
    if (durationSec < MIN_BLOCO) return [];
    return [{
      ...(input.kind ? { kind: input.kind } : {}),
      src: '',
      start: 0,
      end: round3(durationSec),
      position: input.position,
    }];
  }

  const hook = Number.isFinite(Number(input.hookEndSec)) ? Math.max(0, Number(input.hookEndSec)) : 0;
  const piso = hook > 0 ? hook + 0.6 : 0;

  const janelas: PlannedSplit[] = [];
  for (const segment of input.segments) {
    const bruto = Number(segment.start);
    const dur = Number(segment.dur);
    if (!Number.isFinite(bruto) || !Number.isFinite(dur) || dur <= 0) continue;
    const start = Math.max(bruto, piso);
    const end = Math.min(bruto + dur, durationSec);
    // Bloco curto demais nao vira espaco: o fade do template sozinho leva 7
    // quadros para entrar e 6 para sair, entao abaixo disto a midia mal
    // aparece e a divisa le como falha de render, nao como corte.
    if (end - start < MIN_BLOCO) continue;
    janelas.push({
      ...(input.kind ? { kind: input.kind } : {}),
      src: '',
      start: round3(start),
      end: round3(end),
      position: input.position,
    });
  }
  return janelas;
}

/**
 * O plano REPLANEJA, e a midia ja apontada vem junto.
 *
 * A primeira versao preservava as janelas existentes ("elas mandam no tempo")
 * e isso saiu pela culatra em uso real: uma janela mal posicionada, gravada
 * por uma versao anterior, sobreviveu a todo "Salvar e aplicar" seguinte — as
 * correcoes do plano nunca chegaram ao projeto do aluno, e da tela parecia que
 * nada tinha sido corrigido.
 *
 * Agora o corte manda no tempo, como manda em todo o resto da Fase 2, e o que
 * nao pode sumir e o TRABALHO: cada arquivo ja apontado viaja para a janela
 * que cobre o lugar dele. Arquivo que nao encontra janela nenhuma (o corte
 * mudou embaixo dele) fica onde estava em vez de desaparecer calado.
 *
 * O formulario continua mandando no layout — trocar "Tela dividida" por "Tela
 * dividida 2" vira a montagem inteira — e o `kind` so segue o formulario
 * enquanto o espaco esta vazio: depois que ha arquivo, quem manda e o arquivo.
 */
export function applySplitPlan(input: {
  edit: 'limpa' | 'split' | 'split2';
  splitMedia?: 'imagem' | 'video' | 'nenhum';
  previous: readonly Record<string, unknown>[];
  planned: readonly PlannedSplit[];
  // Duracao do corte ATUAL. Uma midia orfa pode ser de um corte mais longo (o
  // aluno refez o corte limpo): sem isto ela ficaria depois do fim do video,
  // invisivel no palco e com o chip estourando a timeline.
  durationSec?: number;
}): Record<string, unknown>[] {
  // "Limpa" e uma afirmacao sobre o RESULTADO. Deixar as janelas gravadas faz
  // o template continuar dividindo a tela (BaseWithSplits nao olha o
  // editType) e a previa passa a contradizer o formulario — exatamente a
  // classe de mentira que este modulo existe para acabar. Os arquivos ficam
  // em public/: voltar para tela dividida replaneja e o aluno reaponta.
  if (input.edit === 'limpa') return [];

  const position = input.edit === 'split' ? 'top' : 'bottom';
  const kind = input.splitMedia === 'video'
    ? 'video'
    : input.splitMedia === 'nenhum'
      ? null
      : 'image';
  const limite = Number(input.durationSec);
  const temLimite = Number.isFinite(limite) && limite > 0;

  const fimDe = (item: Record<string, unknown>): number => {
    const start = Number(item.start);
    const end = Number(item.end);
    return Number.isFinite(end) ? end : start + Number(item.dur);
  };

  // Sem plano nenhum (o segments.json nao pode ser lido, por exemplo) o que
  // existe FICA. Replanejar para o vazio apagaria a edicao inteira por causa
  // de um arquivo ilegivel.
  if (!input.planned.length) return preservar(input.previous, position, kind, limite, temLimite, fimDe);

  // PLANO DE FAIXA UNICA (modo 'inteiro'): so vale para projeto virgem. Se o
  // aluno ja recortou a faixa com a tesoura ou apontou midia, reaplicar
  // estilos nao pode achatar o trabalho dele de volta numa faixa so.
  if (input.planned.length === 1 && input.previous.length) {
    return preservar(input.previous, position, kind, limite, temLimite, fimDe);
  }

  const comMidia = input.previous.filter((item) => String(item.src ?? '').trim() !== '');

  // Casamento pelo MAIOR ENCAIXE GLOBAL, nao janela por janela.
  //
  // Percorrer as janelas em ordem e dar a cada uma a melhor midia que sobrou
  // parece a mesma coisa e nao e: na bancada, a primeira janela abocanhou uma
  // imagem com 0,63s de sobreposicao e deixou a janela seguinte — onde a mesma
  // imagem encaixava por 2,87s — vazia. Ordenar os pares pelo tamanho da
  // sobreposicao resolve, e custa uma lista de N x M numeros.
  const pares: Array<{ janela: number; midia: number; sobra: number }> = [];
  input.planned.forEach((janela, j) => {
    comMidia.forEach((item, m) => {
      const sobra = Math.min(janela.end, fimDe(item)) - Math.max(janela.start, Number(item.start));
      if (sobra > 0) pares.push({ janela: j, midia: m, sobra });
    });
  });
  pares.sort((a, b) => b.sobra - a.sobra);

  const herdeira = new Map<number, number>();
  const usados = new Set<number>();
  for (const par of pares) {
    if (herdeira.has(par.janela) || usados.has(par.midia)) continue;
    herdeira.set(par.janela, par.midia);
    usados.add(par.midia);
  }

  const janelas = input.planned.map((janela, j) => {
    const escolhida = herdeira.get(j);
    if (escolhida === undefined) return { ...janela } as Record<string, unknown>;
    const antiga = comMidia[escolhida];
    return {
      ...janela,
      src: antiga.src,
      ...(antiga.kind ? { kind: antiga.kind } : {}),
      // O enquadramento manual viaja junto: quem ajustou o pan da imagem nao
      // pode perder o ajuste porque o corte foi refeito.
      ...(antiga.transform ? { transform: antiga.transform } : {}),
    } as Record<string, unknown>;
  });

  // Midia que nao coube em janela nenhuma NAO SOME.
  const orfas = comMidia.filter((_, indice) => !usados.has(indice));
  const todas = [...janelas, ...orfas].sort((a, b) => (Number(a.start) || 0) - (Number(b.start) || 0));
  return preservar(todas, position, kind, limite, temLimite, fimDe);
}

// Layout do formulario + aparo pela duracao atual, aplicados na lista final.
function preservar(
  itens: readonly Record<string, unknown>[],
  position: 'top' | 'bottom',
  kind: 'image' | 'video' | null,
  limite: number,
  temLimite: boolean,
  fimDe: (item: Record<string, unknown>) => number,
): Record<string, unknown>[] {
  return itens.flatMap((item) => {
    const { kind: kindAnterior, ...resto } = item;
    const vazio = String(item.src ?? '').trim() === '';
    const kindFinal = vazio ? kind : (kindAnterior ?? null);
    const start = Number(resto.start);
    let end = fimDe(item);
    if (temLimite) {
      if (!(start < limite - MIN_BLOCO)) return [];
      end = Math.min(end, limite);
      if (!(end - start >= MIN_BLOCO)) return [];
    }
    return [{
      ...resto,
      end: round3(end),
      position,
      ...(kindFinal ? { kind: kindFinal } : {}),
    }];
  });
}

// Espaco minimo entre dois claroes. Sem isto, um corte limpo agressivo (o
// helper tira os silencios e as junccoes ficam a cada 1s) vira estrobo — e
// estrobo nao e estilo, e desconforto.
const FOLGA_FLASH = 1.2;

// Duracao do CHIP na timeline. O clarao em si dura 6 quadros e e desenhado
// pelo CustomGraphics a partir do `start`; este `end` existe so para o chip
// ter largura para o aluno clicar e apagar.
const CHIP_FLASH = 0.2;

/**
 * Os claroes de transicao: um em cada troca visual.
 *
 * As trocas sao de dois tipos e as duas contam — a juncao entre takes do corte
 * limpo (segments.json, que ja vem em fronteira de quadro) e a entrada de cada
 * tela dividida, que e uma mudanca de layout.
 */
export function planCutFlashes(input: {
  segments: readonly PlanSegment[];
  splits?: readonly { start: number }[];
  durationSec: number;
}): PlannedFlash[] {
  const durationSec = Number(input.durationSec);
  if (!Number.isFinite(durationSec) || durationSec <= 0) return [];

  const marcas = [
    // O primeiro segmento comeca em 0: nao ha troca ali, o video esta abrindo.
    ...input.segments.map((segment) => Number(segment.start)).filter((at) => at > 0.15),
    ...(input.splits ?? []).map((split) => Number(split.start)),
  ]
    .filter((at) => Number.isFinite(at) && at > 0.15 && at < durationSec - 0.3)
    .sort((a, b) => a - b);

  const flashes: PlannedFlash[] = [];
  let ultimo = -Infinity;
  for (const at of marcas) {
    if (at - ultimo < FOLGA_FLASH) continue;
    flashes.push({
      start: round3(at),
      end: round3(Math.min(at + CHIP_FLASH, durationSec)),
      kind: 'flash',
      label: 'Flash',
    });
    ultimo = at;
  }
  return flashes;
}
