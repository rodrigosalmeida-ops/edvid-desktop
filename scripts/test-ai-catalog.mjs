// Teste do catálogo de IAs e da escolha de provedor por papel.
//
// A regra que importa para o aluno: nunca gastar dinheiro dele sem precisar,
// nunca parar a edição porque UM provedor bateu no limite, e respeitar o
// "apenas modelos gratuitos" mesmo quando isso significa não ter ninguém.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(path.join(tmpdir(), 'edvid-catalog-'));

try {
  execFileSync(process.execPath, [
    path.join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
    path.join(projectRoot, 'src', 'ai-catalog.ts'),
    '--target', 'es2022', '--module', 'es2022', '--moduleResolution', 'bundler',
    '--skipLibCheck', '--outDir', outDir,
  ], { stdio: 'inherit' });

  const { AI_CATALOG, catalogEntry, chatRoute, keyProbe } =
    await import(pathToFileURL(path.join(outDir, 'ai-catalog.js')).href);

  // --- Catálogo bem formado: sem isso a interface mostra badge errado. ---
  const ids = AI_CATALOG.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length, 'ids não podem repetir');
  for (const entry of AI_CATALOG) {
    assert.ok(entry.capabilities.length > 0, `${entry.id} precisa de ao menos um badge`);
    assert.ok(/^https:\/\//u.test(entry.keyUrl), `${entry.id} precisa de link https para criar a chave`);
    // Toda conexão precisa de UM caminho de entrada: chave secreta ou login
    // OAuth. Nenhum dos dois significa um card que o aluno não consegue
    // conectar de jeito nenhum. Os dois ao mesmo tempo significa duas verdades
    // sobre o mesmo estado de conexão — foi assim que o seletor de imagem
    // acabou com uma escolha que voltava sozinha.
    const porChave = entry.credentials.some((field) => field.secret);
    assert.ok(porChave || entry.oauthHub, `${entry.id} não tem como ser conectado`);
    assert.ok(!(porChave && entry.oauthHub), `${entry.id} tem dois caminhos de conexão`);
    if (entry.oauthHub) {
      assert.deepEqual(entry.credentials, [], `${entry.id} entra por login e não guarda credencial`);
      assert.deepEqual(entry.auth, ['login'], `${entry.id} só oferece login`);
      // Modelo fixo aqui apodrece: são 30+ e mudam todo mês. O nível escolhido
      // pelo aluno é resolvido contra o catálogo VIVO do hub.
      assert.deepEqual(entry.models, [], `${entry.id} não fixa lista de modelos`);
    }
    for (const model of entry.models) {
      assert.ok(entry.capabilities.includes(model.capability),
        `${entry.id}: modelo ${model.id} declara capacidade fora dos badges`);
    }
    if (entry.pricing === 'free') {
      assert.ok(entry.models.every((m) => m.free), `${entry.id} é marcado como gratuito`);
    }
  }

  // --- As IAs gratuitas SAÍRAM (0.22.0) -------------------------------------
  // Não é gosto: com um provedor do catálogo escolhido para o chat, o Codex
  // grava model_provider no config.toml e passa a responder `account: null`
  // no account/read — o Edvid dizia que o ChatGPT não estava conectado com o
  // login feito e o token no disco. Medido na máquina do aluno: mesmo
  // auth.json, com o provedor customizado dá null e sem ele dá a conta.
  assert.deepEqual(ids.sort(), ['chatgpt', 'claude', 'gemini', 'higgsfield', 'treblo']);

  // --- O hub de geração (0.24.0) --------------------------------------------
  const higgsfield = catalogEntry('higgsfield');
  assert.deepEqual(higgsfield.capabilities, ['imagem', 'video']);
  assert.equal(higgsfield.oauthHub, 'higgsfield');
  // Vídeo só existe pelo hub: nenhuma das três contas fixas gera vídeo. Se um
  // dia isso mudar, o seletor de vídeo precisa mudar junto.
  const geramVideo = AI_CATALOG.filter((entry) => entry.capabilities.includes('video')).map((entry) => entry.id);
  assert.deepEqual(geramVideo, ['higgsfield']);
  assert.equal(catalogEntry('ollama'), null, 'Ollama saiu do catálogo');
  assert.equal(catalogEntry('cloudflare'), null);
  assert.equal(catalogEntry('openrouter'), null);
  // O Treblo fica: é quem compõe a trilha.
  assert.ok(catalogEntry('treblo')?.capabilities.includes('musica'));
  // E nenhum provedor do catálogo pode voltar a conduzir o CHAT sem que
  // alguém reveja o efeito acima.
  for (const entry of AI_CATALOG) {
    assert.ok(!entry.openaiBaseUrl, `${entry.id} voltaria a virar model_provider no Codex`);
  }

  // --- Verificação de chave: cada provedor no SEU endereço ------------------
  // O defeito real: o teste tinha caso para Cloudflare, Treblo e Ollama, e
  // tudo o mais caía num fallback apontando para o openrouter.ai. A chave boa
  // do Gemini era enviada para o OpenRouter, voltava 401 e o aluno lia
  // "Chave recusada pelo provedor".
  const gemini = keyProbe('gemini', { apiKey: 'abc' });
  assert.ok(gemini.url.includes('generativelanguage.googleapis.com'), `Gemini no endereço errado: ${gemini.url}`);
  assert.ok(!gemini.url.includes('openrouter'), 'NUNCA testar Gemini no OpenRouter');
  // A chave do Gemini vai na URL, não em cabeçalho — e precisa ir escapada.
  assert.ok(gemini.url.includes('key=abc'));
  assert.deepEqual(gemini.headers, {});
  // E o Google recusa com 400, não 401: medido no endpoint real.
  assert.ok(gemini.refusedStatus.includes(400), '400 é como o Google diz "chave inválida"');

  const chatgpt = keyProbe('chatgpt', { apiKey: 'sk-x' });
  assert.ok(chatgpt.url.includes('api.openai.com'));
  assert.equal(chatgpt.headers.Authorization, 'Bearer sk-x');
  const claude = keyProbe('claude', { apiKey: 'sk-ant-x' });
  assert.ok(claude.url.includes('api.anthropic.com'));
  assert.equal(claude.headers['x-api-key'], 'sk-ant-x', 'a Anthropic não usa Bearer');
  assert.ok(claude.headers['anthropic-version'], 'sem a versão a Anthropic recusa o pedido');
  // Provedor que saiu do catálogo não tem mais verificação.
  assert.equal(keyProbe('ollama', { apiKey: 'x' }), null);
  assert.equal(keyProbe('cloudflare', { apiKey: 'x', accountId: 'c' }), null);
  // Provedor sem verificação não pode virar teste contra o serviço errado.
  assert.equal(keyProbe('inventado', { apiKey: 'x' }), null);
  assert.equal(keyProbe('treblo', { apiKey: 'x' }), null, 'o Treblo tem verificação própria');

  // Toda IA do catálogo que aceita chave precisa saber ser verificada — ou
  // ter caso próprio. Sem isto, o próximo provedor repete o defeito.
  for (const entry of AI_CATALOG) {
    if (!entry.auth.includes('apikey')) continue;
    const probe = keyProbe(entry.id, { apiKey: 'x', accountId: 'y' });
    assert.ok(probe !== null || entry.id === 'treblo', `${entry.id} não sabe verificar a própria chave`);
  }

  // --- Quem conduz a conversa: UMA verdade só -------------------------------
  // Havia duas: o seletor mostrava o provedor do catálogo e o roteamento olhava
  // o papel das contas fixas. Com Ollama no catálogo e "gemini" no papel — que
  // fica assim sozinho quando o aluno conecta uma chave do Gemini — o seletor
  // dizia "Ollama Cloud" e a mensagem ia para o agente do Gemini, que respondia
  // "conecte sua chave do Gemini para conversar".
  assert.deepEqual(chatRoute('ollama', 'gemini'), { kind: 'catalog', id: 'ollama' },
    'com provedor do catálogo escolhido, ele conduz — o papel antigo não pode vencer');
  assert.deepEqual(chatRoute(null, 'gemini'), { kind: 'fixed', provider: 'gemini' });
  assert.deepEqual(chatRoute('', 'claude'), { kind: 'fixed', provider: 'claude' });
  assert.deepEqual(chatRoute(undefined, 'chatgpt'), { kind: 'fixed', provider: 'chatgpt' });
  // Espaço em branco não é escolha.
  assert.deepEqual(chatRoute('   ', 'chatgpt'), { kind: 'fixed', provider: 'chatgpt' });

  console.log('test:ai-catalog ok — só as contas pagas e o Treblo, chave no provedor certo e uma só verdade sobre quem conduz o chat.');
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
