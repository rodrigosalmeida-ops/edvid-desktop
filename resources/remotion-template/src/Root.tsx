import {AbsoluteFill, Composition} from 'remotion';
import {Main} from './Main';
import {CustomGraphics} from './CustomGraphics';
import editData from '../public/edit-data.json';

// Composition size/fps/duration come from edit-data.json — set durationSec to
// the exact cut.mp4 duration (ffprobe) when writing the per-video data.

// SO o CustomGraphics, sobre fundo TRANSPARENTE. E a camada de grafico que o
// Edvid pre-renderiza com alpha (--frames por janela de animacao) para a
// previa tocar sem esperar o render inteiro — o video final continua saindo
// da composicao "Reels", inteira, como sempre. Medido: 65 quadros/s aqui
// contra 8,4 na composicao completa, porque nada de video e decodificado.
const GraphicLayer: React.FC = () => (
  <AbsoluteFill style={{backgroundColor: 'transparent'}}>
    <CustomGraphics />
  </AbsoluteFill>
);

export const RemotionRoot: React.FC = () => {
  const durationInFrames = Math.max(1, Math.round(editData.durationSec * editData.fps));
  return (
    <>
      <Composition
        id="Reels"
        component={Main}
        durationInFrames={durationInFrames}
        fps={editData.fps}
        width={editData.width}
        height={editData.height}
      />
      <Composition
        id="Grafico"
        component={GraphicLayer}
        durationInFrames={durationInFrames}
        fps={editData.fps}
        width={editData.width}
        height={editData.height}
      />
    </>
  );
};
