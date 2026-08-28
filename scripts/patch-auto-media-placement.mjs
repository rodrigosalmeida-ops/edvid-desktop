import { readFileSync, writeFileSync } from 'node:fs';

const mainPath = 'src/main.ts';
let source = readFileSync(mainPath, 'utf8');

function replaceOnce(oldText, newText, label) {
  if (!source.includes(oldText)) throw new Error(`Guard failed: ${label}`);
  source = source.replace(oldText, newText);
}

replaceOnce(
  "import { applyEditOperations, type EditOperation } from './edit-data-edits';",
  "import { applyEditOperations, type EditOperation } from './edit-data-edits';\nimport { colocacaoPara, type MediaRequest, parseMediaRequests } from './media-request';",
  'media request import',
);

const videoStart = source.indexOf('type VideoRequestEntry =');
const videoEnd = source.indexOf('\nfunction fulfillVideoRequests(', videoStart);
if (videoStart < 0 || videoEnd < 0) throw new Error('Guard failed: video request reader bounds');
source = source.slice(0, videoStart)
  + `async function readVideoRequests(projectDirectory: string): Promise<MediaRequest[]> {\n  try {\n    return parseMediaRequests(\n      JSON.parse(await readFile(path.join(projectDirectory, 'edit', 'clipes', 'pedidos.json'), 'utf8')),\n      'video',\n    );\n  } catch {\n    return [];\n  }\n}\n`
  + source.slice(videoEnd);
source = source.replace('const pending: VideoRequestEntry[] = [];', 'const pending: MediaRequest[] = [];');

const imageType = "type ImageRequestEntry = { arquivo: string; prompt: string; uso: ImageUse | null };\n\n";
if (source.includes(imageType)) source = source.replace(imageType, '');
const imageStart = source.indexOf('async function readImageRequests(');
const imageEnd = source.indexOf('\n// Imagens pelo hub de geracao.', imageStart);
if (imageStart < 0 || imageEnd < 0) throw new Error('Guard failed: image request reader bounds');
source = source.slice(0, imageStart)
  + `async function readImageRequests(projectDirectory: string): Promise<MediaRequest[]> {\n  try {\n    return parseMediaRequests(\n      JSON.parse(await readFile(path.join(projectDirectory, 'edit', 'imagens', 'pedidos.json'), 'utf8')),\n      'imagem',\n    );\n  } catch {\n    return [];\n  }\n}\n`
  + source.slice(imageEnd);
source = source.replaceAll('readonly ImageRequestEntry[]', 'readonly MediaRequest[]');
source = source.replace('const pending = [] as ImageRequestEntry[];', 'const pending = [] as MediaRequest[];');

const placementMarker = '// --- A MIDIA DE UM ESPACO DA TELA DIVIDIDA ----------------------------------\n';
if (!source.includes(placementMarker)) throw new Error('Guard failed: placement marker');
const placement = `// O aplicativo coloca sozinho a midia cujo pedido trouxe a janela In/Out.\n// Repetir o fulfill nao duplica: mesma fonte + mesmo inicio e idempotente.\nasync function placeGeneratedMedia(\n  projectDirectory: string,\n  request: MediaRequest,\n  pasta: 'clipes' | 'imagens',\n): Promise<boolean> {\n  const publicDirectory = path.join(projectDirectory, 'edit', 'remotion', 'public');\n  const file = path.join(publicDirectory, 'edit-data.json');\n  let data: Record<string, unknown>;\n  try { data = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>; }\n  catch { return false; }\n  const splits = Array.isArray(data.splits) ? data.splits : [];\n  const placement = colocacaoPara(request, pasta, splits);\n  if (!placement) return false;\n  const destination = path.join(publicDirectory, pasta, request.arquivo);\n  if (!(await statOf(destination))) {\n    await mkdir(path.join(publicDirectory, pasta), { recursive: true });\n    await copyFile(path.join(projectDirectory, 'edit', pasta, request.arquivo), destination);\n  }\n  let updated: Record<string, unknown>;\n  if (placement.tipo === 'faixa') {\n    const result = applyEditOperations(data, [{ op: 'set-split-src', index: placement.index, src: placement.src, kind: placement.kind, fit: 'contain' }]);\n    if (!result.ok) return false;\n    updated = result.data;\n  } else {\n    const inserts = Array.isArray(data.inserts) ? [...data.inserts] as Record<string, unknown>[] : [];\n    if (inserts.some((item) => item.src === placement.src && Math.abs(Number(item.start) - placement.start) < 0.01)) return true;\n    inserts.push({ kind: placement.kind, src: placement.src, start: placement.start, end: placement.end, ...(placement.fullscreen ? { fullscreen: true } : {}) });\n    updated = { ...data, inserts: inserts.sort((a, b) => Number(a.start) - Number(b.start)) };\n  }\n  const temporary = \`${'${file}'}.tmp\`;\n  await writeFile(temporary, \`${'${JSON.stringify(updated, null, 2)}'}\\n\`);\n  await rename(temporary, file);\n  return true;\n}\n\n`;
source = source.replace(placementMarker, placement + placementMarker);

replaceOnce(
`    const pending: MediaRequest[] = [];
    for (const request of requests) {
      try {
        await stat(path.join(clipsDirectory, request.arquivo));
      } catch {
        pending.push(request);
      }
    }
    if (!pending.length) {
      await rm(requestsFile, { force: true });
      return { status: 'idle' };
    }`,
`    const pending: MediaRequest[] = [];
    let placed = 0;
    for (const request of requests) {
      try {
        await stat(path.join(clipsDirectory, request.arquivo));
        if (request.janela && await placeGeneratedMedia(projectDirectory, request, 'clipes').catch(() => false)) placed += 1;
      } catch {
        pending.push(request);
      }
    }
    if (!pending.length) {
      await rm(requestsFile, { force: true });
      if (placed > 0) broadcastCodexEvent({ type: 'workspace-refresh' });
      return placed > 0 ? { status: 'ready', total: placed, done: placed, placed, kind: 'video' } : { status: 'idle' };
    }`,
  'existing video placement',
);
replaceOnce(
`          await ingestClip(temporary, path.join(clipsDirectory, request.arquivo));
          done += 1;`,
`          await ingestClip(temporary, path.join(clipsDirectory, request.arquivo));
          done += 1;
          if (request.janela && await placeGeneratedMedia(projectDirectory, request, 'clipes').catch(() => false)) placed += 1;`,
  'generated video placement',
);

replaceOnce(
`    const pending = [] as MediaRequest[];
    for (const request of requests) {
      try {
        await stat(path.join(imagesDirectory, request.arquivo));
      } catch {
        pending.push(request);
      }
    }
    if (!pending.length) {
      await rm(requestsFile, { force: true });
      return { status: 'idle' };
    }`,
`    const pending = [] as MediaRequest[];
    let placed = 0;
    for (const request of requests) {
      try {
        await stat(path.join(imagesDirectory, request.arquivo));
        if (request.janela && await placeGeneratedMedia(projectDirectory, request, 'imagens').catch(() => false)) placed += 1;
      } catch {
        pending.push(request);
      }
    }
    if (!pending.length) {
      await rm(requestsFile, { force: true });
      if (placed > 0) broadcastCodexEvent({ type: 'workspace-refresh' });
      return placed > 0 ? { status: 'ready', total: placed, done: placed, placed, kind: 'imagem' } : { status: 'idle' };
    }`,
  'existing image placement',
);

// The direct image-provider branch already has one unique success increment.
const imageFulfill = source.indexOf('function fulfillImageRequests(');
const splitAttach = source.indexOf(placementMarker, imageFulfill);
let before = source.slice(0, imageFulfill);
let imageBlock = source.slice(imageFulfill, splitAttach);
let after = source.slice(splitAttach);
const successNeedle = '        done += 1;\n        broadcastImageGenState';
if (!imageBlock.includes(successNeedle)) throw new Error('Guard failed: direct image success');
imageBlock = imageBlock.replace(successNeedle, "        done += 1;\n        if (request.janela && await placeGeneratedMedia(projectDirectory, request, 'imagens').catch(() => false)) placed += 1;\n        broadcastImageGenState");
source = before + imageBlock + after;

writeFileSync(mainPath, source);

const sharedPath = 'src/shared.ts';
let shared = readFileSync(sharedPath, 'utf8');
const stateNeedle = '  note?: string;\n};';
if (!shared.includes(stateNeedle)) throw new Error('Guard failed: ImageGenState');
shared = shared.replace(stateNeedle, "  note?: string;\n  placed?: number;\n  kind?: 'imagem' | 'video';\n};");
writeFileSync(sharedPath, shared);

console.log('patch:auto-media-placement applied');
