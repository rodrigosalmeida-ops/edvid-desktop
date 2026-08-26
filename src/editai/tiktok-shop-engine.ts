import type { EditAiLocalAnalysis } from './analysis-context';
import type { AiEditPlan, AiOverlaySuggestion, AiTimelineOperation } from './timeline-operations';
import { retentionReport, type RetentionReport, type SilenceRange, type TranscriptSegment, type TranscriptWord } from './retention-engine';

export type TikTokShopEvidenceKind = 'hook' | 'benefit' | 'price' | 'cta' | 'proof';
export type TikTokShopEvidence = {
  kind: TikTokShopEvidenceKind;
  text: string;
  start: number;
  end: number;
  score: number;
  exact: true;
};

export type TikTokShopVariantId = 'A' | 'B';
export type TikTokShopVariant = {
  id: TikTokShopVariantId;
  label: string;
  strategy: 'contexto' | 'hook-first';
  plan: AiEditPlan;
  report: RetentionReport;
  targetDurationS: number;
  rationale: string[];
  openingEvidence?: TikTokShopEvidence;
};

export type TikTokShopVariantSet = {
  version: 1;
  generatedAt: number;
  productHint?: string;
  evidence: TikTokShopEvidence[];
  baseline: RetentionReport;
  variants: [TikTokShopVariant, TikTokShopVariant];
  warnings: string[];
};

type FlatSegment = { text: string; start: number; end: number; words: TranscriptWord[] };
type RemoveRange = { start: number; end: number };
const round3 = (value: number): number => Math.round(value * 1000) / 1000;

const HOOK_RE = /\b(olha|aten[cç][aã]o|pare|antes|erro|segredo|ningu[eé]m|nunca|como|porque|cuidado|resultado|problema|evite|descobri|testei|funciona|vale|barato|desconto|oferta|hoje|agora)\b/iu;
const BENEFIT_RE = /\b(resolve|ajuda|melhora|reduz|aumenta|protege|hidrata|fortalece|economiza|facilita|pr[aá]tico|r[aá]pido|f[aá]cil|benef[ií]cio|resultado|dura|rende|macio|brilho|limpa|seca|organiza)\b/iu;
const PROOF_RE = /\b(test(?:ei|amos)|uso|usando|resultado|antes|depois|olha como|funcionou|comprov|avalia[cç][aã]o|cliente|vendeu|vendas?)\b/iu;
const CTA_RE = /\b(confira|veja|carrinho|compre|comprar|garanta|aproveite|clique|clica|link|pe[cç]a|pedido|toque|adicione)\b/iu;
const PRICE_MATCH_RE = /(?:r\$\s?\d{1,6}(?:[.\s]\d{3})*(?:[,.]\d{1,2})?|\b\d{1,6}[,.]\d{2}\s*(?:reais?)?\b)/iu;
const PRODUCT_HINT_RE = /\b(?:(?:produto|kit)\s+(?:da|do|de)\s+|(?:shampoo|condicionador|m[aá]scara|creme|perfume|pote|panela|balan[cç]a|ferramenta|power\s*bank)\s+)([\p{L}\p{N}][\p{L}\p{N}-]*(?:\s+[\p{L}\p{N}][\p{L}\p{N}-]*){0,2})/iu;

function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }
function clean(value: string): string { return value.replace(/\s+/gu, ' ').trim(); }

function flatSegments(transcript: readonly TranscriptSegment[]): FlatSegment[] {
  const out: FlatSegment[] = [];
  for (const segment of transcript) {
    const words = (segment.words ?? []).flatMap((word) => {
      const start = Number(word.start);
      const end = Number(word.end);
      const text = clean(String(word.word ?? ''));
      return Number.isFinite(start) && Number.isFinite(end) && end > start && text
        ? [{ ...word, word: text, start, end }]
        : [];
    });
    if (words.length >= 2) {
      let group: TranscriptWord[] = [];
      const flush = () => {
        if (!group.length) return;
        const start = Number(group[0].start);
        const end = Number(group[group.length - 1].end);
        const text = clean(group.map((word) => String(word.word ?? '')).join(' '));
        if (text && Number.isFinite(start) && Number.isFinite(end) && end > start) out.push({ text, start, end, words: group });
        group = [];
      };
      for (const word of words) {
        const previous = group[group.length - 1];
        const gap = previous ? Number(word.start) - Number(previous.end) : 0;
        const groupStart = group.length ? Number(group[0].start) : Number(word.start);
        const projectedDuration = Number(word.end) - groupStart;
        if (previous && (gap > 0.58 || (projectedDuration > 4.2 && gap > 0.22))) flush();
        group.push(word);
      }
      flush();
      continue;
    }
    const start = Number(segment.start);
    const end = Number(segment.end);
    const text = clean(String(segment.text ?? ''));
    if (Number.isFinite(start) && Number.isFinite(end) && end > start && text) out.push({ text, start, end, words });
  }
  return out;
}

function textScore(segment: FlatSegment): number {
  let score = 18;
  const tokens = segment.text.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
  if (tokens >= 4 && tokens <= 16) score += 18;
  if (HOOK_RE.test(segment.text)) score += 24;
  if (BENEFIT_RE.test(segment.text)) score += 14;
  if (PROOF_RE.test(segment.text)) score += 12;
  if (/\?/u.test(segment.text)) score += 8;
  if (/\d/u.test(segment.text)) score += 6;
  if (segment.start <= 3) score += 12;
  else if (segment.start <= 8) score += 7;
  else if (segment.start > 18) score -= 6;
  const duration = segment.end - segment.start;
  if (duration > 6) score -= Math.min(18, (duration - 6) * 3);
  return clamp(Math.round(score), 0, 100);
}

function evidence(kind: TikTokShopEvidenceKind, segment: FlatSegment, score: number, text = segment.text): TikTokShopEvidence {
  return { kind, text: clean(text).slice(0, 160), start: segment.start, end: segment.end, score: clamp(score, 0, 100), exact: true };
}

function extractEvidence(transcript: readonly TranscriptSegment[]): TikTokShopEvidence[] {
  const out: TikTokShopEvidence[] = [];
  for (const segment of flatSegments(transcript)) {
    const strength = textScore(segment);
    if (strength >= 52) out.push(evidence('hook', segment, strength));
    if (BENEFIT_RE.test(segment.text)) out.push(evidence('benefit', segment, Math.max(55, strength)));
    if (PROOF_RE.test(segment.text)) out.push(evidence('proof', segment, Math.max(50, strength)));
    if (CTA_RE.test(segment.text)) out.push(evidence('cta', segment, Math.max(60, strength)));
    const price = segment.text.match(PRICE_MATCH_RE)?.[0];
    if (price) out.push(evidence('price', segment, Math.max(70, strength), price));
  }
  const dedup = new Map<string, TikTokShopEvidence>();
  for (const item of out) {
    const key = `${item.kind}:${item.start.toFixed(2)}:${item.text.toLocaleLowerCase('pt-BR')}`;
    const current = dedup.get(key);
    if (!current || current.score < item.score) dedup.set(key, item);
  }
  return [...dedup.values()].sort((a, b) => a.start - b.start || b.score - a.score);
}

function best(evidenceItems: readonly TikTokShopEvidence[], kind: TikTokShopEvidenceKind): TikTokShopEvidence | undefined {
  return evidenceItems.filter((item) => item.kind === kind).sort((a, b) => b.score - a.score || a.start - b.start)[0];
}

function overlayFromEvidence(item: TikTokShopEvidence, type: AiOverlaySuggestion['type'], options: { start?: number; end?: number; maxText?: number } = {}): AiOverlaySuggestion {
  return {
    type,
    start: options.start ?? item.start,
    end: options.end ?? Math.min(item.end + 0.35, item.start + 4),
    text: item.text.slice(0, options.maxText ?? (type === 'headline' ? 100 : 80)),
    reason: `Trecho identificado na transcrição (${item.kind}); texto preservado sem inventar informação.`,
    confidence: item.score / 100,
  };
}

function mergedRemovals(operations: readonly AiTimelineOperation[]): RemoveRange[] {
  const ranges = operations
    .filter((op): op is Extract<AiTimelineOperation, { type: 'remove-range' }> => op.type === 'remove-range')
    .map((op) => ({ start: Math.max(0, op.start), end: Math.max(0, op.end) }))
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.start - b.start);
  const out: RemoveRange[] = [];
  for (const range of ranges) {
    const prev = out[out.length - 1];
    if (!prev || range.start > prev.end + 0.001) out.push({ ...range });
    else prev.end = Math.max(prev.end, range.end);
  }
  return out;
}

function mapTime(time: number, removals: readonly RemoveRange[]): number {
  let removed = 0;
  for (const range of removals) {
    if (time >= range.end) removed += range.end - range.start;
    else if (time > range.start) return Math.max(0, range.start - removed);
    else break;
  }
  return Math.max(0, time - removed);
}

function transcriptAfterRemovals(transcript: readonly TranscriptSegment[], operations: readonly AiTimelineOperation[]): TranscriptSegment[] {
  const removals = mergedRemovals(operations);
  if (!removals.length) return transcript.map((segment) => ({ ...segment, words: segment.words?.map((word) => ({ ...word })) }));
  return transcript.flatMap((segment) => {
    const start = Number(segment.start);
    const end = Number(segment.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
    if (removals.some((range) => start >= range.start && end <= range.end)) return [];
    const words = (segment.words ?? []).flatMap((word) => {
      const ws = Number(word.start);
      const we = Number(word.end);
      if (!Number.isFinite(ws) || !Number.isFinite(we) || we <= ws) return [];
      if (removals.some((range) => ws >= range.start && we <= range.end)) return [];
      return [{ ...word, start: mapTime(ws, removals), end: mapTime(we, removals) }];
    });
    const mappedStart = mapTime(start, removals);
    const mappedEnd = mapTime(end, removals);
    if (mappedEnd - mappedStart < 0.05 && words.length === 0) return [];
    return [{ ...segment, start: mappedStart, end: Math.max(mappedStart + 0.05, mappedEnd), words }];
  });
}

function silencesAfterRemovals(silences: readonly SilenceRange[], operations: readonly AiTimelineOperation[]): SilenceRange[] {
  const removals = mergedRemovals(operations);
  return silences.flatMap((silence) => {
    if (removals.some((range) => silence.start >= range.start && silence.end <= range.end)) return [];
    const start = mapTime(silence.start, removals);
    const end = mapTime(silence.end, removals);
    return end - start >= 0.05 ? [{ start, end }] : [];
  });
}

function durationAfterRemovals(duration: number, operations: readonly AiTimelineOperation[]): number {
  const removed = mergedRemovals(operations).reduce((sum, item) => sum + (item.end - item.start), 0);
  return Math.max(0.1, duration - removed);
}

function reportForVariant(local: EditAiLocalAnalysis, operations: readonly AiTimelineOperation[]): RetentionReport {
  const transcript = transcriptAfterRemovals(local.transcript, operations);
  const silences = silencesAfterRemovals(local.silences, operations);
  return retentionReport(transcript, durationAfterRemovals(local.report.signals.durationS, operations), silences, 'tiktok_shop');
}

function openingHeadline(items: readonly TikTokShopEvidence[], preferLater = false): TikTokShopEvidence | undefined {
  const hooks = items.filter((item) => item.kind === 'hook');
  if (!hooks.length) return undefined;
  const eligible = preferLater ? hooks.filter((item) => item.start >= 0.7 && item.start <= 15) : hooks.filter((item) => item.start <= 3.2);
  return (eligible.length ? eligible : hooks).sort((a, b) => b.score - a.score || a.start - b.start)[0];
}

function factualOverlays(items: readonly TikTokShopEvidence[], headline?: TikTokShopEvidence): AiOverlaySuggestion[] {
  const overlays: AiOverlaySuggestion[] = [];
  if (headline) overlays.push(overlayFromEvidence(headline, 'headline', { end: Math.min(headline.start + 2.8, headline.end + 0.5) }));
  const price = best(items, 'price');
  const benefit = best(items, 'benefit');
  const cta = best(items, 'cta');
  if (benefit) overlays.push(overlayFromEvidence(benefit, 'benefit'));
  if (price) overlays.push(overlayFromEvidence(price, 'price', { maxText: 40 }));
  if (cta) overlays.push(overlayFromEvidence(cta, 'cta'));
  return overlays;
}

function spokenProductHint(transcript: readonly TranscriptSegment[]): string | undefined {
  const text = clean(transcript.map((segment) => String(segment.text ?? '')).join(' '));
  const match = text.match(PRODUCT_HINT_RE)?.[1];
  if (!match) return undefined;
  return clean(match).split(/[,.!?;]/u)[0].trim().slice(0, 50) || undefined;
}

/**
 * Gera duas alternativas determinísticas e revisáveis para TikTok Shop.
 * Nenhum texto comercial é inventado: overlays usam evidências literais da
 * transcrição. A versão B só remove a abertura quando um hook posterior tem
 * força mínima; o usuário continua revisando tudo antes de aplicar.
 */
export function buildTikTokShopVariants(local: EditAiLocalAnalysis): TikTokShopVariantSet {
  const evidenceItems = extractEvidence(local.transcript);
  const firstHook = openingHeadline(evidenceItems, false);
  const laterHook = openingHeadline(evidenceItems, true);

  const operationsA = [...local.plan.operations];
  const planA: AiEditPlan = {
    version: 1,
    preset: 'tiktok_shop',
    operations: operationsA,
    overlays: factualOverlays(evidenceItems, firstHook),
    notes: ['Versão A: preserva contexto e aplica elementos comerciais somente quando encontrados na transcrição.'],
  };
  const reportA = reportForVariant(local, operationsA);

  const operationsB = [...local.plan.operations];
  const canHookFirst = Boolean(laterHook && laterHook.start >= 0.7 && laterHook.start <= 15 && laterHook.score >= 62);
  if (canHookFirst && laterHook) {
    operationsB.unshift({
      type: 'remove-range', start: 0, end: round3(Math.max(0, laterHook.start - 0.08)),
      reason: 'Versão B: abrir diretamente na fala mais forte identificada.', confidence: laterHook.score / 100,
    });
  }
  const planB: AiEditPlan = {
    version: 1,
    preset: 'tiktok_shop',
    operations: operationsB,
    overlays: factualOverlays(evidenceItems, laterHook ?? firstHook),
    notes: [canHookFirst
      ? 'Versão B: hook-first; começa na melhor fala encontrada e preserva somente alegações existentes.'
      : 'Versão B: alternativa visual; não houve evidência suficiente para remover a abertura com segurança.'],
  };
  const reportB = reportForVariant(local, operationsB);

  const warnings: string[] = [];
  if (!best(evidenceItems, 'price')) warnings.push('Preço não encontrado na transcrição; nenhum valor será criado automaticamente.');
  if (!best(evidenceItems, 'benefit')) warnings.push('Benefício explícito não encontrado; revise o roteiro antes de adicionar alegações.');
  if (!best(evidenceItems, 'cta')) warnings.push('CTA explícito não encontrado; a IA pode sugerir redação depois, mas exige revisão humana.');
  warnings.push('Detecção visual do produto ainda não faz parte desta engine; productHint usa somente fala/transcrição quando disponível.');

  return {
    version: 1,
    generatedAt: Date.now(),
    productHint: spokenProductHint(local.transcript),
    evidence: evidenceItems,
    baseline: local.report,
    variants: [
      {
        id: 'A', label: 'Versão A · Contexto', strategy: 'contexto', plan: planA, report: reportA,
        targetDurationS: reportA.signals.durationS,
        rationale: ['Preserva a abertura atual.', 'Remove pausas detectadas.', 'Usa somente preço, benefício e CTA presentes na transcrição.'],
        openingEvidence: firstHook,
      },
      {
        id: 'B', label: 'Versão B · Hook first', strategy: 'hook-first', plan: planB, report: reportB,
        targetDurationS: reportB.signals.durationS,
        rationale: [
          canHookFirst ? 'Traz a fala mais forte para o início.' : 'Mantém a ordem porque não houve hook posterior forte o bastante.',
          'Preserva fatos comerciais literais.', 'Serve como alternativa A/B antes do render.',
        ],
        openingEvidence: laterHook ?? firstHook,
      },
    ],
    warnings,
  };
}

export function reviewStateForTikTokVariant(variant: TikTokShopVariant) {
  const selection: Record<string, boolean> = {};
  variant.plan.operations.forEach((_item, index) => { selection[`op:${index}`] = true; });
  (variant.plan.overlays ?? []).forEach((item, index) => { selection[`overlay:${index}`] = item.type !== 'broll'; });
  return {
    id: `tiktok-shop:${variant.id}:${Date.now()}`,
    plan: variant.plan,
    report: variant.report,
    selection,
    source: 'local' as const,
  };
}
