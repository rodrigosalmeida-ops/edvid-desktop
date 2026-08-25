// NIVEL DE GERACAO: quanto vale gastar numa imagem ou num video.
//
// Os hubs (Higgsfield, Magnific) expoem 30+ modelos e a lista muda todo mes.
// Pedir para o aluno escolher entre "Seedance 2.0" e "Wan 2.7" e pedir que ele
// acompanhe um catalogo. Aqui ele escolhe um nivel — Regular, Medio, Alto,
// Extremo — e o Edvid traduz para o modelo e os parametros.
//
// Modulo PURO de proposito, no mesmo espirito de image-format.ts: a decisao de
// "qual modelo atende este pedido" precisa ser testavel sem rede, sem Electron
// e sem a conta de ninguem.
//
// MEDIDO no catalogo real do Higgsfield (models_explore, agosto/2026), nao em
// promessa de marketing. Tres coisas que a medicao revelou e que quebrariam
// caladas:
//
//   1. 720p e o PADRAO de quase todo modelo de video. FullHD nao sai de graca:
//      tem de ir escrito no pedido.
//   2. generate_audio (ou sound) vem LIGADO por padrao. O modelo compoe fala e
//      trilha proprias, que entrariam por baixo da voz do aluno. Desligamos no
//      pedido onde da — e o ffmpeg tira a faixa na entrada de qualquer jeito,
//      porque o Veo 3.1 nem oferece o botao.
//   3. Nem todo modelo aceita 9:16. grok_video_v15 e minimax_hailuo nao tem
//      controle de proporcao NENHUM (aspect_ratios: []); gemini_omni e
//      seedance_2_0_mini tem teto de 720p. Ficam de fora por medicao.
//
// CUSTO MEDIDO com get_cost (preflight que nao submete job nem gasta nada),
// para um clipe vertical de 4-5s em 1080p e mudo, e para uma imagem 9:16:
//
//   video    kling3_0_turbo 1080p .... 10      imagem  z_image ............. 0,15
//            seedance1_5 1080p ....... 12              soul_2 2k ........... 0,12
//            kling3_0 mode=4k ........ 30              nano_banana ......... 1
//            cinematic_studio_3_0 .... 40              nano_banana_2 2k .... 2
//            veo3_1 ultra/preview .... 43,6            nano_banana_pro 2k .. 2
//                                                      gpt_image_2 2k high . 7
//
// Duas coisas que a medicao derrubou, e que eu teria escrito errado:
//   - O VARIANTE pesa mais que o modelo. O mesmo veo3_1 custa 43,6 em
//     ultra/preview e 11 em high/fast. Nao existe "modelo caro": existe
//     configuracao cara.
//   - soul_2 custa 0,12 — MENOS que o modelo mais barato do catalogo. Eu tinha
//     escrito que retrato so valia a partir do Medio "porque no Regular o
//     barato ainda vale mais que o rosto perfeito". E falso: aqui o rosto certo
//     e tambem o mais barato. Retrato vale em todos os niveis.
//
// E uma que vale dizer em voz alta: o mercado tem DUAS faixas de preco, nao
// quatro. De 10 a 12 creditos e de 30 a 44. Regular e Medio ficam a 20% um do
// outro; Alto e Extremo custam tres a quatro vezes mais. Os quatro degraus
// existem porque o aluno pensa em quatro degraus, mas o dinheiro so muda de
// verdade quando ele passa do Medio para o Alto.
//
// A lista autorada aqui e INTENCAO; o catalogo vivo e a VERDADE. Todo
// parametro que mandamos e conferido contra o que o modelo declara, e um
// candidato que nao bate e descartado em vez de virar pedido invalido. E por
// isso que a tabela envelhece bem: modelo que sai do ar cai sozinho.

import { bandAspect, type ImageUse } from './image-format';

export type GenerationTier = 'regular' | 'medio' | 'alto' | 'extremo';
export type GenerationKind = 'imagem' | 'video';
export type GenerationHub = 'higgsfield' | 'magnific';

export const TIERS: readonly GenerationTier[] = ['regular', 'medio', 'alto', 'extremo'];

export const TIER_LABEL: Record<GenerationTier, string> = {
  regular: 'Regular',
  medio: 'Médio',
  alto: 'Alto',
  extremo: 'Extremo',
};

// O que cada nivel significa em dinheiro e tempo, na linguagem do aluno. Fica
// no seletor das Configuracoes, embaixo do nome.
export const TIER_NOTE: Record<GenerationKind, Record<GenerationTier, string>> = {
  imagem: {
    regular: 'Rápida e barata. Serve para fundo e preenchimento.',
    medio: 'Bom acabamento pelo preço. É o padrão.',
    alto: 'Melhor com texto e números dentro da imagem.',
    extremo: 'O melhor acabamento, para a imagem que aparece muito tempo.',
  },
  video: {
    regular: 'Rápido e barato. Serve para b-roll curto atrás da legenda.',
    medio: 'Movimento confiável pelo preço. É o padrão.',
    alto: 'Cena mais consistente, quando o clipe segura sozinho.',
    extremo: 'Qualidade de cinema. Gasta muito crédito — use com parcimônia.',
  },
};

export const DEFAULT_TIER: Record<GenerationKind, GenerationTier> = {
  imagem: 'medio',
  // O video e onde o credito vai embora: um "Extremo" padrao esvaziaria o
  // plano do aluno numa edicao. Ele sobe quando quiser, sabendo o que faz.
  video: 'medio',
};

// --- O catalogo vivo, como o hub devolve -----------------------------------
export type HubParameter = {
  name: string;
  options?: unknown;
  min?: unknown;
  max?: unknown;
  default?: unknown;
};

export type HubModel = {
  id: string;
  aspect_ratios?: unknown;
  parameters?: unknown;
  durations?: unknown;
  duration_range?: unknown;
  tags?: unknown;
};

type ParamValue = string | number | boolean;

type Candidate = {
  model: string;
  params: Record<string, ParamValue>;
  // Modelos que ja entregam 1080p ou mais SEM parametro de resolucao (o Veo
  // 3.1 e assim). Sem esta marca, um candidato de video que nao pede 1080p
  // seria recusado — e e essa recusa que garante o fullHD prometido.
  fullHd?: boolean;
  // Custo MEDIDO com get_cost para um clipe de 4-5s ou uma imagem. E
  // estimativa: a duracao real muda o valor, e o hub e quem cobra. Serve para
  // o aviso na interface, nunca para decidir sozinho.
  credits?: number;
};

// --- IMAGEM ----------------------------------------------------------------
// Teto de 2k em TODOS os niveis, de proposito. A entrega e 1080x1920 e a faixa
// da tela dividida tem 1080x749: um 4k so paga credito por pixel que o render
// joga fora. O que o nivel move e o MODELO — realismo e obediencia ao prompt —,
// nao o tamanho.
const HIGGSFIELD_IMAGE: Record<GenerationTier, Candidate[]> = {
  regular: [
    { model: 'z_image', params: {}, credits: 0.15 },
    { model: 'nano_banana', params: {}, credits: 1 },
  ],
  medio: [
    { model: 'nano_banana_2', params: { resolution: '2k' }, credits: 2 },
    { model: 'seedream_v5_lite', params: { quality: 'basic' }, credits: 1 },
    { model: 'nano_banana', params: {}, credits: 1 },
  ],
  alto: [
    { model: 'nano_banana_pro', params: { resolution: '2k' }, credits: 2 },
    { model: 'seedream_v4_5', params: { quality: 'basic' }, credits: 1 },
    { model: 'kling_omni_image', params: { resolution: '2k' }, credits: 2 },
  ],
  extremo: [
    { model: 'gpt_image_2', params: { resolution: '2k', quality: 'high' }, credits: 7 },
    { model: 'cinematic_studio_2_5', params: { resolution: '2k' }, credits: 2 },
    { model: 'seedream_v5_pro', params: { resolution: '2k' }, credits: 2 },
  ],
};

// Imagem COM PESSOA tem modelo proprio: o Soul 2.0 e treinado em retrato e UGC
// e ganha de todos acima nesse caso. Vale em TODOS os niveis, inclusive no
// Regular — custa 0,12, menos que o modelo mais barato do catalogo. Nao ha
// troca a fazer aqui: e melhor e mais barato ao mesmo tempo.
const HIGGSFIELD_PORTRAIT: Candidate = { model: 'soul_2', params: { quality: '2k' }, credits: 0.12 };

// --- VIDEO -----------------------------------------------------------------
// Sempre 1080p e sempre mudo. Ver o cabecalho: nenhuma das duas coisas e o
// padrao do modelo.
const HIGGSFIELD_VIDEO: Record<GenerationTier, Candidate[]> = {
  regular: [
    { model: 'kling3_0_turbo', params: { resolution: '1080p' }, credits: 10 },
    { model: 'wan2_7', params: { resolution: '1080p' }, credits: 12.5 },
  ],
  medio: [
    { model: 'seedance1_5', params: { resolution: '1080p', generate_audio: false }, credits: 12 },
    { model: 'wan2_7', params: { resolution: '1080p' }, credits: 12.5 },
    { model: 'happy_horse_video', params: { resolution: '1080p' }, credits: 22.5 },
  ],
  alto: [
    // 4k para uma entrega de 1080p parece desperdicio, mas custa 30 contra 36
    // do seedance_2_0 em 1080p — e o ffmpeg ja re-encoda na entrada para tirar
    // o audio, entao reduzir e a mesma passada. Fonte maior reduzida fica
    // melhor que 1080p nativo.
    { model: 'kling3_0', params: { mode: '4k', sound: 'off' }, credits: 30 },
    { model: 'seedance_2_0', params: { mode: 'std', resolution: '1080p', generate_audio: false }, credits: 36 },
    { model: 'seedance_2_5', params: { resolution: '1080p', generate_audio: false }, credits: 36 },
  ],
  extremo: [
    // Veo 3.1 nao expoe resolucao nem chave de audio: entrega 1080p nativo e a
    // faixa de som sai no ffmpeg, na entrada. So aceita 4, 6 ou 8 segundos —
    // janela maior cai no Cinema Studio, que vai de 4 a 15.
    { model: 'veo3_1', params: { quality: 'ultra', variant: 'veo-3-1-preview' }, fullHd: true, credits: 43.6 },
    { model: 'cinematic_studio_3_0', params: { resolution: '1080p', generate_audio: false }, credits: 40 },
    { model: 'flux_3_video', params: { resolution: '1080p', generate_audio: false }, credits: 45 },
  ],
};

// O Magnific entra aqui quando a conta estiver conectada e eu puder MEDIR o
// catalogo dele, como fiz com o Higgsfield. Tabela autorada sem medir e como
// a frase fixa da trilha: parece pronta e nao serve.
const TABLES: Record<GenerationHub, Record<GenerationKind, Record<GenerationTier, Candidate[]>> | null> = {
  higgsfield: { imagem: HIGGSFIELD_IMAGE, video: HIGGSFIELD_VIDEO },
  magnific: null,
};

// --- Proporcao --------------------------------------------------------------
export function parseAspect(ratio: string): number | null {
  const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/u.exec(ratio.trim());
  if (!match) return null;
  const height = Number(match[2]);
  if (!height) return null;
  return Number(match[1]) / height;
}

// A proporcao declarada pelo modelo mais proxima da faixa onde a midia vai
// cair. "auto" e descartado: deixar o modelo decidir foi justamente o que
// entregava imagem cortada — quem sabe o enquadramento e o Edvid.
export function nearestAspect(target: number, options: readonly string[]): string | null {
  let best: string | null = null;
  let bestGap = Infinity;
  for (const option of options) {
    const value = parseAspect(option);
    if (value === null) continue;
    const gap = Math.abs(Math.log(value / target));
    if (gap < bestGap) {
      best = option;
      bestGap = gap;
    }
  }
  return best;
}

// --- Conferencia contra o catalogo vivo -------------------------------------
function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function parametersOf(model: HubModel): HubParameter[] {
  return asArray(model.parameters).filter(
    (item): item is HubParameter => typeof item === 'object' && item !== null && typeof (item as HubParameter).name === 'string',
  );
}

// Todo parametro que vamos mandar precisa EXISTIR no modelo e aceitar o valor.
// Um pedido com parametro inventado volta erro do hub e o aluno le "nao
// consegui gerar" sem saber por que; aqui o candidato so e descartado.
export function paramsFit(model: HubModel, params: Record<string, ParamValue>): boolean {
  const declared = new Map(parametersOf(model).map((item) => [item.name, item]));
  for (const [name, value] of Object.entries(params)) {
    const parameter = declared.get(name);
    if (!parameter) return false;
    const options = asArray(parameter.options);
    if (options.length && !options.some((option) => option === value)) return false;
  }
  return true;
}

// Versao RELAXADA: parametro que o plano do aluno nao aceita e DESCARTADO em
// vez de derrubar o candidato. Um plano que so oferece resolution 1k no
// nano_banana_2 recebia "nenhum modelo do seu plano entrega imagem" — quando a
// verdade era "entrega, em 1k". Gerar com qualidade menor e melhor que nao
// gerar; quem chama usa isto so depois de esgotar a passada estrita.
export function paramsRelaxed(
  model: HubModel,
  params: Record<string, ParamValue>,
): Record<string, ParamValue> {
  const declared = new Map(parametersOf(model).map((item) => [item.name, item]));
  const kept: Record<string, ParamValue> = {};
  for (const [name, value] of Object.entries(params)) {
    const parameter = declared.get(name);
    if (!parameter) continue;
    const options = asArray(parameter.options);
    if (options.length && !options.some((option) => option === value)) continue;
    kept[name] = value;
  }
  return kept;
}

// Duracoes sao TRAVADAS por modelo (seedance1_5 aceita 4, 8 ou 12; veo3_1
// aceita 4, 6 ou 8). As janelas do Edvid sao quebradas — 3,7s —, entao pedimos
// a menor duracao que COBRE a janela e o template corta o resto. Pedir menos
// deixaria um buraco no video.
//
// `covers` diz se o modelo alcanca a janela inteira. Um clipe curto demais nao
// e erro fatal — o Veo so faz 4, 6 ou 8 segundos —, mas e motivo para preferir
// outro modelo antes de aceitar o corte.
export function durationFor(model: HubModel, seconds: number): { duration: number; covers: boolean } | null {
  const wanted = Math.max(0, seconds);
  // O formato MUDOU entre medicoes: primeiro o catalogo trazia durations /
  // duration_range no topo do modelo; na conta do aluno (medido no token
  // real, agosto/2026) essas chaves sumiram e a duracao vive so dentro do
  // PARAMETRO `duration` (options ou min/max). Ler apenas o topo reprovava
  // todos os candidatos — foi o "nenhum modelo do seu plano entrega video"
  // da primeira geracao real. As quatro fontes valem, nesta ordem.
  const parameter = parametersOf(model).find((item) => item.name === 'duration');
  const list = [
    ...asArray(model.durations),
    ...(asArray(model.durations).length ? [] : asArray(parameter?.options)),
  ].filter((item): item is number => typeof item === 'number');
  if (list.length) {
    const sorted = [...list].sort((a, b) => a - b);
    const exact = sorted.find((item) => item >= wanted);
    const duration = exact ?? sorted[sorted.length - 1];
    return { duration, covers: duration >= wanted };
  }
  const range = model.duration_range as { min?: unknown; max?: unknown } | undefined;
  const min = typeof range?.min === 'number'
    ? range.min
    : typeof parameter?.min === 'number' ? parameter.min : null;
  const max = typeof range?.max === 'number'
    ? range.max
    : typeof parameter?.max === 'number' ? parameter.max : null;
  if (min === null || max === null) return null;
  const duration = Math.min(max, Math.max(min, Math.ceil(wanted)));
  return { duration, covers: duration >= wanted };
}

export type GenerationRequest = {
  hub: GenerationHub;
  kind: GenerationKind;
  tier: GenerationTier;
  use: ImageUse | null;
  // So para video: quanto tempo a janela da timeline ocupa.
  seconds?: number;
  // Imagem com pessoa em cena: muda o modelo preferido.
  portrait?: boolean;
  catalog: readonly HubModel[];
};

export type ResolvedGeneration = {
  model: string;
  aspectRatio: string;
  params: Record<string, ParamValue>;
  duration: number | null;
  // Nivel realmente atendido: pode ser MENOR que o pedido quando o catalogo
  // nao tem quem entregue o pedido. Nunca maior — ver abaixo.
  tier: GenerationTier;
  // Estimativa de custo para o aviso na interface. null quando nao medimos.
  credits: number | null;
  // O clipe saiu mais curto que a janela: nenhum modelo do nivel alcanca.
  // Quem chama avisa o aluno em vez de deixar um buraco silencioso.
  truncated: boolean;
};

function tryCandidate(
  candidate: Candidate,
  request: GenerationRequest,
  byId: Map<string, HubModel>,
  requireFullDuration: boolean,
  relax: boolean,
  reasons?: string[],
): Omit<ResolvedGeneration, 'tier'> | null {
  const recusa = (motivo: string): null => {
    reasons?.push(`${candidate.model}: ${motivo}`);
    return null;
  };
  const model = byId.get(candidate.model);
  if (!model) return recusa('fora do catálogo do plano');
  let params = candidate.params;
  if (relax) {
    params = paramsRelaxed(model, candidate.params);
  } else if (!paramsFit(model, candidate.params)) {
    return recusa('parâmetro recusado pelo plano');
  }

  // O formato do catalogo JA MUDOU uma vez debaixo de nos (a duracao migrou
  // para dentro de `parameters` — ver durationFor). A proporcao ganha a mesma
  // tolerancia: primeiro o campo proprio, depois um parametro aspect_ratio.
  const topo = asArray(model.aspect_ratios).filter((item): item is string => typeof item === 'string');
  const options = topo.length
    ? topo
    : asArray(parametersOf(model).find((item) => item.name === 'aspect_ratio')?.options)
      .filter((item): item is string => typeof item === 'string');
  // Sem controle de proporcao nao da para prometer 9:16 — e a promessa de
  // proporcao e a que o aluno enxerga primeiro quando quebra.
  const aspectRatio = nearestAspect(bandAspect(request.use ?? 'tela-cheia'), options);
  if (!aspectRatio) return recusa('sem lista de proporções no catálogo');

  let duration: number | null = null;
  let truncated = false;
  if (request.kind === 'video') {
    // FullHD prometido: ou o candidato pede 1080p, ou foi verificado que o
    // modelo entrega isso nativamente. Na passada RELAXADA a exigência cai —
    // um clipe em 720p é melhor que clipe nenhum, e o aviso vai na mensagem.
    const asks1080 = Object.values(params).some(
      (value) => typeof value === 'string' && /^(1080p|1920|2k|4k)$/u.test(value),
    );
    if (!asks1080 && !candidate.fullHd && !relax) return recusa('sem 1080p no plano');
    const window = durationFor(model, request.seconds ?? 0);
    if (!window) return recusa('sem controle de duração no catálogo');
    if (requireFullDuration && !window.covers) return recusa('não cobre a janela inteira');
    duration = window.duration;
    truncated = !window.covers;
  }
  return {
    model: candidate.model,
    aspectRatio,
    params: { ...params },
    duration,
    credits: candidate.credits ?? null,
    truncated,
  };
}

// Escolhe o modelo. Se o nivel pedido nao tiver ninguem capaz, DESCE para o
// nivel abaixo — nunca sobe. Subir sozinho gastaria mais credito do aluno do
// que ele autorizou, e credito gasto nao volta.
export function resolveGeneration(
  request: GenerationRequest,
  // Preenchido quando a resolucao FALHA: o motivo de cada recusa, na ordem
  // tentada. E o que transforma "nenhum modelo do seu plano entrega" — que
  // culpava o plano sem prova — numa mensagem que diz qual porta barrou.
  reasons?: string[],
): ResolvedGeneration | null {
  const table = TABLES[request.hub];
  if (!table) return null;
  const byId = new Map(request.catalog.map((model) => [model.id, model]));
  const start = TIERS.indexOf(request.tier);
  if (start < 0) return null;

  // Passadas, da mais exigente para a mais tolerante:
  //   1. estrita cobrindo a janela inteira; 2. estrita aceitando clipe curto;
  //   3-4. RELAXADAS — parametro que o plano recusa e descartado (o modelo
  //   gera no padrao dele) em vez de derrubar o candidato. Um plano que so
  //   oferece 1k recebia "nenhum modelo entrega" quando a verdade era
  //   "entrega, em 1k" — gerar com qualidade menor ganha de nao gerar.
  const passes: Array<{ full: boolean; relax: boolean }> = request.kind === 'video'
    ? [{ full: true, relax: false }, { full: false, relax: false }, { full: true, relax: true }, { full: false, relax: true }]
    : [{ full: false, relax: false }, { full: false, relax: true }];
  for (const pass of passes) {
    for (let index = start; index >= 0; index -= 1) {
      const tier = TIERS[index];
      const candidates = [...table[request.kind][tier]];
      // Retrato entra na frente em todos os niveis: o soul_2 e ao mesmo tempo
      // o melhor para rosto e o mais barato do catalogo (0,12).
      if (request.kind === 'imagem' && request.portrait) {
        candidates.unshift(HIGGSFIELD_PORTRAIT);
      }
      for (const candidate of candidates) {
        // Motivos so na PRIMEIRA passada do nivel pedido: e a que descreve o
        // que o aluno pediu; as seguintes sao tentativas de salvar o pedido.
        const anotar = pass === passes[0] && tier === request.tier ? reasons : undefined;
        const resolved = tryCandidate(candidate, request, byId, pass.full, pass.relax, anotar);
        if (resolved) return { ...resolved, tier };
      }
    }
  }
  return null;
}

export function tierFrom(raw: unknown, kind: GenerationKind): GenerationTier {
  const value = String(raw ?? '').trim().toLocaleLowerCase('pt-BR');
  return (TIERS as readonly string[]).includes(value)
    ? (value as GenerationTier)
    : DEFAULT_TIER[kind];
}
