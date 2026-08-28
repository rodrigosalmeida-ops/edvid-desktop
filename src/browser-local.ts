export const EDIT_AI_LOCAL_HOST = '127.0.0.1';
export const EDIT_AI_LOCAL_PORT = 4820;

export type BrowserLocalOptions = {
  host?: string;
  port?: number;
  secureToken?: string | null;
};

export type BrowserLocalConfig = {
  host: string;
  port: number;
  origin: string;
  editorUrl: string;
  healthUrl: string;
  secureToken: string | null;
};

function normalizeHost(host?: string): string {
  const value = (host ?? EDIT_AI_LOCAL_HOST).trim().toLowerCase();
  if (value === 'localhost') return EDIT_AI_LOCAL_HOST;
  if (value !== EDIT_AI_LOCAL_HOST) {
    throw new Error('O servidor local do EDIT AI só pode escutar em 127.0.0.1.');
  }
  return value;
}

function normalizePort(port?: number): number {
  const value = port ?? EDIT_AI_LOCAL_PORT;
  if (!Number.isInteger(value) || value < 1024 || value > 65535) {
    throw new Error('A porta local do EDIT AI precisa estar entre 1024 e 65535.');
  }
  return value;
}

export function buildBrowserLocalConfig(options: BrowserLocalOptions = {}): BrowserLocalConfig {
  const host = normalizeHost(options.host);
  const port = normalizePort(options.port);
  const origin = `http://${host}:${port}`;
  const secureToken = options.secureToken?.trim() || null;
  const tokenQuery = secureToken ? `?token=${encodeURIComponent(secureToken)}` : '';

  return {
    host,
    port,
    origin,
    editorUrl: `${origin}/${tokenQuery}`,
    healthUrl: `${origin}/api/health`,
    secureToken,
  };
}

export function isTrustedBrowserLocalOrigin(origin: string, config = buildBrowserLocalConfig()): boolean {
  try {
    return new URL(origin).origin === config.origin;
  } catch {
    return false;
  }
}
