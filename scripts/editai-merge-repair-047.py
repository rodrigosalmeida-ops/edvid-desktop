from pathlib import Path

p = Path('src/App.tsx')
s = p.read_text(encoding='utf-8')

# 1) O merge-union deixou sugerirEFechar dentro de sugerir.
old = ".finally(() => setDraftBusy(null));\n          // GERAR É DECISÃO FINAL"
new = ".finally(() => setDraftBusy(null));\n          };\n          // GERAR É DECISÃO FINAL"
if old not in s:
    raise SystemExit('popover repair anchor not found')
s = s.replace(old, new, 1)
s = s.replace(
    'className="btn ghost small" disabled={ocupado} onClick={sugerir}>\n                    {draftBusy === \'sugerindo\' ? \'Escrevendo…\' : \'Gerar automaticamente\'}',
    'className="btn ghost small" disabled={ocupado} onClick={sugerirEFechar}>\n                    Gerar automaticamente',
    1,
)

# 2) O merge-union também inseriu o controle 0.47 antes de fechar
# stepReviewSpeed. Fecha a função e reaproveita o motor de reviewSpeed já
# validado no EDIT AI em vez de manter dois estados concorrentes.
old = "    setReviewSpeed(REVIEW_SPEEDS[nextIndex]);\n  // O passo é discreto"
new = "    setReviewSpeed(REVIEW_SPEEDS[nextIndex]);\n  }\n\n  // O passo é discreto"
if old not in s:
    raise SystemExit('speed closure repair anchor not found')
s = s.replace(old, new, 1)
s = s.replace('Math.abs(valor - playbackRate) < 1e-6', 'Math.abs(valor - reviewSpeed) < 1e-6', 1)
s = s.replace('setPlaybackRate(VELOCIDADES[alvo]);', 'setReviewSpeed(VELOCIDADES[alvo]);', 1)

# 3) Barra 0.47: um único botão In/Out. O motor e os atalhos antigos ficam,
# mas os dois botões antigos não aparecem junto com a bandeira nova.
s = s.replace(
    '            <button type="button" className={`marker-button ${markIn !== null ? \'active\' : \'\'}`} onClick={setInPoint} disabled={!media} title="Marcar início da correção (I ou M)">IN</button>\n'
    '            <button type="button" className="marker-button" onClick={setOutPoint} disabled={!media || markIn === null || currentTime <= markIn} title="Marcar fim da correção (O ou M)">OUT</button>\n',
    '',
    1,
)

# 4) Barra 0.47: remove o controle −/+ antigo. O botão cíclico usa reviewSpeed.
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

p.write_text(s, encoding='utf-8')
