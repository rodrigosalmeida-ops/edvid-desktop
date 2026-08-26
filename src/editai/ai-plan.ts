import type { AiEditPlan, AiOverlaySuggestion, AiTimelineOperation } from './timeline-operations';

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finiteNumber(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number.NaN;
  return Number.isFinite(number) ? number : null;
}

function textOf(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function confidenceOf(value: unknown): number | undefined {
  const number = finiteNumber(value);
  return number === null ? undefined : Math.max(0, Math.min(1, number));
}

function parseOperation(value: unknown): AiTimelineOperation | null {
  const raw = recordOf(value);
  if (!raw) return null;
  const reason = textOf(raw.reason);
  const confidence = confidenceOf(raw.confidence);

  if (raw.type === 'remove-range') {
    const start = finiteNumber(raw.start);
    const end = finiteNumber(raw.end);
    if (start === null || end === null || start < 0 || end <= start) return null;
    return { type: 'remove-range', start, end, reason, confidence };
  }

  if (raw.type === 'trim') {
    const clipId = textOf(raw.clipId);
    const delta = finiteNumber(raw.delta);
    const edge = raw.edge === 'start' || raw.edge === 'end' ? raw.edge : null;
    if (!clipId || delta === null || !edge) return null;
    return {
      type: 'trim',
      clipId,
      edge,
      delta,
      ripple: typeof raw.ripple === 'boolean' ? raw.ripple : undefined,
      reason,
      confidence,
    };
  }

  if (raw.type === 'set-gain') {
    const clipId = textOf(raw.clipId);
    const gainDb = finiteNumber(raw.gainDb);
    if (!clipId || gainDb === null) return null;
    return { type: 'set-gain', clipId, gainDb, reason, confidence };
  }

  if (raw.type === 'set-enabled') {
    const clipId = textOf(raw.clipId);
    if (!clipId || typeof raw.enabled !== 'boolean') return null;
    return { type: 'set-enabled', clipId, enabled: raw.enabled, reason, confidence };
  }

  return null;
}

function parseOverlay(value: unknown): AiOverlaySuggestion | null {
  const raw = recordOf(value);
  if (!raw) return null;
  const validTypes = new Set<AiOverlaySuggestion['type']>(['headline', 'cta', 'price', 'benefit', 'broll']);
  if (typeof raw.type !== 'string' || !validTypes.has(raw.type as AiOverlaySuggestion['type'])) return null;
  const start = finiteNumber(raw.start);
  const end = finiteNumber(raw.end);
  if (start === null || end === null || start < 0 || end <= start) return null;
  return {
    type: raw.type as AiOverlaySuggestion['type'],
    start,
    end,
    text: textOf(raw.text),
    assetHint: textOf(raw.assetHint),
    reason: textOf(raw.reason),
    confidence: confidenceOf(raw.confidence),
  };
}

/**
 * Faz parse e sanitização de uma resposta do agente sem executar nada.
 * Dados malformados são descartados antes de chegarem ao React ou à timeline.
 */
export function parseAiEditPlan(value: unknown, presetFallback = 'clean'): AiEditPlan {
  const raw = recordOf(value) ?? {};
  const operations = Array.isArray(raw.operations)
    ? raw.operations.map(parseOperation).filter((item): item is AiTimelineOperation => item !== null)
    : [];
  const overlays = Array.isArray(raw.overlays)
    ? raw.overlays.map(parseOverlay).filter((item): item is AiOverlaySuggestion => item !== null)
    : [];
  return {
    version: 1,
    preset: textOf(raw.preset) ?? presetFallback,
    operations,
    overlays,
    notes: Array.isArray(raw.notes)
      ? raw.notes.map(textOf).filter((note): note is string => Boolean(note)).slice(0, 100)
      : [],
  };
}

export const EDIT_AI_PLAN_SYSTEM_PROMPT = `Você é o planejador de edição do EDIT AI.
Retorne APENAS JSON. Nunca retorne comandos de shell, caminhos de arquivo ou código.
A timeline é não destrutiva. Você pode propor operações remove-range, trim, set-gain e set-enabled.
remove-range usa segundos da TIMELINE atual. Não corte no meio de palavras; prefira pausas naturais.
Para elementos visuais, use overlays do tipo headline, cta, price, benefit ou broll.
Nunca invente preço, desconto, benefício técnico ou alegação sobre produto.
Preserve contexto e intenção do criador. Se houver dúvida, proponha menos cortes.`;
