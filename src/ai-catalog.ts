// Catalogo de IAs conectaveis e escolha de quem atende cada papel.
//
// A ideia veio do OmniRoute: em vez de tres provedores fixos, o aluno conecta
// as contas que tiver — de preferencia as de camada gratuita — e o Edvid
// escolhe sozinho, trocando de provedor quando um bate no limite. Modulo PURO
// de proposito: a decisao de "quem gera esta imagem" precisa ser testavel sem
// rede, sem Electron e sem chave de ninguem.
//
// Levantamento que definiu o catalogo inicial (agosto/2026, medido na API de
// cada um, nao em promessa de marketing):
// - OpenRouter tem 11 modelos de imagem e NENHUM gratuito; serve por dar
//   muitos modelos com uma chave so, e o mais barato sai por fracao de centavo.
// - Gemini nao tem camada gratuita para imagem — todo modelo de imagem e pago.
// - Cloudflare Workers AI e quem realmente entrega imagem de graca: 10 mil
//   neurons por dia (~2 mil imagens FLUX.1 Schnell 512x512).

export type AiCapability = 'texto' | 'imagem' | 'video' | 'musica' | 'voz';

// Como a conta e cobrada. "mixed" e o caso do OpenRouter: a mesma chave da
// acesso a modelo gratuito e pago, e por isso existe o filtro do aluno.
export type AiPricing = 'free' | 'paid' | 'mixed';

export type AiCredentialField = {
  key: string;
  label: string;
  // Campo que nao e a chave em si (ex.: o Account ID da Cloudflare). Fica
  // visivel na interface; a chave, nunca.
  secret: boolean;
  placeholder?: string;
};

// Como o aluno entra. "login" e o fluxo pelo navegador com a conta que ele ja
// paga; "apikey" e a chave colada. Hoje so ChatGPT e Claude tem login.
export type AiAuthMode = 'login' | 'apikey';

// Hub de geracao acessado por MCP (Higgsfield, Magnific). A conexao nao e
// chave nenhuma: e login OAuth pelo navegador, e o gasto sai do credito do
// plano do aluno. Ver mcp-hub.ts para o porque de o cliente ser o APP e nao o
// agente.
export type AiOauthHub = 'higgsfield' | 'magnific';

export type AiCatalogEntry = {
  id: string;
  name: string;
  capabilities: AiCapability[];
  pricing: AiPricing;
  // Formas de conexao oferecidas no modal, na ordem em que aparecem.
  auth: AiAuthMode[];
  // Provedores que o aplicativo ja conduzia antes do catalogo (ChatGPT, Claude
  // e Gemini): a conexao deles tem fluxo proprio no main, mas o CARD e o modal
  // sao os mesmos dos demais — era isso que fazia a tela ter duas listas.
  builtIn?: 'chatgpt' | 'claude' | 'gemini';
  // Conecta por MCP com login OAuth em vez de chave. Quem tem isto nao guarda
  // credencial no catalogo: o token vive no cofre do proprio hub (mcp-hub.ts).
  oauthHub?: AiOauthHub;
  // Pagina onde o aluno cria a chave. O catalogo leva ele ate la.
  keyUrl: string;
  credentials: AiCredentialField[];
  // Modelos por papel, na ordem de preferencia. `free` marca o que nao gasta
  // dinheiro do aluno — e o que sobra quando ele liga "apenas gratuitos".
  models: { id: string; label: string; capability: AiCapability; free: boolean }[];
  // Endpoint no formato da OpenAI. Quem tem isto pode virar MOTOR DO CHAT: o
  // Codex aceita provedores proprios em [model_providers] e o agente inteiro
  // (sandbox, ferramentas, instrucoes) continua funcionando por cima.
  openaiBaseUrl?: string;
  // Nome da variavel de ambiente onde o Codex procura a chave desse provedor.
  envKey?: string;
  note?: string;
};

export const AI_CATALOG: AiCatalogEntry[] = [
  // Os tres primeiros ja existiam como "Conexao de IA"; entraram no catalogo
  // para a tela ter UMA lista so, com o mesmo card e o mesmo modal.
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    capabilities: ['texto', 'imagem'],
    pricing: 'mixed',
    auth: ['login', 'apikey'],
    builtIn: 'chatgpt',
    keyUrl: 'https://platform.openai.com/api-keys',
    credentials: [{ key: 'apiKey', label: 'Chave de API', secret: true }],
    models: [],
    note: 'Entrando com a assinatura, as imagens saem da cota do plano; por chave, são cobradas por imagem.',
  },
  {
    id: 'claude',
    name: 'Claude',
    capabilities: ['texto'],
    pricing: 'mixed',
    auth: ['login', 'apikey'],
    builtIn: 'claude',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    credentials: [{ key: 'apiKey', label: 'Chave de API', secret: true }],
    models: [],
    note: 'Conduz a conversa e a edição. Não gera imagens.',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    capabilities: ['texto', 'imagem'],
    pricing: 'mixed',
    auth: ['apikey'],
    builtIn: 'gemini',
    keyUrl: 'https://aistudio.google.com/apikey',
    credentials: [{ key: 'apiKey', label: 'Chave de API', secret: true }],
    models: [],
    note: 'Chave do Google AI Studio. MEDIDO em conta real: a chave NÃO gera imagem na camada gratuita — o Google responde que a cota acabou. Serve para texto; para imagem grátis, use a Cloudflare.',
  },
  {
    id: 'higgsfield',
    name: 'Higgsfield',
    capabilities: ['imagem', 'video'],
    pricing: 'paid',
    auth: ['login'],
    oauthHub: 'higgsfield',
    keyUrl: 'https://higgsfield.ai',
    credentials: [],
    // A lista de modelos NAO fica aqui: sao 30+ e mudam todo mes. O Edvid le o
    // catalogo vivo do hub e traduz o nivel escolhido pelo aluno (Regular,
    // Medio, Alto, Extremo) para modelo e parametros — ver generation-tier.ts.
    models: [],
    note: 'Imagens e vídeos pelo seu plano Higgsfield. Entra com a conta, sem chave — o gasto sai do crédito do plano.',
  },
  {
    id: 'treblo',
    name: 'Treblo',
    capabilities: ['musica'],
    pricing: 'mixed',
    auth: ['apikey'],
    keyUrl: 'https://treblo.com/developers',
    credentials: [{ key: 'apiKey', label: 'Chave de API', secret: true }],
    models: [
      // Sondado: POST api.treblo.com/v1/generations/v3 com
      // "Authorization: Bearer <chave>" (a propria API diz que o header
      // precisa comecar com "Bearer ").
      { id: 'melodia-v3', label: 'Melodia v3', capability: 'musica', free: false },
    ],
    note: 'Trilha sonora sob medida. Créditos gratuitos no cadastro; depois é por assinatura.',
  },
];

export type ConnectedProvider = {
  id: string;
  // Provedor conectado mas em descanso ate este horario (bateu no limite).
  cooldownUntil?: number | null;
};

export function catalogEntry(id: string): AiCatalogEntry | null {
  return AI_CATALOG.find((entry) => entry.id === id) ?? null;
}

// --- VERIFICACAO DE CHAVE --------------------------------------------------
// Cada provedor tem seu endereco e seu jeito de recusar. Isto vivia como um
// if/else no main com um FALLBACK para o OpenRouter — e o fallback pegava
// todo provedor sem caso proprio: a chave do Gemini era enviada para o
// openrouter.ai, voltava 401 e o aluno lia "Chave recusada pelo provedor"
// sobre uma chave perfeitamente boa. Aqui a tabela e explicita, e provedor
// desconhecido nao vira teste contra o servico errado.
export type KeyProbe = {
  url: string;
  headers: Record<string, string>;
  // Status que significam "a chave nao presta". O Gemini responde 400 com
  // "API key not valid" — 401 nao cobre (medido no endpoint real).
  refusedStatus: number[];
};

export function keyProbe(
  providerId: string,
  credentials: Readonly<Record<string, string>>,
): KeyProbe | null {
  const apiKey = credentials.apiKey ?? '';
  switch (providerId) {
    case 'gemini':
      return {
        url: `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=${encodeURIComponent(apiKey)}`,
        headers: {},
        refusedStatus: [400, 401, 403],
      };
    case 'chatgpt':
      return {
        url: 'https://api.openai.com/v1/models',
        headers: { Authorization: `Bearer ${apiKey}` },
        refusedStatus: [401, 403],
      };
    case 'claude':
      return {
        url: 'https://api.anthropic.com/v1/models?limit=1',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        refusedStatus: [401, 403],
      };
    default:
      // Treblo tem verificacao propria (POST) e vive no main; qualquer outro
      // provedor novo cai aqui e o teste diz isso, em vez de mentir.
      return null;
  }
}

// --- QUEM CONDUZ A CONVERSA ------------------------------------------------
// Havia DUAS verdades sobre isso: o seletor mostrava o provedor do catalogo e
// o roteamento no main olhava o papel de chat das contas fixas. Com Ollama no
// catalogo e "gemini" no papel — que fica assim sozinho quando o aluno conecta
// uma chave do Gemini —, o seletor dizia "Ollama Cloud" e a mensagem ia para o
// agente do Gemini, que respondia "conecte sua chave do Gemini para
// conversar". Uma funcao so, usada pelos dois lados.
export type ChatRoute = { kind: 'catalog'; id: string } | { kind: 'fixed'; provider: string };

export function chatRoute(catalogChatProviderId: string | null | undefined, role: string): ChatRoute {
  const catalog = String(catalogChatProviderId ?? '').trim();
  // O catalogo tem PRECEDENCIA: e a escolha mais recente e explicita do aluno,
  // e e o que o seletor mostra.
  if (catalog) return { kind: 'catalog', id: catalog };
  return { kind: 'fixed', provider: role };
}
