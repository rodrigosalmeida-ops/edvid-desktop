import type { TimelineModel } from '../shared';
import {
  VIDEO_TRACK_ID,
  applyTrim,
  clipEnd,
  linkedPartner,
  razorAtTime,
  rippleDeleteClip,
  round3,
  timelineModelDuration,
} from '../timeline-model';

/**
 * Operações permitidas para a IA do EDIT AI.
 *
 * A IA nunca recebe permissão para editar timeline.json diretamente. Ela produz
 * somente este contrato; o renderer valida e aplica usando as operações puras do
 * timeline-model do Edvid. Assim, undo/redo e preview mapeado continuam íntegros.
 */
export type AiTimelineOperation =
  | {
      type: 'remove-range';
      start: number;
      end: number;
      reason?: string;
      confidence?: number;
    }
  | {
      type: 'trim';
      clipId: string;
      edge: 'start' | 'end';
      delta: number;
      ripple?: boolean;
      reason?: string;
      confidence?: number;
    }
  | {
      type: 'set-gain';
      clipId: string;
      gainDb: number;
      reason?: string;
      confidence?: number;
    }
  | {
      type: 'set-enabled';
      clipId: string;
      enabled: boolean;
      reason?: string;
      confidence?: number;
    };

export type AiOverlaySuggestion = {
  type: 'headline' | 'cta' | 'price' | 'benefit' | 'broll';
  start: number;
  end: number;
  text?: string;
  assetHint?: string;
  reason?: string;
  confidence?: number;
};

export type AiEditPlan = {
  version: 1;
  preset: string;
  operations: AiTimelineOperation[];
  overlays?: AiOverlaySuggestion[];
  notes?: string[];
};

export type ApplyPlanResult = {
  model: TimelineModel;
  applied: AiTimelineOperation[];
  rejected: Array<{ operation: AiTimelineOperation; reason: string }>;
  durationBefore: number;
  durationAfter: number;
  removedSeconds: number;
};

const EPS = 0.002;
const MAX_OPERATIONS = 250;
const MAX_SINGLE_REMOVE_SECONDS = 180;

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function validateAiTimelineOperation(
  operation: AiTimelineOperation,
): string | null {
  if (!operation || typeof operation !== 'object') return 'Operação inválida.';
  if (operation.type === 'remove-range') {
    if (!finite(operation.start) || !finite(operation.end)) return 'Range sem timestamps válidos.';
    if (operation.start < 0 || operation.end <= operation.start + EPS) return 'Range vazio ou invertido.';
    if (operation.end - operation.start > MAX_SINGLE_REMOVE_SECONDS) {
      return `Remoção única acima de ${MAX_SINGLE_REMOVE_SECONDS}s exige revisão manual.`;
    }
    return null;
  }
  if (operation.type === 'trim') {
    if (!operation.clipId?.trim()) return 'Trim sem clipId.';
    if (!finite(operation.delta)) return 'Trim com delta inválido.';
    if (Math.abs(operation.delta) > 60) return 'Trim acima de 60s exige revisão manual.';
    return null;
  }
  if (operation.type === 'set-gain') {
    if (!operation.clipId?.trim()) return 'Ganho sem clipId.';
    if (!finite(operation.gainDb)) return 'Ganho inválido.';
    return null;
  }
  if (operation.type === 'set-enabled') {
    if (!operation.clipId?.trim()) return 'Alteração sem clipId.';
    if (typeof operation.enabled !== 'boolean') return 'enabled precisa ser booleano.';
    return null;
  }
  return 'Tipo de operação não suportado.';
}

/**
 * Remove um intervalo em tempo DA TIMELINE, não em tempo da mídia-fonte.
 * Primeiro cria fronteiras exatas com razor e depois apaga da direita para a
 * esquerda. Apagar ao contrário evita que o ripple invalide os clipIds/posições
 * dos alvos que ainda serão removidos.
 */
export function removeTimelineRange(
  model: TimelineModel,
  startInput: number,
  endInput: number,
): TimelineModel | null {
  const duration = timelineModelDuration(model);
  const start = clamp(round3(startInput), 0, duration);
  const end = clamp(round3(endInput), 0, duration);
  if (end <= start + EPS) return null;

  let working = model;
  const atEnd = razorAtTime(working, end);
  if (atEnd) working = atEnd;
  const atStart = razorAtTime(working, start);
  if (atStart) working = atStart;

  const targets = working.clips
    .filter((clip) =>
      clip.trackId === VIDEO_TRACK_ID
      && clip.enabled
      && clip.timelineStart >= start - EPS
      && clipEnd(clip) <= end + EPS,
    )
    .sort((a, b) => b.timelineStart - a.timelineStart);

  if (targets.length === 0) return null;
  let changed = false;
  for (const target of targets) {
    // O clipe pode ter sido removido junto com seu parceiro numa iteração anterior.
    if (!working.clips.some((clip) => clip.id === target.id)) continue;
    const next = rippleDeleteClip(working, target.id);
    if (next) {
      working = next;
      changed = true;
    }
  }
  return changed ? working : null;
}

function setClipGain(model: TimelineModel, clipId: string, gainDb: number): TimelineModel | null {
  const primary = model.clips.find((clip) => clip.id === clipId);
  if (!primary) return null;
  const partner = linkedPartner(model, primary);
  const ids = new Set([primary.id, ...(partner ? [partner.id] : [])]);
  const nextGain = round3(clamp(gainDb, -60, 12));
  return {
    ...model,
    clips: model.clips.map((clip) => (ids.has(clip.id) ? { ...clip, gainDb: nextGain } : clip)),
  };
}

function setClipEnabled(model: TimelineModel, clipId: string, enabled: boolean): TimelineModel | null {
  const primary = model.clips.find((clip) => clip.id === clipId);
  if (!primary) return null;
  const partner = linkedPartner(model, primary);
  const ids = new Set([primary.id, ...(partner ? [partner.id] : [])]);
  return {
    ...model,
    clips: model.clips.map((clip) => (ids.has(clip.id) ? { ...clip, enabled } : clip)),
  };
}

export function applyAiTimelineOperation(
  model: TimelineModel,
  operation: AiTimelineOperation,
  sourceDurations: Readonly<Record<string, number | undefined>> = {},
): TimelineModel | null {
  const invalid = validateAiTimelineOperation(operation);
  if (invalid) return null;

  if (operation.type === 'remove-range') {
    return removeTimelineRange(model, operation.start, operation.end);
  }
  if (operation.type === 'trim') {
    const result = applyTrim(
      model,
      operation.clipId,
      operation.edge,
      operation.delta,
      sourceDurations,
      { ripple: operation.ripple !== false },
    );
    return Math.abs(result.applied) > EPS ? result.model : null;
  }
  if (operation.type === 'set-gain') {
    return setClipGain(model, operation.clipId, operation.gainDb);
  }
  if (operation.type === 'set-enabled') {
    return setClipEnabled(model, operation.clipId, operation.enabled);
  }
  return null;
}

export function applyAiEditPlan(
  model: TimelineModel,
  plan: AiEditPlan,
  sourceDurations: Readonly<Record<string, number | undefined>> = {},
): ApplyPlanResult {
  const durationBefore = timelineModelDuration(model);
  let working = model;
  const applied: AiTimelineOperation[] = [];
  const rejected: ApplyPlanResult['rejected'] = [];

  const operations = Array.isArray(plan.operations) ? plan.operations.slice(0, MAX_OPERATIONS) : [];
  if (Array.isArray(plan.operations) && plan.operations.length > MAX_OPERATIONS) {
    for (const operation of plan.operations.slice(MAX_OPERATIONS)) {
      rejected.push({ operation, reason: `Plano excede o limite de ${MAX_OPERATIONS} operações.` });
    }
  }

  for (const operation of operations) {
    const invalid = validateAiTimelineOperation(operation);
    if (invalid) {
      rejected.push({ operation, reason: invalid });
      continue;
    }
    const next = applyAiTimelineOperation(working, operation, sourceDurations);
    if (!next) {
      rejected.push({ operation, reason: 'Operação não alterou a timeline ou não pôde ser aplicada.' });
      continue;
    }
    working = next;
    applied.push(operation);
  }

  const durationAfter = timelineModelDuration(working);
  return {
    model: working,
    applied,
    rejected,
    durationBefore: round3(durationBefore),
    durationAfter: round3(durationAfter),
    removedSeconds: round3(Math.max(0, durationBefore - durationAfter)),
  };
}
