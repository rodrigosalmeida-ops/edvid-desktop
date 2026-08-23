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
import { Player } from '@remotion/player';
import { useEffect, useMemo, useState } from 'react';
import type { LivePreviewData } from './shared';

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

export function LivePreview({ data }: { data: NonNullable<LivePreviewData> }) {
  const [composition, setComposition] = useState<CompositionModule | null>(null);

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
      <Player
        component={Main}
        durationInFrames={durationInFrames}
        fps={fps}
        compositionWidth={width}
        compositionHeight={height}
        style={{ width: '100%', height: '100%' }}
        controls
        acknowledgeRemotionLicense
        renderPoster={() => null}
        errorFallback={({ error }) => (
          <div className="live-preview-error">
            A prévia ao vivo não conseguiu montar esta edição.
            <small>{error.message}</small>
          </div>
        )}
      />
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
