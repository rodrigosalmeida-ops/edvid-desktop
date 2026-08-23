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

export type EditOperation =
  | { op: 'set-divider'; index: number; divider: number }
  | { op: 'move'; kind: OverlayKind; index: number; start: number }
  | { op: 'resize'; kind: OverlayKind; index: number; edge: 'start' | 'end'; time: number };

// Os mesmos limites do template (Main.tsx): fora deles a divisa colaria no
// topo ou no pe do quadro e o recorte do video degeneraria.
const DIVIDER_MIN = 0.15;
const DIVIDER_MAX = 0.85;
// Janela menor que isto nao da nem para o fade de entrada do proprio item.
const MIN_WINDOW = 0.2;

type Item = Record<string, unknown>;

const clamp = (value: number, low: number, high: number): number =>
  Math.max(low, Math.min(high, value));

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

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

export function applyEditOperations(
  data: Record<string, unknown>,
  operations: readonly EditOperation[],
): EditResult {
  let current = data;
  let changed = false;
  for (const operation of operations) {
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
