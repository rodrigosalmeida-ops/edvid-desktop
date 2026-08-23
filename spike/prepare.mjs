// Prepara a pasta public do EXPERIMENTO: junta o public de um projeto real
// com as fontes do runtime compartilhado (que o app só copia na hora do
// render). Sem isso a tipografia cai para a fonte reserva e a medição mediria
// outra coisa.
import { mkdir, rm, symlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

// Caminhos ancorados no ARQUIVO, nao no diretorio de onde o comando foi
// chamado. Rodar de ~ criava spike/public dentro da home e o vite nem achava a
// configuracao — foi o que aconteceu na primeira vez que isto saiu daqui.
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const projeto = process.argv[2];
if (!projeto) {
  console.error('uso: npm run spike:preparar -- "<pasta do projeto>"');
  process.exit(1);
}
const origem = path.join(path.resolve(projeto), 'edit', 'remotion', 'public');
if (!existsSync(origem)) {
  console.error(`não achei ${origem}`);
  process.exit(1);
}
const fontes = path.join(os.homedir(), 'Library', 'Application Support', 'Edvid', 'runtime', 'remotion', 'fonts');
const destino = path.join(raiz, 'spike', 'public');

await rm(destino, { recursive: true, force: true });
await mkdir(path.dirname(destino), { recursive: true });
// Link em vez de cópia: o cut.mp4 tem dezenas de MB e a medição é sobre
// decodificar vídeo, não sobre copiar arquivo.
await symlink(path.resolve(origem), destino, 'dir');

// As fontes moram fora do projeto; entram por um link dentro dele seria sujar
// a pasta do aluno. Ficam num diretório irmão que o vite também serve.
const destinoFontes = path.join(raiz, 'spike', 'fonts');
await rm(destinoFontes, { recursive: true, force: true });
if (existsSync(fontes)) await symlink(fontes, destinoFontes, 'dir');
else console.warn('AVISO: fontes do runtime não encontradas — a tipografia vai cair para a reserva.');

// O Vite guarda o módulo resolvido em cache; trocar o alvo do link não basta.
// Limpar aqui evita medir o projeto ANTERIOR e achar que mediu este — foi o
// que aconteceu na primeira troca.
await rm(path.join(raiz, 'node_modules', '.vite'), { recursive: true, force: true });

console.log(`public -> ${origem}`);
console.log(`fonts  -> ${existsSync(fontes) ? fontes : '(ausente)'}`);
console.log('\nAgora: npm run spike');
