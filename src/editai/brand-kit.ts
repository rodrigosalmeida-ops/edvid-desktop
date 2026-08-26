import type { CommercialCallout, CommercialCalloutKind, CommercialCalloutPosition, CommercialCalloutStyle } from './commercial-callout';

export type EditAiBrandFont = 'Poppins' | 'Inter' | 'Playfair Display' | 'Lora' | 'Libre Baskerville';
export type EditAiHeadlineStyle = 'outline' | 'card' | 'realce' | 'misto';
export type EditAiCaptionStyle = 'karaoke' | 'stacked' | 'scatter' | 'simples' | 'serifada' | 'classica';

export type EditAiBrandKit = {
  version: 1;
  id: string;
  name: string;
  primary: string;
  secondary: string;
  textColor: string;
  headlineFont: EditAiBrandFont;
  captionFont: EditAiBrandFont;
  commercialFont: EditAiBrandFont;
  headlineStyle: EditAiHeadlineStyle;
  captionStyle: EditAiCaptionStyle;
  calloutStyles: Record<CommercialCalloutKind, CommercialCalloutStyle>;
  calloutPositions: Record<CommercialCalloutKind, CommercialCalloutPosition>;
  zoomStrength: number;
  logoDataUrl?: string;
  updatedAt: number;
};

export type EditAiBrandSnapshot = Pick<
  EditAiBrandKit,
  'id' | 'name' | 'primary' | 'secondary' | 'textColor' | 'commercialFont'
>;

export const EDIT_AI_BRAND_STORAGE_KEY = 'editai:brand-kits:v1';
export const EDIT_AI_ACTIVE_BRAND_KEY = 'editai:brand-active:v1';

export const EDIT_AI_DEFAULT_BRAND: EditAiBrandKit = {
  version: 1,
  id: 'editai-default',
  name: 'Padrão EDIT AI',
  primary: '#FF6B2C',
  secondary: '#111318',
  textColor: '#FFFFFF',
  headlineFont: 'Poppins',
  captionFont: 'Poppins',
  commercialFont: 'Poppins',
  headlineStyle: 'outline',
  captionStyle: 'karaoke',
  calloutStyles: { price: 'pill', benefit: 'banner', cta: 'solid' },
  calloutPositions: { price: 'top', benefit: 'center', cta: 'bottom' },
  zoomStrength: 1.06,
  updatedAt: 0,
};

const FONTS = new Set<EditAiBrandFont>(['Poppins', 'Inter', 'Playfair Display', 'Lora', 'Libre Baskerville']);
const HEADLINES = new Set<EditAiHeadlineStyle>(['outline', 'card', 'realce', 'misto']);
const CAPTIONS = new Set<EditAiCaptionStyle>(['karaoke', 'stacked', 'scatter', 'simples', 'serifada', 'classica']);
const CALLOUT_STYLES = new Set<CommercialCalloutStyle>(['solid', 'pill', 'banner']);
const CALLOUT_POSITIONS = new Set<CommercialCalloutPosition>(['top', 'center', 'bottom']);

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function hex(value: unknown, fallback: string): string {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return /^#[0-9A-F]{6}$/u.test(normalized) ? normalized : fallback;
}

function safeId(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 64);
}

function text(value: unknown, fallback: string, max = 80): string {
  const clean = String(value ?? '').replace(/\s+/gu, ' ').trim().slice(0, max);
  return clean || fallback;
}

function font(value: unknown, fallback: EditAiBrandFont): EditAiBrandFont {
  return FONTS.has(value as EditAiBrandFont) ? value as EditAiBrandFont : fallback;
}

function kindMap<T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
  fallback: Record<CommercialCalloutKind, T>,
): Record<CommercialCalloutKind, T> {
  const raw = recordOf(value) ?? {};
  const pick = (kind: CommercialCalloutKind): T => allowed.has(raw[kind] as T) ? raw[kind] as T : fallback[kind];
  return { price: pick('price'), benefit: pick('benefit'), cta: pick('cta') };
}

export function sanitizeBrandKit(value: unknown, fallback = EDIT_AI_DEFAULT_BRAND): EditAiBrandKit {
  const raw = recordOf(value) ?? {};
  const id = safeId(raw.id) || safeId(raw.name) || fallback.id;
  const logo = typeof raw.logoDataUrl === 'string'
    && raw.logoDataUrl.length <= 700_000
    && /^data:image\/(?:png|jpeg|webp);base64,/u.test(raw.logoDataUrl)
    ? raw.logoDataUrl
    : undefined;
  const zoom = Number(raw.zoomStrength);
  return {
    version: 1,
    id,
    name: text(raw.name, fallback.name),
    primary: hex(raw.primary, fallback.primary),
    secondary: hex(raw.secondary, fallback.secondary),
    textColor: hex(raw.textColor, fallback.textColor),
    headlineFont: font(raw.headlineFont, fallback.headlineFont),
    captionFont: font(raw.captionFont, fallback.captionFont),
    commercialFont: font(raw.commercialFont, fallback.commercialFont),
    headlineStyle: HEADLINES.has(raw.headlineStyle as EditAiHeadlineStyle) ? raw.headlineStyle as EditAiHeadlineStyle : fallback.headlineStyle,
    captionStyle: CAPTIONS.has(raw.captionStyle as EditAiCaptionStyle) ? raw.captionStyle as EditAiCaptionStyle : fallback.captionStyle,
    calloutStyles: kindMap(raw.calloutStyles, CALLOUT_STYLES, fallback.calloutStyles),
    calloutPositions: kindMap(raw.calloutPositions, CALLOUT_POSITIONS, fallback.calloutPositions),
    zoomStrength: Number.isFinite(zoom) ? Math.max(1, Math.min(1.18, zoom)) : fallback.zoomStrength,
    ...(logo ? { logoDataUrl: logo } : {}),
    updatedAt: Number.isFinite(Number(raw.updatedAt)) ? Math.max(0, Number(raw.updatedAt)) : Date.now(),
  };
}

export function brandSnapshot(brand: EditAiBrandKit): EditAiBrandSnapshot {
  return {
    id: brand.id,
    name: brand.name,
    primary: brand.primary,
    secondary: brand.secondary,
    textColor: brand.textColor,
    commercialFont: brand.commercialFont,
  };
}

export function calloutWithBrand(callout: CommercialCallout, brand: EditAiBrandKit): CommercialCallout {
  return {
    ...callout,
    accent: brand.primary,
    style: brand.calloutStyles[callout.kind],
    position: brand.calloutPositions[callout.kind],
    fontFamily: brand.commercialFont,
  };
}

export function stylePatchForBrand(brand: EditAiBrandKit): {
  accent: string;
  headline: EditAiHeadlineStyle;
  captions: EditAiCaptionStyle;
  elements: { zoomAuto: boolean; zoomCuts: boolean };
} {
  return {
    accent: brand.primary,
    headline: brand.headlineStyle,
    captions: brand.captionStyle,
    elements: { zoomAuto: brand.zoomStrength > 1.001, zoomCuts: brand.zoomStrength >= 1.03 },
  };
}

export function brandBriefing(brand: EditAiBrandKit): string {
  return [
    `Brand Kit ativo: ${brand.name}.`,
    `Cor principal: ${brand.primary}; secundária: ${brand.secondary}; texto: ${brand.textColor}.`,
    `Headline: ${brand.headlineStyle}, fonte ${brand.headlineFont}.`,
    `Legendas: ${brand.captionStyle}, fonte ${brand.captionFont}.`,
    `Elementos comerciais: fonte ${brand.commercialFont}; preço ${brand.calloutStyles.price}/${brand.calloutPositions.price}; benefício ${brand.calloutStyles.benefit}/${brand.calloutPositions.benefit}; CTA ${brand.calloutStyles.cta}/${brand.calloutPositions.cta}.`,
    `Zoom máximo de marca: ${Math.round(brand.zoomStrength * 100)}%.`,
    'Não invente cores, preço, desconto, benefício nem identidade fora deste kit.',
  ].join(' ');
}
