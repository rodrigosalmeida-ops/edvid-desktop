import { useEffect, useState } from 'react';
import { calloutWithBrand, type EditAiBrandKit } from './brand-kit';
import type { CommercialCallout } from './commercial-callout';
import './commercial-inspector.css';

type Props = {
  item: CommercialCallout;
  brandAccent: string;
  brand?: EditAiBrandKit;
  duration: number;
  onCommit: (next: CommercialCallout) => void;
  onDelete: () => void;
};

function numberText(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : '0.00';
}

export function CommercialInspector({ item, brandAccent, brand, duration, onCommit, onDelete }: Props) {
  const [draftText, setDraftText] = useState(item.text);
  useEffect(() => setDraftText(item.text), [item.id, item.text]);

  const patch = (changes: Partial<CommercialCallout>) => onCommit({ ...item, ...changes });
  const safeEnd = Math.max(item.start + 0.2, duration || item.end);

  return (
    <aside className="editai-commercial-inspector" aria-label="Inspector da oferta">
      <div className="editai-inspector-head">
        <div>
          <small>EDIT AI</small>
          <strong>Oferta</strong>
        </div>
        <span className={`editai-kind-dot ${item.kind}`} />
      </div>

      <label>
        <span>Tipo</span>
        <select value={item.kind} onChange={(event) => patch({ kind: event.target.value as CommercialCallout['kind'] })}>
          <option value="price">Preço</option>
          <option value="benefit">Benefício</option>
          <option value="cta">CTA</option>
        </select>
      </label>

      <label>
        <span>Texto</span>
        <textarea
          rows={3}
          value={draftText}
          maxLength={120}
          onChange={(event) => setDraftText(event.target.value)}
          onBlur={() => {
            const text = draftText.replace(/\s+/gu, ' ').trim();
            if (text && text !== item.text) patch({ text });
            else setDraftText(item.text);
          }}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') { setDraftText(item.text); event.currentTarget.blur(); }
          }}
        />
      </label>

      <div className="editai-inspector-grid">
        <label>
          <span>Posição</span>
          <select value={item.position ?? 'bottom'} onChange={(event) => patch({ position: event.target.value as CommercialCallout['position'] })}>
            <option value="top">Topo</option>
            <option value="center">Centro</option>
            <option value="bottom">Inferior</option>
          </select>
        </label>
        <label>
          <span>Estilo</span>
          <select value={item.style ?? 'pill'} onChange={(event) => patch({ style: event.target.value as CommercialCallout['style'] })}>
            <option value="pill">Pill</option>
            <option value="solid">Sólido</option>
            <option value="banner">Banner</option>
          </select>
        </label>
      </div>

      <div className="editai-inspector-grid">
        <label>
          <span>Início</span>
          <input
            key={`${item.id}:start:${item.start}`}
            type="number" min={0} max={Math.max(0, item.end - 0.2)} step={0.05}
            defaultValue={numberText(item.start)}
            onBlur={(event) => {
              const start = Number(event.target.value);
              if (Number.isFinite(start) && Math.abs(start - item.start) > 0.001) patch({ start: Math.max(0, Math.min(start, item.end - 0.2)) });
              else event.currentTarget.value = numberText(item.start);
            }}
            onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
          />
        </label>
        <label>
          <span>Fim</span>
          <input
            key={`${item.id}:end:${item.end}`}
            type="number" min={item.start + 0.2} max={safeEnd} step={0.05}
            defaultValue={numberText(item.end)}
            onBlur={(event) => {
              const end = Number(event.target.value);
              if (Number.isFinite(end) && Math.abs(end - item.end) > 0.001) patch({ end: Math.max(item.start + 0.2, Math.min(end, safeEnd)) });
              else event.currentTarget.value = numberText(item.end);
            }}
            onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
          />
        </label>
      </div>

      <label>
        <span>Cor</span>
        <div className="editai-color-row">
          <input type="color" value={item.accent ?? brandAccent} onChange={(event) => patch({ accent: event.target.value })} />
          <button type="button" onClick={() => patch({ accent: brand?.primary ?? brandAccent })}>Usar cor da marca</button>
        </div>
      </label>

      {brand && (
        <button type="button" onClick={() => onCommit(calloutWithBrand(item, brand))}>
          Aplicar Brand Kit “{brand.name}”
        </button>
      )}
      <div className="editai-inspector-meta">
        <span>Duração</span>
        <strong>{Math.max(0, item.end - item.start).toFixed(2)}s</strong>
      </div>
      <div className="editai-inspector-meta">
        <span>Fonte</span>
        <strong>{item.fontFamily ?? brand?.commercialFont ?? 'Padrão'}</strong>
      </div>

      <button type="button" className="editai-inspector-delete" onClick={onDelete}>Excluir elemento</button>
      <small className="editai-inspector-hint">Arraste o chip na timeline para mover. Arraste as bordas para ajustar a duração.</small>
    </aside>
  );
}
