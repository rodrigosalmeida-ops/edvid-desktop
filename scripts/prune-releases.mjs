// Faxina do bucket de releases no R2.
//
// O bucket chegou a 25,7 GB porque nada era apagado desde a primeira versao:
// 54 ZIPs do mac, 38 DMGs, 36 instaladores e 36 pacotes do Windows. Nenhuma
// dessas versoes antigas e alcancavel pelos canais de atualizacao — feed.json
// e win32/RELEASES apontam SEMPRE so para a atual.
//
// Politica: guarda as 3 versoes mais novas de cada familia de artefato.
//
// Invariantes, verificados a cada execucao (nao sao opcionais):
//   1. Nada citado por feed.json ou win32/RELEASES e apagado.
//   2. Os nomes estaveis (Edvid.dmg, EdvidSetup.exe) ficam: sao os links que
//      circulam por fora.
//   3. runtimes/ NUNCA e tocado. O pacote e escolhido por CHAVE do manifesto,
//      e um aluno numa versao antiga do Edvid ainda baixa o pacote dele — o
//      espaco economizado nao paga quebrar a instalacao de quem nao atualizou.
//
// Uso:
//   node scripts/prune-releases.mjs            (so lista o que sairia)
//   node scripts/prune-releases.mjs --apply    (apaga)
import { createHash } from 'node:crypto';
import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

const KEEP_VERSIONS = 3;
const apply = process.argv.includes('--apply');

const accountId = process.env.EDVID_CF_ACCOUNT_ID?.trim();
const apiToken = process.env.EDVID_CF_API_TOKEN?.trim();
const bucket = process.env.EDVID_R2_BUCKET?.trim();
const baseUrl = process.env.EDVID_UPDATE_BASE_URL?.trim().replace(/\/$/, '');
if (!accountId || !apiToken || !bucket || !baseUrl) {
  console.error('Faltam EDVID_CF_ACCOUNT_ID, EDVID_CF_API_TOKEN, EDVID_R2_BUCKET ou EDVID_UPDATE_BASE_URL.');
  process.exit(1);
}

const chamar = (url) => fetch(url, { headers: { Authorization: `Bearer ${apiToken}` } });
let verify = await chamar('https://api.cloudflare.com/client/v4/user/tokens/verify');
let verifyBody = await verify.json().catch(() => null);
if (!verifyBody?.result?.id) {
  verify = await chamar(`https://api.cloudflare.com/client/v4/accounts/${accountId}/tokens/verify`);
  verifyBody = await verify.json().catch(() => null);
}
if (!verifyBody?.result?.id) {
  console.error('Token do Cloudflare recusado.');
  process.exit(1);
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: verifyBody.result.id,
    secretAccessKey: createHash('sha256').update(apiToken).digest('hex'),
  },
});

// --- O que os canais estao usando AGORA -------------------------------------
const referenciados = new Set();
const feed = await (await fetch(`${baseUrl}/feed.json`)).json().catch(() => null);
for (const release of feed?.releases ?? []) {
  const url = release?.updateTo?.url;
  if (typeof url === 'string') referenciados.add(url.split('/').pop());
}
const releases = await (await fetch(`${baseUrl}/win32/RELEASES`)).text().catch(() => '');
for (const linha of releases.split(/\r?\n/)) {
  const nome = linha.trim().split(/\s+/)[1];
  if (nome) referenciados.add(nome);
}

// --- Inventario -------------------------------------------------------------
const objetos = [];
let cursor;
do {
  const pagina = await s3.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: cursor }));
  objetos.push(...(pagina.Contents ?? []));
  cursor = pagina.IsTruncated ? pagina.NextContinuationToken : undefined;
} while (cursor);

// Versao no nome do arquivo; sem versao, o objeto e estavel e fica.
const versaoDe = (key) => key.match(/(\d+)\.(\d+)\.(\d+)/u);
const familia = (key) => key.replace(/\d+\.\d+\.\d+/u, '<v>');
const ordem = (m) => Number(m[1]) * 1e6 + Number(m[2]) * 1e3 + Number(m[3]);

const porFamilia = new Map();
for (const objeto of objetos) {
  const key = objeto.Key ?? '';
  if (key.startsWith('runtimes/')) continue;      // invariante 3
  const versao = versaoDe(key);
  if (!versao) continue;                          // invariante 2 (nomes estaveis)
  const grupo = familia(key);
  if (!porFamilia.has(grupo)) porFamilia.set(grupo, []);
  porFamilia.get(grupo).push({ key, size: objeto.Size ?? 0, ordem: ordem(versao) });
}

const apagar = [];
for (const [grupo, itens] of porFamilia) {
  itens.sort((a, b) => b.ordem - a.ordem);
  for (const item of itens.slice(KEEP_VERSIONS)) {
    const nome = item.key.split('/').pop();
    if (referenciados.has(nome)) {                // invariante 1
      console.log(`mantido (em uso pelo canal): ${item.key}`);
      continue;
    }
    apagar.push(item);
  }
  const ficam = itens.slice(0, KEEP_VERSIONS).map((item) => item.key.split('/').pop()).join(', ');
  console.log(`${grupo}: ${itens.length} versões → ficam ${ficam}`);
}

const total = apagar.reduce((soma, item) => soma + item.size, 0);
console.log(`\n${apagar.length} objetos a apagar — ${(total / 1e9).toFixed(2)} GB`);
if (!apply) {
  console.log('Nada foi apagado. Rode com --apply para executar.');
  process.exit(0);
}

for (let i = 0; i < apagar.length; i += 1000) {
  const lote = apagar.slice(i, i + 1000);
  await s3.send(new DeleteObjectsCommand({
    Bucket: bucket,
    Delete: { Objects: lote.map((item) => ({ Key: item.key })), Quiet: true },
  }));
  console.log(`apagados ${Math.min(i + lote.length, apagar.length)}/${apagar.length}`);
}
console.log(`Pronto. ${(total / 1e9).toFixed(2)} GB liberados.`);
