// GERACAO no hub: do pedido do agente ate o arquivo dentro de edit/.
//
// O agente escreve pedidos.json dizendo O QUE quer. Este modulo faz o resto,
// que e mecanico: le o catalogo vivo, traduz o nivel escolhido pelo aluno em
// modelo e parametros (generation-tier.ts), submete em lote, espera os jobs e
// devolve os enderecos. Quem baixa e converte e o main, que tem ffmpeg.
//
// As funcoes de LEITURA das respostas sao puras e ficam expostas de proposito:
// e onde as coisas quebram calado. Um job que termina e nao entrega endereco
// precisa virar erro barulhento, nao um arquivo faltando que so aparece no
// render.

import {
  type GenerationKind,
  type GenerationTier,
  type HubModel,
  resolveGeneration,
  type ResolvedGeneration,
  TIER_LABEL,
  TIERS,
} from './generation-tier';
import type { ImageUse } from './image-format';
import type { McpHub } from './mcp-hub';

// Teto do lote e da espera, ditados pelo proprio hub.
const BATCH_LIMIT = 12;
const WAIT_TIMEOUT_SECONDS = 15;
// Um clipe de video pode levar minutos. O teto existe para nao deixar o aluno
// preso para sempre num job que travou do outro lado.
const MAX_WAIT_MS = 12 * 60 * 1000;
// O catalogo muda de mes em mes, nao de minuto em minuto.
const CATALOG_TTL_MS = 10 * 60 * 1000;

export type HubJob = { index: number; jobId: string };

export type HubResult =
  | { index: number; url: string }
  | { index: number; error: string };

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

// O hub devolve os jobs numa lista; o nome do campo variou entre versoes, e
// aceitar os tres apelidos custa menos que quebrar num rename.
export function jobsFrom(response: unknown): HubJob[] {
  const root = asRecord(response);
  const list = [root.jobs, root.results, root.requests, response].map(asList).find((item) => item.length) ?? [];
  const jobs: HubJob[] = [];
  for (const raw of list) {
    const item = asRecord(raw);
    const jobId = [item.job_id, item.jobId, item.id].find((value) => typeof value === 'string' && value);
    if (typeof jobId !== 'string') continue;
    jobs.push({ index: typeof item.index === 'number' ? item.index : jobs.length, jobId });
  }
  return jobs;
}

export function allTerminal(response: unknown): boolean {
  const root = asRecord(response);
  return root.all_terminal === true;
}

// Onde mora o endereco do resultado. A lista e generosa porque nao deu para
// MEDIR um job concluido sem gastar credito do aluno; o que NAO e generoso e o
// caso de falha: um job "completed" sem endereco vira erro escrito, e nao um
// arquivo que some sem explicacao.
// `rawUrl` em camelCase e o que o Higgsfield usa de verdade (medido na conta
// do aluno) — a lista so tinha a forma com underline e o endereco escapava.
const URL_FIELDS = [
  'url', 'rawUrl', 'raw_url', 'result_url', 'resultUrl',
  'output_url', 'outputUrl', 'media_url', 'mediaUrl',
  'video_url', 'videoUrl', 'image_url', 'imageUrl',
];

function urlIn(value: unknown, depth = 0): string | null {
  if (typeof value === 'string') return /^https?:\/\//u.test(value) ? value : null;
  if (depth > 3) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = urlIn(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const record = asRecord(value);
  for (const field of URL_FIELDS) {
    const found = urlIn(record[field], depth + 1);
    if (found) return found;
  }
  for (const key of ['results', 'result', 'output', 'outputs', 'medias', 'media', 'assets']) {
    const found = urlIn(record[key], depth + 1);
    if (found) return found;
  }
  return null;
}

const TERMINAL_FAILURE = new Set(['failed', 'error', 'canceled', 'cancelled', 'lookup_failed', 'rejected']);

export function resultsFrom(response: unknown): Array<HubResult & { pending?: boolean }> {
  return asList(asRecord(response).jobs).map((raw, position) => {
    const item = asRecord(raw);
    const index = typeof item.index === 'number' ? item.index : position;
    const status = String(item.status ?? '').toLocaleLowerCase('en');
    if (TERMINAL_FAILURE.has(status)) {
      return { index, error: String(item.error ?? `o hub respondeu "${status}"`) };
    }
    const url = urlIn(item);
    if (url) return { index, url };
    // Concluiu e nao veio endereco: isto e defeito, e precisa aparecer.
    if (status === 'completed' || status === 'succeeded' || status === 'done') {
      return { index, error: 'o hub concluiu a geração mas não devolveu o arquivo' };
    }
    return { index, error: 'ainda gerando', pending: true };
  });
}

export type GenerationItem = {
  index: number;
  prompt: string;
  use: ImageUse | null;
  seconds?: number;
  portrait?: boolean;
};

export type GenerationProgress = {
  submitted: number;
  done: number;
  total: number;
  // Estimativa somada dos candidatos escolhidos, para o aviso na interface.
  credits: number;
};

export class HubGeneration {
  private catalogCache = new Map<GenerationKind, { at: number; models: HubModel[] }>();

  constructor(private readonly hub: McpHub, private readonly now: () => number = Date.now) {}

  async catalog(kind: GenerationKind): Promise<HubModel[]> {
    const cached = this.catalogCache.get(kind);
    if (cached && this.now() - cached.at < CATALOG_TTL_MS) return cached.models;
    const response = await this.hub.call('models_explore', {
      action: 'list',
      type: kind === 'imagem' ? 'image' : 'video',
      limit: 100,
    });
    const models = asList(asRecord(response).items)
      .map(asRecord)
      .filter((item): item is HubModel => typeof item.id === 'string');
    // Lista VAZIA e falha de leitura, nao um catalogo sem modelos — e nao
    // entra no cache. Cacheada, uma falha transitoria virava "Nenhum modelo do
    // seu plano entrega imagem nessa proporcao" por uma hora inteira: mensagem
    // que culpa o plano do aluno por um problema de rede.
    if (!models.length) {
      throw new Error('não consegui ler o catálogo de modelos do hub — tente de novo em instantes');
    }
    this.catalogCache.set(kind, { at: this.now(), models });
    return models;
  }

  // Traduz um pedido do agente no que o hub entende. Separado da submissao
  // para o main poder mostrar o custo antes de gastar.
  async plan(
    items: readonly GenerationItem[],
    kind: GenerationKind,
    tier: GenerationTier,
  ): Promise<Array<{ item: GenerationItem; resolved: ResolvedGeneration }>> {
    const catalog = await this.catalog(kind);
    const planned: Array<{ item: GenerationItem; resolved: ResolvedGeneration }> = [];
    for (const item of items) {
      const reasons: string[] = [];
      const resolved = resolveGeneration({
        hub: this.hub.hub,
        kind,
        tier,
        use: item.use,
        seconds: item.seconds,
        portrait: item.portrait,
        catalog,
      }, reasons);
      if (!resolved) {
        // VIDEO nao sobe de nivel sozinho (30-45 creditos), mas a recusa tem
        // de apontar a saida: se um nivel MAIOR resolve no plano do aluno, a
        // mensagem diz qual modelo, quanto custa e onde mudar. Medido no plano
        // real: so o Cinema Studio 3.0 (Extremo, ~40 creditos) existia, e o
        // aluno nao tinha como adivinhar isso de "nenhum modelo entrega".
        if (kind === 'video') {
          for (const acima of TIERS.slice(TIERS.indexOf(tier) + 1)) {
            const maior = resolveGeneration({
              hub: this.hub.hub, kind, tier: acima, use: item.use,
              seconds: item.seconds, portrait: item.portrait, catalog,
            });
            if (maior) {
              throw new Error(
                `seu plano não tem modelo de vídeo no nível ${TIER_LABEL[tier]}. Ele oferece o ${maior.model}${maior.credits ? ` (~${Math.round(maior.credits)} créditos por clipe)` : ''} — mude o nível de vídeo para ${TIER_LABEL[acima]} em Configurações → Conexões de IA para usá-lo.`,
              );
            }
          }
        }
        // A mensagem carrega o DIAGNOSTICO: qual porta barrou cada candidato
        // do nivel pedido. "Nenhum modelo do seu plano entrega" sem prova
        // custou dois dias de idas e vindas com o aluno.
        const detalhe = reasons.slice(0, 3).join('; ');
        throw new Error(
          `nenhum modelo ${kind === 'video' ? 'de vídeo' : 'de imagem'} pôde atender${detalhe ? ` — ${detalhe}` : ''}. Tente de novo em instantes; se persistir, me mostre esta mensagem.`,
        );
      }
      planned.push({ item, resolved });
    }
    return planned;
  }

  // Monta o corpo do pedido. Os parametros do modelo vao no MESMO nivel de
  // model/prompt — e assim que o hub espera.
  private static requestFor(item: GenerationItem, resolved: ResolvedGeneration, kind: GenerationKind): Record<string, unknown> {
    return {
      index: item.index,
      params: {
        model: resolved.model,
        prompt: item.prompt,
        aspect_ratio: resolved.aspectRatio,
        ...(kind === 'video' && resolved.duration ? { duration: Math.round(resolved.duration) } : {}),
        // Explicito de proposito. Omitir faz o hub PERGUNTAR se e para gastar a
        // cota gratuita do aluno, e devolver a pergunta em vez do job — o que
        // travaria a geracao esperando uma resposta que ninguem vai dar aqui.
        use_unlim: false,
        ...resolved.params,
      },
    };
  }

  async submit(
    planned: ReadonlyArray<{ item: GenerationItem; resolved: ResolvedGeneration }>,
    kind: GenerationKind,
  ): Promise<HubJob[]> {
    const tool = kind === 'imagem' ? 'generate_image_batch' : 'generate_video_batch';
    const jobs: HubJob[] = [];
    for (let start = 0; start < planned.length; start += BATCH_LIMIT) {
      const slice = planned.slice(start, start + BATCH_LIMIT);
      const response = await this.hub.call(tool, {
        requests: slice.map(({ item, resolved }) => HubGeneration.requestFor(item, resolved, kind)),
      });
      const submitted = jobsFrom(response);
      if (!submitted.length) {
        throw new Error(`${this.hub.hub} aceitou o pedido mas não abriu nenhuma geração.`);
      }
      jobs.push(...submitted);
    }
    return jobs;
  }

  // Espera os jobs terminarem. O hub responde em ate 15s por chamada, entao
  // isto e um laco de long-poll, nao um sleep.
  async wait(jobs: readonly HubJob[], onTick?: (done: number, total: number) => void): Promise<HubResult[]> {
    const pending = new Map(jobs.map((job) => [job.index, job.jobId]));
    const finished = new Map<number, HubResult>();
    const deadline = this.now() + MAX_WAIT_MS;

    while (pending.size && this.now() < deadline) {
      const slice = [...pending.entries()].slice(0, BATCH_LIMIT);
      const response = await this.hub.call('jobs_wait', {
        jobs: slice.map(([index, jobId]) => ({ index, job_id: jobId })),
        timeout_seconds: WAIT_TIMEOUT_SECONDS,
      });
      for (const result of resultsFrom(response)) {
        if (result.pending) continue;
        delete result.pending;
        finished.set(result.index, result);
        pending.delete(result.index);
      }
      onTick?.(finished.size, jobs.length);
      // Sem parada antecipada de proposito: todo job que chega a um estado
      // final sai de `pending` na volta acima, inclusive os que falharam. O que
      // sobra sao jobs ainda vivos — e para esses quem manda e o prazo. Uma
      // parada por `all_terminal` quebraria lotes de mais de 12, onde a fatia
      // atual termina enquanto as outras nem comecaram.
    }

    for (const [index] of pending) {
      finished.set(index, { index, error: 'a geração demorou demais e foi abandonada' });
    }
    return [...finished.values()].sort((a, b) => a.index - b.index);
  }
}
