export type TranscriptWord = { word?: string; start?: number; end?: number };
export type TranscriptSegment = {
  text?: string;
  start?: number;
  end?: number;
  words?: TranscriptWord[];
};

export type SilenceRange = { start: number; end: number };

export type RetentionReport = {
  score: number;
  label: 'forte' | 'boa' | 'mediana' | 'fraca';
  dimensions: {
    hook3s: number;
    pacing: number;
    commercialClarity: number;
    lengthFit: number;
  };
  signals: {
    durationS: number;
    wordCount: number;
    wordsPerMinute: number;
    silenceRatio: number;
    longestSilenceS: number;
    ctaDetected: boolean;
    priceDetected: boolean;
    benefitDetected: boolean;
  };
  suggestions: string[];
  disclaimer: string;
};

const HOOK_WORDS = new Set([
  'pare', 'atenção', 'atencao', 'erro', 'segredo', 'ninguém', 'ninguem', 'nunca',
  'como', 'porque', 'antes', 'cuidado', 'dinheiro', 'barato', 'grátis', 'gratis',
  'desconto', 'oferta', 'hoje', 'agora', 'você', 'voce', 'seu', 'sua', 'resultado',
  'problema', 'evite', 'olha', 'descobri', 'testei', 'funciona',
]);

const WORD_RE = /[\p{L}\p{N}_]+/gu;
const CTA_RE = /\b(compre|comprar|garanta|aproveite|clique|clica|link|carrinho|peça|peca|pedido|siga|segue|comenta|comente|salva|compartilha)\b/iu;
const PRICE_RE = /(?:r\$\s?\d|\b\d+[,.]\d{2}\b|\bpor\s+\d+\b)/iu;
const PT_NUMBER = '(?:um|uma|dois|duas|tres|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|catorze|quatorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|duzentos|trezentos|quatrocentos|quinhentos|seiscentos|setecentos|oitocentos|novecentos|mil)';
const SPOKEN_PRICE_RE = new RegExp(
  `\\b${PT_NUMBER}(?:\\s+(?:e\\s+)?${PT_NUMBER}){0,5}\\s+reais?(?:\\s+e\\s+${PT_NUMBER}(?:\\s+(?:e\\s+)?${PT_NUMBER}){0,2}\\s+centavos?)?\\b`,
  'iu',
);
const BENEFIT_RE = /\b(benef[ií]cio|resolve|ajuda|melhora|reduz|aumenta|protege|hidrata|fortalece|economiza|pr[aá]tico|r[aá]pido|f[aá]cil)\b/iu;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function segmentText(transcript: readonly TranscriptSegment[]): string {
  return transcript.map((segment) => String(segment.text ?? '').trim()).filter(Boolean).join(' ');
}

function tokens(text: string): string[] {
  return (text.toLocaleLowerCase('pt-BR').match(WORD_RE) ?? []);
}

function wordsUntil(transcript: readonly TranscriptSegment[], endSeconds: number): string[] {
  const out: string[] = [];
  for (const segment of transcript) {
    const segmentStart = Number(segment.start ?? 0);
    if (segmentStart >= endSeconds) break;
    if (Array.isArray(segment.words) && segment.words.length) {
      for (const word of segment.words) {
        const start = Number(word.start ?? segmentStart);
        if (start <= endSeconds) out.push(...tokens(String(word.word ?? '')));
      }
    } else {
      out.push(...tokens(String(segment.text ?? '')));
    }
  }
  return out;
}

export function retentionReport(
  transcript: readonly TranscriptSegment[],
  durationInput: number,
  silences: readonly SilenceRange[],
  preset = 'viral',
): RetentionReport {
  const duration = Math.max(0.01, Number.isFinite(durationInput) ? durationInput : 0.01);
  const text = segmentText(transcript);
  const lower = text.toLocaleLowerCase('pt-BR');
  const allWords = tokens(lower);
  const hookWords = wordsUntil(transcript, 3);

  const hookDensity = Math.min(1, hookWords.length / 9);
  const hookPower = Math.min(1, hookWords.filter((word) => HOOK_WORDS.has(word)).length / 2);
  const hook3s = Math.round(100 * (0.58 * hookDensity + 0.42 * hookPower));

  const silenceDurations = silences.map((silence) => Math.max(0, silence.end - silence.start));
  const silenceTotal = silenceDurations.reduce((sum, value) => sum + value, 0);
  const longestSilenceS = silenceDurations.reduce((maximum, value) => Math.max(maximum, value), 0);
  const silenceRatio = Math.min(1, silenceTotal / duration);
  const pacingPenalty = Math.min(55, silenceRatio * 150 + Math.max(0, longestSilenceS - 0.65) * 22);

  const spokenMinutes = Math.max(duration - silenceTotal, 1) / 60;
  const wordsPerMinute = allWords.length ? allWords.length / spokenMinutes : 0;
  const shortForm = new Set(['viral', 'vendas', 'tiktok_shop', 'demonstracao']).has(preset);
  const idealWpm = shortForm ? 175 : 150;
  const paceDistance = Math.abs(wordsPerMinute - idealWpm);
  const pacing = Math.max(25, 100 - paceDistance * 0.55 - pacingPenalty);

  const ctaDetected = CTA_RE.test(lower);
  const priceDetected = PRICE_RE.test(lower) || SPOKEN_PRICE_RE.test(lower);
  const benefitDetected = BENEFIT_RE.test(lower);
  const commercialClarity = Math.min(
    100,
    35 + (benefitDetected ? 22 : 0) + (ctaDetected ? 18 : 0) + (priceDetected ? 15 : 0),
  );

  const lengthTarget = shortForm ? 32 : 55;
  const lengthFit = Math.max(35, 100 - Math.abs(duration - lengthTarget) * 1.15);
  const score = clamp(Math.round(
    0.34 * hook3s + 0.27 * pacing + 0.24 * commercialClarity + 0.15 * lengthFit,
  ), 0, 100);

  const suggestions: string[] = [];
  if (hook3s < 60) suggestions.push('Fortaleça os 3 primeiros segundos com promessa, dor, curiosidade ou resultado concreto.');
  if (longestSilenceS > 0.8) suggestions.push(`Existe pausa de ${longestSilenceS.toFixed(1)}s; encurte pausas acima de 0,8s.`);
  if (wordsPerMinute < 115 && shortForm) suggestions.push('O ritmo está lento para short-form; considere cortes de respiro e jump cuts moderados.');
  if (wordsPerMinute > 225) suggestions.push('O ritmo está muito acelerado; preserve micro-pausas para compreensão.');
  if (!benefitDetected) suggestions.push('Inclua um benefício explícito em linguagem de resultado.');
  if (new Set(['vendas', 'tiktok_shop']).has(preset) && !priceDetected) suggestions.push('Se houver oferta real, destaque preço ou condição sem inventar valores.');
  if (new Set(['vendas', 'tiktok_shop']).has(preset) && !ctaDetected) suggestions.push('Inclua CTA claro no encerramento, alinhado ao canal e à oferta.');
  if (!suggestions.length) suggestions.push('Estrutura equilibrada; concentre a revisão em clareza visual e sincronização das legendas.');

  return {
    score,
    label: score >= 80 ? 'forte' : score >= 65 ? 'boa' : score >= 50 ? 'mediana' : 'fraca',
    dimensions: {
      hook3s,
      pacing: Math.round(pacing),
      commercialClarity: Math.round(commercialClarity),
      lengthFit: Math.round(lengthFit),
    },
    signals: {
      durationS: Math.round(duration * 100) / 100,
      wordCount: allWords.length,
      wordsPerMinute: Math.round(wordsPerMinute * 10) / 10,
      silenceRatio: Math.round(silenceRatio * 10_000) / 10_000,
      longestSilenceS: Math.round(longestSilenceS * 100) / 100,
      ctaDetected,
      priceDetected,
      benefitDetected,
    },
    suggestions,
    disclaimer: 'Nota heurística de produção; não representa previsão oficial de retenção ou distribuição da plataforma.',
  };
}
