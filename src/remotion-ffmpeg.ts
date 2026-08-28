import path from 'node:path';

export type RemotionFfmpegCandidate = {
  command: string;
  env: NodeJS.ProcessEnv;
  libraryDirectory: string;
};

// Resolve o FFmpeg distribuído pelo compositor do Remotion. Esse binário é o
// fallback do EDIT AI para codecs (hoje AV1) que o FFmpeg principal consegue
// identificar via ffprobe, mas pode não conseguir decodificar em máquinas sem
// aceleração por hardware.
//
// A função é pura: quem chama continua responsável por conferir se `command`
// existe antes de usá-lo. Isso permite testar a resolução em Windows sem
// depender de um runtime já baixado na máquina de CI.
export function remotionFfmpegCandidate(
  runtimeDirectory: string,
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): RemotionFfmpegCandidate {
  const libraryDirectory = path.join(
    runtimeDirectory,
    'node_modules',
    '@remotion',
    `compositor-${platform}-${arch}`,
  );
  const command = path.join(libraryDirectory, platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');

  const env: NodeJS.ProcessEnv = {};
  // macOS e Linux precisam enxergar as bibliotecas vizinhas do compositor.
  // No Windows as DLLs ao lado do executável já são resolvidas pelo loader.
  if (platform === 'darwin') env.DYLD_LIBRARY_PATH = libraryDirectory;
  if (platform === 'linux') env.LD_LIBRARY_PATH = libraryDirectory;

  return { command, env, libraryDirectory };
}
