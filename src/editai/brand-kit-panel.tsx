import { useEffect, useState, type ChangeEvent, type CSSProperties } from 'react';
import {
  EDIT_AI_DEFAULT_BRAND,
  sanitizeBrandKit,
  type EditAiBrandFont,
  type EditAiBrandKit,
  type EditAiCaptionStyle,
  type EditAiHeadlineStyle,
} from './brand-kit';
import './brand-kit-panel.css';

const FONTS: EditAiBrandFont[] = ['Poppins', 'Inter', 'Playfair Display', 'Lora', 'Libre Baskerville'];
const HEADLINES: EditAiHeadlineStyle[] = ['outline', 'card', 'realce', 'misto'];
const CAPTIONS: EditAiCaptionStyle[] = ['karaoke', 'stacked', 'scatter', 'simples', 'serifada', 'classica'];

function cloneBrand(source: EditAiBrandKit, index: number): EditAiBrandKit {
  return sanitizeBrandKit({
    ...source,
    id: `${source.id}-copia-${Date.now()}-${index}`,
    name: `${source.name} — cópia`,
    updatedAt: Date.now(),
  });
}

async function logoFromFile(file: File): Promise<string> {
  if (!/^image\/(?:png|jpeg|webp)$/u.test(file.type)) throw new Error('Use PNG, JPG ou WebP.');
  if (file.size > 512 * 1024) throw new Error('O logo deve ter no máximo 512 KB nesta versão.');
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Não consegui ler o logo.'));
    reader.readAsDataURL(file);
  });
}

export function BrandKitPanel({
  brands,
  activeId,
  onSelect,
  onSave,
  onDelete,
  onApply,
}: {
  brands: readonly EditAiBrandKit[];
  activeId: string;
  onSelect: (id: string) => void;
  onSave: (brand: EditAiBrandKit) => void;
  onDelete: (id: string) => void;
  onApply: (brand: EditAiBrandKit) => void;
}) {
  const selected = brands.find((brand) => brand.id === activeId) ?? brands[0] ?? EDIT_AI_DEFAULT_BRAND;
  const [draft, setDraft] = useState<EditAiBrandKit>(selected);
  const [error, setError] = useState('');
  useEffect(() => { setDraft(selected); setError(''); }, [selected.id, selected.updatedAt]);

  const patch = (changes: Partial<EditAiBrandKit>) => setDraft((current) => sanitizeBrandKit({ ...current, ...changes }));
  const patchCallout = <K extends 'calloutStyles' | 'calloutPositions'>(key: K, kind: 'price' | 'benefit' | 'cta', value: EditAiBrandKit[K]['price']) => {
    setDraft((current) => sanitizeBrandKit({ ...current, [key]: { ...current[key], [kind]: value } }));
  };

  const onLogo = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    try { patch({ logoDataUrl: await logoFromFile(file) }); setError(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Logo inválido.'); }
  };

  return (
    <section className="editai-brand-kit" aria-label="Brand Kit EDIT AI">
      <header>
        <div><small>EDIT AI</small><h3>Brand Kit</h3><p>Salve identidade visual e reutilize em qualquer projeto.</p></div>
        <div className="editai-brand-actions">
          <button type="button" onClick={() => onSave(cloneBrand(selected, brands.length))}>Duplicar</button>
          <button type="button" className="primary" onClick={() => { const clean = sanitizeBrandKit({ ...draft, updatedAt: Date.now() }); onSave(clean); onSelect(clean.id); }}>Salvar</button>
        </div>
      </header>

      <div className="editai-brand-layout">
        <nav className="editai-brand-list" aria-label="Marcas salvas">
          {brands.map((brand) => (
            <button type="button" key={brand.id} className={brand.id === activeId ? 'active' : ''} onClick={() => onSelect(brand.id)}>
              <span className="swatch" style={{ background: brand.primary }} />
              <span><strong>{brand.name}</strong><small>{brand.headlineStyle} · {brand.captionStyle}</small></span>
            </button>
          ))}
        </nav>

        <div className="editai-brand-form">
          <label className="wide"><span>Nome da marca</span><input value={draft.name} maxLength={80} onChange={(e) => patch({ name: e.target.value })} /></label>
          <div className="editai-brand-grid colors">
            <label><span>Principal</span><input type="color" value={draft.primary} onChange={(e) => patch({ primary: e.target.value })} /></label>
            <label><span>Secundária</span><input type="color" value={draft.secondary} onChange={(e) => patch({ secondary: e.target.value })} /></label>
            <label><span>Texto</span><input type="color" value={draft.textColor} onChange={(e) => patch({ textColor: e.target.value })} /></label>
          </div>

          <div className="editai-brand-grid">
            <label><span>Estilo da headline</span><select value={draft.headlineStyle} onChange={(e) => patch({ headlineStyle: e.target.value as EditAiHeadlineStyle })}>{HEADLINES.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label><span>Fonte da headline</span><select value={draft.headlineFont} onChange={(e) => patch({ headlineFont: e.target.value as EditAiBrandFont })}>{FONTS.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label><span>Estilo da legenda</span><select value={draft.captionStyle} onChange={(e) => patch({ captionStyle: e.target.value as EditAiCaptionStyle })}>{CAPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label><span>Fonte da legenda</span><select value={draft.captionFont} onChange={(e) => patch({ captionFont: e.target.value as EditAiBrandFont })}>{FONTS.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label><span>Fonte de preço/CTA</span><select value={draft.commercialFont} onChange={(e) => patch({ commercialFont: e.target.value as EditAiBrandFont })}>{FONTS.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label><span>Zoom máximo</span><input type="range" min="1" max="1.18" step="0.01" value={draft.zoomStrength} onChange={(e) => patch({ zoomStrength: Number(e.target.value) })} /><b>{Math.round(draft.zoomStrength * 100)}%</b></label>
          </div>

          <div className="editai-callout-brand-table">
            <strong>Oferta</strong>
            {(['price', 'benefit', 'cta'] as const).map((kind) => (
              <div key={kind}>
                <span>{kind === 'price' ? 'Preço' : kind === 'benefit' ? 'Benefício' : 'CTA'}</span>
                <select value={draft.calloutStyles[kind]} onChange={(e) => patchCallout('calloutStyles', kind, e.target.value as EditAiBrandKit['calloutStyles']['price'])}>
                  <option value="pill">Pill</option><option value="solid">Sólido</option><option value="banner">Banner</option>
                </select>
                <select value={draft.calloutPositions[kind]} onChange={(e) => patchCallout('calloutPositions', kind, e.target.value as EditAiBrandKit['calloutPositions']['price'])}>
                  <option value="top">Topo</option><option value="center">Centro</option><option value="bottom">Inferior</option>
                </select>
              </div>
            ))}
          </div>

          <div className="editai-brand-logo-row">
            <div className="editai-brand-logo-preview" style={{ borderColor: draft.primary }}>{draft.logoDataUrl ? <img src={draft.logoDataUrl} alt="Logo da marca" /> : <span>LOGO</span>}</div>
            <label className="file-button"><span>Logo PNG/JPG/WebP</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={onLogo} /></label>
            {draft.logoDataUrl && <button type="button" onClick={() => setDraft(({ logoDataUrl: _logo, ...rest }) => rest as EditAiBrandKit)}>Remover logo</button>}
          </div>
          {error && <p className="editai-brand-error">{error}</p>}

          <div className="editai-brand-footer">
            <div className="editai-brand-preview" style={{ '--brand': draft.primary, '--brand2': draft.secondary } as CSSProperties}>
              <span className="price">R$ 49,90</span><span className="caption">Seu produto em destaque</span><span className="cta">Confira agora</span>
            </div>
            <div>
              <button type="button" className="primary" onClick={() => { const clean = sanitizeBrandKit({ ...draft, updatedAt: Date.now() }); onSave(clean); onSelect(clean.id); onApply(clean); }}>Aplicar à edição atual</button>
              {selected.id !== EDIT_AI_DEFAULT_BRAND.id && <button type="button" className="danger" onClick={() => onDelete(selected.id)}>Excluir marca</button>}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
