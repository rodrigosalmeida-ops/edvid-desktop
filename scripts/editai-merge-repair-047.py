from pathlib import Path

p = Path('src/App.tsx')
s = p.read_text(encoding='utf-8')

# 1) Corrige os dois fechamentos que o merge-union juntou incorretamente.
old = ".finally(() => setDraftBusy(null));\n          // GERAR É DECISÃO FINAL"
new = ".finally(() => setDraftBusy(null));\n          };\n          // GERAR É DECISÃO FINAL"
if old in s:
    s = s.replace(old, new, 1)
s = s.replace(
    'className="btn ghost small" disabled={ocupado} onClick={sugerir}>\n                    {draftBusy === \'sugerindo\' ? \'Escrevendo…\' : \'Gerar automaticamente\'}',
    'className="btn ghost small" disabled={ocupado} onClick={sugerirEFechar}>\n                    Gerar automaticamente',
    1,
)

old = "    setReviewSpeed(REVIEW_SPEEDS[nextIndex]);\n  // O passo é discreto"
new = "    setReviewSpeed(REVIEW_SPEEDS[nextIndex]);\n  }\n\n  // O passo é discreto"
if old in s:
    s = s.replace(old, new, 1)

# 2) Um só motor de velocidade: mantém o reviewSpeed já validado no EDIT AI,
# mas com o botão cíclico do 0.47.
s = s.replace('Math.abs(valor - playbackRate) < 1e-6', 'Math.abs(valor - reviewSpeed) < 1e-6', 1)
s = s.replace('setPlaybackRate(VELOCIDADES[alvo]);', 'setReviewSpeed(VELOCIDADES[alvo]);', 1)
s = s.replace(
    '            <button type="button" className={`marker-button ${markIn !== null ? \'active\' : \'\'}`} onClick={setInPoint} disabled={!media} title="Marcar início da correção (I ou M)">IN</button>\n'
    '            <button type="button" className="marker-button" onClick={setOutPoint} disabled={!media || markIn === null || currentTime <= markIn} title="Marcar fim da correção (O ou M)">OUT</button>\n',
    '',
    1,
)
old_block = '''            <div className="review-speed" aria-label="Velocidade de revisão">
              <button
                type="button"
                onClick={() => stepReviewSpeed(-1)}
                disabled={!media || reviewSpeed === REVIEW_SPEEDS[0]}
                title="Revisar mais devagar (,)"
              >−</button>
              <span>{reviewSpeed}×</span>
              <button
                type="button"
                onClick={() => stepReviewSpeed(1)}
                disabled={!media || reviewSpeed === REVIEW_SPEEDS[REVIEW_SPEEDS.length - 1]}
                title="Revisar mais rápido (.)"
              >+</button>
            </div>
'''
s = s.replace(old_block, '', 1)

# 3) Estado assíncrono das marcações do 0.47: a marcação entra na timeline
# imediatamente e o Aplicar espera o prompt que ainda estiver sendo escrito.
s = s.replace(
    '  arquivo?: string;\n};',
    '  arquivo?: string;\n  escrevendo?: boolean;\n  erro?: string;\n};',
    1,
)
anchor = '  const correctionHistoryRef = useRef<CorrectionRange[][]>([]);\n'
if anchor not in s:
    raise SystemExit('corrections ref anchor not found')
s = s.replace(
    anchor,
    anchor + '  const correctionsRef = useRef<CorrectionRange[]>(corrections);\n  correctionsRef.current = corrections;\n',
    1,
)
# O union trouxe a versão antiga e a nova do início de applyCorrections.
s = s.replace(
    '    const midia = corrections.filter(ehMarcacaoDeMidia);\n'
    '    const correcoes = corrections.filter((item) => !ehMarcacaoDeMidia(item));\n',
    '',
    1,
)

# 4) Resumo local da reconexão. O 0.47 upstream já tinha esse helper em outra
# camada; aqui ele fica perto da interface para não puxar uma cadeia inteira de
# versões intermediárias do catálogo.
app_anchor = 'export function App() {'
helper = '''function resumoDaReconexao(
  modelos: { imagem: number | null; video: number | null },
  conta: { plano: string | null; creditos: number | null } | null,
): string {
  const partes = ['Reconectado'];
  if (modelos.imagem !== null) partes.push(`${modelos.imagem} modelos de imagem`);
  if (modelos.video !== null) partes.push(`${modelos.video} modelos de vídeo`);
  if (conta?.plano) partes.push(`plano ${conta.plano}`);
  if (conta?.creditos !== null && conta?.creditos !== undefined) partes.push(`${conta.creditos} créditos`);
  return partes.join(' · ');
}

'''
if app_anchor not in s:
    raise SystemExit('App helper anchor not found')
s = s.replace(app_anchor, helper + app_anchor, 1)
p.write_text(s, encoding='utf-8')

# 5) Reconexão adaptada ao HubGeneration que já está validado no EDIT AI.
# A leitura de catálogo existente é suficiente para confirmar que a sessão
# voltou; dados de plano/créditos continuam opcionais neste candidato.
p = Path('src/main.ts')
s = p.read_text(encoding='utf-8')
s = s.replace('.catalogoConferido(kind)', '.catalog(kind)', 1)
s = s.replace('      const conta = await generator.conta().catch(() => null);', '      const conta = null;', 1)
s = s.replace('    generator.esquecerCatalogo();\n', '', 1)
p.write_text(s, encoding='utf-8')

# 6) A API já foi adicionada a shared.ts pelo 0.47; expõe os dois IPCs no
# preload para o renderer realmente conseguir chamá-los.
p = Path('src/preload.ts')
s = p.read_text(encoding='utf-8')
anchor = "  loginHub: (hub) => ipcRenderer.invoke('hub:login', { hub }),\n"
if anchor not in s:
    raise SystemExit('preload hub anchor not found')
s = s.replace(
    anchor,
    anchor
    + "  reconnectHub: (hub) => ipcRenderer.invoke('hub:reconnect', { hub }),\n"
    + "  checkHubs: () => ipcRenderer.invoke('hub:check'),\n",
    1,
)
p.write_text(s, encoding='utf-8')
