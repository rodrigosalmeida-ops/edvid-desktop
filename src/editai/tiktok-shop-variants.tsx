import type { TikTokShopVariantId, TikTokShopVariantSet } from './tiktok-shop-engine';

export function TikTokShopVariantPanel({
  set,
  active,
  onSelect,
}: {
  set: TikTokShopVariantSet;
  active: TikTokShopVariantId;
  onSelect: (id: TikTokShopVariantId) => void;
}) {
  return (
    <section className="editai-variants" aria-label="Comparação A/B TikTok Shop">
      <header>
        <div><span>TIKTOK SHOP ENGINE</span><strong>Comparar versões</strong></div>
        {set.productHint ? <small>Produto citado: {set.productHint}</small> : <small>Produto: não identificado pela fala</small>}
      </header>
      <div className="editai-variant-grid">
        {set.variants.map((variant) => (
          <button
            key={variant.id}
            type="button"
            className={`editai-variant ${active === variant.id ? 'active' : ''}`}
            onClick={() => onSelect(variant.id)}
          >
            <span className="editai-variant-id">{variant.id}</span>
            <span className="editai-variant-copy">
              <strong>{variant.label}</strong>
              <small>{variant.openingEvidence ? `Destaque: ${variant.openingEvidence.text}` : 'Abertura atual preservada'}</small>
            </span>
            <span className="editai-variant-metrics">
              <b>{variant.report.score}<em>/100</em></b>
              <small>{variant.targetDurationS.toFixed(1)}s</small>
            </span>
          </button>
        ))}
      </div>
      <div className="editai-evidence-row">
        {set.evidence.slice().sort((a, b) => b.score - a.score).slice(0, 4).map((item) => (
          <span key={`${item.kind}:${item.start}`}>{item.kind} · {item.score}</span>
        ))}
      </div>
      {set.warnings.length > 0 && (
        <details className="editai-variant-warnings">
          <summary>Limites desta análise</summary>
          <ul>{set.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </details>
      )}
    </section>
  );
}
