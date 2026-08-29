import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { aplicarTexto, textoEditavel, type PalavraLegenda } from './caption-edit';

export type CaptionSyncPaths = {
  captions: string;
  cut: string;
  cues: string;
};

export type CaptionSyncResult = {
  palavras: number;
  texto: string;
  paths: CaptionSyncPaths;
};

export function captionSyncPaths(projectDirectory: string, editDir = 'edit'): CaptionSyncPaths {
  const editDirectory = path.join(projectDirectory, editDir);
  const publicDirectory = path.join(editDirectory, 'remotion', 'public');
  return {
    captions: path.join(publicDirectory, 'captions.json'),
    cues: path.join(publicDirectory, 'caption-cues.json'),
    cut: path.join(editDirectory, 'transcricao_corte_raw', 'cut.json'),
  };
}

export async function readCaptionWords(captionsPath: string): Promise<PalavraLegenda[] | null> {
  try {
    const parsed = JSON.parse(await readFile(captionsPath, 'utf8')) as unknown;
    return Array.isArray(parsed) ? parsed as PalavraLegenda[] : null;
  } catch {
    return null;
  }
}

export async function readEditableCaptionText(
  projectDirectory: string,
  editDir = 'edit',
): Promise<{ texto: string; palavras: number } | null> {
  const paths = captionSyncPaths(projectDirectory, editDir);
  const palavras = await readCaptionWords(paths.captions);
  if (!palavras?.length) return null;
  return { texto: textoEditavel(palavras), palavras: palavras.length };
}

function captionCues(palavras: readonly PalavraLegenda[]) {
  return palavras.map((palavra) => ({
    text: String(palavra.text ?? ''),
    startMs: Number(palavra.startMs),
    endMs: Number(palavra.endMs),
    timestampMs: Number(palavra.timestampMs ?? Math.round((Number(palavra.startMs) + Number(palavra.endMs)) / 2)),
  }));
}

export async function writeSynchronizedCaptionText(
  projectDirectory: string,
  texto: string,
  editDir = 'edit',
): Promise<CaptionSyncResult> {
  const paths = captionSyncPaths(projectDirectory, editDir);
  const palavras = await readCaptionWords(paths.captions);
  if (!palavras?.length) throw new Error('Este projeto ainda não tem legenda para corrigir.');

  const novas = aplicarTexto(palavras, texto);
  if (!novas.length) throw new Error('O texto ficou vazio. Para tirar a legenda do vídeo, use a aba Legendas.');

  await mkdir(path.dirname(paths.captions), { recursive: true });
  await mkdir(path.dirname(paths.cut), { recursive: true });

  const serialized = `${JSON.stringify(novas, null, 2)}\n`;
  await writeFile(paths.captions, serialized, 'utf8');

  // cut.json é derivado da mesma lista para o agente nunca enxergar texto/timing diferente do palco.
  await writeFile(paths.cut, `${JSON.stringify({ words: novas }, null, 2)}\n`, 'utf8');

  // Mantemos as cues sincronizadas no mesmo commit lógico. O renderer/Remotion pode regenerar
  // apresentações específicas depois, mas nunca parte de uma transcrição antiga.
  await writeFile(paths.cues, `${JSON.stringify(captionCues(novas), null, 2)}\n`, 'utf8');

  return {
    palavras: novas.length,
    texto: textoEditavel(novas),
    paths,
  };
}
