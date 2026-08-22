// Qual TRECHO do vídeo mudou desde o último render.
//
// Medido no projeto real do aluno (91s, 1080x1920): 8,4 quadros por segundo,
// mais 9,4s fixos de empacotamento. O vídeo inteiro leva ~5,6 min; um trecho
// de 3s leva ~20s. Quando ele pede uma animação num ponto específico, esperar
// cinco minutos para ver três segundos é o que dói.
//
// Aqui NÃO se decide substituir o render completo — ele continua acontecendo
// inteiro, do zero. Isto só descobre o que dá para mostrar antes.

export type PreviewPlan =
  | { kind: 'full' }
  | { kind: 'window'; start: number; end: number };

// Campos que valem para o VÍDEO INTEIRO. Mudou um deles, não existe trecho:
// trocar o estilo de legenda ou a cor de destaque muda todo quadro.
const GLOBAL_FIELDS = [
  'width', 'height', 'fps', 'durationSec', 'editType',
  'captions', 'camera', 'hook', 'soundtrack',
] as const;

// Listas cujos itens têm janela de tempo própria.
const WINDOWED_FIELDS = ['splits', 'inserts', 'behind', 'animations'] as const;

// Respiro em cada borda: a animação entra com fade e o quadro anterior já
// mostra o começo dela.
const PADDING_SECONDS = 0.5;
// Abaixo disto o trecho não paga o custo fixo de 9,4s; acima, não adianta.
const MIN_WINDOW = 0.5;
const MAX_SHARE = 0.4;

type Item = { start?: unknown; end?: unknown; dur?: unknown };

function windowOf(item: Item): { start: number; end: number } | null {
  const start = Number(item.start);
  if (!Number.isFinite(start)) return null;
  const end = Number.isFinite(Number(item.end))
    ? Number(item.end)
    : start + Number(item.dur ?? 0);
  return Number.isFinite(end) && end > start ? { start, end } : null;
}

function list(value: unknown): Item[] {
  return Array.isArray(value) ? (value as Item[]) : [];
}

// Itens que aparecem em um lado e não no outro, dos DOIS lados: um item
// apagado deixa um buraco que também precisa ser redesenhado.
function differing(previous: unknown, current: unknown): Item[] {
  const before = list(previous).map((item) => JSON.stringify(item));
  const after = list(current).map((item) => JSON.stringify(item));
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  return [
    ...list(previous).filter((_, index) => !afterSet.has(before[index])),
    ...list(current).filter((_, index) => !beforeSet.has(after[index])),
  ];
}

export function previewPlan(
  previous: Record<string, unknown> | null,
  current: Record<string, unknown>,
): PreviewPlan {
  // Primeiro render do projeto: não há o que comparar.
  if (!previous) return { kind: 'full' };

  // LISTA BRANCA, e não lista negra. Qualquer campo desconhecido — inclusive
  // um que o agente invente — força o render inteiro. Errar para o lado lento
  // custa tempo; errar para o lado rápido entrega um vídeo em que só um
  // pedaço mudou e o resto ficou velho, parecendo pronto.
  const conhecidos = new Set<string>([...GLOBAL_FIELDS, ...WINDOWED_FIELDS]);
  const chaves = new Set([...Object.keys(previous), ...Object.keys(current)]);
  for (const chave of chaves) {
    if (chave.startsWith('_')) continue;
    if (!conhecidos.has(chave)) {
      if (JSON.stringify(previous[chave]) !== JSON.stringify(current[chave])) {
        return { kind: 'full' };
      }
      continue;
    }
    if (GLOBAL_FIELDS.includes(chave as (typeof GLOBAL_FIELDS)[number])) {
      if (JSON.stringify(previous[chave]) !== JSON.stringify(current[chave])) {
        return { kind: 'full' };
      }
    }
  }

  const janelas: Array<{ start: number; end: number }> = [];
  for (const chave of WINDOWED_FIELDS) {
    for (const item of differing(previous[chave], current[chave])) {
      const janela = windowOf(item);
      // Item sem tempo legível: não dá para saber onde mudou.
      if (!janela) return { kind: 'full' };
      janelas.push(janela);
    }
  }
  if (!janelas.length) return { kind: 'full' };

  const duracao = Number(current.durationSec) || 0;
  const start = Math.max(0, Math.min(...janelas.map((j) => j.start)) - PADDING_SECONDS);
  const end = duracao > 0
    ? Math.min(duracao, Math.max(...janelas.map((j) => j.end)) + PADDING_SECONDS)
    : Math.max(...janelas.map((j) => j.end)) + PADDING_SECONDS;
  if (end - start < MIN_WINDOW) return { kind: 'full' };
  // Trecho grande demais: o render completo chega quase junto e a prévia só
  // atrasaria a fila.
  if (duracao > 0 && (end - start) / duracao > MAX_SHARE) return { kind: 'full' };
  return { kind: 'window', start, end };
}

// O intervalo em QUADROS, que é o que o render entende. O fim é inclusivo.
export function previewFrames(
  plan: Extract<PreviewPlan, { kind: 'window' }>,
  fps: number,
  totalFrames: number,
): { from: number; to: number } {
  const from = Math.max(0, Math.floor(plan.start * fps));
  const to = Math.min(Math.max(from, totalFrames - 1), Math.ceil(plan.end * fps));
  return { from, to };
}
