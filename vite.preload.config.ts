import { defineConfig, type Plugin } from 'vite';

function editAiDirectVideoImport(): Plugin {
  return {
    name: 'editai-direct-video-import',
    enforce: 'pre',
    transform(code, id) {
      const normalized = id.replace(/\\/gu, '/').split('?')[0];
      if (!normalized.endsWith('/src/preload.ts')) return null;
      const before = "selectProjectDirectory: (name) => ipcRenderer.invoke('project:select-directory', { name }),";
      if (!code.includes(before)) {
        throw new Error('EDIT AI: contrato selectProjectDirectory mudou; revise o importador direto.');
      }
      const after = `selectProjectDirectory: async (name) => {\n    const selected = await ipcRenderer.invoke('project:pick-source', { name }) as { directory?: string } | null;\n    if (!selected?.directory) return null;\n    return ipcRenderer.invoke('project:open-recent', { directory: selected.directory });\n  },`;
      return {
        code: code.replace(before, after),
        map: null,
      };
    },
  };
}

export default defineConfig({
  plugins: [editAiDirectVideoImport()],
});
