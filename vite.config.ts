// Configuracao SO da bancada de QA (`npx vite` na raiz). O empacotamento nao
// passa por aqui: o forge aponta explicitamente para vite.main/preload/
// renderer.config.ts, e este arquivo e ignorado la.
//
// O proxy da previa ao vivo: /edvid-preview/qa/* cai no servidor do spike
// (porta 4832), que serve o public/ de um projeto REAL — entao a previa
// dentro da interface de QA toca o mesmo video, legendas e fontes que o
// Electron serviria pelo protocolo edvid-media.
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      '/edvid-preview/qa': {
        target: 'http://127.0.0.1:4832',
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/edvid-preview\/qa/u, ''),
      },
    },
  },
});
