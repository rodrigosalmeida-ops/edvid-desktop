import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// UMA copia do remotion, custe o que custar: o Player entra estatico e a
// composicao entra por import dinamico. Com duas copias no bundle, o
// useVideoConfig da composicao nao enxerga o contexto do Player e a previa
// morre com "No video config found" — aconteceu na bancada de QA e o app
// empacotado tem exatamente o mesmo grafo de imports.
export default defineConfig({
  plugins: [react()],
  resolve: { dedupe: ['remotion', '@remotion/player', 'react', 'react-dom'] },
});
