// Teste da LEITURA das respostas do hub.
//
// O envelope do jobs_wait foi MEDIDO contra o servidor real, com o UUID nulo
// (que o proprio esquema aceita) — sonda que nao submete job nem gasta credito:
//
//   {"jobs":[{"index":0,"job_id":"000...0","status":"lookup_failed",
//    "error":"Generation not found","retryable":false}],
//    "summary":{...},"all_terminal":true}
//
// O que NAO deu para medir sem gastar credito do aluno foi um job concluido —
// nao se sabe em qual campo o endereco chega. Por isso a busca aceita varios
// nomes. O perigo dessa tolerancia e virar silencio: um job "completed" sem
// endereco nenhum tem de virar ERRO ESCRITO, e nao um arquivo que some e so
// aparece faltando na hora do render. E isso que a maior parte deste teste
// trava.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(path.join(tmpdir(), 'edvid-hub-'));

try {
  execFileSync(process.execPath, [
    path.join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
    path.join(projectRoot, 'src', 'hub-generation.ts'),
    path.join(projectRoot, 'src', 'generation-tier.ts'),
    path.join(projectRoot, 'src', 'image-format.ts'),
    '--target', 'es2022', '--module', 'es2022', '--moduleResolution', 'bundler',
    '--skipLibCheck', '--outDir', outDir,
  ], { stdio: 'inherit' });
  for (const [arquivo, de, para] of [
    ['hub-generation.js', "'./generation-tier'", "'./generation-tier.js'"],
    ['generation-tier.js', "'./image-format'", "'./image-format.js'"],
  ]) {
    const file = path.join(outDir, arquivo);
    writeFileSync(file, readFileSync(file, 'utf8').replace(de, para));
  }
  const { allTerminal, jobsFrom, resultsFrom } = await import(
    pathToFileURL(path.join(outDir, 'hub-generation.js')).href
  );

  // --- 1. Os jobs que voltam da submissão ----------------------------------
  assert.deepEqual(
    jobsFrom({ jobs: [{ index: 0, job_id: 'a1' }, { index: 1, job_id: 'b2' }] }),
    [{ index: 0, jobId: 'a1' }, { index: 1, jobId: 'b2' }],
  );
  // Apelidos aceitos: um rename do lado do hub não pode derrubar a geração.
  assert.deepEqual(jobsFrom({ results: [{ index: 3, jobId: 'c3' }] }), [{ index: 3, jobId: 'c3' }]);
  assert.deepEqual(jobsFrom([{ id: 'd4' }]), [{ index: 0, jobId: 'd4' }]);
  // Sem job nenhum é lista vazia — quem chama transforma isso em erro claro,
  // em vez de ficar esperando por algo que nunca foi aberto.
  assert.deepEqual(jobsFrom({ jobs: [] }), []);
  assert.deepEqual(jobsFrom(null), []);
  assert.deepEqual(jobsFrom({ jobs: [{ index: 0 }] }), [], 'job sem id não conta');

  // --- 1b. O formato REAL do hub: texto tabular + structuredContent ---------
  // Medido no servidor de verdade (0.30.1): o bloco de texto NÃO é JSON —
  // é uma tabela compacta — e o dado vive em structuredContent, campo do
  // próprio protocolo MCP. Ler só o texto fazia a submissão parecer vazia:
  // os jobs abriam, o hub cobrava, e o Edvid dizia "não abriu nenhuma
  // geração". Cinco clipes já tinham sido pagos quando isso foi descoberto.
  const tabular = 'jobs[1]{index,job_id,status,type,model}:   0,aad3a3a1,in_progress,image,seedance1_5';
  assert.deepEqual(jobsFrom(tabular), [], 'o texto tabular não é fonte de jobs');
  const estruturado = { jobs: [{ index: 0, job_id: 'aad3a3a1', status: 'in_progress' }], all_terminal: false };
  assert.deepEqual(jobsFrom(estruturado), [{ index: 0, jobId: 'aad3a3a1' }]);
  // E o resultado concluído no mesmo formato entrega a URL.
  assert.equal(
    resultsFrom({ jobs: [{ index: 0, job_id: 'x', status: 'completed', results: { rawUrl: 'https://cdn/v.mp4' } }] })[0].url,
    'https://cdn/v.mp4',
  );

  // --- 2. A resposta real do jobs_wait, medida -----------------------------
  const medida = {
    jobs: [{ index: 0, job_id: '00000000-0000-0000-0000-000000000000', status: 'lookup_failed', error: 'Generation not found', retryable: false }],
    summary: { total: 1, completed: 0, failed: 0, active: 0, errors: 1 },
    all_terminal: true,
  };
  assert.ok(allTerminal(medida));
  assert.deepEqual(resultsFrom(medida), [{ index: 0, error: 'Generation not found' }]);
  assert.ok(!allTerminal({ jobs: [], all_terminal: false }));

  // --- 3. Onde o endereço pode estar ---------------------------------------
  const pronto = (job) => resultsFrom({ jobs: [{ index: 0, status: 'completed', ...job }] })[0];
  assert.equal(pronto({ url: 'https://cdn/x.mp4' }).url, 'https://cdn/x.mp4');
  assert.equal(pronto({ result_url: 'https://cdn/y.mp4' }).url, 'https://cdn/y.mp4');
  assert.equal(pronto({ results: [{ url: 'https://cdn/z.png' }] }).url, 'https://cdn/z.png');
  assert.equal(pronto({ output: { media_url: 'https://cdn/w.mp4' } }).url, 'https://cdn/w.mp4');
  assert.equal(pronto({ medias: [{ raw_url: 'https://cdn/v.mp4' }] }).url, 'https://cdn/v.mp4');

  // --- 4. A tolerância NÃO pode virar silêncio ------------------------------
  // Concluiu e não veio arquivo: isso é defeito e precisa ser dito. Antes de
  // existir esta regra, o resultado seria um arquivo faltando que só apareceria
  // como buraco no vídeo renderizado.
  const mudo = pronto({});
  assert.ok(mudo.error, 'job concluído sem endereço tem de virar erro');
  assert.ok(!mudo.pending, 'e não pode ficar marcado como ainda gerando');
  assert.match(mudo.error, /não devolveu o arquivo/u);
  // Endereço que não é endereço também não passa.
  assert.ok(pronto({ url: 'nao-e-uma-url' }).error);
  assert.ok(pronto({ url: 'file:///etc/passwd' }).error, 'só http(s) conta como resultado');

  // --- 5. Estados de falha e de espera --------------------------------------
  for (const status of ['failed', 'error', 'canceled', 'cancelled', 'rejected', 'lookup_failed']) {
    const resultado = resultsFrom({ jobs: [{ index: 0, status }] })[0];
    assert.ok(resultado.error, `${status} tem de ser falha`);
    assert.ok(!resultado.pending, `${status} é terminal, não espera`);
  }
  for (const status of ['queued', 'active', 'in_progress', '']) {
    const resultado = resultsFrom({ jobs: [{ index: 0, status }] })[0];
    assert.ok(resultado.pending, `${status} ainda está gerando`);
  }
  // Um job vivo que JÁ traz o endereço conta como pronto: esperar de novo só
  // gastaria tempo do aluno.
  assert.equal(resultsFrom({ jobs: [{ index: 0, status: 'active', url: 'https://cdn/a.mp4' }] })[0].url, 'https://cdn/a.mp4');

  // --- 6. O índice é o que liga o resultado ao pedido -----------------------
  // Se o índice se perder, a imagem do pedido 2 é salva com o nome do pedido 1
  // — e o vídeo sai com a arte errada no lugar certo, que é pior que faltar.
  const fora_de_ordem = resultsFrom({
    jobs: [
      { index: 2, status: 'completed', url: 'https://cdn/dois.png' },
      { index: 0, status: 'completed', url: 'https://cdn/zero.png' },
    ],
  });
  assert.equal(fora_de_ordem.find((item) => item.index === 2).url, 'https://cdn/dois.png');
  assert.equal(fora_de_ordem.find((item) => item.index === 0).url, 'https://cdn/zero.png');
  // Sem índice declarado, cai na posição — nunca em zero para todos.
  const sem_indice = resultsFrom({ jobs: [{ status: 'completed', url: 'https://a/1.png' }, { status: 'completed', url: 'https://a/2.png' }] });
  assert.deepEqual(sem_indice.map((item) => item.index), [0, 1]);

  console.log('test:hub-generation ok — endereço achado em qualquer campo, e job concluído sem arquivo vira erro escrito.');
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
