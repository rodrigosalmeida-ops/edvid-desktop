import type { EditOperation } from '../edit-data-edits';
import type { AiEditPlan, AiOverlaySuggestion, AiTimelineOperation } from './timeline-operations';
import { calloutWithBrand, type EditAiBrandKit } from './brand-kit';
import { sanitizeCommercialCallout } from './commercial-callout';

const TEXT_LIMITS: Record<'headline' | 'cta' | 'price' | 'benefit', number> = {
  headline: 160,
  cta: 100,
  price: 80,
  benefit: 120,
};

type RemoveWindow = { start: number; end: number };

function cleanText(value: string | undefined, max: number): string {
  return String(value ?? '').replace(/\s+/gu, ' ').trim().slice(0, max);
}
function stableOverlayId(overlay: AiOverlaySuggestion, index: number): string {
  const start = Math.round(overlay.start * 1000);
  const end = Math.round(overlay.end * 1000);
  return `editai-${overlay.type}-${start}-${end}-${index}`;
}

function mergedRemoveWindows(operations: readonly AiTimelineOperation[]): RemoveWindow[] {
  const ranges = operations
    .filter((operation): operation is Extract<AiTimelineOperation, { type: 'remove-range' }> => operation.type === 'remove-range')
    .map(({ start, end }) => ({ start, end }))
    .filter(({ start, end }) => Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start)
    .sort((a, b) => a.start - b.start);
  const merged: RemoveWindow[] = [];
  for (const range of ranges) {
    const previous = merged[merged.length - 1];
    if (!previous || range.start > previous.end) {
      merged.push({ ...range });
    } else {
      previous.end = Math.max(previous.end, range.end);
    }
  }
  return merged;
}

function mapTimeAfterRemovals(time: number, removals: readonly RemoveWindow[]): number {
  let removedBefore = 0;
  for (const range of removals) {
    if (time >= range.end) {
      removedBefore += range.end - range.start;
      continue;
    }
    if (time > range.start) return Math.max(0, range.start - removedBefore);
    break;
  }
  return Math.max(0, time - removedBefore);
}

/**
 * Overlays da IA são propostos no relógio da timeline ANTES dos cortes do mesmo
 * plano. Remove-range faz ripple; portanto remapeamos a janela para o relógio
 * resultante antes de gravar o edit-data. Trim deliberadamente não é remapeado
 * aqui: se o plano mistura trim temporal e overlay, a UI continua exigindo
 * revisão e o agente deve preferir remove-range para cortes semânticos.
 */
export function remapPlanOverlaysAfterRemovals(plan: AiEditPlan): AiEditPlan {
  const removals = mergedRemoveWindows(plan.operations);
  if (!removals.length || !(plan.overlays?.length)) return plan;
  const overlays = plan.overlays.flatMap((overlay) => {
    const start = mapTimeAfterRemovals(overlay.start, removals);
    const end = mapTimeAfterRemovals(overlay.end, removals);
    if (end - start < 0.2) return [];
    return [{ ...overlay, start, end }];
  });
  return { ...plan, overlays };
}

export function isOverlaySuggestionSupported(overlay: AiOverlaySuggestion): boolean {
  if (overlay.type === 'broll') return false;
  const text = cleanText(overlay.text, TEXT_LIMITS[overlay.type]);
  return text.length > 0
    && Number.isFinite(overlay.start)
    && Number.isFinite(overlay.end)
    && overlay.start >= 0
    && overlay.end > overlay.start;
}

export function editOperationsForOverlay(
  overlay: AiOverlaySuggestion,
  index: number,
  brand?: EditAiBrandKit,
): EditOperation[] {
  if (!isOverlaySuggestionSupported(overlay)) return [];
  const start = Math.max(0, overlay.start);
  const end = Math.max(start + 0.2, overlay.end);

  if (overlay.type === 'headline') {
    return [
      { op: 'set-layer-enabled', kind: 'hook', enabled: true },
      { op: 'set-headline-text', text: cleanText(overlay.text, TEXT_LIMITS.headline) },
      { op: 'set-headline-window', start, end },
    ];
  }

  if (overlay.type === 'broll') return [];
  const base = {
    id: stableOverlayId(overlay, index),
    kind: overlay.type,
    start,
    end,
    text: cleanText(overlay.text, TEXT_LIMITS[overlay.type]),
    style: overlay.type === 'cta' ? 'solid' : overlay.type === 'price' ? 'pill' : 'banner',
    position: overlay.type === 'price' ? 'top' : overlay.type === 'cta' ? 'bottom' : 'center',
  } as const;
  return [{
    op: 'upsert-commercial-callout',
    callout: brand ? calloutWithBrand(base, brand) : base,
  }];
}

export function editDataOperationsForPlan(plan: AiEditPlan, brand?: EditAiBrandKit): EditOperation[] {
  const mapped = remapPlanOverlaysAfterRemovals(plan);
  return (mapped.overlays ?? []).flatMap((overlay, index) => editOperationsForOverlay(overlay, index, brand));
}

export function editDataOperationsForBrand(
  editData: Record<string, unknown>,
  brand: EditAiBrandKit,
): EditOperation[] {
  const raw = Array.isArray(editData.commercialCallouts) ? editData.commercialCallouts : [];
  return raw.flatMap((value) => {
    const callout = sanitizeCommercialCallout(value);
    return callout ? [{ op: 'upsert-commercial-callout', callout: calloutWithBrand(callout, brand) } as EditOperation] : [];
  });
}
