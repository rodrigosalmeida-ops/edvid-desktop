import type { EditOperation } from '../edit-data-edits';

export type EditAiVisualHistoryEntry = {
  undo: EditOperation[];
  redo: EditOperation[];
};

type CommercialCallout = {
  id: string;
  kind: 'cta' | 'price' | 'benefit';
  start: number;
  end: number;
  text: string;
  accent?: string;
  style?: 'solid' | 'pill' | 'banner';
  position?: 'top' | 'center' | 'bottom';
  fontFamily?: string;
};

function cleanCallout(value: unknown): CommercialCallout | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const id = String(raw.id ?? '').trim();
  const kind = String(raw.kind ?? '');
  const start = Number(raw.start);
  const end = Number(raw.end);
  const text = String(raw.text ?? '').trim();
  if (!id || !['cta', 'price', 'benefit'].includes(kind) || !Number.isFinite(start) || !Number.isFinite(end) || end <= start || !text) {
    return null;
  }
  const callout: CommercialCallout = { id, kind: kind as CommercialCallout['kind'], start, end, text };
  if (typeof raw.accent === 'string') callout.accent = raw.accent;
  if (['solid', 'pill', 'banner'].includes(String(raw.style))) callout.style = raw.style as CommercialCallout['style'];
  if (['top', 'center', 'bottom'].includes(String(raw.position))) callout.position = raw.position as CommercialCallout['position'];
  if (typeof raw.fontFamily === 'string' && raw.fontFamily.trim()) callout.fontFamily = raw.fontFamily.trim().slice(0, 80);
  return callout;
}

function calloutsOf(data: Record<string, unknown>): CommercialCallout[] {
  return Array.isArray(data.commercialCallouts)
    ? data.commercialCallouts.flatMap((value) => {
        const item = cleanCallout(value);
        return item ? [item] : [];
      })
    : [];
}

function headlineSnapshot(data: Record<string, unknown>): Extract<EditOperation, { op: 'restore-editai-headline' }>['snapshot'] {
  const hook = data.hook && typeof data.hook === 'object' ? data.hook as Record<string, unknown> : {};
  const lines = Array.isArray(hook.lines) ? hook.lines.filter((line): line is string => typeof line === 'string').slice(0, 8) : undefined;
  return {
    enabled: typeof hook.enabled === 'boolean' ? hook.enabled : true,
    text: typeof hook.text === 'string' ? hook.text : '',
    lines,
    startSec: Number.isFinite(Number(hook.startSec)) ? Number(hook.startSec) : 0,
    endSec: Number.isFinite(Number(hook.endSec)) ? Number(hook.endSec) : undefined,
  };
}


function brandStyleSnapshot(data: Record<string, unknown>): Extract<EditOperation, { op: 'restore-editai-brand-style' }>['snapshot'] {
  const hook = data.hook && typeof data.hook === 'object' ? data.hook as Record<string, unknown> : {};
  const captions = data.captions && typeof data.captions === 'object' ? data.captions as Record<string, unknown> : {};
  return {
    headlineFont: typeof hook.fontFamily === 'string' ? hook.fontFamily : undefined,
    captionFont: typeof captions.fontFamily === 'string' ? captions.fontFamily : undefined,
    hookAccent: typeof hook.accent === 'string' ? hook.accent : undefined,
    captionAccent: typeof captions.accent === 'string' ? captions.accent : undefined,
    hookLogo: typeof hook.logo === 'string' ? hook.logo : undefined,
  };
}

/**
 * Cria o par Undo/Redo APENAS para mutações comerciais do EDIT AI.
 * A lista de redo já passou pela validação do domínio. O undo nunca restaura
 * o edit-data inteiro: só o headline tocado pelo lote e os callouts com IDs
 * envolvidos. Isso evita apagar alterações independentes do usuário.
 */
export function buildEditAiVisualHistoryEntry(
  before: Record<string, unknown>,
  operations: readonly EditOperation[],
): EditAiVisualHistoryEntry | null {
  if (!operations.length) return null;
  const priorCallouts = new Map(calloutsOf(before).map((item) => [item.id, item]));
  const undo: EditOperation[] = [];
  let headlineTouched = false;
  let brandStyleTouched = false;

  for (const operation of [...operations].reverse()) {
    if (operation.op === 'set-headline-text' || operation.op === 'set-headline-window'
      || (operation.op === 'set-layer-enabled' && operation.kind === 'hook')) {
      headlineTouched = true;
      continue;
    }
    if (operation.op === 'set-editai-brand-style') {
      brandStyleTouched = true;
      continue;
    }
    if (operation.op === 'upsert-commercial-callout') {
      const previous = priorCallouts.get(operation.callout.id);
      undo.push(previous
        ? { op: 'upsert-commercial-callout', callout: previous }
        : { op: 'remove-commercial-callout', id: operation.callout.id });
      continue;
    }
    if (operation.op === 'remove-commercial-callout') {
      const previous = priorCallouts.get(operation.id);
      if (previous) undo.push({ op: 'upsert-commercial-callout', callout: previous });
    }
  }

  if (headlineTouched) {
    undo.push({ op: 'restore-editai-headline', snapshot: headlineSnapshot(before) });
  }
  if (brandStyleTouched) {
    undo.push({ op: 'restore-editai-brand-style', snapshot: brandStyleSnapshot(before) });
  }

  return undo.length ? { undo, redo: [...operations] } : null;
}
