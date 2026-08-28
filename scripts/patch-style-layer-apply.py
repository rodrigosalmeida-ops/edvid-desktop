from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'Guard failed: {label}')
    return text.replace(old, new, 1)


p = Path('src/shared.ts')
s = p.read_text(encoding='utf-8')
if not s.startswith('import type { StyleLayer }'):
    s = "import type { StyleLayer } from './style-layers';\n\n" + s
s = replace_once(
    s,
    "  buildPhase2: (\n    directory: string,\n    style: ProjectStyleState,\n  ) => Promise<{ splits: number; flashes: number }>;",
    "  buildPhase2: (\n    directory: string,\n    style: ProjectStyleState,\n    layers?: readonly StyleLayer[],\n  ) => Promise<{ splits: number; flashes: number }>;",
    'shared buildPhase2 signature',
)
p.write_text(s, encoding='utf-8')

p = Path('src/preload.ts')
s = p.read_text(encoding='utf-8')
s = replace_once(
    s,
    "  buildPhase2: (directory, style) => ipcRenderer.invoke('phase2:build', { directory, style }),",
    "  buildPhase2: (directory, style, layers) => ipcRenderer.invoke('phase2:build', { directory, style, layers }),",
    'preload buildPhase2',
)
p.write_text(s, encoding='utf-8')

p = Path('src/main.ts')
s = p.read_text(encoding='utf-8')
s = replace_once(
    s,
    "async function buildPhase2(\n  projectDirectory: string,\n  style: ProjectStyleState,\n): Promise<{ splits: number; flashes: number }> {",
    "async function buildPhase2(\n  projectDirectory: string,\n  style: ProjectStyleState,\n  layers: readonly StyleLayer[] = STYLE_LAYERS,\n): Promise<{ splits: number; flashes: number }> {",
    'main buildPhase2 signature',
)
s = replace_once(
    s,
    "  return writeEditData(publicDirectory, style, {\n    width, height, fps, durationSec, opening: openingLine(captions), segments,\n  });",
    "  return writeEditData(publicDirectory, style, {\n    width, height, fps, durationSec, opening: openingLine(captions), segments,\n  }, layers);",
    'main writeEditData delegation',
)
old = """  ipcMain.handle('phase2:build', async (_event, input: { directory?: string; style?: ProjectStyleState }) => {
    const requestedDirectory = path.resolve(asText(input.directory));
    if (!selectedProjectDirectories.has(requestedDirectory)) {
      throw new Error('Abra o projeto antes de aplicar os estilos.');
    }
    if (!input.style) throw new Error('Escolha os estilos antes de aplicar.');
    return buildPhase2(requestedDirectory, input.style);
  });"""
new = """  ipcMain.handle('phase2:build', async (_event, input: { directory?: string; style?: ProjectStyleState; layers?: unknown }) => {
    const requestedDirectory = path.resolve(asText(input.directory));
    if (!selectedProjectDirectories.has(requestedDirectory)) {
      throw new Error('Abra o projeto antes de aplicar os estilos.');
    }
    if (!input.style) throw new Error('Escolha os estilos antes de aplicar.');
    const requestedLayers = Array.isArray(input.layers)
      ? input.layers.filter((layer): layer is StyleLayer => typeof layer === 'string' && (STYLE_LAYERS as readonly string[]).includes(layer))
      : STYLE_LAYERS;
    if (requestedLayers.length === 0) throw new Error('Escolha uma camada de estilo válida para aplicar.');
    return buildPhase2(requestedDirectory, input.style, requestedLayers);
  });"""
s = replace_once(s, old, new, 'phase2 IPC handler')
p.write_text(s, encoding='utf-8')

p = Path('src/App.tsx')
s = p.read_text(encoding='utf-8')
s = replace_once(
    s,
    "import { SPLIT_DIVIDER } from './image-format';",
    "import { SPLIT_DIVIDER } from './image-format';\nimport { STYLE_LAYER_LABEL, type StyleLayer } from './style-layers';",
    'App style layer import',
)
s = replace_once(s, "  onApply: () => void;", "  onApply: (layer: StyleLayer) => void;", 'StyleWorkspace onApply type')
old_button = """        <button type=\"button\" className=\"btn primary apply-style\" onClick={onApply} disabled={!canApply || applying || runtime.status === 'installing'}>
          <Icon name=\"sparkles\" /> {runtime.status === 'installing' ? 'Preparando...' : applying ? 'Enviando...' : 'Salvar e aplicar'}
        </button>"""
new_button = """        <div className=\"apply-style-layers\" aria-label=\"Aplicar camada de estilo\">
          {(['edicao', 'efeitos', 'legendas', 'texto'] as StyleLayer[]).map((layer) => (
            <button
              type=\"button\"
              className=\"btn primary apply-style\"
              key={layer}
              onClick={() => onApply(layer)}
              disabled={!canApply || applying || runtime.status === 'installing'}
              title={`Aplicar somente ${STYLE_LAYER_LABEL[layer]}`}
            >
              <Icon name=\"sparkles\" /> {runtime.status === 'installing' ? 'Preparando...' : applying ? 'Enviando...' : `Aplicar ${STYLE_LAYER_LABEL[layer]}`}
            </button>
          ))}
        </div>"""
s = replace_once(s, old_button, new_button, 'StyleWorkspace footer')
s = replace_once(s, "  async function applyStyleSelection() {", "  async function applyStyleSelection(layer: StyleLayer) {", 'applyStyleSelection signature')
s = replace_once(
    s,
    "      plano = await window.edvidDesktop.buildPhase2(projectDirectory, escolhas);",
    "      plano = await window.edvidDesktop.buildPhase2(projectDirectory, escolhas, [layer]);",
    'renderer buildPhase2 layer',
)
s = replace_once(s, "    if (escolhas.elements.musicAI) {", "    if (layer === 'efeitos' && escolhas.elements.musicAI) {", 'music layer guard')
s = replace_once(
    s,
    "    const precisaDoAgente = escolhas.edit !== 'limpa' || escolhas.note.trim().length > 0;",
    "    const precisaDoAgente = (layer === 'edicao' && escolhas.edit !== 'limpa')\n      || (layer === 'efeitos' && escolhas.note.trim().length > 0);",
    'agent layer guard',
)
s = replace_once(
    s,
    "      const partes = ['Estilos aplicados na edição.'];",
    "      const partes = [`${STYLE_LAYER_LABEL[layer][0].toUpperCase()}${STYLE_LAYER_LABEL[layer].slice(1)} aplicado na edição.`];",
    'layer confirmation',
)
s = replace_once(s, "      if (plano.splits > 0) {", "      if (layer === 'edicao' && plano.splits > 0) {", 'split confirmation guard')
p.write_text(s, encoding='utf-8')

p = Path('scripts/test-style-layer-integration.mjs')
s = p.read_text(encoding='utf-8')
addition = """
const shared = readFileSync(path.join(root, 'src', 'shared.ts'), 'utf8').replace(/\\r\\n?/gu, '\\n');
const preload = readFileSync(path.join(root, 'src', 'preload.ts'), 'utf8').replace(/\\r\\n?/gu, '\\n');
const app = readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8').replace(/\\r\\n?/gu, '\\n');
assert.match(shared, /buildPhase2:[\\s\\S]{0,220}?layers\\?: readonly StyleLayer\\[\\]/u, 'API renderer precisa aceitar camadas');
assert.match(preload, /buildPhase2: \\(directory, style, layers\\)[\\s\\S]{0,120}?\\{ directory, style, layers \\}/u, 'preload precisa propagar camadas');
assert.match(source, /async function buildPhase2\\([\\s\\S]{0,220}?layers: readonly StyleLayer\\[\\] = STYLE_LAYERS/u, 'buildPhase2 preserva fallback de todas as camadas');
assert.match(source, /writeEditData\\(publicDirectory, style,[\\s\\S]{0,220}?\\}, layers\\)/u, 'buildPhase2 precisa entregar camadas ao writeEditData');
assert.match(source, /requestedLayers[\\s\\S]{0,500}?STYLE_LAYERS[\\s\\S]{0,500}?buildPhase2\\(requestedDirectory, input\\.style, requestedLayers\\)/u, 'IPC precisa validar e encaminhar camadas');
assert.match(app, /async function applyStyleSelection\\(layer: StyleLayer\\)[\\s\\S]{0,2200}?buildPhase2\\(projectDirectory, escolhas, \\[layer\\]\\)/u, 'renderer aplica somente a camada escolhida');
assert.match(app, /layer === 'efeitos' && escolhas\\.elements\\.musicAI/u, 'trilha so pode ser disparada pela camada de efeitos');
assert.match(app, /layer === 'edicao' && escolhas\\.edit !== 'limpa'/u, 'texto e legenda nao podem acordar agente por causa do tipo de edicao');
assert.match(app, /onApply: \\(layer: StyleLayer\\) => void/u, 'workspace precisa expor aplicacao por camada');
"""
anchor = "console.log('test:style-layer-integration ok');"
if anchor not in s:
    raise SystemExit('Guard failed: integration test anchor')
s = s.replace(anchor, addition + "\n" + anchor, 1)
p.write_text(s, encoding='utf-8')
