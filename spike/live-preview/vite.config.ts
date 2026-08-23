// EXPERIMENTO: a composição do Edvid tocando AO VIVO, sem render.
//
// A pergunta que este vite responde é uma só: o @remotion/player aguenta o
// material real do aluno em tempo real? Nada aqui é para virar produção — é
// para medir antes de decidir.
//
// Dois truques que fazem a composição de VERDADE rodar sem tocar nela:
//   1. Os imports estáticos de ../public/*.json são apontados, por alias, para
//      os arquivos do projeto real.
//   2. publicDir aponta para o public do projeto, então staticFile('cut.mp4')
//      resolve sozinho. As fontes, que o app só copia na hora do render, entram
//      por um middleware.
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';

const raiz = path.resolve(__dirname, '..', '..');
const templatePublic = path.join(raiz, 'resources', 'remotion-template', 'public');
const projetoPublic = path.join(raiz, 'spike', 'public');
const fontes = path.join(raiz, 'spike', 'fonts');

// As fontes vivem no runtime compartilhado, fora do projeto. Servir por
// middleware evita escrever dentro da pasta do aluno só para medir.
const servirFontes = (): Plugin => ({
  name: 'edvid-fontes',
  configureServer(server) {
    if (!fs.existsSync(fontes)) return;
    server.middlewares.use('/fonts', (request, response, next) => {
      const nome = decodeURIComponent((request.url ?? '/').split('?')[0]).replace(/^\/+/u, '');
      const arquivo = path.join(fontes, nome);
      // Confinado à pasta de fontes: um ".." na URL não pode sair dela.
      if (!arquivo.startsWith(fontes) || !fs.existsSync(arquivo)) return next();
      const tipo = nome.endsWith('.css') ? 'text/css'
        : nome.endsWith('.woff2') ? 'font/woff2'
        : nome.endsWith('.woff') ? 'font/woff' : 'application/octet-stream';
      response.setHeader('Content-Type', tipo);
      fs.createReadStream(arquivo).pipe(response);
    });
  },
});

// Alias por ESPECIFICADOR não serve aqui: a composição importa
// '../public/captions.json' e esta página importa
// '../../resources/remotion-template/public/edit-data.json'. São dois textos
// diferentes que apontam para o mesmo arquivo, e o alias do Vite casa com o
// texto, não com o destino. Foi por isso que a primeira tentativa tocou o
// vídeo do projeto (publicDir resolve staticFile) com os DADOS do template:
// 24 fps e 30 segundos, que são os valores de exemplo.
//
// Resolver primeiro e desviar depois casa com o destino, que é o que importa.
const DADOS = ['edit-data.json', 'captions.json', 'track.json', 'segments.json', 'caption-cues.json'];

// O CustomGraphics.tsx é POR PROJETO — é o único arquivo que o agente escreve
// sob medida, e o do template não combina com os dados de outro projeto. Sem
// este desvio a composição estoura em staticFile(undefined) e o Player entra
// em erro. É também o pedaço que a versão de produção não vai conseguir
// empacotar junto com o app: aqui o Vite compila na hora, lá teria de haver
// compilação em tempo de execução.
const projetoSrc = path.join(projetoPublic, '..', 'src');

const dadosDoProjeto = (): Plugin => ({
  name: 'edvid-dados-do-projeto',
  enforce: 'pre',
  async resolveId(source, importer, options) {
    // TSX sob medida do projeto tem precedência sobre o do template.
    if (source.includes('CustomGraphics')) {
      // EDVID_SPIKE_GRAFICOS=template força o CustomGraphics do template com os
      // dados de outro projeto — que é exatamente a combinação que estoura.
      // Existe para provar que o medidor RECUSA um render quebrado em vez de
      // anunciar quadros por segundo sobre uma tela de erro.
      if (process.env.EDVID_SPIKE_GRAFICOS === 'template') return null;
      const doProjeto = path.join(projetoSrc, 'CustomGraphics.tsx');
      if (fs.existsSync(doProjeto)) return fs.realpathSync(doProjeto);
      return null;
    }
    if (!source.endsWith('.json')) return null;
    const resolvido = await this.resolve(source, importer, { ...options, skipSelf: true });
    if (!resolvido) return null;
    const nome = path.basename(resolvido.id);
    if (path.dirname(resolvido.id) !== templatePublic || !DADOS.includes(nome)) return null;
    const doProjeto = path.join(projetoPublic, nome);
    if (!fs.existsSync(doProjeto)) {
      this.warn(`${nome} não existe no projeto — usando o exemplo do template.`);
      return null;
    }
    return fs.realpathSync(doProjeto);
  },
});

export default defineConfig({
  root: __dirname,
  publicDir: projetoPublic,
  plugins: [dadosDoProjeto(), react(), servirFontes()],
  server: { port: 4832, host: '127.0.0.1', fs: { allow: [raiz, fs.realpathSync(projetoPublic)] } },
});
