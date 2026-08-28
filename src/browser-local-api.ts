import type { EdvidDesktopApi } from './shared';
import { EDIT_AI_LOCAL_HOST } from './browser-local';

type BrowserEvent = { channel: string; payload: unknown };
type BrowserRpcResponse = { ok: boolean; value?: unknown; error?: string };
type BrowserListener = (payload: unknown) => void;

function browserToken(): string {
  const token = new URLSearchParams(window.location.search).get('token')?.trim() ?? '';
  if (!token) throw new Error('Token local do EDIT AI ausente. Reabra o aplicativo.');
  return token;
}

function rewriteLocalMedia(value: unknown, token: string): unknown {
  if (typeof value === 'string' && value.startsWith('edvid-media://')) {
    const url = new URL(value);
    const host = url.hostname === 'preview' ? 'preview' : 'local';
    const pathname = url.pathname.replace(/^\/+/, '');
    return `${window.location.origin}/api/media/${host}/${pathname}?token=${encodeURIComponent(token)}`;
  }
  if (Array.isArray(value)) return value.map((item) => rewriteLocalMedia(item, token));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => [key, rewriteLocalMedia(item, token)]));
  }
  return value;
}

export function isBrowserLocalRuntime(): boolean {
  return window.location.protocol === 'http:'
    && (window.location.hostname === EDIT_AI_LOCAL_HOST || window.location.hostname === 'localhost')
    && Boolean(new URLSearchParams(window.location.search).get('token'));
}

export function createBrowserLocalApi(): EdvidDesktopApi {
  const token = browserToken();
  const listeners = new Map<string, Set<BrowserListener>>();
  let events: EventSource | null = null;

  const ensureEvents = () => {
    if (events) return;
    events = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);
    events.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as BrowserEvent;
        const payload = rewriteLocalMedia(event.payload, token);
        for (const listener of listeners.get(event.channel) ?? []) listener(payload);
      } catch {
        // Eventos malformados sao ignorados; a conexao continua viva.
      }
    };
  };

  const on = <T>(channel: string, listener: (payload: T) => void): (() => void) => {
    ensureEvents();
    const bucket = listeners.get(channel) ?? new Set<BrowserListener>();
    const wrapped: BrowserListener = (payload) => listener(payload as T);
    bucket.add(wrapped);
    listeners.set(channel, bucket);
    return () => {
      bucket.delete(wrapped);
      if (!bucket.size) listeners.delete(channel);
    };
  };

  const invoke = async <T>(channel: string, ...args: unknown[]): Promise<T> => {
    const response = await fetch('/api/rpc', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-edit-ai-token': token,
      },
      body: JSON.stringify({ channel, args }),
      cache: 'no-store',
    });
    const payload = await response.json() as BrowserRpcResponse;
    if (!response.ok || !payload.ok) throw new Error(payload.error || `Falha local do EDIT AI (${response.status})`);
    return rewriteLocalMedia(payload.value, token) as T;
  };

  return {
    getDesktopInfo: () => invoke('desktop:get-info'),
    checkRuntimes: () => invoke('runtime:check'),
    listRecentProjects: () => invoke('project:list'),
    selectProjectDirectory: (name) => invoke('project:select-directory', { name }),
    openRecentProject: (directory) => invoke('project:open-recent', { directory }),
    renameProject: (directory, name) => invoke('project:rename', { directory, name }),
    pinProject: (directory, pinned) => invoke('project:pin', { directory, pinned }),
    removeRecentProject: (directory) => invoke('project:remove-recent', { directory }),
    openProjectFolder: (directory) => invoke('project:open-folder', { directory }),
    refreshProjectWorkspace: (directory) => invoke('project:refresh-workspace', { directory }),
    getEditAiAnalysisContext: (directory) => invoke('editai:analysis-context', { directory }),
    getCodexAccount: () => invoke('codex:account'),
    loginWithChatGPT: () => invoke('codex:login'),
    cancelChatGPTLogin: () => invoke('codex:login-cancel'),
    logoutCodex: () => invoke('codex:logout'),
    getAiRoles: () => invoke('ai:roles-get'),
    setImageCatalogProvider: (id) => invoke('ai:image-catalog', { id }),
    setVideoCatalogProvider: (id) => invoke('ai:video-catalog', { id }),
    setGenerationTier: (kind, tier) => invoke('ai:tier-set', { kind, tier }),
    loginHub: (hub) => invoke('hub:login', { hub }),
    reconnectHub: (hub) => invoke('hub:reconnect', { hub }),
    checkHubs: () => invoke('hub:check'),
    disconnectHub: (hub) => invoke('hub:disconnect', { hub }),
    setAiRole: (role, provider, pinned) => invoke('ai:role-set', { role, provider, pinned }),
    onAiRoles: (listener) => on('ai:roles', listener),
    fulfillImageRequests: (directory) => invoke('image:fulfill', { directory }),
    fulfillVideoRequests: (directory) => invoke('video:fulfill', { directory }),
    getLivePreview: (directory) => invoke('preview:data', { directory }),
    onPreviewProxyState: (listener) => on('preview-proxy:state', listener),
    applyPreviewEdits: (directory, operations) => invoke('preview:edit', { directory, operations }),
    pickSplitMedia: (directory, index) => invoke('preview:pick-split-media', { directory, index }),
    generateSplitMedia: (directory, index, prompt, kind) => invoke('preview:generate-split-media', { directory, index, prompt, kind }),
    suggestSplitPrompt: (directory, index, kind) => invoke('preview:suggest-split-prompt', { directory, index, kind }),
    pickMediaFile: () => invoke('media:pick-file'),
    applyMarkedMedia: (directory, items) => invoke('preview:apply-marked-media', { directory, items }),
    suggestMarkPrompt: (directory, start, end, kind) => invoke('preview:suggest-mark-prompt', { directory, start, end, kind }),
    fulfillMusicRequests: (directory) => invoke('music:fulfill', { directory }),
    applyJcut: (directory) => invoke('jcut:apply', { directory }),
    syncJcut: (directory) => invoke('jcut:sync', { directory }),
    pendingCustomAnimations: (directory) => invoke('animations:pending-custom', { directory }),
    onImageGenState: (listener) => on('image-gen:state', listener),
    loginCodexWithApiKey: (apiKey) => invoke('codex:login-api-key', { apiKey }),
    getClaudeAccount: () => invoke('claude:account'),
    loginWithClaude: () => invoke('claude:login'),
    connectClaudeApiKey: (apiKey) => invoke('claude:connect-key', { apiKey }),
    submitClaudeLoginCode: (code) => invoke('claude:login-code', { code }),
    cancelClaudeLogin: () => invoke('claude:login-cancel'),
    logoutClaude: () => invoke('claude:logout'),
    onClaudeAccount: (listener) => on('claude:account', listener),
    getGeminiAccount: () => invoke('gemini:account'),
    connectGeminiApiKey: (apiKey) => invoke('gemini:connect-key', { apiKey }),
    disconnectGemini: () => invoke('gemini:disconnect'),
    onGeminiAccount: (listener) => on('gemini:account', listener),
    getAiCatalog: () => invoke('ai-catalog:read'),
    testCatalogProvider: (id, fields) => invoke('ai-catalog:test', { id, fields }),
    checkForUpdates: () => invoke('update:check'),
    connectCatalogProvider: (id, fields) => invoke('ai-catalog:connect', { id, fields }),
    disconnectCatalogProvider: (id) => invoke('ai-catalog:disconnect', { id }),
    setCatalogFreeOnly: (freeOnly) => invoke('ai-catalog:free-only', { freeOnly }),
    setCatalogChatProvider: (id) => invoke('ai-catalog:chat-provider', { id }),
    onAiCatalog: (listener) => on('ai-catalog:state', listener),
    onActiveModel: (listener) => on('ai-catalog:active-model', listener),
    saveTimelineModel: (directory, model, loadStamp) => invoke('timeline:save', { directory, model, loadStamp }),
    ensureRuntimePack: () => invoke('runtime-pack:ensure'),
    onRuntimePackState: (listener) => on('runtime-pack:state', listener),
    ensureWhisperModel: () => invoke('whisper-model:ensure'),
    onWhisperModelState: (listener) => on('whisper-model:state', listener),
    ensureRemotionRuntime: () => invoke('remotion:ensure'),
    onRemotionRuntimeState: (listener) => on('remotion:state', listener),
    scaffoldRemotionProject: (directory) => invoke('remotion:scaffold', { directory }),
    buildPhase2: (directory, style, layers) => invoke('phase2:build', { directory, style, layers }),
    getSourceWaveform: (mediaUrl) => invoke('waveform:get', { url: mediaUrl }),
    installAppUpdate: () => invoke('update:install'),
    getMemberAuth: () => invoke('member:get'),
    memberLogin: (email, password) => invoke('member:login', { email, password }),
    memberLogout: () => invoke('member:logout'),
    onMemberAuthState: (listener) => on('member:state', listener),
    onAppUpdateState: (listener) => on('update:state', listener),
    runCleanCut: (directory) => invoke('cleancut:run', { directory }),
    applyTimelineRanges: (directory, ranges) => invoke('cleancut:apply-timeline', { directory, ranges }),
    onCleanCutState: (listener) => on('cleancut:state', listener),
    renderPhase2: (directory) => invoke('phase2:render', { directory }),
    onPhase2RenderState: (listener) => on('phase2:state', listener),
    sendCodexMessage: (input) => invoke('codex:message', input),
    interruptCodexTurn: (threadId, turnId) => invoke('codex:interrupt', { threadId, turnId }),
    respondToCodexApproval: (approvalId, decision) => invoke('codex:approval', { approvalId, decision }),
    onCodexEvent: (listener) => on('codex:event', listener),
  } as EdvidDesktopApi;
}
