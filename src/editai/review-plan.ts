import { EDIT_AI_PLAN_SYSTEM_PROMPT, parseAiEditPlan } from './ai-plan';
import { EDIT_AI_PRESETS, buildPresetBriefing, type EditAiPresetId } from './commercial-presets';
import type { RetentionReport } from './retention-engine';
import type { AiEditPlan, AiOverlaySuggestion, AiTimelineOperation } from './timeline-operations';
import { isOverlaySuggestionSupported } from './overlay-operations';

export type EditAiReviewSelection = Record<string, boolean>;

export type EditAiReviewState = {
  id: string;
  plan: AiEditPlan;
  report: RetentionReport | null;
  selection: EditAiReviewSelection;
  source: 'local' | 'ai';
};

export type EditAiReviewItem = {
  id: string;
  kind: 'operation' | 'overlay';
  title: string;
  detail: string;
  start?: number;
  end?: number;
  confidence?: number;
  supported: boolean;
};

function seconds(value: number): string {
  const minutes = Math.floor(value / 60);
  const rest = value - minutes * 60;
  return `${String(minutes).padStart(2, '0')}:${rest.toFixed(1).padStart(4, '0')}`;
}

function operationItem(operation: AiTimelineOperation, index: number): EditAiReviewItem {
  if (operation.type === 'remove-range') {
    return {
      id: `op:${index}`,
      kind: 'operation',
      title: 'Remover pausa/trecho',
      detail: operation.reason || `${seconds(operation.start)} → ${seconds(operation.end)}`,
      start: operation.start,
      end: operation.end,
      confidence: operation.confidence,
      supported: true,
    };
  }
  if (operation.type === 'trim') {
    return {
      id: `op:${index}`,
      kind: 'operation',
      title: `Ajustar ${operation.edge === 'start' ? 'entrada' : 'saída'} do clipe`,
      detail: operation.reason || `${operation.delta >= 0 ? '+' : ''}${operation.delta.toFixed(2)}s`,
      confidence: operation.confidence,
      supported: true,
    };
  }
  if (operation.type === 'set-gain') {
    return {
      id: `op:${index}`,
      kind: 'operation',
      title: 'Ajustar volume',
      detail: operation.reason || `${operation.gainDb.toFixed(1)} dB`,
      confidence: operation.confidence,
      supported: true,
    };
  }
  return {
    id: `op:${index}`,
    kind: 'operation',
    title: operation.enabled ? 'Ativar clipe' : 'Desativar clipe',
    detail: operation.reason || operation.clipId,
    confidence: operation.confidence,
    supported: true,
  };
}

function overlayItem(overlay: AiOverlaySuggestion, index: number): EditAiReviewItem {
  const labels: Record<AiOverlaySuggestion['type'], string> = {
    headline: 'Revisar headline',
    cta: 'Adicionar CTA visual',
    price: 'Destacar preço',
    benefit: 'Destacar benefício',
    broll: 'Sugerir B-roll',
  };
  return {
    id: `overlay:${index}`,
    kind: 'overlay',
    title: labels[overlay.type],
    detail: overlay.reason || overlay.text || `${seconds(overlay.start)} → ${seconds(overlay.end)}`,
    start: overlay.start,
    end: overlay.end,
    confidence: overlay.confidence,
    supported: isOverlaySuggestionSupported(overlay),
  };
}

export function reviewItems(state: EditAiReviewState): EditAiReviewItem[] {
  return [
    ...state.plan.operations.map(operationItem),
    ...(state.plan.overlays ?? []).map(overlayItem),
  ];
}

export function defaultReviewSelection(plan: AiEditPlan): EditAiReviewSelection {
  const selection: EditAiReviewSelection = {};
  plan.operations.forEach((_operation, index) => { selection[`op:${index}`] = true; });
  (plan.overlays ?? []).forEach((overlay, index) => { selection[`overlay:${index}`] = isOverlaySuggestionSupported(overlay); });
  return selection;
}

export function selectedTimelinePlan(state: EditAiReviewState): AiEditPlan {
  return {
    ...state.plan,
    operations: state.plan.operations.filter((_operation, index) => state.selection[`op:${index}`] !== false),
    overlays: (state.plan.overlays ?? []).filter((_overlay, index) => state.selection[`overlay:${index}`] === true),
  };
}

function jsonFromText(text: string): unknown | null {
  const tagged = text.match(/<editai-plan>\s*([\s\S]*?)\s*<\/editai-plan>/iu)?.[1];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/iu)?.[1];
  const candidate = (tagged ?? fenced ?? text).trim();
  if (!candidate.startsWith('{')) return null;
  try { return JSON.parse(candidate); } catch { return null; }
}

export function reviewStateFromAiText(text: string, presetFallback: EditAiPresetId): EditAiReviewState | null {
  const raw = jsonFromText(text);
  if (!raw) return null;
  const plan = parseAiEditPlan(raw, presetFallback);
  if (!plan.operations.length && !(plan.overlays?.length)) return null;
  return {
    id: `ai:${Date.now()}`,
    plan,
    report: null,
    selection: defaultReviewSelection(plan),
    source: 'ai',
  };
}


export function mergeAiReviewWithLocal(local: EditAiReviewState | null, ai: EditAiReviewState): EditAiReviewState {
  if (!local) return ai;
  const seen = new Set<string>();
  const operationKey = (operation: AiTimelineOperation): string => {
    if (operation.type === 'remove-range') return `remove:${operation.start.toFixed(3)}:${operation.end.toFixed(3)}`;
    if (operation.type === 'trim') return `trim:${operation.clipId}:${operation.edge}:${operation.delta.toFixed(3)}`;
    if (operation.type === 'set-gain') return `gain:${operation.clipId}:${operation.gainDb.toFixed(2)}`;
    return `enabled:${operation.clipId}:${operation.enabled}`;
  };
  const operations = [...local.plan.operations, ...ai.plan.operations].filter((operation) => {
    const key = operationKey(operation);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const overlaySeen = new Set<string>();
  const overlays = [...(local.plan.overlays ?? []), ...(ai.plan.overlays ?? [])].filter((overlay) => {
    const key = `${overlay.type}:${overlay.start.toFixed(2)}:${overlay.end.toFixed(2)}:${overlay.text ?? ''}`;
    if (overlaySeen.has(key)) return false;
    overlaySeen.add(key);
    return true;
  });
  const plan: AiEditPlan = {
    ...ai.plan,
    operations,
    overlays,
    notes: [...new Set([...(local.plan.notes ?? []), ...(ai.plan.notes ?? [])])],
  };
  return {
    ...ai,
    plan,
    report: local.report ?? ai.report,
    selection: defaultReviewSelection(plan),
  };
}

export function buildAiReviewRequest(presetId: EditAiPresetId): string {
  const preset = EDIT_AI_PRESETS[presetId];
  return [
    EDIT_AI_PLAN_SYSTEM_PROMPT,
    '',
    buildPresetBriefing(presetId),
    '',
    'Analise o corte atual deste projeto usando a transcrição e os arquivos já disponíveis no workspace.',
    'NÃO renderize, NÃO escreva timeline.json e NÃO execute FFmpeg.',
    'Sua tarefa é SOMENTE propor um plano de edição revisável.',
    'Use apenas fatos presentes no material. Nunca invente preço, desconto, ingrediente, resultado, garantia ou benefício.',
    `O preset escolhido pelo usuário é ${preset.label}.`,
    'Retorne um único objeto JSON compatível com AiEditPlan. Sem markdown e sem explicação fora do JSON.',
  ].join('\n');
}
