// MUTACOES do edit-data.json vindas da MANIPULACAO DIRETA (0.28.0): arrastar
// a divisa da tela dividida no palco, mover e redimensionar as janelas de
// imagem, clipe e animacao na timeline. Nada aqui renderiza — o aluno ajusta
// tudo ao vivo e o render acontece UMA vez, no fim.
//
// Modulo PURO de proposito, como generation-tier e image-format: cada arrasto
// vira uma operacao pequena e validada, e o que nao e valido nao chega ao
// disco. O agente continua sendo dono do arquivo; estas operacoes so mexem no
// numero que o mouse mexeu, e o writeEditData ja preserva o resto por spread.

export type OverlayKind = 'splits' | 'inserts' | 'behind' | 'animations';

export type ManualTransform = { x?: number; y?: number; scale?: number; rotation?: number };

export type EditOperation =
  | { op: 'set-divider'; index: number; divider: number }
  | { op: 'move'; kind: OverlayKind; index: number; start: number }
  | { op: 'resize'; kind: OverlayKind; index: number; edge: 'start' | 'end'; time: number }
  // O gizmo do palco: pan/zoom/giro do elemento selecionado. Parcial — so os
  // eixos que o mouse mexeu; os demais ficam como estavam.
  | { op: 'set-transform'; kind: 'splits' | 'inserts'; index: number; transform: ManualTransform }
  // O aluno apontou o arquivo de um espaco vazio (origem "nenhum"). O src e
  // RELATIVO a public/ e ja foi copiado para la por quem chama.
  | { op: 'set-split-src'; index: number; src: string; kind: 'image' | 'video'; fit?: 'cover' | 'contain' }
  // Recorte manual da midia pelas bordas do gizmo. Fracoes da caixa do
  // elemento (faixa ou cartao), parcial como o set-transform.
  | { op: 'set-crop'; kind: 'splits' | 'inserts'; index: number; crop: { left?: number; top?: number; right?: number; bottom?: number } }
  // LEGENDA e HEADLINE nao tem x/y livres: cada uma tem um motor de layout
  // proprio (a legenda se centra sozinha na divisa do split; a headline se
  // reparte em duas linhas e ajusta o corpo). Dar transform livre brigaria
  // com esses motores. O que o gizmo mexe sao os TUNAVEIS que o template ja
  // respeita: altura na tela e tamanho da fonte.
  | { op: 'set-caption-layout'; paddingBottom?: number; fontSize?: number }
  | { op: 'set-headline-layout'; paddingTop?: number; maxFontPx?: number }
  | { op: 'set-headline-text'; text: string }
  // TRIM das duas faixas de texto. Elas nao tem janela propria no arquivo por
  // padrao — a legenda vale o video inteiro e a headline sempre comecava no
  // quadro 0 —, entao o campo nasce aqui na primeira vez que o aluno arrasta
  // a ponta. O template le os dois como opcionais.
  | { op: 'set-caption-window'; start?: number; end?: number }
  | { op: 'set-headline-window'; start?: number; end?: number }
  // A TESOURA COM UM ELEMENTO SELECIONADO parte SO ele: uma midia vira duas
  // midias, cada uma com metade da janela e o mesmo arquivo. Sem selecao a
  // tesoura continua cortando a tomada, como sempre.
  | { op: 'split-at'; kind: OverlayKind; index: number; time: number }
  // Apagar o que foi selecionado. Legenda e headline nao somem do arquivo:
  // viram enabled:false, que e reversivel e o que o template entende.
  | { op: 'remove'; kind: OverlayKind; index: number }
  | { op: 'disable'; kind: 'captions' | 'hook' | 'soundtrack' };

// Os mesmos limites do template (Main.tsx): fora deles a divisa colaria no
// topo ou no pe do quadro e o recorte do video degeneraria.
const DIVIDER_MIN = 0.15;
const DIVIDER_MAX = 0.85;
// Limites do gizmo: alem de +-1 quadro de deslocamento o elemento ja sumiu;
// escala fora de [0.2, 5] e clique tremido, nao intencao.
const SHIFT_LIMIT = 1;
const SCALE_MIN = 0.2;
const SCALE_MAX = 5;
// Janela menor que isto nao da nem para o fade de entrada do proprio item.
const MIN_WINDOW = 0.2;

type Item = Record<string, unknown>;

const clamp = (value: number, low: number, high: number): number =>
  Math.max(low, Math.min(high, value));

// 9 casas, como o segments_for_remotion.py e pelo MESMO motivo: um tempo
// quantizado em quadro (121/30 = 4,0333333...) truncado em milissegundos vira
// 4,033 — 0,99 de um quadro — e a agulha (que anda em quadros) nunca mais
// coincide com a borda do chip. Visto em uso real com zoom na timeline.
const round3 = (value: number): number => Math.round(value * 1e9) / 1e9;

function listOf(data: Record<string, unknown>, kind: OverlayKind): Item[] | null {
  const value = data[kind];
  return Array.isArray(value) ? (value as Item[]) : null;
}

// behind usa {start, dur}; os outros usam {start, end}. A leitura e a escrita
// respeitam o formato do proprio item — converter mudaria um campo que o
// template e o agente leem.
function windowOf(item: Item): { start: number; end: number } | null {
  const start = Number(item.start);
  if (!Number.isFinite(start)) return null;
  const end = Number.isFinite(Number(item.end))
    ? Number(item.end)
    : start + Number(item.dur);
  return Number.isFinite(end) && end > start ? { start, end } : null;
}

function writeWindow(item: Item, start: number, end: number): Item {
  const next: Item = { ...item, start: round3(start) };
  if (Number.isFinite(Number(item.end)) || !Number.isFinite(Number(item.dur))) {
    next.end = round3(end);
  } else {
    next.dur = round3(end - start);
  }
  return next;
}

export type EditResult =
  | { ok: true; data: Record<string, unknown>; changed: boolean }
  | { ok: false; reason: string };

export function applyEditOperation(
  data: Record<string, unknown>,
  operation: EditOperation,
): EditResult {
  const durationSec = Number(data.durationSec) || 0;

  if (operation.op === 'set-divider') {
    const splits = listOf(data, 'splits');
    const item = splits?.[operation.index];
    if (!splits || !item) return { ok: false, reason: 'essa tela dividida não existe mais' };
    if (!Number.isFinite(operation.divider)) return { ok: false, reason: 'divisa ilegível' };
    const divider = round3(clamp(operation.divider, DIVIDER_MIN, DIVIDER_MAX));
    if (Number(item.divider ?? NaN) === divider) return { ok: true, data, changed: false };
    const next = [...splits];
    next[operation.index] = { ...item, divider };
    return { ok: true, data: { ...data, splits: next }, changed: true };
  }

  if (operation.op === 'set-split-src') {
    const splits = listOf(data, 'splits');
    const item = splits?.[operation.index];
    if (!splits || !item) return { ok: false, reason: 'essa tela dividida não existe mais' };
    const src = String(operation.src ?? '').trim();
    // Relativo a public/, sempre: absoluto ou ../ apontaria para fora do
    // projeto e o render nao encontraria (ou encontraria o que nao devia).
    if (!src || src.startsWith('/') || src.includes('..') || /^[a-z]+:/iu.test(src)) {
      return { ok: false, reason: 'arquivo fora da pasta do projeto' };
    }
    if (item.src === src && item.kind === operation.kind && (operation.fit === undefined || item.fit === operation.fit)) {
      return { ok: true, data, changed: false };
    }
    const next = [...splits];
    // Midia NOVA zera o recorte da anterior: o crop pertence ao arquivo que o
    // aluno recortou, nao ao espaco.
    const { crop: _cropAnterior, ...resto } = item;
    next[operation.index] = {
      ...resto,
      src,
      kind: operation.kind,
      ...(operation.fit ? { fit: operation.fit } : {}),
    };
    return { ok: true, data: { ...data, splits: next }, changed: true };
  }

  if (operation.op === 'set-crop') {
    const items = listOf(data, operation.kind);
    const item = items?.[operation.index];
    if (!items || !item) return { ok: false, reason: 'esse item não existe mais' };
    const before = (item.crop ?? {}) as Record<string, number>;
    const next: Record<string, number> = { ...before };
    for (const lado of ['left', 'top', 'right', 'bottom'] as const) {
      const valor = operation.crop[lado];
      if (valor === undefined) continue;
      if (!Number.isFinite(valor)) return { ok: false, reason: 'recorte ilegível' };
      next[lado] = round3(clamp(valor, 0, 0.9));
    }
    // Os dois lados do mesmo eixo nao podem se cruzar: sobraria midia
    // negativa e o clip-path desenharia nada — pior que recusar.
    if ((next.left ?? 0) + (next.right ?? 0) > 0.85 || (next.top ?? 0) + (next.bottom ?? 0) > 0.85) {
      return { ok: false, reason: 'o recorte comeria a mídia inteira' };
    }
    const iguais = (['left', 'top', 'right', 'bottom'] as const).every(
      (lado) => (next[lado] ?? 0) === (Number(before[lado]) || 0),
    );
    if (iguais) return { ok: true, data, changed: false };
    const lista = [...items];
    lista[operation.index] = { ...item, crop: next };
    return { ok: true, data: { ...data, [operation.kind]: lista }, changed: true };
  }

  if (operation.op === 'split-at') {
    const items = listOf(data, operation.kind);
    const item = items?.[operation.index];
    if (!items || !item) return { ok: false, reason: 'esse item não existe mais' };
    const window = windowOf(item);
    if (!window) return { ok: false, reason: 'esse item não tem janela de tempo' };
    const time = Number(operation.time);
    if (!Number.isFinite(time)) return { ok: false, reason: 'posição ilegível' };
    // As DUAS metades precisam sobreviver: cortar a 1 quadro da ponta deixaria
    // um item que nem chega a aparecer e que o aluno teria de cacar para
    // apagar. Fora da janela, a tesoura simplesmente nao corta este item.
    if (time - window.start < MIN_WINDOW || window.end - time < MIN_WINDOW) {
      return { ok: false, reason: 'a agulha está fora deste elemento' };
    }
    const next = [...items];
    next.splice(
      operation.index,
      1,
      writeWindow(item, window.start, time),
      writeWindow(item, time, window.end),
    );
    return { ok: true, data: { ...data, [operation.kind]: next }, changed: true };
  }

  if (operation.op === 'set-caption-window' || operation.op === 'set-headline-window') {
    const campo = operation.op === 'set-caption-window' ? 'captions' : 'hook';
    const before = (data[campo] ?? {}) as Item;
    const inicioAtual = Number(before.startSec);
    const fimAtual = Number(before.endSec);
    const inicio = operation.start === undefined
      ? (Number.isFinite(inicioAtual) ? inicioAtual : 0)
      : Number(operation.start);
    const fim = operation.end === undefined
      ? (Number.isFinite(fimAtual) ? fimAtual : durationSec)
      : Number(operation.end);
    if (!Number.isFinite(inicio) || !Number.isFinite(fim)) {
      return { ok: false, reason: 'janela ilegível' };
    }
    const start = clamp(inicio, 0, Math.max(0, (durationSec || fim) - MIN_WINDOW));
    const end = clamp(fim, start + MIN_WINDOW, durationSec || fim);
    if (end - start < MIN_WINDOW) return { ok: false, reason: 'janela curta demais' };
    if (Number(before.startSec ?? 0) === round3(start) && Number(before.endSec ?? NaN) === round3(end)) {
      return { ok: true, data, changed: false };
    }
    return {
      ok: true,
      data: { ...data, [campo]: { ...before, startSec: round3(start), endSec: round3(end) } },
      changed: true,
    };
  }

  if (operation.op === 'set-transform') {
    const items = listOf(data, operation.kind);
    const item = items?.[operation.index];
    if (!items || !item) return { ok: false, reason: 'esse item não existe mais' };
    const before = (item.transform ?? {}) as ManualTransform;
    const next: ManualTransform = { ...before };
    const patch = operation.transform;
    if (patch.x !== undefined) {
      if (!Number.isFinite(patch.x)) return { ok: false, reason: 'deslocamento ilegível' };
      next.x = round3(clamp(patch.x, -SHIFT_LIMIT, SHIFT_LIMIT));
    }
    if (patch.y !== undefined) {
      if (!Number.isFinite(patch.y)) return { ok: false, reason: 'deslocamento ilegível' };
      next.y = round3(clamp(patch.y, -SHIFT_LIMIT, SHIFT_LIMIT));
    }
    if (patch.scale !== undefined) {
      if (!Number.isFinite(patch.scale)) return { ok: false, reason: 'escala ilegível' };
      next.scale = round3(clamp(patch.scale, SCALE_MIN, SCALE_MAX));
    }
    if (patch.rotation !== undefined) {
      if (!Number.isFinite(patch.rotation)) return { ok: false, reason: 'rotação ilegível' };
      // Normaliza para (-180, 180]: 370 e 10 sao o MESMO giro, e gravar 370
      // faria o proximo arrasto partir de um numero que ninguem entende.
      let degrees = patch.rotation % 360;
      if (degrees > 180) degrees -= 360;
      if (degrees <= -180) degrees += 360;
      next.rotation = round3(degrees);
    }
    // Identidade limpa o campo: edit-data sem lixo e o render identico ao de
    // antes do gizmo existir (paridade byte a byte).
    const isIdentity = !next.x && !next.y && (next.scale === undefined || next.scale === 1) && !next.rotation;
    if (JSON.stringify(before) === JSON.stringify(next) || (isIdentity && item.transform === undefined)) {
      return { ok: true, data, changed: false };
    }
    const list = [...items];
    if (isIdentity) {
      const { transform: _removed, ...rest } = item;
      list[operation.index] = rest;
    } else {
      list[operation.index] = { ...item, transform: next };
    }
    return { ok: true, data: { ...data, [operation.kind]: list }, changed: true };
  }

  if (operation.op === 'set-caption-layout' || operation.op === 'set-headline-layout') {
    const chave = operation.op === 'set-caption-layout' ? 'captions' : 'hook';
    const antes = (data[chave] ?? {}) as Record<string, unknown>;
    const depois = { ...antes };
    // Limites em FRACAO da altura: o texto nunca sai do quadro nem encosta
    // na borda onde a interface das redes cobre.
    const altura = Number(data.height) || 1920;
    if (operation.op === 'set-caption-layout') {
      if (operation.paddingBottom !== undefined) {
        if (!Number.isFinite(operation.paddingBottom)) return { ok: false, reason: 'posição ilegível' };
        depois.paddingBottom = Math.round(clamp(operation.paddingBottom, altura * 0.03, altura * 0.85));
      }
      if (operation.fontSize !== undefined) {
        if (!Number.isFinite(operation.fontSize)) return { ok: false, reason: 'tamanho ilegível' };
        depois.fontSize = Math.round(clamp(operation.fontSize, 18, 160));
      }
    } else {
      if (operation.paddingTop !== undefined) {
        if (!Number.isFinite(operation.paddingTop)) return { ok: false, reason: 'posição ilegível' };
        depois.paddingTop = Math.round(clamp(operation.paddingTop, altura * 0.02, altura * 0.8));
      }
      if (operation.maxFontPx !== undefined) {
        if (!Number.isFinite(operation.maxFontPx)) return { ok: false, reason: 'tamanho ilegível' };
        // O template trata isto como TETO do auto-ajuste, nunca tamanho fixo:
        // fixo faz a linha quebrar em tres e desmonta a headline.
        depois.maxFontPx = Math.round(clamp(operation.maxFontPx, 20, 120));
        delete depois.fontSizePx;
      }
    }
    if (JSON.stringify(antes) === JSON.stringify(depois)) return { ok: true, data, changed: false };
    return { ok: true, data: { ...data, [chave]: depois }, changed: true };
  }

  if (operation.op === 'set-headline-text') {
    const antes = (data.hook ?? {}) as Record<string, unknown>;
    const texto = String(operation.text ?? '').replace(/\s+/gu, ' ').trim().slice(0, 160);
    if (antes.text === texto) return { ok: true, data, changed: false };
    // `text` vence `lines` no template; limpar lines evita duas verdades.
    return { ok: true, data: { ...data, hook: { ...antes, text: texto, lines: [] } }, changed: true };
  }

  if (operation.op === 'disable') {
    const antes = (data[operation.kind] ?? {}) as Record<string, unknown>;
    if (antes.enabled === false) return { ok: true, data, changed: false };
    return { ok: true, data: { ...data, [operation.kind]: { ...antes, enabled: false } }, changed: true };
  }

  if (operation.op === 'remove') {
    const items = listOf(data, operation.kind);
    if (!items || !items[operation.index]) return { ok: false, reason: 'esse item não existe mais' };
    const next = items.filter((_, index) => index !== operation.index);
    return { ok: true, data: { ...data, [operation.kind]: next }, changed: true };
  }

  const items = listOf(data, operation.kind);
  const item = items?.[operation.index];
  if (!items || !item) return { ok: false, reason: 'esse item não existe mais' };
  const window = windowOf(item);
  if (!window) return { ok: false, reason: 'esse item não tem janela de tempo legível' };
  if (!Number.isFinite(operation.op === 'move' ? operation.start : operation.time)) {
    return { ok: false, reason: 'tempo ilegível' };
  }

  let start = window.start;
  let end = window.end;
  if (operation.op === 'move') {
    // Mover PRESERVA a duracao: e o que todo editor faz, e e o que impede um
    // arrasto de encolher a janela sem o aluno pedir.
    const length = end - start;
    start = clamp(operation.start, 0, Math.max(0, (durationSec || operation.start + length) - length));
    end = start + length;
  } else if (operation.edge === 'start') {
    start = clamp(operation.time, 0, end - MIN_WINDOW);
  } else {
    const ceiling = durationSec > 0 ? durationSec : operation.time;
    end = clamp(operation.time, start + MIN_WINDOW, ceiling);
  }

  if (round3(start) === round3(window.start) && round3(end) === round3(window.end)) {
    return { ok: true, data, changed: false };
  }
  const next = [...items];
  next[operation.index] = writeWindow(item, start, end);
  return { ok: true, data: { ...data, [operation.kind]: next }, changed: true };
}

// TODO MOVIMENTO CAI EM QUADRO.
//
// A timeline media em segundos fracionarios (a fracao horizontal do mouse na
// pista), e o template converte para quadro com Math.round: um corte em
// 3,4831s e um corte em 3,4667s desenham o MESMO quadro, mas gravam numeros
// diferentes no arquivo e a ponta do elemento nunca encosta de verdade na do
// vizinho. Arredondar aqui, na camada que grava, faz o que o aluno ve na
// timeline ser exatamente o que o render desenha.
function paraQuadro(time: number, fps: number): number {
  return Math.round(time * fps) / fps;
}

function emQuadros(operation: EditOperation, fps: number): EditOperation {
  if (!Number.isFinite(fps) || fps <= 0) return operation;
  const q = (value: number) => paraQuadro(value, fps);
  switch (operation.op) {
    case 'move':
      return { ...operation, start: q(operation.start) };
    case 'resize':
      return { ...operation, time: q(operation.time) };
    case 'split-at':
      return { ...operation, time: q(operation.time) };
    case 'set-caption-window':
    case 'set-headline-window':
      return {
        ...operation,
        ...(operation.start === undefined ? {} : { start: q(operation.start) }),
        ...(operation.end === undefined ? {} : { end: q(operation.end) }),
      };
    default:
      return operation;
  }
}

export function applyEditOperations(
  data: Record<string, unknown>,
  operations: readonly EditOperation[],
  options?: { fps?: number },
): EditResult {
  let current = data;
  let changed = false;
  const fps = Number(options?.fps ?? current.fps);
  for (const bruta of operations) {
    const operation = emQuadros(bruta, fps);
    const result = applyEditOperation(current, operation);
    if (!result.ok) return result;
    current = result.data;
    changed = changed || result.changed;
  }
  return { ok: true, data: current, changed };
}

// A tela dividida ativa num INSTANTE, para o palco saber onde desenhar a
// alca da divisa. Mesma janela (+VIDEO_LAG desprezado: um quadro nao muda
// onde a mao pega).
export function activeSplitIndexAt(
  data: Record<string, unknown>,
  seconds: number,
): number {
  const splits = listOf(data, 'splits') ?? [];
  return splits.findIndex((item) => {
    const window = windowOf(item);
    return window !== null && seconds >= window.start && seconds < window.end;
  });
}
