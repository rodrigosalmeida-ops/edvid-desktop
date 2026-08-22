// CLIENTE MCP dos hubs de geracao (Higgsfield, Magnific).
//
// Quem fala com o hub e o APP, nao o agente. Poderia ser o contrario — o Codex
// aceita [mcp_servers], o SDK do Claude aceita mcpServers e o Gemini ja recebe
// um mcpServers na sessao —, e seria menos codigo. Mas seria o mesmo padrao
// que falhou seis vezes este mes: o agente teria de lembrar de forcar 1080p,
// desligar o audio, acertar a proporcao e salvar o arquivo no lugar certo, e o
// resultado mudaria conforme o aluno escolheu ChatGPT, Claude ou Gemini. Aqui
// e uma implementacao so, um login so, e as regras ficam em codigo testavel.
//
// O agente continua fazendo o que faz bem: decidir QUAL imagem ou video pedir,
// e escrever isso em pedidos.json. O resto e mecanico.
//
// Conexao: streamable HTTP com OAuth pelo navegador. Os dois hubs sao assim —
// o Higgsfield diz na documentacao "no API keys to manage or configure" e o
// Magnific descontinuou o pay-per-use da API. Cobra do credito do plano do
// aluno, nao de uma fatura separada.

import { createServer, type Server } from 'node:http';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import type { GenerationHub } from './generation-tier';

export const HUB_URL: Record<GenerationHub, string> = {
  higgsfield: 'https://mcp.higgsfield.ai/mcp',
  magnific: 'https://mcp.magnific.com',
};

export const HUB_NAME: Record<GenerationHub, string> = {
  higgsfield: 'Higgsfield',
  magnific: 'Magnific',
};

// Porta fixa de retorno do login. Precisa ser fixa porque o endereco de
// retorno vai REGISTRADO no hub no primeiro login e fica guardado: mudar a
// porta depois invalidaria o registro. Quando a porta esta ocupada caimos para
// a seguinte e o registro e refeito (ver redirectChanged abaixo).
const CALLBACK_PORTS = [54546, 54547, 54548];
const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;

type StoredAuth = {
  redirectUri?: string;
  client?: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
  verifier?: string;
};

// A pagina que o navegador mostra quando o login termina. O aluno volta para o
// Edvid sozinho; sem isto ele fica olhando uma aba em branco sem saber se deu
// certo.
function closingPage(hub: GenerationHub, ok: boolean): string {
  const title = ok ? `${HUB_NAME[hub]} conectado` : 'Não foi possível conectar';
  const body = ok
    ? 'Pode fechar esta aba e voltar para o Edvid.'
    : 'Volte para o Edvid e tente novamente.';
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8">
<title>${title}</title>
<style>body{font:16px -apple-system,system-ui,sans-serif;background:#0d0d10;color:#f4f4f5;
display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
div{text-align:center}h1{font-size:20px;margin:0 0 8px}p{color:#a1a1aa;margin:0}</style>
<div><h1>${title}</h1><p>${body}</p></div>`;
}

// --- Guarda dos segredos ----------------------------------------------------
// Token de acesso e chave: vive em userData com 0600 e NUNCA e escrito em log,
// em mensagem de chat ou no config de ninguem.
class HubAuthStore implements OAuthClientProvider {
  private cache: StoredAuth | null = null;

  constructor(
    private readonly file: string,
    private readonly redirect: string,
    private readonly openBrowser: (url: string) => void,
  ) {}

  private async read(): Promise<StoredAuth> {
    if (this.cache) return this.cache;
    try {
      this.cache = JSON.parse(await readFile(this.file, 'utf8')) as StoredAuth;
    } catch {
      this.cache = {};
    }
    return this.cache;
  }

  private async write(patch: Partial<StoredAuth>): Promise<void> {
    const next = { ...(await this.read()), ...patch };
    this.cache = next;
    await mkdir(path.dirname(this.file), { recursive: true });
    await writeFile(this.file, `${JSON.stringify(next)}\n`, { mode: 0o600 });
  }

  get redirectUrl(): string {
    return this.redirect;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: 'Edvid Desktop',
      redirect_uris: [this.redirect],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    };
  }

  async clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
    const stored = await this.read();
    // Registro feito para OUTRO endereco de retorno nao serve: o hub recusaria
    // o code. Melhor registrar de novo do que falhar num erro opaco.
    if (stored.redirectUri && stored.redirectUri !== this.redirect) return undefined;
    return stored.client;
  }

  async saveClientInformation(client: OAuthClientInformationMixed): Promise<void> {
    await this.write({ client, redirectUri: this.redirect });
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    return (await this.read()).tokens;
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    await this.write({ tokens });
  }

  async saveCodeVerifier(verifier: string): Promise<void> {
    await this.write({ verifier });
  }

  async codeVerifier(): Promise<string> {
    const stored = await this.read();
    if (!stored.verifier) throw new Error('O login não foi iniciado por aqui.');
    return stored.verifier;
  }

  redirectToAuthorization(url: URL): void {
    this.openBrowser(url.toString());
  }

  async invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery'): Promise<void> {
    if (scope === 'all') {
      this.cache = {};
      await rm(this.file, { force: true });
      return;
    }
    if (scope === 'tokens') await this.write({ tokens: undefined });
    if (scope === 'client') await this.write({ client: undefined });
    if (scope === 'verifier') await this.write({ verifier: undefined });
  }

  async hasTokens(): Promise<boolean> {
    return Boolean((await this.read()).tokens?.access_token);
  }

  async forget(): Promise<void> {
    await this.invalidateCredentials('all');
  }
}

// --- Erros que o aluno precisa entender -------------------------------------
export class HubNeedsLogin extends Error {
  constructor(hub: GenerationHub) {
    super(`Entre na sua conta ${HUB_NAME[hub]} em Configurações → Conexões de IA.`);
    this.name = 'HubNeedsLogin';
  }
}

// --- O cliente --------------------------------------------------------------
export class McpHub {
  private client: Client | null = null;
  private transport: StreamableHTTPClientTransport | null = null;
  private store: HubAuthStore | null = null;
  private connecting: Promise<Client> | null = null;
  private port = CALLBACK_PORTS[0];

  constructor(
    readonly hub: GenerationHub,
    private readonly storeDir: string,
    private readonly openBrowser: (url: string) => void,
  ) {}

  private authStore(port = this.port): HubAuthStore {
    if (!this.store || this.port !== port) {
      this.port = port;
      this.store = new HubAuthStore(
        path.join(this.storeDir, `${this.hub}.json`),
        `http://127.0.0.1:${port}/callback`,
        this.openBrowser,
      );
    }
    return this.store;
  }

  async connected(): Promise<boolean> {
    return this.authStore().hasTokens();
  }

  async forget(): Promise<void> {
    await this.close();
    await this.authStore().forget();
    this.store = null;
  }

  async close(): Promise<void> {
    const client = this.client;
    this.client = null;
    this.transport = null;
    this.connecting = null;
    await client?.close().catch(() => {});
  }

  // Liga usando o token guardado. NAO abre navegador: conexao acontece no meio
  // de uma geracao, e abrir uma janela de login sozinho no meio do trabalho
  // assusta. Sem token, o erro diz onde entrar.
  private async ensure(): Promise<Client> {
    if (this.client) return this.client;
    if (this.connecting) return this.connecting;
    const store = this.authStore();
    if (!(await store.hasTokens())) throw new HubNeedsLogin(this.hub);

    this.connecting = (async () => {
      const transport = new StreamableHTTPClientTransport(new URL(HUB_URL[this.hub]), {
        authProvider: store,
      });
      const client = new Client(
        { name: 'edvid-desktop', version: '1.0.0' },
        { capabilities: {} },
      );
      await client.connect(transport);
      this.client = client;
      this.transport = transport;
      return client;
    })();
    try {
      return await this.connecting;
    } catch (error) {
      this.connecting = null;
      // Token vencido e sem refresh: o hub responde 401 e o SDK levanta
      // UnauthorizedError. Vira o mesmo recado de "entre na conta".
      if (error instanceof Error && error.name === 'UnauthorizedError') {
        throw new HubNeedsLogin(this.hub);
      }
      throw error;
    }
  }

  // Login pelo navegador, com retorno em 127.0.0.1. Mesma forma do login do
  // Claude que ja existe no app.
  async login(): Promise<void> {
    await this.close();
    const { server, port } = await listen();
    const store = this.authStore(port);
    // Um login novo descarta o registro antigo: se a porta mudou, o endereco
    // de retorno mudou junto.
    await store.invalidateCredentials('tokens');

    const transport = new StreamableHTTPClientTransport(new URL(HUB_URL[this.hub]), {
      authProvider: store,
    });
    const client = new Client({ name: 'edvid-desktop', version: '1.0.0' }, { capabilities: {} });

    const code = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('O login demorou demais. Tente de novo.')), LOGIN_TIMEOUT_MS);
      server.on('request', (request, response) => {
        const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
        if (url.pathname !== '/callback') {
          response.writeHead(404).end();
          return;
        }
        const received = url.searchParams.get('code');
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(closingPage(this.hub, Boolean(received)));
        clearTimeout(timer);
        if (received) resolve(received);
        else reject(new Error(url.searchParams.get('error_description') ?? 'A conta não autorizou o Edvid.'));
      });
    });

    try {
      // A primeira conexao levanta UnauthorizedError DEPOIS de abrir o
      // navegador — e o caminho documentado, nao um erro de verdade.
      await client.connect(transport).catch((error: unknown) => {
        if (error instanceof Error && error.name === 'UnauthorizedError') return;
        throw error;
      });
      await transport.finishAuth(await code);
      // Reconecta com o token na mao.
      await client.connect(transport);
      this.client = client;
      this.transport = transport;
    } finally {
      server.close();
    }
  }

  // --- Chamada de ferramenta -------------------------------------------------
  // O MCP devolve o resultado como texto; quase sempre e JSON. Devolvemos o
  // objeto quando da, e o texto cru quando nao da — em vez de estourar.
  async call(tool: string, args: Record<string, unknown>): Promise<unknown> {
    const client = await this.ensure();
    const result = await client.callTool({ name: tool, arguments: args });
    const blocks = Array.isArray(result.content) ? result.content : [];
    const text = blocks
      .filter((block): block is { type: 'text'; text: string } => (
        typeof block === 'object' && block !== null
        && (block as { type?: unknown }).type === 'text'
        && typeof (block as { text?: unknown }).text === 'string'
      ))
      .map((block) => block.text)
      .join('\n');
    if (result.isError) {
      throw new Error(text || `${HUB_NAME[this.hub]} recusou o pedido.`);
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }
}

// Sobe o servidor de retorno na primeira porta livre. Fixa por escolha: o
// endereco de retorno fica registrado no hub.
async function listen(): Promise<{ server: Server; port: number }> {
  let last: unknown = null;
  for (const port of CALLBACK_PORTS) {
    try {
      const server = createServer();
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => {
          server.removeListener('error', reject);
          resolve();
        });
      });
      return { server, port };
    } catch (error) {
      last = error;
    }
  }
  throw new Error(
    `Não consegui abrir a porta de retorno do login (${CALLBACK_PORTS.join(', ')}). `
    + `Feche outros programas que estejam usando essas portas. ${last instanceof Error ? last.message : ''}`.trim(),
  );
}
