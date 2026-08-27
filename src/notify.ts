// FIM DE TAREFA AUDIVEL E VISIVEL — o aluno troca de aba ou de aplicativo
// enquanto o Edvid trabalha (corte, render, geracao de midia). Este modulo e
// o sino da casa: qualquer componente chama notify() e o App desenha o toast.
// O som e sintetizado na hora por WebAudio — sem arquivo de audio no bundle —
// e, com a janela em segundo plano, o aviso tambem vira notificacao do
// sistema (silenciosa, porque o sino daqui ja tocou).
export type ToastKind = 'ok' | 'erro';
export type ToastData = { id: number; kind: ToastKind; title: string; body?: string };

type Listener = (toast: ToastData) => void;
let listener: Listener | null = null;
let seq = 0;

export function onToast(fn: Listener): () => void {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}

// Um contexto de audio so, criado no primeiro aviso. O Electron toca audio
// sem gesto do usuario (autoplayPolicy padrao); o resume() cobre o caso raro
// de o contexto nascer suspenso.
let audioCtx: AudioContext | null = null;

function tocarSino(kind: ToastKind) {
  try {
    audioCtx ??= new AudioContext();
    const ctx = audioCtx;
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    const agora = ctx.currentTime + 0.02;
    // Sucesso: quinta ascendente (Sol#5 → Re#6), o "ding" classico de
    // concluido. Erro: terca menor descendente, mais grave — avisa sem
    // alarmar.
    const notas: Array<[number, number]> = kind === 'ok'
      ? [[830.61, 0], [1244.51, 0.09]]
      : [[392.0, 0], [311.13, 0.11]];
    for (const [freq, offset] of notas) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, agora + offset);
      gain.gain.linearRampToValueAtTime(0.14, agora + offset + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, agora + offset + 0.55);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(agora + offset);
      osc.stop(agora + offset + 0.6);
    }
  } catch {
    // Som e cortesia: sem audio, o toast continua avisando.
  }
}

export function notify(kind: ToastKind, title: string, body?: string) {
  tocarSino(kind);
  listener?.({ id: ++seq, kind, title, body });
  if (!document.hasFocus()) {
    try {
      new Notification(title, { body, silent: true });
    } catch {
      // Sem suporte ou permissao, o toast interno espera o aluno voltar.
    }
  }
}

// Sonda da bancada: dispara um aviso pelo console remoto sem tocar no React.
(window as unknown as { __edvidNotify?: typeof notify }).__edvidNotify = notify;
