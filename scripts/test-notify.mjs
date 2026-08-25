// Guardas do sino de fim de tarefa e do palco horizontal (0.34.0).
//
// Duas classes de defeito que a bancada pegou ao vivo e não podem voltar:
// 1. O CSS da marca (preview-base.css) já tem um `.toast` FIXO E CENTRALIZADO;
//    o toast do sino precisa se chamar `.task-toast` — com o nome antigo os
//    avisos empilhavam um sobre o outro no centro da tela (foto da bancada).
// 2. O palco (.video-stage) é um grid de trilha implícita: max-height/height
//    em % de um filho resolvem contra trilha indefinida e viram none — o
//    vídeo estourava 52px para fora do palco. A medida certa é cqw/cqh com
//    container-type: size no palco e --live-ar vindo do App.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = (rel) => readFileSync(path.join(projectRoot, rel), 'utf8');

const app = ler('src/App.tsx');
const css = ler('src/styles.css');
const marca = ler('src/brand/preview-base.css');
const notifySrc = ler('src/notify.ts');

// --- 1. A colisão de nome com o .toast da marca ---------------------------
assert.match(marca, /^\.toast \{/mu, 'o .toast da marca sumiu — se ele não existe mais, esta guarda pode ser revista');
assert.doesNotMatch(css, /^\.toast \{/mu, 'styles.css não pode declarar um .toast puro: colide com o fixo centralizado da marca');
assert.match(css, /^\.task-toast \{/mu, 'o toast do sino se chama .task-toast');
assert.match(app, /className=\{`task-toast \$\{toast\.kind\}`\}/u, 'o App monta o toast com a classe task-toast');

// --- 2. O sino existe e está ligado nos três fins de tarefa ----------------
assert.match(notifySrc, /export function notify\(/u, 'notify.ts exporta notify()');
assert.match(notifySrc, /new Notification\(title, \{ body, silent: true \}\)/u, 'janela em segundo plano vira notificação do sistema, silenciosa');
assert.match(app, /notify\('ok', 'Render concluído'/u, 'render pronto toca o sino');
assert.match(app, /notify\('erro', 'O render falhou'/u, 'render com erro toca o sino');
assert.match(app, /notify\('ok', 'O Edvid terminou'/u, 'turno longo do chat toca o sino');
assert.match(app, /notify\('erro', 'A tarefa do chat falhou'/u, 'turno com falha toca o sino');
assert.match(app, /tipoPedido === 'video' \? 'Clipe gerado' : 'Imagem gerada'/u, 'geração da faixa toca o sino');
// Sucesso só em turno LONGO: resposta rápida com o aluno olhando não precisa
// de fanfarra. Interrupção (o aluno parou) não toca nada.
assert.match(app, /event\.status === 'completed' && Date\.now\(\) - turnStartedAtRef\.current >= 10_000/u, 'sino de sucesso do chat exige turno de 10s+');

// --- 3. O palco horizontal contém o vídeo nos DOIS eixos -------------------
assert.match(css, /\.video-stage \{[^}]*container-type: size/u, 'o palco é query container: os filhos medem em cqw/cqh');
assert.match(css, /\.video-stage\.horizontal video \{ width: min\(100cqw, calc\(100cqh \* var\(--live-ar/u, 'vídeo cru contido por cqw/cqh (max-height em % não clampa em trilha implícita de grid)');
assert.match(css, /\.live-stage \{ width: min\(100cqw, calc\(100cqh \* var\(--live-ar/u, 'prévia ao vivo contida por cqw/cqh — a caixa coincide com a área desenhada');
assert.match(app, /'--live-ar': String\(media \? media\.width \/ Math\.max\(1, media\.height\) : 1\)/u, 'o App publica --live-ar no palco');
// O palco manda no espaço: primeira linha 1fr, timeline no máximo ~um terço.
assert.match(css, /\.editor-workspace\.horizontal \{ grid-template-rows: minmax\(0, 1fr\) minmax\(178px, 32%\); \}/u, 'horizontal: palco 1fr, timeline baixa com rolagem vertical');

console.log('test-notify: sino ligado nos fins de tarefa, .task-toast sem colisão e palco horizontal contido — ok');
