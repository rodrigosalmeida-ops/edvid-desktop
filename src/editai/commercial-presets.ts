export type EditAiPresetId =
  | 'tiktok_shop'
  | 'viral'
  | 'vendas'
  | 'demonstracao'
  | 'depoimento'
  | 'clean'
  | 'especialista'
  | 'podcast';

export type EditAiPreset = {
  id: EditAiPresetId;
  label: string;
  aspect: '9:16' | '1:1' | '16:9' | 'preserve';
  silenceMin: number;
  silencePadding: number;
  semanticAggressiveness: 'low' | 'medium' | 'high';
  captionStyle: 'clean' | 'impact' | 'karaoke';
  captionSize: number;
  zoomStrength: number;
  hookReview: boolean;
  commercial: boolean;
};

export const EDIT_AI_PRESETS: Record<EditAiPresetId, EditAiPreset> = {
  tiktok_shop: {
    id: 'tiktok_shop', label: 'TikTok Shop', aspect: '9:16', silenceMin: 0.24,
    silencePadding: 0.055, semanticAggressiveness: 'high', captionStyle: 'impact',
    captionSize: 58, zoomStrength: 1.10, hookReview: true, commercial: true,
  },
  viral: {
    id: 'viral', label: 'TikTok Viral', aspect: '9:16', silenceMin: 0.28,
    silencePadding: 0.07, semanticAggressiveness: 'high', captionStyle: 'karaoke',
    captionSize: 54, zoomStrength: 1.08, hookReview: true, commercial: false,
  },
  vendas: {
    id: 'vendas', label: 'Vídeo de Vendas', aspect: '9:16', silenceMin: 0.25,
    silencePadding: 0.06, semanticAggressiveness: 'high', captionStyle: 'impact',
    captionSize: 56, zoomStrength: 1.10, hookReview: true, commercial: true,
  },
  demonstracao: {
    id: 'demonstracao', label: 'Demonstração de Produto', aspect: '9:16', silenceMin: 0.30,
    silencePadding: 0.07, semanticAggressiveness: 'medium', captionStyle: 'impact',
    captionSize: 54, zoomStrength: 1.07, hookReview: true, commercial: true,
  },
  depoimento: {
    id: 'depoimento', label: 'Depoimento', aspect: '9:16', silenceMin: 0.48,
    silencePadding: 0.10, semanticAggressiveness: 'medium', captionStyle: 'clean',
    captionSize: 48, zoomStrength: 1.04, hookReview: true, commercial: false,
  },
  clean: {
    id: 'clean', label: 'Clean Profissional', aspect: '9:16', silenceMin: 0.55,
    silencePadding: 0.12, semanticAggressiveness: 'low', captionStyle: 'clean',
    captionSize: 46, zoomStrength: 1.03, hookReview: false, commercial: false,
  },
  especialista: {
    id: 'especialista', label: 'Especialista', aspect: '9:16', silenceMin: 0.42,
    silencePadding: 0.10, semanticAggressiveness: 'medium', captionStyle: 'clean',
    captionSize: 48, zoomStrength: 1.04, hookReview: true, commercial: false,
  },
  podcast: {
    id: 'podcast', label: 'Podcast', aspect: 'preserve', silenceMin: 0.75,
    silencePadding: 0.15, semanticAggressiveness: 'low', captionStyle: 'clean',
    captionSize: 44, zoomStrength: 1.02, hookReview: false, commercial: false,
  },
};

export function buildPresetBriefing(presetId: EditAiPresetId): string {
  const preset = EDIT_AI_PRESETS[presetId];
  return [
    `Preset: ${preset.label}.`,
    `Formato preferido: ${preset.aspect}.`,
    `Remover pausas apenas quando preservarem naturalidade; referência ${preset.silenceMin.toFixed(2)}s.`,
    `Agressividade semântica: ${preset.semanticAggressiveness}.`,
    `Legenda: ${preset.captionStyle}, tamanho-base ${preset.captionSize}.`,
    `Zoom máximo sugerido: ${Math.round(preset.zoomStrength * 100)}%.`,
    preset.hookReview ? 'Revisar obrigatoriamente os primeiros 3 segundos.' : 'Gancho não precisa ser agressivo.',
    preset.commercial ? 'Priorizar benefício, prova, oferta verdadeira e CTA; nunca inventar preço.' : '',
  ].filter(Boolean).join(' ');
}
