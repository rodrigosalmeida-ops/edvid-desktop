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

export type PlanWord = { text: string; startMs: number; endMs: number };
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

type Phrase = { start: number; end: number };

// Silencio que separa uma frase da seguinte. Medido na transcricao do corte
// limpo: dentro de uma frase falada as palavras encostam uma na outra (menos
// de 0,2s), e a respirada entre frases passa de 0,4s. Cortar a tela dividida
// no meio de uma frase e o que faz a troca parecer erro de render.
const PAUSA_FRASE = 0.42;

// Tamanho das janelas de tela dividida.
//
// ALVO e o que o olho aguenta olhar uma imagem parada sem cansar. Abaixo de
// MIN a imagem mal entra (o fade do template sozinho leva 7 quadros de cada
// lado) e acima de MAX vira slideshow em vez de reel.
const ALVO_JANELA = 5;
const MIN_JANELA = 2.4;
const MAX_JANELA = 8;

// Respiro entre uma janela e a proxima: o apresentador precisa voltar a tela
// cheia tempo suficiente para o corte ler como intencao, nao como piscada.
const FOLGA_ENTRE_JANELAS = 3;

// Quantas janelas para cada duracao. Uma a cada 18s, entre 2 e 6.
//
// Este numero e mais conservador que o do zoom (uma a cada 12s) de proposito:
// zoom e de graca e cada janela destas pode virar um clipe gerado, que custa
// credito do plano do aluno. Errar para menos ele resolve apagando um espaco;
// errar para mais custa dinheiro.
export function splitCount(durationSec: number): number {
  return Math.max(2, Math.min(6, Math.round(durationSec / 18)));
}

// As palavras viram frases pelo silencio entre elas.
export function phrasesFrom(words: readonly PlanWord[], pausa = PAUSA_FRASE): Phrase[] {
  const phrases: Phrase[] = [];
  for (const word of words) {
    const start = Number(word.startMs) / 1000;
    const end = Number(word.endMs) / 1000;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const last = phrases[phrases.length - 1];
    // A frase tambem quebra quando fica longa demais: uma fala corrida de 20s
    // sem respirada daria uma frase unica e o plano inteiro caberia nela.
    if (last && start - last.end < pausa && end - last.start <= MAX_JANELA) {
      last.end = end;
      continue;
    }
    phrases.push({ start, end });
  }
  return phrases;
}

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

/**
 * As janelas de tela dividida, tiradas da propria fala.
 *
 * O desenho e por FATIAS e nao guloso do inicio para o fim: o span elegivel e
 * dividido em partes iguais e cada janela nasce na frase mais proxima do
 * centro da sua parte. Guloso agrupava tudo nos primeiros 20s e o resto do
 * video ficava sem nada — foi o primeiro rascunho e o defeito era visivel na
 * timeline antes mesmo de renderizar.
 */
export function planSplits(input: {
  captions: readonly PlanWord[];
  durationSec: number;
  // A headline ocupa o alto do quadro no comeco; dividir a tela por baixo dela
  // empilha dois elementos fortes na mesma respirada.
  hookEndSec: number;
  position: 'top' | 'bottom';
  kind?: 'image' | 'video';
}): PlannedSplit[] {
  const durationSec = Number(input.durationSec);
  if (!Number.isFinite(durationSec) || durationSec <= 0) return [];

  const hook = Number.isFinite(Number(input.hookEndSec)) ? Math.max(0, Number(input.hookEndSec)) : 0;
  const inicio = hook > 0 ? hook + 0.6 : 0.8;
  // Nao dividir a tela em cima do fim: o ultimo segundo e onde o aluno assina
  // ou chama a acao, e a divisa entrando ali corta a frase final ao meio.
  const fim = durationSec - 1;
  if (fim - inicio < MIN_JANELA) return [];

  const alvo = splitCount(durationSec);
  const span = fim - inicio;

  // A JANELA E O RESPIRO SE ENCOLHEM QUANDO O VIDEO E CURTO.
  //
  // Com os valores fixos (5s de janela + 3s de respiro) um reel de 14s com
  // headline de 4s so tinha 8,4s uteis: a primeira janela comia 5, o respiro
  // comia 3, e a segunda nao cabia. Saia UMA janela, jogada na segunda metade
  // — foi exatamente o que apareceu no uso real. Os valores continuam sendo
  // teto: em video longo nada muda.
  const folga = Math.min(FOLGA_ENTRE_JANELAS, span * 0.15);
  const janelaAlvo = Math.max(
    MIN_JANELA,
    Math.min(ALVO_JANELA, (span - (alvo - 1) * folga) / alvo),
  );

  const phrases = phrasesFrom(input.captions).filter((p) => p.end > inicio && p.start < fim);
  const janelas: PlannedSplit[] = [];
  let ultimoFim = -Infinity;

  for (let k = 0; k < alvo; k += 1) {
    // A janela fica CENTRADA na sua fatia, nao colada no comeco dela: com a
    // semente no comeco, um video de 60s punha as tres janelas em 4,8s, 24,6s
    // e 42,2s e deixava os ultimos 14s sem nada.
    const fatia = span / alvo;
    const fatiaInicio = inicio + fatia * k + Math.max(0, (fatia - janelaAlvo) / 2);
    const piso = Math.max(inicio, fatiaInicio, ultimoFim + folga);
    if (fim - piso < MIN_JANELA) break;

    let start: number;
    let end: number;

    if (phrases.length) {
      // Semente: a PRIMEIRA frase que comeca depois do piso.
      //
      // Era "a frase cujo meio esta mais perto do centro da fatia", e num reel
      // de 14s isso empurrava a primeira janela quase 2s para a direita — o
      // suficiente para a segunda nao caber mais. O piso ja carrega a fatia e
      // o respiro, entao pegar a primeira depois dele posiciona igual em video
      // longo e deixa de roubar espaco em video curto.
      const semente = phrases.findIndex((p) => p.start >= piso);
      if (semente < 0) break;
      start = phrases[semente].start;
      end = phrases[semente].end;
      // Cresce pelas frases seguintes, sempre parando em fronteira de frase —
      // nunca no meio de uma palavra. E nao PASSA do alvo: deixar uma frase
      // longa estourar a janela era o outro lado do mesmo defeito, porque ela
      // comia o respiro da janela seguinte. Estourar so vale para escapar do
      // minimo.
      for (let i = semente + 1; i < phrases.length; i += 1) {
        const candidato = phrases[i].end;
        if (candidato > fim || candidato - start > MAX_JANELA) break;
        if (candidato - start > janelaAlvo && end - start >= MIN_JANELA) break;
        end = candidato;
        if (end - start >= janelaAlvo) break;
      }
    } else {
      // Sem transcricao (video sem fala, ou a legenda falhou) o plano ainda
      // existe: fatias iguais. B-roll sobre silencio e um pedido legitimo.
      start = piso;
      end = start + janelaAlvo;
    }

    end = Math.min(end, fim, start + MAX_JANELA);
    if (end - start < MIN_JANELA) continue;

    janelas.push({
      ...(input.kind ? { kind: input.kind } : {}),
      src: '',
      start: round3(start),
      end: round3(end),
      position: input.position,
    });
    ultimoFim = end;
  }

  return janelas;
}

/**
 * O plano encontra o que JA EXISTE no projeto.
 *
 * Reaplicar estilos nao pode apagar trabalho — o aluno pode ja ter apontado
 * arquivos nos espacos, ou o agente pode ter preenchido tudo. Mas tambem nao
 * pode ignorar o formulario: trocar "Tela dividida" por "Tela dividida 2" tem
 * de virar a montagem inteira, e nao so as janelas novas.
 *
 * O acordo: as JANELAS existentes mandam no tempo, o FORMULARIO manda no
 * layout, e o `kind` so segue o formulario enquanto o espaco esta vazio —
 * depois que ha arquivo, quem manda e o arquivo.
 */
export function applySplitPlan(input: {
  edit: 'limpa' | 'split' | 'split2';
  splitMedia?: 'imagem' | 'video' | 'nenhum';
  previous: readonly Record<string, unknown>[];
  planned: readonly PlannedSplit[];
  // Duracao do corte ATUAL. As janelas guardadas podem ser de um corte mais
  // longo (o aluno refez o corte limpo e voltou aos estilos): sem isto elas
  // ficariam depois do fim do video — invisiveis no palco e com o chip
  // estourando a timeline.
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

  const base = input.previous.length ? input.previous : (input.planned as unknown as Record<string, unknown>[]);
  const limite = Number(input.durationSec);
  const temLimite = Number.isFinite(limite) && limite > 0;
  return base.flatMap((item) => {
    const { kind: kindAnterior, ...resto } = item;
    const vazio = String(item.src ?? '').trim() === '';
    const kindFinal = vazio ? kind : (kindAnterior ?? null);
    const start = Number(resto.start);
    let end = Number(resto.end);
    if (temLimite) {
      if (!(start < limite - MIN_JANELA)) return [];
      end = Math.min(end, limite);
      if (!(end - start >= MIN_JANELA)) return [];
    }
    return [{
      ...resto,
      ...(temLimite ? { end: round3(end) } : {}),
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
