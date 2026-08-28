// Camadas de estilo do EDIT AI: cada aplicacao so pode sobrescrever os campos
// que pertencem a camada escolhida. Isso evita que, por exemplo, aplicar uma
// headline apague uma tela dividida que ja estava montada no edit-data.

export const STYLE_LAYERS = ['edicao', 'efeitos', 'texto', 'legendas'] as const;
export type StyleLayer = (typeof STYLE_LAYERS)[number];

export const STYLE_KEY_OWNER: Readonly<Record<string, StyleLayer>> = {
  editType: 'edicao',
  splits: 'edicao',
  camera: 'efeitos',
  animations: 'efeitos',
  soundtrack: 'efeitos',
  hook: 'texto',
  captions: 'legendas',
};

const ACCENT_LAYERS: readonly StyleLayer[] = ['texto', 'legendas'];

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const finitePositive = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

function normalizeTimelineWindows(
  document: Record<string, unknown>,
  layers: readonly StyleLayer[],
): void {
  const durationSec = finitePositive(document.durationSec);
  if (!durationSec) return;
  const roundedDuration = Number(durationSec.toFixed(3));

  // Aplicar a camada de legendas e uma nova afirmacao sobre a camada. O
  // comportamento padrao e acompanhar o corte atual inteiro; herdar start/end
  // de um corte anterior faz a legenda morrer antes do fim do video.
  if (layers.includes('legendas') && isObject(document.captions)) {
    document.captions = {
      ...document.captions,
      startSec: 0,
      endSec: roundedDuration,
    };
  }

  // Qualquer janela herdada que ultrapasse a duracao atual e invalida depois
  // de um novo corte. Aparar aqui protege tanto legenda quanto headline sem
  // interferir em trims manuais que continuam dentro do video.
  for (const key of ['captions', 'hook'] as const) {
    const block = document[key];
    if (!isObject(block)) continue;
    const endSec = Number(block.endSec);
    if (Number.isFinite(endSec) && endSec > durationSec + 0.05) {
      document[key] = { ...block, endSec: roundedDuration };
    }
  }
}

export function mergeStyleLayers(input: {
  previous: Record<string, unknown>;
  next: Record<string, unknown>;
  layers: readonly StyleLayer[];
}): Record<string, unknown> {
  const { previous, next, layers } = input;
  const applies = (layer: StyleLayer) => layers.includes(layer);
  // O EDIT AI possui campos proprios que nao existem necessariamente no
  // documento reconstruido pelo pipeline herdado do upstream. Partir apenas
  // de `next` apagava esses dados ao aplicar uma camada de estilo. O merge
  // agora preserva por padrao tudo que ja estava no projeto e deixa `next`
  // atualizar fatos de midia/campos conhecidos; os donos abaixo continuam
  // decidindo quais camadas podem ser substituidas nesta rodada.
  const output: Record<string, unknown> = { ...previous, ...next };

  for (const [key, owner] of Object.entries(STYLE_KEY_OWNER)) {
    if (applies(owner)) continue;
    if (key in previous) output[key] = previous[key];
  }

  // Flashes depend on edit geometry. Changing split windows without
  // recalculating animations leaves flashes at stale boundaries.
  if (!applies('efeitos') && applies('edicao')) {
    output.animations = next.animations;
  }

  // Accent color is a single video-level choice shared by text and captions.
  if (layers.some((layer) => ACCENT_LAYERS.includes(layer))) {
    const accent = accentFrom(next);
    if (accent) {
      for (const key of ['hook', 'captions'] as const) {
        const block = output[key];
        if (isObject(block)) output[key] = { ...block, accent };
      }
    }
  }

  normalizeTimelineWindows(output, layers);
  return output;
}

function accentFrom(document: Record<string, unknown>): string | null {
  for (const key of ['hook', 'captions'] as const) {
    const block = document[key];
    if (isObject(block) && typeof block.accent === 'string' && block.accent) return block.accent;
  }
  return null;
}

export const STYLE_LAYER_LABEL: Readonly<Record<StyleLayer, string>> = {
  edicao: 'tipo de edicao',
  efeitos: 'efeitos',
  texto: 'texto',
  legendas: 'legendas',
};
