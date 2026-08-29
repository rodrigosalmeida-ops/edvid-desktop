import { defineConfig, type Plugin } from 'vite';

// O main.ts é um arquivo grande herdado do upstream. Mantemos o seletor de
// fonte do EDIT AI isolado e o injetamos no entrypoint no build, evitando uma
// alteração invasiva no coração do desktop só para registrar um IPC pequeno.
function editAiProjectSourcePicker(): Plugin {
  return {
    name: 'editai-project-source-picker',
    enforce: 'pre',
    transform(code, id) {
      const normalized = id.replace(/\\/gu, '/').split('?')[0];
      if (!normalized.endsWith('/src/main.ts')) return null;
      return {
        code: `import './project-source-picker';\n${code}`,
        map: null,
      };
    },
  };
}

// A distribuição comercial do EDIT AI é browser-only: Electron permanece
// apenas como motor nativo local (dialogs, FFmpeg, WhisperX, Remotion e RPC),
// mas a janela desktop nunca vira uma interface alternativa. Se o navegador
// local não puder subir/abrir, encerramos em vez de cair silenciosamente para
// a UI Electron.
function editAiBrowserOnlyRuntime(): Plugin {
  return {
    name: 'editai-browser-only-runtime',
    enforce: 'pre',
    transform(code, id) {
      const normalized = id.replace(/\\/gu, '/').split('?')[0];
      if (!normalized.endsWith('/src/main.ts')) return null;

      const fallback = 'if (!openedInBrowser && !mainWindow.isDestroyed()) mainWindow.show();';
      const fallbackReplacement = "if (!openedInBrowser) { console.error('EDIT AI browser-only: navegador local indisponivel.'); app.quit(); }";
      const catchFallback = 'if (!mainWindow.isDestroyed()) mainWindow.show();';
      const catchReplacement = "console.error('EDIT AI browser-only: falha ao iniciar a interface no navegador.'); app.quit();";

      if (!code.includes(fallback)) throw new Error('Contrato browser-only mudou: fallback Electron principal nao encontrado.');
      if (!code.includes(catchFallback)) throw new Error('Contrato browser-only mudou: fallback Electron de erro nao encontrado.');

      return {
        code: code.replace(fallback, fallbackReplacement).replace(catchFallback, catchReplacement),
        map: null,
      };
    },
  };
}

export default defineConfig({
  plugins: [editAiProjectSourcePicker(), editAiBrowserOnlyRuntime()],
});
