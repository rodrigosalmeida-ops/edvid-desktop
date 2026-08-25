// Teste do NIVEL DE GERACAO (Regular / Medio / Alto / Extremo).
//
// O catalogo abaixo nao e inventado: e o recorte do que o MCP do Higgsfield
// devolveu em models_explore (agosto/2026), com os campos que a escolha usa.
// Se o hub mudar um modelo de lugar, este teste continua descrevendo o que
// FOI medido — e a diferenca aparece quando alguem re-medir.
//
// O risco aqui nao e escolher um modelo pior. E escolher um que entrega 720p,
// ou com audio proprio por baixo da voz do aluno, ou numa proporcao que o
// render corta. Nenhuma dessas tres coisas aparece em teste manual rapido:
// o video sai, parece pronto, e so incomoda depois de publicado.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(path.join(tmpdir(), 'edvid-tier-'));

// --- Catalogo MEDIDO --------------------------------------------------------
const VIDEO = [
  { id: 'kling3_0_turbo', aspect_ratios: ['16:9', '9:16', '1:1'], duration_range: { min: 3, max: 15 },
    parameters: [
      { name: 'resolution', options: ['720p', '1080p'], default: '720p' },
      { name: 'duration', min: 3, max: 15, default: 5 },
    ] },
  { id: 'happy_horse_video', aspect_ratios: ['16:9', '9:16', '1:1', '4:3', '3:4'], duration_range: { min: 3, max: 15 },
    parameters: [{ name: 'resolution', options: ['720p', '1080p'], default: '720p' }] },
  { id: 'seedance1_5', aspect_ratios: ['auto', '16:9', '9:16', '4:3', '3:4', '1:1', '21:9'], durations: [4, 8, 12],
    parameters: [
      { name: 'duration', options: [4, 8, 12], default: 4 },
      { name: 'resolution', options: ['480p', '720p', '1080p'], default: '720p' },
      { name: 'generate_audio', default: true },
    ] },
  { id: 'wan2_7', aspect_ratios: ['16:9', '9:16', '1:1', '4:3', '3:4'], duration_range: { min: 2, max: 15 },
    parameters: [{ name: 'resolution', options: ['720p', '1080p'], default: '720p' }] },
  { id: 'seedance_2_0', aspect_ratios: ['auto', '16:9', '9:16', '4:3', '3:4', '1:1', '21:9'], duration_range: { min: 4, max: 15 },
    parameters: [
      { name: 'resolution', options: ['480p', '720p', '1080p', '4k'], default: '720p' },
      { name: 'mode', options: ['std', 'fast'], default: 'std' },
      { name: 'generate_audio', default: true },
    ] },
  { id: 'seedance_2_5', aspect_ratios: ['auto', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'], duration_range: { min: 4, max: 30 },
    parameters: [
      { name: 'resolution', options: ['480p', '720p', '1080p'], default: '720p' },
      { name: 'generate_audio', default: true },
    ] },
  { id: 'kling3_0', aspect_ratios: ['16:9', '9:16', '1:1'], duration_range: { min: 3, max: 15 },
    parameters: [
      { name: 'mode', options: ['std', 'pro', '4k'], default: 'std' },
      { name: 'sound', options: ['on', 'off'], default: 'on' },
    ] },
  { id: 'cinematic_studio_3_0', aspect_ratios: ['auto', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'], duration_range: { min: 4, max: 15 },
    parameters: [
      { name: 'resolution', options: ['480p', '720p', '1080p', '4k'], default: '720p' },
      { name: 'generate_audio', default: false },
    ] },
  { id: 'veo3_1', aspect_ratios: ['16:9', '9:16'], durations: [4, 6, 8],
    parameters: [
      { name: 'duration', options: [4, 6, 8], default: 8 },
      { name: 'quality', options: ['basic', 'high', 'ultra'], default: 'basic' },
      { name: 'variant', options: ['veo-3-1-preview', 'veo-3-1-fast'], default: 'veo-3-1-fast' },
    ] },
  { id: 'flux_3_video', aspect_ratios: ['auto', '21:9', '2:1', '16:9', '4:3', '1:1', '3:4', '9:16'], duration_range: { min: 5, max: 20 },
    parameters: [
      { name: 'resolution', options: ['720p', '1080p'], default: '720p' },
      { name: 'generate_audio', default: true },
    ] },
  // Os que precisam FICAR DE FORA, e por que.
  { id: 'gemini_omni', aspect_ratios: ['16:9', '9:16'], duration_range: { min: 4, max: 10 },
    parameters: [{ name: 'resolution', options: ['720p'], default: '720p' }] },        // teto 720p
  { id: 'seedance_2_0_mini', aspect_ratios: ['auto', '16:9', '9:16'], duration_range: { min: 4, max: 15 },
    parameters: [{ name: 'resolution', options: ['480p', '720p'], default: '720p' }] }, // teto 720p
  { id: 'minimax_hailuo', aspect_ratios: [], durations: [6, 10],
    parameters: [{ name: 'resolution', options: ['512', '768', '1080'], default: '768' }] }, // sem proporcao
  { id: 'grok_video_v15', aspect_ratios: [], duration_range: { min: 2, max: 15 },
    parameters: [{ name: 'resolution', options: ['480p', '720p', '1080p'], default: '720p' }] }, // sem proporcao
];

const IMAGE = [
  { id: 'nano_banana', aspect_ratios: ['1:1', '3:2', '2:3', '4:3', '3:4', '4:5', '5:4', '9:16', '16:9', '21:9'], parameters: [] },
  { id: 'z_image', aspect_ratios: ['1:1', '4:3', '3:4', '16:9', '9:16'], parameters: [] },
  { id: 'nano_banana_2', aspect_ratios: ['1:1', '3:2', '2:3', '4:3', '3:4', '4:5', '5:4', '9:16', '16:9', '21:9'],
    parameters: [{ name: 'resolution', options: ['1k', '2k', '4k'], default: '1k' }] },
  { id: 'nano_banana_pro', aspect_ratios: ['1:1', '3:2', '2:3', '4:3', '3:4', '4:5', '5:4', '9:16', '16:9', '21:9'],
    parameters: [{ name: 'resolution', options: ['1k', '2k', '4k'], default: '2k' }] },
  { id: 'seedream_v5_lite', aspect_ratios: ['1:1', '4:3', '3:4', '16:9', '9:16', '21:9'],
    parameters: [{ name: 'quality', options: ['basic', 'high'], default: 'basic' }] },
  { id: 'seedream_v4_5', aspect_ratios: ['1:1', '4:3', '16:9', '3:2', '21:9', '3:4', '9:16', '2:3'],
    parameters: [{ name: 'quality', options: ['basic', 'high'], default: 'basic' }] },
  { id: 'kling_omni_image', aspect_ratios: ['1:1', 'auto', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9'],
    parameters: [{ name: 'resolution', options: ['1k', '2k'], default: '1k' }] },
  { id: 'gpt_image_2', aspect_ratios: ['1:1', '4:3', '3:4', '16:9', '21:9', '9:16', '3:2', '2:3'],
    parameters: [
      { name: 'resolution', options: ['1k', '2k', '4k'], default: '1k' },
      { name: 'quality', options: ['low', 'medium', 'high'], default: 'low' },
    ] },
  { id: 'cinematic_studio_2_5', aspect_ratios: ['1:1', '3:2', '2:3', '4:3', '3:4', '4:5', '5:4', '16:9', '9:16', '21:9'],
    parameters: [{ name: 'resolution', options: ['1k', '2k', '4k'], default: '1k' }] },
  { id: 'seedream_v5_pro', aspect_ratios: ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '21:9'],
    parameters: [{ name: 'resolution', options: ['1k', '1.5k', '2k'], default: '2k' }] },
  { id: 'soul_2', aspect_ratios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'],
    parameters: [{ name: 'quality', options: ['1.5k', '2k'], default: '2k' }] },
  // So 1:1 / 3:2 / 2:3 / auto — nao serve para 9:16, por melhor que seja.
  { id: 'openai_hazel', aspect_ratios: ['1:1', '3:2', '2:3', 'auto'],
    parameters: [{ name: 'quality', options: ['low', 'medium', 'high'], default: 'medium' }] },
];

try {
  execFileSync(process.execPath, [
    path.join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
    path.join(projectRoot, 'src', 'generation-tier.ts'),
    path.join(projectRoot, 'src', 'image-format.ts'),
    '--target', 'es2022', '--module', 'es2022', '--moduleResolution', 'bundler',
    '--skipLibCheck', '--outDir', outDir,
  ], { stdio: 'inherit' });
  // O tsc emite `from './image-format'` sem extensão (resolução de bundler);
  // o Node em ESM exige o .js. Só o carregamento muda — o código é o mesmo.
  const emitido = path.join(outDir, 'generation-tier.js');
  writeFileSync(emitido, readFileSync(emitido, 'utf8').replace("'./image-format'", "'./image-format.js'"));
  const tier = await import(pathToFileURL(emitido).href);
  const {
    DEFAULT_TIER, TIERS, durationFor, nearestAspect, paramsFit, parseAspect, resolveGeneration, tierFrom,
  } = tier;

  const video = (t, extra = {}) => resolveGeneration({
    hub: 'higgsfield', kind: 'video', tier: t, use: 'tela-cheia', seconds: 4, catalog: VIDEO, ...extra,
  });
  const image = (t, extra = {}) => resolveGeneration({
    hub: 'higgsfield', kind: 'imagem', tier: t, use: 'tela-cheia', catalog: IMAGE, ...extra,
  });

  // --- 1. As tres promessas do video ---------------------------------------
  // Estas valem para TODO nivel. Sao a razao de o modulo existir.
  const MODELOS_1080_NATIVO = new Set(['veo3_1', 'kling3_0']);
  for (const nivel of TIERS) {
    const escolha = video(nivel);
    assert.ok(escolha, `${nivel}: precisa achar um modelo de vídeo`);

    // (a) FullHD. 720p e o padrao de quase todos: tem de ir escrito.
    const pede1080 = Object.values(escolha.params).some((v) => /^(1080p|2k|4k)$/u.test(String(v)));
    assert.ok(
      pede1080 || MODELOS_1080_NATIVO.has(escolha.model),
      `${nivel}: ${escolha.model} não garante 1080p — ${JSON.stringify(escolha.params)}`,
    );

    // (b) Proporção do vídeo vertical.
    assert.equal(escolha.aspectRatio, '9:16', `${nivel}: ${escolha.model} saiu em ${escolha.aspectRatio}`);

    // (c) Áudio desligado onde o modelo tem a chave. Som gerado pelo modelo
    //     entra POR BAIXO da voz do aluno — é o defeito que só aparece depois
    //     de publicado.
    const modelo = VIDEO.find((item) => item.id === escolha.model);
    for (const chave of ['generate_audio', 'sound']) {
      const declarada = modelo.parameters.some((p) => p.name === chave);
      const ligadaPorPadrao = modelo.parameters.find((p) => p.name === chave)?.default;
      if (declarada && ligadaPorPadrao !== false && ligadaPorPadrao !== 'off') {
        assert.ok(chave in escolha.params, `${nivel}: ${escolha.model} precisa desligar ${chave}`);
        assert.ok(
          escolha.params[chave] === false || escolha.params[chave] === 'off',
          `${nivel}: ${escolha.model} deixou ${chave} = ${escolha.params[chave]}`,
        );
      }
    }
  }

  // O custo MEDIDO precisa subir junto com o nível — senão o dial mente sobre
  // o que está sendo cobrado do aluno.
  const custos = TIERS.map((t) => video(t).credits);
  for (let i = 1; i < custos.length; i += 1) {
    assert.ok(custos[i] > custos[i - 1], `${TIERS[i]} (${custos[i]}) não custa mais que ${TIERS[i - 1]} (${custos[i - 1]})`);
  }
  const custosImagem = TIERS.map((t) => image(t).credits);
  for (let i = 1; i < custosImagem.length; i += 1) {
    assert.ok(custosImagem[i] >= custosImagem[i - 1], `imagem ${TIERS[i]} ficou mais barata que ${TIERS[i - 1]}`);
  }

  // Os quatro níveis não podem ser o mesmo modelo com nome diferente.
  const escolhidos = TIERS.map((t) => video(t).model);
  assert.equal(new Set(escolhidos).size, 4, `níveis repetiram modelo: ${escolhidos.join(', ')}`);

  // --- 2. Quem tem de ficar de fora, e por quê ------------------------------
  const proibidos = new Set(['gemini_omni', 'seedance_2_0_mini', 'minimax_hailuo', 'grok_video_v15']);
  for (const nivel of TIERS) {
    assert.ok(!proibidos.has(video(nivel).model), `${nivel} escolheu um modelo que não entrega 1080p em 9:16`);
  }
  // Mesmo sozinho no catálogo, um modelo sem controle de proporção não serve:
  // é melhor avisar que não deu do que entregar b-roll na proporção errada.
  assert.equal(
    resolveGeneration({ hub: 'higgsfield', kind: 'video', tier: 'medio', use: 'tela-cheia', seconds: 4,
      catalog: VIDEO.filter((m) => m.id === 'minimax_hailuo') }),
    null,
  );
  // E um catálogo só com modelos de 720p também não vira um 720p silencioso.
  assert.equal(
    resolveGeneration({ hub: 'higgsfield', kind: 'video', tier: 'extremo', use: 'tela-cheia', seconds: 4,
      catalog: VIDEO.filter((m) => m.id === 'gemini_omni' || m.id === 'seedance_2_0_mini') }),
    null,
  );

  // --- 3. Imagem: o nível move o MODELO, não o tamanho ----------------------
  // A entrega é 1080x1920 e a faixa da tela dividida tem 1080x749. Um 4k só
  // paga crédito por pixel que o render joga fora.
  for (const nivel of TIERS) {
    const escolha = image(nivel);
    assert.ok(escolha, `${nivel}: precisa achar um modelo de imagem`);
    assert.ok(
      !Object.values(escolha.params).includes('4k'),
      `${nivel}: pediu 4k numa entrega de 1080x1920 (${escolha.model})`,
    );
  }
  assert.equal(image('regular').model, 'z_image');
  assert.equal(image('extremo').model, 'gpt_image_2');
  assert.equal(image('extremo').params.quality, 'high');

  // A faixa da tela dividida é larga (1,44): pedir 9:16 nela era o defeito
  // antigo de imagem cortadíssima.
  assert.equal(image('alto', { use: 'tela-dividida' }).aspectRatio, '3:2');
  assert.equal(image('alto', { use: 'tela-dividida-base' }).aspectRatio, '1:1');
  assert.equal(image('alto', { use: 'paisagem' }).aspectRatio, '16:9');
  // openai_hazel tem o melhor texto do catálogo e mesmo assim nunca é escolhido
  // para 9:16, porque não oferece a proporção.
  assert.notEqual(image('extremo').model, 'openai_hazel');

  // Retrato vale em TODOS os níveis: medido, o soul_2 custa 0,12 — menos que o
  // modelo mais barato do catálogo. Não há troca entre qualidade e preço aqui.
  for (const nivel of TIERS) {
    assert.equal(image(nivel, { portrait: true }).model, 'soul_2', `${nivel}: retrato tem modelo próprio`);
  }
  assert.ok(image('regular', { portrait: true }).credits < image('regular').credits);

  // --- 4b. O formato NOVO do catálogo: duração só no parâmetro ---------------
  // Medido na conta real do aluno: durations/duration_range sumiram do topo e
  // vivem no parâmetro `duration`. O catálogo inteiro nesse formato tem de
  // continuar resolvendo — foi a falha da primeira geração real.
  const soParametro = VIDEO.map((m) => {
    const { durations, duration_range, ...resto } = m;
    const parametros = [...(m.parameters ?? [])];
    if (!parametros.some((p) => p.name === 'duration')) {
      parametros.push(durations
        ? { name: 'duration', options: durations, default: durations[0] }
        : { name: 'duration', min: duration_range.min, max: duration_range.max, default: 5 });
    }
    return { ...resto, parameters: parametros };
  });
  const novoFormato = resolveGeneration({ hub: 'higgsfield', kind: 'video', tier: 'medio', use: 'tela-cheia', seconds: 4, catalog: soParametro });
  assert.ok(novoFormato, 'o formato novo tem de resolver');
  assert.equal(novoFormato.model, 'seedance1_5');
  assert.equal(novoFormato.duration, 4);

  // --- 4. Duração: arredonda para CIMA ---------------------------------------
  // Pedir menos que a janela deixaria um buraco no vídeo.
  const dur = (id, s) => durationFor(VIDEO.find((m) => m.id === id), s);
  assert.deepEqual(dur('seedance1_5', 3.7), { duration: 4, covers: true });
  assert.deepEqual(dur('seedance1_5', 8.2), { duration: 12, covers: true });
  assert.deepEqual(dur('veo3_1', 5.1), { duration: 6, covers: true });
  assert.deepEqual(dur('kling3_0_turbo', 4.2), { duration: 5, covers: true });
  assert.deepEqual(dur('kling3_0_turbo', 1), { duration: 3, covers: true });
  // Acima do máximo do modelo, o clipe sai CURTO e isso é dito, não escondido.
  assert.deepEqual(dur('veo3_1', 30), { duration: 8, covers: false });
  assert.equal(video('medio', { seconds: 3.7 }).duration, 4);
  assert.equal(video('medio', { seconds: 3.7 }).truncated, false);

  // Janela de 10s no Extremo: o Veo só faz 4/6/8 e deixaria dois segundos de
  // buraco. O Cinema Studio, ao lado na mesma lista, vai até 15 — e é ele que
  // tem de atender, em vez de o primeiro da fila cortar calado.
  const longo = video('extremo', { seconds: 10 });
  assert.equal(longo.model, 'cinematic_studio_3_0');
  assert.equal(longo.duration, 10);
  assert.equal(longo.truncated, false);
  // E quando NINGUÉM alcança, o corte é assumido em vez de silencioso.
  const curto = resolveGeneration({ hub: 'higgsfield', kind: 'video', tier: 'extremo', use: 'tela-cheia',
    seconds: 30, catalog: VIDEO.filter((m) => m.id === 'veo3_1') });
  assert.equal(curto.duration, 8);
  assert.equal(curto.truncated, true);

  // --- 5. Nível desce, NUNCA sobe --------------------------------------------
  // Crédito gasto não volta: subir sozinho gastaria mais do que o aluno
  // autorizou. Sem os modelos do Extremo, o pedido cai para o Alto.
  const semExtremo = VIDEO.filter((m) => !['cinematic_studio_3_0', 'veo3_1', 'flux_3_video'].includes(m.id));
  const rebaixado = resolveGeneration({ hub: 'higgsfield', kind: 'video', tier: 'extremo', use: 'tela-cheia', seconds: 4, catalog: semExtremo });
  assert.equal(rebaixado.tier, 'alto');
  assert.equal(rebaixado.model, 'kling3_0');
  // E o Regular jamais é atendido por um modelo de nível acima.
  assert.equal(video('regular').tier, 'regular');
  assert.equal(video('regular').model, 'kling3_0_turbo');

  // --- 6. O catálogo vivo manda ---------------------------------------------
  // Parâmetro que o modelo não declara derruba o candidato, em vez de virar
  // pedido inválido que volta como "não consegui gerar" sem explicação.
  const semOpcao1080 = VIDEO.map((m) => (m.id === 'kling3_0_turbo'
    ? { ...m, parameters: [{ name: 'resolution', options: ['720p'], default: '720p' }] }
    : m));
  assert.notEqual(
    resolveGeneration({ hub: 'higgsfield', kind: 'video', tier: 'regular', use: 'tela-cheia', seconds: 4, catalog: semOpcao1080 }).model,
    'kling3_0_turbo',
  );
  assert.ok(paramsFit({ id: 'x', parameters: [{ name: 'resolution', options: ['720p', '1080p'] }] }, { resolution: '1080p' }));
  assert.ok(!paramsFit({ id: 'x', parameters: [{ name: 'resolution', options: ['720p'] }] }, { resolution: '1080p' }));
  assert.ok(!paramsFit({ id: 'x', parameters: [] }, { resolution: '1080p' }));
  // Parâmetro sem lista de opções (número livre) é aceito.
  assert.ok(paramsFit({ id: 'x', parameters: [{ name: 'duration', min: 3, max: 15 }] }, { duration: 5 }));

  // Catálogo vazio não vira pedido chutado.
  assert.equal(resolveGeneration({ hub: 'higgsfield', kind: 'video', tier: 'medio', use: 'tela-cheia', seconds: 4, catalog: [] }), null);
  // O Magnific ainda não foi medido: melhor devolver nada do que uma tabela
  // autorada no escuro.
  assert.equal(resolveGeneration({ hub: 'magnific', kind: 'imagem', tier: 'alto', use: 'tela-cheia', catalog: IMAGE }), null);

  // --- 7. Utilitários ---------------------------------------------------------
  assert.equal(parseAspect('9:16').toFixed(4), '0.5625');
  assert.equal(parseAspect('auto'), null);
  assert.equal(nearestAspect(1.44, ['1:1', '16:9', '9:16']), '16:9');
  assert.equal(nearestAspect(0.5625, ['1:1', '16:9', '9:16']), '9:16');
  assert.equal(nearestAspect(1, ['auto']), null, '"auto" não conta como proporção');
  assert.equal(tierFrom('extremo', 'video'), 'extremo');
  assert.equal(tierFrom('EXTREMO', 'video'), 'extremo');
  assert.equal(tierFrom('turbinado', 'video'), DEFAULT_TIER.video);
  assert.equal(tierFrom(null, 'imagem'), DEFAULT_TIER.imagem);
  // O padrão não pode ser o nível mais caro: é o crédito do aluno.
  assert.ok(TIERS.indexOf(DEFAULT_TIER.video) < TIERS.indexOf('extremo'));

  // --- Passada RELAXADA: plano magro nao vira "nenhum modelo entrega" ------
  // Um plano que so oferece 1k no nano_banana_2 (e nada dos outros candidatos)
  // recusava tudo; agora o parametro recusado e descartado e o modelo gera no
  // padrao dele. Qualidade menor ganha de geracao nenhuma.
  const catalogoMagro = [
    { id: 'nano_banana_2', aspect_ratios: ['1:1', '3:2', '9:16'],
      parameters: [{ name: 'resolution', options: ['1k'], default: '1k' }] },
  ];
  const relaxada = resolveGeneration({
    hub: 'higgsfield', kind: 'imagem', tier: 'medio', use: 'tela-dividida', catalog: catalogoMagro,
  });
  assert.ok(relaxada, 'o plano magro tem de gerar mesmo assim');
  assert.equal(relaxada.model, 'nano_banana_2');
  assert.deepEqual(relaxada.params, {}, 'o parametro recusado e descartado, nao enviado errado');

  // Video sem 1080p no plano: a passada relaxada aceita o padrao do modelo.
  const videoMagro = [
    { id: 'seedance1_5', aspect_ratios: ['9:16'],
      parameters: [
        { name: 'resolution', options: ['720p'], default: '720p' },
        { name: 'duration', options: [4, 8, 12] },
        { name: 'generate_audio', options: [] },
      ] },
  ];
  const clipeMagro = resolveGeneration({
    hub: 'higgsfield', kind: 'video', tier: 'medio', use: 'tela-dividida', seconds: 4, catalog: videoMagro,
  });
  assert.ok(clipeMagro, 'clipe em 720p ganha de clipe nenhum');
  assert.equal(clipeMagro.model, 'seedance1_5');

  // --- Diagnostico: a recusa DIZ qual porta barrou --------------------------
  const motivos = [];
  const nada = resolveGeneration({
    hub: 'higgsfield', kind: 'imagem', tier: 'medio', use: 'tela-dividida', catalog: [],
  }, motivos);
  assert.equal(nada, null);
  assert.ok(motivos.length >= 3, 'cada candidato do nivel pedido registra o motivo');
  assert.ok(motivos.every((m) => /fora do catálogo/.test(m)), `motivos: ${motivos.join('; ')}`);

  const motivosProporcao = [];
  resolveGeneration({
    hub: 'higgsfield', kind: 'imagem', tier: 'medio', use: 'tela-dividida',
    catalog: [{ id: 'nano_banana_2', aspect_ratios: [], parameters: [{ name: 'resolution', options: ['2k'] }] }],
  }, motivosProporcao);
  assert.ok(motivosProporcao.some((m) => /sem lista de proporções/.test(m)));

  // --- O PLANO REAL de um aluno (fixture medida em 25/08/2026) --------------
  // 11 modelos de imagem, 6 de video, e NENHUM candidato do Regular/Medio
  // presente. Foi o "nenhum modelo do seu plano entrega" que atravessou tres
  // versoes: o plano nao e o meu, e o teste manual na minha conta nunca ia
  // reproduzir. A fixture trava as duas promessas: imagem SOBE de nivel
  // sozinha (ate 7 creditos), video NUNCA sobe — quem chama orienta.
  const planoReal = JSON.parse(readFileSync(
    path.join(projectRoot, 'scripts', 'fixtures', 'catalogo-plano-basico-2026-08.json'), 'utf8'));
  const imagemPlanoReal = resolveGeneration({
    hub: 'higgsfield', kind: 'imagem', tier: 'medio', use: 'tela-dividida', catalog: planoReal.imagem,
  });
  assert.ok(imagemPlanoReal, 'o plano basico TEM de gerar imagem');
  assert.equal(imagemPlanoReal.model, 'cinematic_studio_2_5', 'a subida escolhe o mais barato que atende');
  assert.equal(imagemPlanoReal.tier, 'medio', 'o nivel mostrado continua o pedido — o preco e que manda');
  const videoPlanoReal = resolveGeneration({
    hub: 'higgsfield', kind: 'video', tier: 'medio', use: 'tela-dividida', seconds: 5, catalog: planoReal.video,
  });
  assert.equal(videoPlanoReal, null, 'video NAO sobe sozinho: 40 creditos e decisao do aluno');
  const videoExtremoReal = resolveGeneration({
    hub: 'higgsfield', kind: 'video', tier: 'extremo', use: 'tela-dividida', seconds: 5, catalog: planoReal.video,
  });
  assert.ok(videoExtremoReal, 'no Extremo o plano basico gera');
  assert.equal(videoExtremoReal.model, 'cinematic_studio_3_0');
  assert.equal(videoExtremoReal.params.resolution, '1080p');
  assert.equal(videoExtremoReal.params.generate_audio, false, 'mudo continua garantido');

  console.log('test:generation-tier ok — vídeo sempre 1080p 9:16 e mudo, imagem nunca em 4k, e o nível desce mas nunca sobe.');
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
