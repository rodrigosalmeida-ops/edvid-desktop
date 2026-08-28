from pathlib import Path
import json
import re
from textwrap import dedent

main = Path('src/main.ts')
s = main.read_text(encoding='utf-8')

browser_import = "import { launchBrowserLocalEditor, type BrowserLocalLauncherHandle } from './browser-local-launcher';"
import_anchor = "import { STYLE_LAYERS, mergeStyleLayers, type StyleLayer } from './style-layers';"
if browser_import not in s:
    if import_anchor not in s:
        raise SystemExit('import anchor missing')
    s = s.replace(import_anchor, import_anchor + '\n' + browser_import, 1)

if 'function registerIpcHandle(' not in s:
    s = s.replace('ipcMain.handle(', 'registerIpcHandle(')
    anchor = 'function registerIpcHandlers(): void {'
    bridge = dedent('''
    type RegisteredIpcHandler = Parameters<typeof ipcMain.handle>[1];
    const browserLocalInvokeHandlers = new Map<string, RegisteredIpcHandler>();
    type BrowserLocalEvent = { channel: string; payload: unknown };
    const browserLocalEventListeners = new Set<(event: BrowserLocalEvent) => void>();
    let browserLocalHandle: BrowserLocalLauncherHandle | null = null;

    function registerIpcHandle(channel: string, listener: RegisteredIpcHandler): void {
      browserLocalInvokeHandlers.set(channel, listener);
      ipcMain.handle(channel, listener);
    }

    function browserLocalBroadcast(channel: string, payload: unknown): void {
      for (const listener of browserLocalEventListeners) listener({ channel, payload });
    }

    function restoreBrowserLocalMedia(value: unknown): unknown {
      if (typeof value === 'string') {
        try {
          const url = new URL(value);
          if ((url.hostname === '127.0.0.1' || url.hostname === 'localhost') && url.pathname.startsWith('/api/media/')) {
            const rest = url.pathname.slice('/api/media/'.length);
            const slash = rest.indexOf('/');
            if (slash > 0) {
              const kind = rest.slice(0, slash);
              const target = rest.slice(slash + 1);
              if (kind === 'local' || kind === 'preview') return `edvid-media://${kind}/${target}`;
            }
          }
        } catch {}
        return value;
      }
      if (Array.isArray(value)) return value.map(restoreBrowserLocalMedia);
      if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value as Record<string, unknown>)
          .map(([key, item]) => [key, restoreBrowserLocalMedia(item)]));
      }
      return value;
    }

    function resolveBrowserLocalMediaPath(requestPath: string): string | null {
      const localPrefix = '/api/media/local/';
      if (requestPath.startsWith(localPrefix)) {
        return authorizedMedia.get(requestPath.slice(localPrefix.length)) ?? null;
      }
      for (const prefix of ['/api/media/preview/', '/edvid-preview/']) {
        if (!requestPath.startsWith(prefix)) continue;
        const parts = requestPath.slice(prefix.length).split('/');
        const token = parts.shift() ?? '';
        const root = previewRoots.get(token);
        if (!root) return null;
        return resolvePreviewPath(root, parts);
      }
      return null;
    }

    async function startBrowserLocalMode(mainWindow: BrowserWindow): Promise<boolean> {
      if (!app.isPackaged || MAIN_WINDOW_VITE_DEV_SERVER_URL || process.argv.includes('--editai-electron') || process.env.EDITAI_DISABLE_BROWSER_LOCAL === '1') {
        return false;
      }
      const staticRoot = path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}`);
      const secureToken = randomUUID();
      let lastError: unknown = null;
      for (let port = 4820; port <= 4829; port += 1) {
        try {
          browserLocalHandle = await launchBrowserLocalEditor({
            staticRoot,
            port,
            secureToken,
            openExternal: (url) => shell.openExternal(url),
            invoke: async (channel, args) => {
              const handler = browserLocalInvokeHandlers.get(channel);
              if (!handler) throw new Error(`Canal local desconhecido: ${channel}`);
              const restored = restoreBrowserLocalMedia(args) as unknown[];
              return handler({} as Electron.IpcMainInvokeEvent, ...restored);
            },
            subscribe: (listener) => {
              browserLocalEventListeners.add(listener);
              return () => { browserLocalEventListeners.delete(listener); };
            },
            resolveMediaPath: resolveBrowserLocalMediaPath,
          });
          mainWindow.hide();
          return true;
        } catch (error) {
          lastError = error;
        }
      }
      console.error('Nao foi possivel abrir o EDIT AI no navegador; usando a janela local.', lastError);
      browserLocalHandle = null;
      return false;
    }

    ''')
    if anchor not in s:
        raise SystemExit('registerIpcHandlers anchor missing')
    s = s.replace(anchor, bridge + anchor, 1)

# Mirror native renderer events to SSE exactly once per broadcast function.
pattern = re.compile(r"(for \(const window of BrowserWindow\.getAllWindows\(\)\) \{\n\s*window\.webContents\.send\('([^']+)', ([^;\n]+)\);\n\s*\})")
parts = []
last = 0
added = 0
for match in pattern.finditer(s):
    parts.append(s[last:match.end()])
    channel, payload = match.group(2), match.group(3)
    marker = f"browserLocalBroadcast('{channel}', {payload});"
    tail = s[match.end():match.end() + 180]
    if marker not in tail:
        parts.append('\n  ' + marker)
        added += 1
    last = match.end()
if parts:
    parts.append(s[last:])
    s = ''.join(parts)
if added == 0 and "browserLocalBroadcast('codex:event'" not in s:
    raise SystemExit('renderer event broadcast anchors missing')

window_anchor = '  const mainWindow = new BrowserWindow({\n    width: 1400,'
if window_anchor in s:
    s = s.replace(window_anchor, '  const mainWindow = new BrowserWindow({\n    show: false,\n    width: 1400,', 1)
elif 'show: false' not in s:
    raise SystemExit('BrowserWindow anchor missing')

shot = s.find('const screenshotPath = process.env.EDVID_SCREENSHOT_PATH;')
if shot < 0:
    raise SystemExit('screenshot anchor missing')
tail = s[shot:]
target = "  } else {\n    void pageLoad;\n  }\n}"
replacement = dedent('''
  } else {
    void pageLoad
      .then(async () => {
        const openedInBrowser = await startBrowserLocalMode(mainWindow);
        if (!openedInBrowser && !mainWindow.isDestroyed()) mainWindow.show();
      })
      .catch((error: unknown) => {
        console.error('Falha ao carregar a interface do EDIT AI:', error);
        if (!mainWindow.isDestroyed()) mainWindow.show();
      });
  }
}''')
if target in tail:
    tail = tail.replace(target, replacement, 1)
    s = s[:shot] + tail
elif 'openedInBrowser' not in tail:
    raise SystemExit('createWindow pageLoad else anchor missing')

quit_anchor = "app.on('window-all-closed', () => {"
if "app.on('before-quit'" not in s:
    cleanup = dedent('''
    app.on('before-quit', () => {
      const handle = browserLocalHandle;
      browserLocalHandle = null;
      browserLocalEventListeners.clear();
      if (handle) void handle.close().catch(() => undefined);
    });

    ''')
    if quit_anchor not in s:
        raise SystemExit('quit anchor missing')
    s = s.replace(quit_anchor, cleanup + quit_anchor, 1)

main.write_text(s, encoding='utf-8')

# Runtime contract test: preload and browser bridge must expose the same channels.
Path('scripts/test-browser-production.mjs').write_text(dedent(r'''
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const preload = readFileSync('src/preload.ts','utf8');
const browser = readFileSync('src/browser-local-api.ts','utf8');
const main = readFileSync('src/main.ts','utf8');
const server = readFileSync('src/browser-local-server.ts','utf8');
const renderer = readFileSync('src/renderer.tsx','utf8');
const invokes = [...preload.matchAll(/ipcRenderer\.invoke\('([^']+)'/gu)].map((m) => m[1]);
const browserInvokes = new Set([...browser.matchAll(/invoke\('([^']+)'/gu)].map((m) => m[1]));
for (const channel of invokes) assert.ok(browserInvokes.has(channel), `browser RPC missing ${channel}`);
const nativeEvents = [...preload.matchAll(/ipcRenderer\.on\('([^']+)'/gu)].map((m) => m[1]);
const browserEvents = new Set([...browser.matchAll(/on\('([^']+)'/gu)].map((m) => m[1]));
for (const channel of nativeEvents) assert.ok(browserEvents.has(channel), `browser SSE missing ${channel}`);
assert.match(main, /launchBrowserLocalEditor\(/u);
assert.match(main, /registerIpcHandle\(/u);
assert.match(main, /EDITAI_DISABLE_BROWSER_LOCAL/u);
assert.match(main, /resolveBrowserLocalMediaPath/u);
assert.match(main, /show: false/u);
assert.match(server, /\/api\/rpc/u);
assert.match(server, /text\/event-stream/u);
assert.match(server, /content-range/u);
assert.match(renderer, /createBrowserLocalApi\(\)/u);
console.log(`test:browser-production ok — ${invokes.length} RPCs e ${nativeEvents.length} eventos cobertos.`);
''').lstrip(), encoding='utf-8')

pkg_path = Path('package.json')
pkg = json.loads(pkg_path.read_text(encoding='utf-8'))
pkg['scripts']['test:browser-production'] = 'node scripts/test-browser-production.mjs'
verify = pkg['scripts']['verify:editai']
if 'test:browser-production' not in verify:
    needle = 'npm run test:browser-local-launcher'
    pkg['scripts']['verify:editai'] = verify.replace(needle, needle + ' && npm run test:browser-production')
pkg_path.write_text(json.dumps(pkg, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

server_test = Path('scripts/test-browser-local-server.mjs')
t = server_test.read_text(encoding='utf-8')
if 'secure RPC + Range' not in t:
    t = t.replace(
        "  writeFileSync(path.join(staticRoot, 'app.js'), 'window.__EDIT_AI__ = true;');",
        "  writeFileSync(path.join(staticRoot, 'app.js'), 'window.__EDIT_AI__ = true;');\n  const mediaFile = path.join(temp, 'sample.mp4');\n  writeFileSync(mediaFile, Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]));",
    )
    t = t.replace(
        "  const handle = await startBrowserLocalServer({ staticRoot, port });",
        "  const token = 'editai-test-token';\n  const handle = await startBrowserLocalServer({\n    staticRoot, port, secureToken: token,\n    invoke: async (channel, args) => ({ channel, args }),\n    resolveMediaPath: (requestPath) => requestPath === '/api/media/local/demo' ? mediaFile : null,\n  });",
    )
    insertion = dedent('''

        const deniedRpc = await fetch(`${handle.origin}/api/rpc`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ channel: 'desktop:get-info', args: [] }) });
        assert.equal(deniedRpc.status, 403);

        const rpc = await fetch(`${handle.origin}/api/rpc`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-edit-ai-token': token, origin: handle.origin }, body: JSON.stringify({ channel: 'desktop:get-info', args: [{ ok: true }] }) });
        assert.equal(rpc.status, 200);
        assert.deepEqual(await rpc.json(), { ok: true, value: { channel: 'desktop:get-info', args: [{ ok: true }] } });

        const media = await fetch(`${handle.origin}/api/media/local/demo?token=${encodeURIComponent(token)}`, { headers: { range: 'bytes=1-3' } });
        assert.equal(media.status, 206);
        assert.equal(media.headers.get('content-range'), 'bytes 1-3/8');
        assert.deepEqual([...new Uint8Array(await media.arrayBuffer())], [1, 2, 3]);
        // secure RPC + Range
    ''')
    anchor = "    const traversal = await fetch(`${handle.origin}/%2e%2e/package.json`);"
    if anchor not in t:
        raise SystemExit('browser server test traversal anchor missing')
    t = t.replace(anchor, insertion + '\n' + anchor, 1)
    server_test.write_text(t, encoding='utf-8')
