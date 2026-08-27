// CORTE VIRTUAL (0.38.0) — a edição inteira acontece AO VIVO.
//
// Antes, qualquer corte pendente na timeline derrubava a prévia ao vivo para
// o preview mapeado (sem zoom, sem legenda, sem elementos) até o aluno
// renderizar — "perco a capacidade de fazer ajustes e marcações" foi o
// relato. A composição lê o cut.mp4 do disco e não sabia mostrar um corte
// que ainda não aconteceu.
//
// Este módulo ensina: os cortes pendentes viram JANELAS sobre o cut.mp4
// atual (tempo novo → fatia do arquivo), e TODOS os dados que a composição
// consome (legendas, segmentos, splits, inserts, animações, zooms, rastreio
// dos olhos) são remapeados para o tempo novo. O template só precisa tocar o
// vídeo-base em fatias (baseWindows); o corte físico com ffmpeg continua
// acontecendo uma vez só — no Renderizar, em Salvar e aplicar ou ao aplicar
// correções.
//
// LIMITE HONESTO: só dá para virtualizar REMOÇÃO (tesoura, excluir, encolher
// trim) — conteúdo que o aluno PUXOU de volta da fonte não existe no cut.mp4
// e não tem de onde sair. Nesses casos virtualWindows devolve null e o
// preview mapeado por fontes continua sendo o caminho, como sempre foi.

export type VirtualWindow = {
  // Onde a janela começa no tempo NOVO (o da timeline em edição).
  from: number;
  // Onde a fatia começa no cut.mp4 atual.
  srcStart: number;
  dur: number;
};

const EPS = 1e-4;

const round9 = (value: number): number => Math.round(value * 1e9) / 1e9;

// Quantiza na grade de quadros com 9 casas — a mesma régua do relógio único.
const grade = (value: number, fps: number): number => round9(Math.round(value * fps) / fps);

export function virtualWindows(input: {
  // Os trechos PENDENTES da timeline (edlRangesFromModel): tempo de FONTE.
  pending: ReadonlyArray<{ sourceId: string; start: number; end: number }>;
  // O EDL APLICADO (o que o cut.mp4 contém hoje): tempo de fonte, na ordem.
  applied: ReadonlyArray<{ source: string; start: number; end: number }>;
  fps: number;
}): VirtualWindow[] | null {
  const { fps } = input;
  if (!input.pending.length || !input.applied.length || !(fps > 0)) return null;
  // Posição de cada trecho aplicado DENTRO do cut atual.
  let cursor = 0;
  const applied = input.applied.map((range) => {
    const item = { ...range, cutStart: cursor };
    cursor += range.end - range.start;
    return item;
  });
  const meiaGrade = 0.5 / fps + EPS;
  const windows: VirtualWindow[] = [];
  let from = 0;
  for (const range of input.pending) {
    // O trecho pendente precisa caber INTEIRO dentro de um trecho aplicado da
    // mesma fonte: é o que garante que o conteúdo existe no cut.mp4.
    const host = applied.find((item) =>
      item.source === range.sourceId
      && range.start >= item.start - meiaGrade
      && range.end <= item.end + meiaGrade);
    if (!host) return null;
    const srcStart = grade(host.cutStart + (range.start - host.start), fps);
    const dur = grade(range.end - range.start, fps);
    if (dur <= 0) continue;
    const anterior = windows[windows.length - 1];
    // Fatias contíguas no arquivo viram UMA janela: uma tesoura sem remoção
    // não pode virar duas Sequences (e uma emenda visual) à toa.
    if (anterior && Math.abs(anterior.srcStart + anterior.dur - srcStart) < meiaGrade) {
      anterior.dur = round9(anterior.dur + dur);
    } else {
      windows.push({ from: grade(from, fps), srcStart, dur });
    }
    from += dur;
  }
  return windows.length ? windows : null;
}

// tempo VELHO (do cut atual) → tempo NOVO. null = o instante foi removido.
export function mapOldTime(windows: readonly VirtualWindow[], time: number): number | null {
  for (const window of windows) {
    if (time >= window.srcStart - EPS && time < window.srcStart + window.dur - EPS) {
      return round9(window.from + (time - window.srcStart));
    }
  }
  return null;
}

// Janela VELHA [start, end) → pedaços NOVOS (um por fatia que ela atravessa).
export function mapOldWindow(
  windows: readonly VirtualWindow[],
  start: number,
  end: number,
): Array<{ start: number; end: number }> {
  const pieces: Array<{ start: number; end: number }> = [];
  for (const window of windows) {
    const a = Math.max(start, window.srcStart);
    const b = Math.min(end, window.srcStart + window.dur);
    if (b - a <= EPS) continue;
    pieces.push({
      start: round9(window.from + (a - window.srcStart)),
      end: round9(window.from + (b - window.srcStart)),
    });
  }
  return pieces;
}

type Janela = Record<string, unknown>;

// Elemento com janela (start/end ou start/dur) vira 0..N elementos novos —
// um por pedaço que sobreviveu ao corte.
function remapItens(itens: unknown, windows: readonly VirtualWindow[]): Janela[] {
  if (!Array.isArray(itens)) return [];
  const saida: Janela[] = [];
  for (const entry of itens) {
    const item = entry as Janela;
    const start = Number(item.start);
    const end = Number.isFinite(Number(item.end)) ? Number(item.end) : start + Number(item.dur);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    for (const piece of mapOldWindow(windows, start, end)) {
      const novo: Janela = { ...item, start: piece.start, end: piece.end };
      if ('dur' in novo) novo.dur = round9(piece.end - piece.start);
      saida.push(novo);
    }
  }
  return saida;
}

// Remapeia TUDO que a composição consome para o tempo novo. `data` é o
// LivePreviewData cru; a saída tem a mesma forma, mais editData.baseWindows —
// a única coisa nova que o template precisa entender.
export function remapLiveData<T extends {
  editData: Record<string, unknown>;
  captions: unknown;
  segments: unknown;
  track: unknown;
}>(data: T, windows: readonly VirtualWindow[]): T {
  const segmentsIn = (data.segments ?? null) as { segments?: Array<{ start: number; dur: number }> } | null;
  const trackIn = (data.track ?? null) as { points?: unknown[] } | null;
  const fps = Number(data.editData.fps) || 30;
  const durationSec = round9(windows.reduce((total, window) => total + window.dur, 0));

  // Legendas: palavra sobrevive se o intervalo dela cruza alguma janela.
  const captions = Array.isArray(data.captions)
    ? (data.captions as Array<{ text?: unknown; startMs?: number; endMs?: number }>).flatMap((word) => {
      const pieces = mapOldWindow(windows, Number(word.startMs) / 1000, Number(word.endMs) / 1000);
      if (!pieces.length) return [];
      return [{ ...word, startMs: Math.round(pieces[0].start * 1000), endMs: Math.round(pieces[0].end * 1000) }];
    })
    : data.captions;

  // Segmentos (zoom por cena): as fronteiras novas são o começo de cada
  // janela + toda junção velha que caiu dentro de uma janela.
  const velhos = segmentsIn?.segments ?? [];
  const juncoesVelhas = velhos.map((segment) => Number(segment.start));
  const startsNovos = new Set<number>();
  for (const window of windows) {
    startsNovos.add(window.from);
    for (const juncao of juncoesVelhas) {
      const mapped = mapOldTime(windows, juncao);
      if (mapped !== null && mapped > window.from - EPS && mapped < window.from + window.dur) startsNovos.add(grade(mapped, fps));
    }
  }
  const ordenados = [...startsNovos].sort((a, b) => a - b).filter((value) => value < durationSec - EPS);
  const segmentosNovos = ordenados.map((start, index) => ({
    start: round9(start),
    dur: round9((index + 1 < ordenados.length ? ordenados[index + 1] : durationSec) - start),
  }));

  // O zoom de cada cena NOVA herda o da cena VELHA que contém o conteúdo:
  // excluir uma cena não pode re-sortear o zoom das outras.
  const zoomsVelhos = ((data.editData.camera as Janela | undefined)?.zooms ?? []) as number[];
  const zoomsNovos = segmentosNovos.map((segment) => {
    // meia grade para dentro: o início da cena nova, em tempo velho.
    const window = windows.find((item) => segment.start >= item.from - EPS && segment.start < item.from + item.dur - EPS);
    const velhoTempo = window ? window.srcStart + (segment.start - window.from) : 0;
    let idx = 0;
    for (let i = 0; i < juncoesVelhas.length; i += 1) {
      if (velhoTempo + 0.5 / fps >= juncoesVelhas[i]) idx = i;
    }
    return zoomsVelhos.length ? (zoomsVelhos[idx % zoomsVelhos.length] ?? 1) : 1;
  });

  // Rastreio dos olhos: fatia e emenda por janela, quadro a quadro.
  const pontosVelhos = (trackIn?.points ?? []) as Array<[number, number]>;
  const pontosNovos: Array<[number, number]> = [];
  if (pontosVelhos.length) {
    for (const window of windows) {
      const de = Math.round(window.srcStart * fps);
      const ate = de + Math.max(1, Math.round(window.dur * fps));
      for (let i = de; i < ate; i += 1) {
        pontosNovos.push(pontosVelhos[Math.min(i, pontosVelhos.length - 1)] ?? [0.5, 0.4]);
      }
    }
  }

  const hook = (data.editData.hook ?? {}) as Janela;
  const hookPieces = mapOldWindow(windows, Number(hook.startSec) || 0, Number(hook.endSec) || 0);
  const captionsCfg = (data.editData.captions ?? {}) as Janela;
  const capWindow = mapOldWindow(
    windows,
    Number(captionsCfg.startSec) || 0,
    Number.isFinite(Number(captionsCfg.endSec)) ? Number(captionsCfg.endSec) : durationSec + 1,
  );

  const editData: Record<string, unknown> = {
    ...data.editData,
    durationSec,
    splits: remapItens(data.editData.splits, windows),
    inserts: remapItens(data.editData.inserts, windows),
    animations: remapItens(data.editData.animations, windows),
    behind: remapItens(data.editData.behind, windows),
    hook: {
      ...hook,
      // A headline não se parte: fica o primeiro pedaço que sobreviveu.
      enabled: Boolean(hook.enabled) && hookPieces.length > 0,
      startSec: hookPieces[0]?.start ?? 0,
      endSec: hookPieces[0]?.end ?? 0,
    },
    captions: {
      ...captionsCfg,
      ...(capWindow.length
        ? { startSec: capWindow[0].start, endSec: capWindow[capWindow.length - 1].end }
        : { enabled: false }),
      windows: remapItens(captionsCfg.windows, windows).map((item) => ({
        start: item.start, end: item.end, paddingBottom: item.paddingBottom,
      })),
    },
    camera: { ...((data.editData.camera ?? {}) as Janela), zooms: zoomsNovos },
    baseWindows: windows.map((window) => ({ ...window })),
  };

  return {
    ...data,
    editData,
    captions,
    segments: { segments: segmentosNovos },
    track: pontosNovos.length ? { ...(trackIn ?? {}), points: pontosNovos } : data.track,
  } as T;
}
