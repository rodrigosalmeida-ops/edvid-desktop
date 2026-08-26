import { EDIT_AI_PRESETS, type EditAiPresetId } from './commercial-presets';
import { retentionReport, type RetentionReport, type SilenceRange, type TranscriptSegment } from './retention-engine';
import type { AiEditPlan, AiOverlaySuggestion, AiTimelineOperation } from './timeline-operations';

export type EditAiTranscriptFile = {
  source: string;
  segments: TranscriptSegment[];
};

export type EditAiEdlRange = {
  source: string;
  start: number;
  end: number;
  label?: string;
};

export type EditAiAnalysisContext = {
  transcripts: EditAiTranscriptFile[];
  ranges: EditAiEdlRange[];
};

export type EditAiLocalAnalysis = {
  report: RetentionReport;
  plan: AiEditPlan;
  transcript: TranscriptSegment[];
  silences: SilenceRange[];
};

function sourceStem(value: string): string {
  const normalized = value.replace(/\\/gu, '/').split('/').at(-1) ?? value;
  return normalized.replace(/\.[^.]+$/u, '').toLocaleLowerCase('pt-BR');
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function wordBounds(segment: TranscriptSegment): Array<{ word: string; start: number; end: number }> {
  if (Array.isArray(segment.words) && segment.words.length > 0) {
    return segment.words.flatMap((item) => {
      const start = Number(item.start);
      const end = Number(item.end);
      const word = String(item.word ?? '').trim();
      return word && Number.isFinite(start) && Number.isFinite(end) && end > start
        ? [{ word, start, end }]
        : [];
    });
  }
  const start = Number(segment.start);
  const end = Number(segment.end);
  const text = String(segment.text ?? '').trim();
  if (!text || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  const tokens = text.split(/\s+/u).filter(Boolean);
  if (!tokens.length) return [];
  const step = (end - start) / tokens.length;
  return tokens.map((word, index) => ({
    word,
    start: start + step * index,
    end: start + step * (index + 1),
  }));
}

/**
 * Converte os timestamps de fonte do WhisperX para o tempo da timeline atual,
 * respeitando os ranges do EDL. O score passa a medir o corte que o usuário
 * realmente está vendo, e não simplesmente o material bruto.
 */
export function timelineTranscriptFromContext(context: EditAiAnalysisContext): TranscriptSegment[] {
  const transcriptByStem = new Map(
    context.transcripts.map((file) => [sourceStem(file.source), file.segments] as const),
  );
  let cursor = 0;
  const output: TranscriptSegment[] = [];

  for (const range of context.ranges) {
    const rangeStart = Number(range.start);
    const rangeEnd = Number(range.end);
    if (!finite(rangeStart) || !finite(rangeEnd) || rangeEnd <= rangeStart) continue;
    const segments = transcriptByStem.get(sourceStem(range.source)) ?? [];
    const words = segments
      .flatMap(wordBounds)
      .filter((word) => word.end > rangeStart && word.start < rangeEnd)
      .map((word) => {
        const clippedStart = Math.max(rangeStart, word.start);
        const clippedEnd = Math.min(rangeEnd, word.end);
        return {
          word: word.word,
          start: cursor + (clippedStart - rangeStart),
          end: cursor + (clippedEnd - rangeStart),
        };
      })
      .filter((word) => word.end > word.start);

    if (words.length > 0) {
      output.push({
        start: words[0].start,
        end: words.at(-1)?.end ?? words[0].end,
        text: words.map((word) => word.word).join(' '),
        words,
      });
    }
    cursor += rangeEnd - rangeStart;
  }
  return output;
}

export function silencesFromTimelineTranscript(transcript: readonly TranscriptSegment[]): SilenceRange[] {
  const words = transcript
    .flatMap(wordBounds)
    .sort((a, b) => a.start - b.start);
  const silences: SilenceRange[] = [];
  for (let index = 1; index < words.length; index += 1) {
    const previous = words[index - 1];
    const current = words[index];
    if (current.start > previous.end + 0.04) {
      silences.push({ start: previous.end, end: current.start });
    }
  }
  return silences;
}

function transcriptDuration(transcript: readonly TranscriptSegment[], context: EditAiAnalysisContext): number {
  const lastWord = transcript
    .flatMap(wordBounds)
    .reduce((max, word) => Math.max(max, word.end), 0);
  const rangesDuration = context.ranges.reduce((sum, range) => {
    const start = Number(range.start);
    const end = Number(range.end);
    return sum + (Number.isFinite(start) && Number.isFinite(end) && end > start ? end - start : 0);
  }, 0);
  return Math.max(lastWord, rangesDuration, 0.01);
}

function silenceOperations(
  silences: readonly SilenceRange[],
  presetId: EditAiPresetId,
): AiTimelineOperation[] {
  const preset = EDIT_AI_PRESETS[presetId];
  return silences
    .filter((silence) => silence.end - silence.start >= preset.silenceMin)
    .slice(0, 60)
    .flatMap((silence) => {
      const start = silence.start + preset.silencePadding;
      const end = silence.end - preset.silencePadding;
      if (end - start < 0.08) return [];
      return [{
        type: 'remove-range' as const,
        start: Number(start.toFixed(3)),
        end: Number(end.toFixed(3)),
        reason: `Pausa de ${(silence.end - silence.start).toFixed(2)}s; preset ${preset.label}.`,
        confidence: 0.98,
      }];
    });
}

function overlaySuggestions(report: RetentionReport, duration: number, presetId: EditAiPresetId): AiOverlaySuggestion[] {
  const preset = EDIT_AI_PRESETS[presetId];
  const overlays: AiOverlaySuggestion[] = [];
  if (preset.hookReview && report.dimensions.hook3s < 65) {
    overlays.push({
      type: 'headline',
      start: 0,
      end: Math.min(3, duration),
      reason: 'O gancho local ficou abaixo de 65/100; revisar headline antes de renderizar.',
      confidence: 0.86,
    });
  }
  if (preset.commercial && !report.signals.ctaDetected) {
    overlays.push({
      type: 'cta',
      start: Math.max(0, duration - 4),
      end: duration,
      reason: 'CTA não detectado na fala. Sugestão visual sem inventar oferta ou condição.',
      confidence: 0.82,
    });
  }
  return overlays;
}

export function analyzeEditAiContext(
  context: EditAiAnalysisContext,
  presetId: EditAiPresetId = 'tiktok_shop',
): EditAiLocalAnalysis {
  const transcript = timelineTranscriptFromContext(context);
  const silences = silencesFromTimelineTranscript(transcript);
  const duration = transcriptDuration(transcript, context);
  const report = retentionReport(transcript, duration, silences, presetId);
  return {
    report,
    transcript,
    silences,
    plan: {
      version: 1,
      preset: presetId,
      operations: silenceOperations(silences, presetId),
      overlays: overlaySuggestions(report, duration, presetId),
      notes: report.suggestions,
    },
  };
}
