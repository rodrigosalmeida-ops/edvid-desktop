// EXPERIMENTO — a composição do Edvid tocando ao vivo, sem render.
//
// A pergunta é uma só e é de DESEMPENHO: o @remotion/player aguenta o material
// real do aluno em tempo real? Se aguentar, a prévia deixa de ser um render de
// minutos e vira uma coisa que responde na hora — e as camadas podem virar
// arrastáveis, porque passam a ser DOM em vez de pixel dentro de um MP4.
//
// A composição importada aqui é a MESMA que o render usa. Nada foi duplicado:
// os imports de dados dela são apontados por alias para o projeto real (ver
// vite.config.ts). Se este experimento medir bem, o passo seguinte é trocar
// esses aliases por props — e é só isso.
import { Player, type PlayerRef } from '@remotion/player';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Main } from '../../resources/remotion-template/src/Main';
import editData from '../../resources/remotion-template/public/edit-data.json';

const D = editData as unknown as { width: number; height: number; fps: number; durationSec: number };
const TOTAL = Math.max(1, Math.round(D.durationSec * D.fps));

// Altura do palco na tela. O Player desenha na resolução da composição e a
// escala é CSS, então isto não muda o custo de desenho — só o tamanho aparente.
const ALTURA = 620;

type Medida = {
  fpsReal: number;
  fpsMin: number;
  quedas: number;
  amostras: number;
  segundos: number;
};

function Bancada() {
  const player = useRef<PlayerRef>(null);
  const [medida, setMedida] = useState<Medida | null>(null);
  const [medindo, setMedindo] = useState(false);
  const [pronto, setPronto] = useState(false);
  // A composição pode ESTOURAR e o Player continua avançando o quadro
  // normalmente, desenhando um ⚠️. Na primeira medição isto rendeu um alegre
  // "29,2 quadros por segundo" sobre uma tela de erro — o medidor mediu o
  // relógio, não o vídeo. Medida sem esta checagem é pior que nenhuma: ela
  // convence.
  const [erro, setErro] = useState<string | null>(null);

  // O relógio da verdade é o QUADRO DA COMPOSIÇÃO contra o relógio de parede.
  // Contar requestAnimationFrame mediria a tela, não o vídeo: um player que
  // repinta a 60Hz e avança 8 quadros por segundo passaria como perfeito.
  const medir = useCallback(async () => {
    const atual = player.current;
    if (!atual || medindo) return;
    if (erro) return;
    setMedindo(true);
    setMedida(null);

    atual.seekTo(0);
    await new Promise((r) => setTimeout(r, 400));

    const marcas: Array<{ t: number; f: number }> = [];
    const ouvir = (event: { detail: { frame: number } }) => {
      marcas.push({ t: performance.now(), f: event.detail.frame });
    };
    atual.addEventListener('frameupdate', ouvir as never);
    atual.play();

    const DURACAO_MS = 12_000;
    await new Promise((r) => setTimeout(r, DURACAO_MS));
    atual.pause();
    atual.removeEventListener('frameupdate', ouvir as never);

    // Segunda trava: além do evento de erro, conferimos que o Player desenhou
    // MESMO — um <video> ou um <img> vivo dentro dele. Composição que virou
    // caixa de erro não tem nenhum dos dois.
    const palco = document.querySelector('.__remotion-player');
    const desenhou = Boolean(palco?.querySelector('video') || palco?.querySelector('img'));
    if (!desenhou) {
      setErro('a composição não desenhou nada — medida descartada');
      setMedindo(false);
      return;
    }

    if (marcas.length < 2) {
      setMedida({ fpsReal: 0, fpsMin: 0, quedas: 0, amostras: marcas.length, segundos: 0 });
      setMedindo(false);
      return;
    }

    const primeira = marcas[0];
    const ultima = marcas[marcas.length - 1];
    const segundos = (ultima.t - primeira.t) / 1000;
    const fpsReal = (ultima.f - primeira.f) / segundos;

    // O pior segundo importa mais que a média: um travo de 2s no meio de uma
    // reprodução boa some na média e é exatamente o que incomoda quem edita.
    let fpsMin = Infinity;
    let quedas = 0;
    for (let i = 1; i < marcas.length; i += 1) {
      const dt = (marcas[i].t - marcas[i - 1].t) / 1000;
      const df = marcas[i].f - marcas[i - 1].f;
      if (dt <= 0) continue;
      const instantaneo = df / dt;
      fpsMin = Math.min(fpsMin, instantaneo);
      // Intervalo que passou de 2 quadros de atraso conta como engasgo.
      if (dt > (2 / D.fps)) quedas += 1;
    }

    setMedida({
      fpsReal,
      fpsMin: Number.isFinite(fpsMin) ? fpsMin : 0,
      quedas,
      amostras: marcas.length,
      segundos,
    });
    setMedindo(false);
  }, [medindo]);

  useEffect(() => {
    const atual = player.current;
    if (!atual) return;
    // Exposto de propósito: é um experimento, e medir de fora (console, script)
    // vale mais aqui do que esconder o objeto.
    (window as unknown as { player: PlayerRef }).player = atual;
    atual.addEventListener('error', (e: { detail: { error: Error } }) => {
      setErro(e.detail?.error?.message ?? 'a composição estourou');
    });
    const ok = () => setPronto(true);
    atual.addEventListener('waiting', () => setPronto(false));
    atual.addEventListener('resume', ok);
    const timer = setTimeout(ok, 1500);
    return () => clearTimeout(timer);
  }, []);

  const veredito = useMemo(() => {
    if (erro) return { classe: 'ruim', texto: `A composição não rodou: ${erro}. Nenhum número aqui vale.` };
    if (!medida) return null;
    const alvo = D.fps;
    const razao = medida.fpsReal / alvo;
    if (razao >= 0.92 && medida.quedas <= 2) {
      return { classe: 'bom', texto: `Toca em tempo real. A prévia ao vivo aguenta este material sem proxy.` };
    }
    if (razao >= 0.6) {
      return { classe: 'medio', texto: `Toca, mas engasga. Dá para editar assim; para ficar liso precisa de proxy em baixa resolução — é o que Premiere e CapCut fazem.` };
    }
    return { classe: 'ruim', texto: `Não toca em tempo real. Sem proxy, a prévia ao vivo não substitui o render neste material.` };
  }, [erro, medida]);

  const cor = (valor: number, alvo: number) => (valor >= alvo * 0.92 ? 'bom' : valor >= alvo * 0.6 ? 'medio' : 'ruim');

  return (
    <>
      <div style={{ width: (ALTURA * D.width) / D.height, height: ALTURA, background: '#000', borderRadius: 12, overflow: 'hidden' }}>
        <Player
          ref={player}
          component={Main as never}
          durationInFrames={TOTAL}
          fps={D.fps}
          compositionWidth={D.width}
          compositionHeight={D.height}
          style={{ width: '100%', height: '100%' }}
          controls
          acknowledgeRemotionLicense
        />
      </div>
      <div>
        <h1>Prévia ao vivo — experimento</h1>
        <p className="sub">
          A mesma composição que o render usa, tocando no navegador sem gerar
          arquivo nenhum. O medidor compara o quadro da composição com o relógio
          de parede: é o único jeito de saber se tocou de verdade.
        </p>
        <table>
          <tbody>
            <tr><td className="rotulo">Composição</td><td>{D.width}×{D.height} · {D.fps} fps</td></tr>
            <tr><td className="rotulo">Duração</td><td>{D.durationSec.toFixed(1)}s · {TOTAL} quadros</td></tr>
            <tr><td className="rotulo">Estado</td><td className={erro ? 'ruim' : undefined}>{erro ? 'erro' : pronto ? 'carregado' : 'carregando…'}</td></tr>
            {medida && !erro && (
              <>
                <tr><td className="rotulo">Quadros por segundo</td><td className={cor(medida.fpsReal, D.fps)}>{medida.fpsReal.toFixed(1)}</td></tr>
                <tr><td className="rotulo">Pior instante</td><td className={cor(medida.fpsMin, D.fps)}>{medida.fpsMin.toFixed(1)}</td></tr>
                <tr><td className="rotulo">Engasgos</td><td className={medida.quedas <= 2 ? 'bom' : 'ruim'}>{medida.quedas}</td></tr>
                <tr><td className="rotulo">Amostras</td><td>{medida.amostras} em {medida.segundos.toFixed(1)}s</td></tr>
              </>
            )}
          </tbody>
        </table>
        <button type="button" onClick={() => void medir()} disabled={medindo || Boolean(erro)}>
          {medindo ? 'Medindo… (12s)' : 'Medir reprodução'}
        </button>
        {veredito && <div id="veredito" className={veredito.classe}>{veredito.texto}</div>}
      </div>
    </>
  );
}

createRoot(document.getElementById('raiz')!).render(<Bancada />);
