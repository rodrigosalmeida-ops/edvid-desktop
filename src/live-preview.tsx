// PREVIA AO VIVO — a composicao do render tocando no Player, sem gerar
// arquivo. Medido na bancada com material real: 29,7 de 30 quadros/s num
// projeto de 95s com karaoke e trilha; scrub em 69ms. E por isso que isto
// existe: o aluno ve a edicao AGORA, e o render vira so a exportacao final.
//
// Leitura obrigatoria antes de mexer:
// - A composicao importada e a MESMA do render (resources/remotion-template).
//   Os dados entram pelo ProjectDataProvider; o render usa o padrao estatico.
// - A importacao e DINAMICA e so acontece depois de window.remotion_staticBase
//   estar definido: o fonts.ts carrega as fontes NO IMPORT, e importar antes
//   da base faria o CSS das fontes buscar /fonts/fonts.css na origem da
//   pagina — 404 silencioso e tipografia de reserva, sem nenhum erro visivel.
import { Player, type PlayerRef } from '@remotion/player';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { LivePreviewData } from './shared';

export type { PlayerRef } from '@remotion/player';

type CompositionModule = {
  Main: React.FC;
  ProjectDataProvider: React.ComponentType<{ value: unknown; children: React.ReactNode }>;
};

let compositionPromise: Promise<CompositionModule> | null = null;

function loadComposition(): Promise<CompositionModule> {
  if (!compositionPromise) {
    compositionPromise = Promise.all([
      import('../resources/remotion-template/src/Main'),
      import('../resources/remotion-template/src/data'),
    ]).then(([main, data]) => ({
      Main: main.Main,
      ProjectDataProvider: data.ProjectDataProvider as CompositionModule['ProjectDataProvider'],
    }));
  }
  return compositionPromise;
}

// PALCO PRETO NAO PODE SER SILENCIOSO. Num relato do Windows o Player montou
// e ficou preto — sem erro, sem placeholder, sem pista. Um <video> que falha
// em carregar nao derruba a composicao: ele so nao desenha. Este ouvinte de
// captura escuta o erro de QUALQUER midia dentro do palco e o transforma numa
// mensagem com o endereco que falhou — e o mesmo movimento do diagnostico da
// geracao: a proxima foto do problema diz a causa.
function useMediaErrorWatch(onError: (message: string) => void): React.RefObject<HTMLDivElement | null> {
  const holder = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const alvo = holder.current;
    if (!alvo) return;
    const ouvir = (event: Event) => {
      const el = event.target as HTMLElement | null;
      if (!el || (el.tagName !== 'VIDEO' && el.tagName !== 'IMG' && el.tagName !== 'AUDIO')) return;
      const src = el.getAttribute('src') ?? '';
      // O ultimo pedaco identifica o arquivo sem vazar token inteiro.
      const nome = src.split('/').slice(-1)[0]?.split('#')[0] || src.slice(0, 80);
      onError(`não consegui carregar a mídia "${nome}" — o palco ficaria preto sem este aviso.`);
    };
    alvo.addEventListener('error', ouvir, true);
    return () => alvo.removeEventListener('error', ouvir, true);
  }, [onError]);
  return holder;
}

export function LivePreview({
  data,
  playerRef,
  onPlayerReady,
  controls = true,
}: {
  data: NonNullable<LivePreviewData>;
  // A TIMELINE comanda: o EditorWorkspace segura o ref e liga play, agulha e
  // mudo nele. Sem isso a previa tinha transporte proprio e o play da
  // timeline parecia quebrado — foi o primeiro relato de uso real da 0.27.0.
  playerRef?: React.RefObject<PlayerRef | null>;
  onPlayerReady?: () => void;
  controls?: boolean;
}) {
  const [composition, setComposition] = useState<CompositionModule | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const innerRef = useRef<PlayerRef | null>(null);
  const readyNotified = useRef(false);
  const errorWatchRef = useMediaErrorWatch(setMediaError);

  useEffect(() => {
    // A base PRECEDE o import — ver o cabecalho. Trocar de projeto atualiza a
    // base e os proximos staticFile() ja resolvem no projeto novo.
    (window as unknown as { remotion_staticBase?: string }).remotion_staticBase = data.staticBase;
    let alive = true;
    void loadComposition().then((loaded) => {
      if (alive) setComposition(loaded);
    });
    return () => {
      alive = false;
    };
  }, [data.staticBase]);

  // O provider recebe um valor MEMOIZADO: um objeto novo por render faria a
  // composicao inteira re-renderizar a cada quadro do Player.
  const value = useMemo(
    () => ({
      editData: data.editData,
      captions: data.captions,
      segments: data.segments,
      track: data.track,
      cues: data.cues,
      graphicLayers: data.graphicLayers,
    }),
    [data],
  );

  const width = Number(data.editData.width) || 1080;
  const height = Number(data.editData.height) || 1920;
  const fps = Number(data.editData.fps) || 30;
  const durationInFrames = Math.max(1, Math.round((Number(data.editData.durationSec) || 0) * fps));

  // Avisa quando o Player EXISTE de verdade: a composicao chega por import
  // dinamico e o ref so preenche depois. Sem o aviso, o EditorWorkspace
  // tentaria pendurar os ouvintes num ref ainda nulo.
  useEffect(() => {
    // Uma vez por montagem do Player: sem a trava, o aviso rodaria a cada
    // render e o setState de quem ouve viraria um laco infinito.
    if (readyNotified.current) return;
    if (composition && (playerRef?.current ?? innerRef.current)) {
      readyNotified.current = true;
      onPlayerReady?.();
    }
  });

  if (!composition) {
    return <div className="live-preview-loading">Preparando a prévia ao vivo…</div>;
  }
  const { Main, ProjectDataProvider } = composition;
  return (
    // O provider envolve o Player: contexto atravessa a arvore normalmente e
    // chega a composicao. SEM ele, o padrao estatico do template assume e a
    // previa tocaria o projeto de EXEMPLO — o mesmo defeito da primeira
    // rodada da bancada (24 fps e 30s de dados de amostra sobre o video real).
    <ProjectDataProvider value={value}>
      <div ref={errorWatchRef} style={{ display: 'contents' }}>
      <Player
        ref={(playerRef ?? innerRef) as React.Ref<PlayerRef>}
        component={Main}
        durationInFrames={durationInFrames}
        fps={fps}
        compositionWidth={width}
        compositionHeight={height}
        style={{ width: '100%', height: '100%' }}
        controls={controls}
        clickToPlay
        acknowledgeRemotionLicense
        renderPoster={() => null}
        errorFallback={({ error }) => (
          <div className="live-preview-error">
            A prévia ao vivo não conseguiu montar esta edição.
            <small>{error.message}</small>
          </div>
        )}
      />
      </div>
      {mediaError && (
        <div className="live-preview-note erro">
          {mediaError}
        </div>
      )}
      {/* Grafico sob medida ainda preparando: dizer e melhor que sumir — sem o
          aviso, a animacao que o aluno acabou de pedir parece ter sido
          ignorada. */}
      {data.bespokeGraphics && !data.layersReady && (
        <div className="live-preview-note">
          Este vídeo tem uma animação personalizada sendo preparada — ela já aparece no render final.
        </div>
      )}
    </ProjectDataProvider>
  );
}
