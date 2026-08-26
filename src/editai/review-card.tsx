import type { EditAiPresetId } from './commercial-presets';
import { EDIT_AI_PRESETS } from './commercial-presets';
import { reviewItems, type EditAiReviewState } from './review-plan';

export function EditAiReviewCard({
  state,
  preset,
  applying,
  onToggle,
  onApply,
  onDiscard,
  onEnhance,
  enhancing,
}: {
  state: EditAiReviewState;
  preset: EditAiPresetId;
  applying: boolean;
  onToggle: (id: string) => void;
  onApply: () => void;
  onDiscard: () => void;
  onEnhance?: () => void;
  enhancing?: boolean;
}) {
  const items = reviewItems(state);
  const selectedSupported = items.filter((item) => item.supported && state.selection[item.id] !== false).length;
  const report = state.report;
  return (
    <section className="editai-review" aria-label="Revisão das sugestões do EDIT AI">
      <header className="editai-review-head">
        <div>
          <span className="editai-review-kicker">ANÁLISE EDIT AI</span>
          <strong>{EDIT_AI_PRESETS[preset].label}</strong>
        </div>
        {report ? (
          <div className={`editai-score score-${report.label}`} title={report.disclaimer}>
            <b>{report.score}</b><span>/100</span>
          </div>
        ) : (
          <div className="editai-score pending"><b>IA</b><span>plano</span></div>
        )}
      </header>

      {report && (
        <div className="editai-dimensions">
          <span><b>{report.dimensions.hook3s}</b>Gancho</span>
          <span><b>{report.dimensions.pacing}</b>Ritmo</span>
          <span><b>{report.dimensions.commercialClarity}</b>Oferta</span>
          <span><b>{report.dimensions.lengthFit}</b>Duração</span>
        </div>
      )}

      <div className="editai-review-list">
        {items.length === 0 ? (
          <p className="editai-review-empty">Nenhuma alteração automática necessária neste momento.</p>
        ) : items.map((item) => {
          const checked = state.selection[item.id] === true || (item.supported && state.selection[item.id] !== false);
          return (
            <label key={item.id} className={`editai-review-item ${!item.supported ? 'future' : ''}`}>
              <input
                type="checkbox"
                checked={checked}
                disabled={!item.supported}
                onChange={() => onToggle(item.id)}
              />
              <span className="editai-review-check" aria-hidden="true">✓</span>
              <span className="editai-review-copy">
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
              </span>
              {item.start !== undefined && item.end !== undefined && (
                <span className="editai-review-time">{item.start.toFixed(1)}–{item.end.toFixed(1)}s</span>
              )}
              {!item.supported && <em>Em breve</em>}
              {item.supported && item.kind === 'overlay' && <em className="ready">Visual</em>}
            </label>
          );
        })}
      </div>

      {report?.suggestions?.length ? (
        <details className="editai-review-notes">
          <summary>Por que o EDIT AI sugeriu isso?</summary>
          <ul>{report.suggestions.slice(0, 5).map((item) => <li key={item}>{item}</li>)}</ul>
        </details>
      ) : null}

      <footer className="editai-review-actions">
        {onEnhance && <button type="button" className="btn ghost small" onClick={onEnhance} disabled={applying || enhancing}>{enhancing ? 'Revisando…' : 'Revisar com IA'}</button>}
        <button type="button" className="btn ghost small" onClick={onDiscard} disabled={applying}>Descartar</button>
        <button type="button" className="btn primary" onClick={onApply} disabled={applying || selectedSupported === 0}>
          {applying ? 'Aplicando…' : `Aplicar ${selectedSupported} ${selectedSupported === 1 ? 'alteração' : 'alterações'}`}
        </button>
      </footer>
      <p className="editai-review-disclaimer">A nota é heurística de produção, não uma previsão oficial do TikTok, Instagram ou YouTube.</p>
    </section>
  );
}
