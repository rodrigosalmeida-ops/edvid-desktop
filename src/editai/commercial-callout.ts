export type CommercialCalloutKind = 'cta' | 'price' | 'benefit';
export type CommercialCalloutStyle = 'solid' | 'pill' | 'banner';
export type CommercialCalloutPosition = 'top' | 'center' | 'bottom';

export type CommercialCallout = {
  id: string;
  kind: CommercialCalloutKind;
  start: number;
  end: number;
  text: string;
  accent?: string;
  style?: CommercialCalloutStyle;
  position?: CommercialCalloutPosition;
  fontFamily?: string;
};

export type CommercialDragMode = 'move' | 'start' | 'end';

const MIN_WINDOW = 0.2;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundFrame(value: number, fps: number): number {
  const safeFps = Number.isFinite(fps) && fps > 0 ? fps : 30;
  return Math.round(value * safeFps) / safeFps;
}

export function sanitizeCommercialCallout(value: unknown): CommercialCallout | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const id = String(raw.id ?? '').trim();
  const kind = String(raw.kind ?? '');
  const start = Number(raw.start);
  const end = Number(raw.end);
  const text = String(raw.text ?? '').replace(/\s+/gu, ' ').trim();
  if (!id || !['cta', 'price', 'benefit'].includes(kind) || !Number.isFinite(start) || !Number.isFinite(end) || end <= start || !text) {
    return null;
  }
  return {
    id,
    kind: kind as CommercialCalloutKind,
    start,
    end,
    text,
    ...(typeof raw.accent === 'string' ? { accent: raw.accent } : {}),
    ...(['solid', 'pill', 'banner'].includes(String(raw.style)) ? { style: raw.style as CommercialCalloutStyle } : {}),
    ...(['top', 'center', 'bottom'].includes(String(raw.position)) ? { position: raw.position as CommercialCalloutPosition } : {}),
    ...(typeof raw.fontFamily === 'string' && raw.fontFamily.trim() ? { fontFamily: raw.fontFamily.trim().slice(0, 80) } : {}),
  };
}

export function commercialCalloutAtPointer({
  base,
  mode,
  pointerTime,
  grabOffset,
  duration,
  fps,
  snapPoints = [],
  snapTolerance = 0,
}: {
  base: CommercialCallout;
  mode: CommercialDragMode;
  pointerTime: number;
  grabOffset: number;
  duration: number;
  fps: number;
  snapPoints?: readonly number[];
  snapTolerance?: number;
}): CommercialCallout {
  const safeDuration = Math.max(MIN_WINDOW, Number.isFinite(duration) ? duration : base.end);
  const snap = (candidate: number): number => {
    let best = candidate;
    let bestDistance = Math.max(0, snapTolerance);
    for (const point of snapPoints) {
      if (!Number.isFinite(point)) continue;
      const distance = Math.abs(point - candidate);
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = point;
      }
    }
    return roundFrame(best, fps);
  };

  if (mode === 'move') {
    const length = Math.max(MIN_WINDOW, base.end - base.start);
    let start = clamp(pointerTime - grabOffset, 0, Math.max(0, safeDuration - length));
    const candidateEnd = start + length;
    // Ambas as pontas disputam o snap; vence o menor ajuste.
    const startSnap = snap(start);
    const endSnap = snap(candidateEnd);
    const startDelta = Math.abs(startSnap - start);
    const endDelta = Math.abs(endSnap - candidateEnd);
    if (startDelta <= snapTolerance || endDelta <= snapTolerance) {
      start += startDelta <= endDelta ? startSnap - start : endSnap - candidateEnd;
    }
    start = roundFrame(clamp(start, 0, Math.max(0, safeDuration - length)), fps);
    return { ...base, start, end: roundFrame(start + length, fps) };
  }

  if (mode === 'start') {
    const start = snap(clamp(pointerTime, 0, base.end - MIN_WINDOW));
    return { ...base, start: clamp(start, 0, base.end - MIN_WINDOW) };
  }

  const end = snap(clamp(pointerTime, base.start + MIN_WINDOW, safeDuration));
  return { ...base, end: clamp(end, base.start + MIN_WINDOW, safeDuration) };
}

export function commercialCalloutLabel(kind: CommercialCalloutKind): string {
  if (kind === 'price') return 'Preço';
  if (kind === 'cta') return 'CTA';
  return 'Benefício';
}
