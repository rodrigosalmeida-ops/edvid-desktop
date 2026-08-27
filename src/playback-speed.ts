export const REVIEW_SPEEDS = [0.25, 0.5, 1, 1.5, 2, 3, 4] as const;

export type ReviewSpeed = (typeof REVIEW_SPEEDS)[number];

export function isReviewSpeed(value: unknown): value is ReviewSpeed {
  return typeof value === 'number' && REVIEW_SPEEDS.some((speed) => speed === value);
}

export function normalizeReviewSpeed(value: unknown): ReviewSpeed {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  let closest: ReviewSpeed = 1;
  let distance = Number.POSITIVE_INFINITY;
  for (const speed of REVIEW_SPEEDS) {
    const nextDistance = Math.abs(speed - numeric);
    if (nextDistance < distance) {
      closest = speed;
      distance = nextDistance;
    }
  }
  return closest;
}

/**
 * A velocidade de revisão multiplica a velocidade criativa do segmento.
 * Ela só muda como o aluno ASSISTE: não altera a duração nem o EDL/render.
 */
export function playbackRateForReview(segmentSpeed: number, reviewSpeed: ReviewSpeed): number {
  const contentSpeed = Number.isFinite(segmentSpeed) && segmentSpeed > 0 ? segmentSpeed : 1;
  return contentSpeed * reviewSpeed;
}

/**
 * Trocar `video.src` faz Chromium restaurar `playbackRate` a partir de
 * `defaultPlaybackRate`. Escrever os dois mantém a taxa atravessando trocas
 * de arquivo na prévia mapeada.
 */
export function applyPlaybackRate(
  media: Pick<HTMLMediaElement, 'playbackRate' | 'defaultPlaybackRate'>,
  segmentSpeed: number,
  reviewSpeed: ReviewSpeed,
): number {
  const rate = playbackRateForReview(segmentSpeed, reviewSpeed);
  media.defaultPlaybackRate = rate;
  media.playbackRate = rate;
  return rate;
}
