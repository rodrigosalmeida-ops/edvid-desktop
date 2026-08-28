import { setTimeout as delay } from 'node:timers/promises';
import { startBrowserLocalServer, type BrowserLocalServerHandle } from './browser-local-server';
import type { BrowserLocalOptions } from './browser-local';

export type BrowserLocalLauncherOptions = BrowserLocalOptions & {
  staticRoot: string;
  openExternal: (url: string) => Promise<void> | void;
  healthTimeoutMs?: number;
  healthPollMs?: number;
};

export type BrowserLocalLauncherHandle = BrowserLocalServerHandle & {
  healthUrl: string;
};

async function waitUntilHealthy(origin: string, timeoutMs: number, pollMs: number): Promise<void> {
  const started = Date.now();
  let lastError: unknown;

  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${origin}/api/health`, { cache: 'no-store' });
      if (response.ok) {
        const payload = await response.json() as { ok?: boolean; app?: string; mode?: string };
        if (payload.ok === true && payload.app === 'EDIT AI' && payload.mode === 'browser-local') return;
      }
    } catch (error) {
      lastError = error;
    }
    await delay(pollMs);
  }

  const detail = lastError instanceof Error ? `: ${lastError.message}` : '';
  throw new Error(`EDIT AI local server did not become healthy within ${timeoutMs}ms${detail}`);
}

export async function launchBrowserLocalEditor(options: BrowserLocalLauncherOptions): Promise<BrowserLocalLauncherHandle> {
  const healthTimeoutMs = options.healthTimeoutMs ?? 15_000;
  const healthPollMs = options.healthPollMs ?? 100;
  if (!Number.isFinite(healthTimeoutMs) || healthTimeoutMs <= 0) throw new Error('healthTimeoutMs must be greater than zero');
  if (!Number.isFinite(healthPollMs) || healthPollMs <= 0) throw new Error('healthPollMs must be greater than zero');

  const server = await startBrowserLocalServer(options);
  try {
    await waitUntilHealthy(server.origin, healthTimeoutMs, healthPollMs);
    await options.openExternal(server.editorUrl);
    return { ...server, healthUrl: `${server.origin}/api/health` };
  } catch (error) {
    await server.close().catch(() => undefined);
    throw error;
  }
}
