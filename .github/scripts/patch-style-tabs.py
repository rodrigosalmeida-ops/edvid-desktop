from pathlib import Path
import json

app = Path('src/App.tsx')
text = app.read_text(encoding='utf-8')

state = "  const accentUsed = style.headline === 'realce' || style.headline === 'misto' || style.captions === 'stacked';"
if text.count(state) != 1:
    raise SystemExit('Guard failed: StyleWorkspace state anchor')
text = text.replace(state, "  const [activeLayer, setActiveLayer] = useState<StyleLayer>('efeitos');\n" + state, 1)

heading = '            <h2>Escolha estilos e elementos de edição</h2>\n          </div>\n        </div>'
tabs = heading + '''

        <div className="style-layer-tabs" role="tablist" aria-label="Camadas de estilo">
          {(['efeitos', 'edicao', 'legendas', 'texto'] as StyleLayer[]).map((layer) => (
            <button type="button" role="tab" aria-selected={activeLayer === layer} className={activeLayer === layer ? 'active' : ''} key={layer} onClick={() => setActiveLayer(layer)}>
              <Icon name={layer === 'efeitos' ? 'sparkles' : layer === 'edicao' ? 'layers' : layer === 'legendas' ? 'captions' : 'text'} />
              <span>{STYLE_LAYER_LABEL[layer]}</span>
            </button>
          ))}
        </div>'''
if text.count(heading) != 1:
    raise SystemExit('Guard failed: style heading anchor')
text = text.replace(heading, tabs, 1)

swaps = [
    ('<section className="style-group">\n          <div className="style-group-head"><div><h3>Tipo de edição</h3></div></div>', '<section className={`style-group${activeLayer === \'edicao\' ? \'\' : \' style-layer-hidden\'}`}>\n          <div className="style-group-head"><div><h3>Tipo de edição</h3></div></div>'),
    ('<section className="style-group accent-group">', '<section className={`style-group accent-group${activeLayer === \'legendas\' || activeLayer === \'texto\' ? \'\' : \' style-layer-hidden\'}`}>'),
    ('<section className="style-group">\n          <div className="style-group-head"><div><h3>Estilo de headline</h3></div></div>', '<section className={`style-group${activeLayer === \'texto\' ? \'\' : \' style-layer-hidden\'}`}>\n          <div className="style-group-head"><div><h3>Estilo de headline</h3></div></div>'),
    ('<section className="style-group">\n          <div className="style-group-head"><div><h3>Estilo de legenda</h3></div></div>', '<section className={`style-group${activeLayer === \'legendas\' ? \'\' : \' style-layer-hidden\'}`}>\n          <div className="style-group-head"><div><h3>Estilo de legenda</h3></div></div>'),
    ('<section className="style-group">\n          <div className="style-group-head"><div><h3>Elementos da edição</h3><p>Desmarcado significa que o elemento ficará fora.</p></div></div>', '<section className={`style-group${activeLayer === \'efeitos\' ? \'\' : \' style-layer-hidden\'}`}>\n          <div className="style-group-head"><div><h3>Elementos da edição</h3><p>Desmarcado significa que o elemento ficará fora.</p></div></div>'),
]
for old, new in swaps:
    if text.count(old) != 1:
        raise SystemExit('Guard failed: style section ' + old[:45])
    text = text.replace(old, new, 1)

footer_start = '        <div className="apply-style-layers" aria-label="Aplicar camada de estilo">'
footer_close = '        </div>\n'
footer_tail = '      </div>\n    </div>\n  );\n}\n\nfunction MemberGate'
start = text.find(footer_start)
close = text.find(footer_close, start)
tail = text.find(footer_tail, close + len(footer_close))
if start < 0 or close < 0 or tail < 0:
    raise SystemExit('Guard failed: style footer bounds')
contextual = '''        <div className="apply-style-layers contextual" aria-label={`Aplicar ${STYLE_LAYER_LABEL[activeLayer]}`}>
          <button type="button" className="btn primary apply-style" onClick={() => onApply(activeLayer)} disabled={!canApply || applying || runtime.status === 'installing'} title={`Aplicar somente ${STYLE_LAYER_LABEL[activeLayer]}`}>
            <Icon name="check" /> {runtime.status === 'installing' ? 'Preparando...' : applying ? 'Aplicando...' : 'Aplicar'}
          </button>
        </div>
'''
text = text[:start] + contextual + text[tail:]
app.write_text(text, encoding='utf-8')

css = Path('src/styles.css')
css_text = css.read_text(encoding='utf-8')
marker = '/* EDIT AI style-layer tabs parity */'
if marker not in css_text:
    css_text += '''

/* EDIT AI style-layer tabs parity */
.style-layer-tabs { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:6px; padding:0 2px 12px; position:sticky; top:0; z-index:8; background:var(--panel,#111214); }
.style-layer-tabs button { min-height:42px; border:1px solid rgba(255,255,255,.10); border-radius:10px; background:rgba(255,255,255,.035); color:inherit; display:inline-flex; align-items:center; justify-content:center; gap:7px; cursor:pointer; }
.style-layer-tabs button.active { border-color:var(--style-accent); background:color-mix(in srgb,var(--style-accent) 14%,transparent); }
.style-layer-tabs svg { width:16px; height:16px; }
.style-layer-hidden { display:none !important; }
.apply-style-layers.contextual { justify-content:flex-end; }
.apply-style-layers.contextual .apply-style { width:auto; min-width:118px; }
'''
css.write_text(css_text, encoding='utf-8')

Path('scripts/test-style-tabs.mjs').write_text("""import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
assert.match(app, /useState<StyleLayer>\\('efeitos'\\)/u);
assert.match(app, /style-layer-tabs[\\s\\S]{0,1000}?STYLE_LAYER_LABEL\\[layer\\]/u);
assert.match(app, /onApply\\(activeLayer\\)/u);
assert.match(css, /\\.style-layer-hidden\\s*\\{\\s*display:\\s*none/u);
console.log('style tabs parity: ok');
""", encoding='utf-8')

package = Path('package.json')
data = json.loads(package.read_text(encoding='utf-8'))
scripts = data['scripts']
scripts['test:style-tabs'] = 'node scripts/test-style-tabs.mjs'
verify = scripts.get('verify:editai', '')
if 'npm run test:style-tabs' not in verify:
    scripts['verify:editai'] = verify + ' && npm run test:style-tabs'
package.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
