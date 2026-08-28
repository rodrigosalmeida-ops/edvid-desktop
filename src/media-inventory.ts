import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const VIDEO_EXTENSIONS = new Set(['.mp4', '.m4v', '.mov', '.webm', '.mkv', '.avi']);
const IMAGE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.avif', '.tif', '.tiff', '.heic', '.heif',
]);
const INPUT_DIRECTORIES = new Set(['assets', 'clipes', 'imagens', 'musica', 'música', 'derivados', 'graficos']);
const IGNORED_DIRECTORIES = new Set(['.git', '.runtime-cache', '.venv', 'node_modules', 'out', 'renders']);
const MAX_ITEMS = 800;
const MAX_DEPTH = 6;

export type InventoryMediaKind = 'video' | 'image';

export type InventoryMediaItem = {
  arquivo: string;
  tipo: InventoryMediaKind;
  tamanho: number;
  modificadoEm: number;
  fingerprint: string;
};

export type ProjectMediaInventory = {
  version: 1;
  generatedAt: string;
  items: InventoryMediaItem[];
};

export function inventoryMediaKind(name: string): InventoryMediaKind | null {
  const extension = path.extname(name).toLowerCase();
  if (VIDEO_EXTENSIONS.has(extension)) return 'video';
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  return null;
}

function normalizedParts(relativePath: string): string[] {
  return relativePath.replaceAll('\\', '/').split('/').filter(Boolean).map((part) => part.toLocaleLowerCase('pt-BR'));
}

export function isInventoryInputPath(relativePath: string): boolean {
  const parts = normalizedParts(relativePath);
  const directories = parts.slice(0, -1);
  return directories.some((directory) => INPUT_DIRECTORIES.has(directory));
}

async function collectInventory(
  root: string,
  current: string,
  depth: number,
  items: InventoryMediaItem[],
): Promise<void> {
  if (depth > MAX_DEPTH || items.length >= MAX_ITEMS) return;
  let entries;
  try {
    entries = await readdir(current, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (items.length >= MAX_ITEMS || entry.isSymbolicLink()) break;
    if (entry.name.startsWith('.')) continue;
    const absolutePath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name.toLocaleLowerCase('pt-BR'))) {
        await collectInventory(root, absolutePath, depth + 1, items);
      }
      continue;
    }
    if (!entry.isFile()) continue;
    const tipo = inventoryMediaKind(entry.name);
    if (!tipo) continue;
    const relativePath = path.relative(root, absolutePath);
    if (!isInventoryInputPath(relativePath)) continue;
    const fileStat = await stat(absolutePath);
    items.push({
      arquivo: relativePath.replaceAll('\\', '/'),
      tipo,
      tamanho: fileStat.size,
      modificadoEm: fileStat.mtimeMs,
      fingerprint: `${fileStat.size}:${Math.round(fileStat.mtimeMs)}`,
    });
  }
}

export async function buildProjectMediaInventory(projectDirectory: string): Promise<ProjectMediaInventory> {
  const items: InventoryMediaItem[] = [];
  await collectInventory(projectDirectory, projectDirectory, 0, items);
  items.sort((a, b) => a.arquivo.localeCompare(b.arquivo, 'pt-BR', { numeric: true, sensitivity: 'base' }));
  return { version: 1, generatedAt: new Date().toISOString(), items };
}

export async function writeProjectMediaInventory(projectDirectory: string): Promise<ProjectMediaInventory> {
  const inventory = await buildProjectMediaInventory(projectDirectory);
  const editDirectory = path.join(projectDirectory, 'edit');
  await mkdir(editDirectory, { recursive: true });
  await writeFile(path.join(editDirectory, 'insumos.json'), `${JSON.stringify(inventory, null, 2)}\n`, 'utf8');
  return inventory;
}
