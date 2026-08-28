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

export default defineConfig({
  plugins: [editAiProjectSourcePicker()],
});
