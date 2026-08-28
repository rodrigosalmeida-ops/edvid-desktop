import { app, dialog, ipcMain } from 'electron';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ProjectSummary } from './shared';
import { cleanProjectName, safeDirectoryPart } from './project-import-name';

const PROJECT_VIDEO_EXTENSIONS = new Set(['.mp4', '.m4v', '.mov', '.webm', '.mkv']);

type PickedProject = { directory: string; name: string };

type RecentProjectsDocument = { version?: number; projects?: unknown };

function projectsFile(): string {
  return path.join(app.getPath('userData'), 'projects.json');
}

async function recentProjects(): Promise<ProjectSummary[]> {
  try {
    const parsed = JSON.parse(await readFile(projectsFile(), 'utf8')) as RecentProjectsDocument;
    if (!Array.isArray(parsed.projects)) return [];
    return parsed.projects.filter((project): project is ProjectSummary => {
      if (!project || typeof project !== 'object') return false;
      const item = project as Partial<ProjectSummary>;
      return typeof item.directory === 'string'
        && typeof item.name === 'string'
        && typeof item.lastOpenedAt === 'string';
    });
  } catch {
    return [];
  }
}

async function registerRecentProject(directory: string, requestedName?: string): Promise<PickedProject> {
  const resolved = path.resolve(directory);
  const current = await recentProjects();
  const existing = current.find((item) => path.resolve(item.directory) === resolved);
  const name = cleanProjectName(requestedName ?? '') || existing?.name || path.basename(resolved);
  const project: ProjectSummary = {
    directory: resolved,
    name,
    lastOpenedAt: new Date().toISOString(),
    ...(existing?.pinned ? { pinned: true } : null),
  };
  const projects = [
    project,
    ...current.filter((item) => path.resolve(item.directory) !== resolved),
  ].slice(0, 16);
  await mkdir(path.dirname(projectsFile()), { recursive: true });
  await writeFile(projectsFile(), `${JSON.stringify({ version: 1, projects }, null, 2)}\n`);
  return { directory: resolved, name };
}

async function managedProjectForVideo(sourceFile: string, requestedName?: string): Promise<PickedProject> {
  const extension = path.extname(sourceFile).toLowerCase();
  if (!PROJECT_VIDEO_EXTENSIONS.has(extension)) {
    throw new Error('Formato de vídeo não suportado pelo EDIT AI.');
  }

  const sourceBase = path.basename(sourceFile);
  const sourceStem = path.basename(sourceFile, extension);
  const name = cleanProjectName(requestedName ?? '') || cleanProjectName(sourceStem) || 'Vídeo';
  const importRoot = path.join(app.getPath('userData'), 'imported-projects');
  const unique = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const directory = path.join(importRoot, `${safeDirectoryPart(name)}-${unique}`);

  await mkdir(directory, { recursive: true });
  try {
    await copyFile(sourceFile, path.join(directory, sourceBase));
  } catch (error) {
    throw new Error(`Não consegui copiar o vídeo para o projeto: ${error instanceof Error ? error.message : String(error)}`);
  }

  return registerRecentProject(directory, name);
}

async function pickFolder(requestedName?: string): Promise<PickedProject | null> {
  const result = await dialog.showOpenDialog({
    title: 'Escolha a pasta do projeto de vídeo',
    buttonLabel: 'Usar esta pasta',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return registerRecentProject(result.filePaths[0], requestedName);
}

async function pickVideo(requestedName?: string): Promise<PickedProject | null> {
  const result = await dialog.showOpenDialog({
    title: 'Abrir vídeo no EDIT AI',
    buttonLabel: 'Abrir vídeo',
    properties: ['openFile'],
    filters: [
      { name: 'Vídeos', extensions: ['mp4', 'm4v', 'mov', 'webm', 'mkv'] },
    ],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return managedProjectForVideo(result.filePaths[0], requestedName);
}

// O renderer continua usando a mesma ação de "abrir projeto". Este handler
// acrescenta a escolha de ARQUIVO sem remover o fluxo antigo por pasta. Ao
// escolher um vídeo solto, o original fica intocado e uma cópia entra em um
// projeto gerenciado; daí em diante WhisperX, Corte Limpo, proxy, timeline e
// render enxergam exatamente a mesma estrutura que já conhecem.
ipcMain.handle('project:pick-source', async (_event, input?: { name?: string }) => {
  const choice = await dialog.showMessageBox({
    type: 'question',
    title: 'Abrir no EDIT AI',
    message: 'Como você quer adicionar o vídeo?',
    detail: 'Você pode escolher um vídeo diretamente ou continuar abrindo uma pasta de projeto.',
    buttons: ['Abrir vídeo', 'Abrir pasta', 'Cancelar'],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  });

  if (choice.response === 2) return null;
  if (choice.response === 0) return pickVideo(input?.name);
  return pickFolder(input?.name);
});