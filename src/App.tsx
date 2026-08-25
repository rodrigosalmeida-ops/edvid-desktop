import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import edvidIcon from './brand/edvid-icon.png';
import edvidLogo from './brand/edvid-logo.png';
// Thumbnails renderizadas pelo proprio template do Remotion
// (scripts/render-style-thumbs.mjs) — fieis ao resultado da Fase 2.
import thumbHeadlineOutline from './brand/thumbs/headline-outline.png';
import thumbHeadlineCard from './brand/thumbs/headline-card.png';
import thumbHeadlineRealce from './brand/thumbs/headline-realce.png';
import thumbHeadlineMisto from './brand/thumbs/headline-misto.png';
import thumbCaptionKaraoke from './brand/thumbs/caption-karaoke.mp4';
import thumbCaptionStacked from './brand/thumbs/caption-stacked.mp4';
import thumbCaptionScatter from './brand/thumbs/caption-scatter.mp4';
import thumbCaptionSimples from './brand/thumbs/caption-simples.png';
import thumbCaptionSerifada from './brand/thumbs/caption-serifada.png';
import thumbCaptionClassica from './brand/thumbs/caption-classica.png';

const headlineThumbs: Record<Exclude<HeadlineStyle, 'none'>, string> = {
  outline: thumbHeadlineOutline,
  card: thumbHeadlineCard,
  realce: thumbHeadlineRealce,
  misto: thumbHeadlineMisto,
};

// Estilos animados mostram um clipe em loop; os estáticos, um frame.
const captionThumbs: Record<Exclude<CaptionStyle, 'none'>, { kind: 'video' | 'image'; src: string }> = {
  karaoke: { kind: 'video', src: thumbCaptionKaraoke },
  stacked: { kind: 'video', src: thumbCaptionStacked },
  scatter: { kind: 'video', src: thumbCaptionScatter },
  simples: { kind: 'image', src: thumbCaptionSimples },
  serifada: { kind: 'image', src: thumbCaptionSerifada },
  classica: { kind: 'image', src: thumbCaptionClassica },
};
import chatgptMark from './brand/ai/chatgpt-mark.svg';
import claudeMark from './brand/ai/claude-mark.svg';
import geminiMark from './brand/ai/gemini-mark.svg';
// Estavam em src/brand/ai/ desde sempre e nunca foram importados: os cards do
// Treblo e dos hubs caiam na letra inicial de reserva.
import higgsfieldMark from './brand/ai/higgsfield.png';
import magnificMark from './brand/ai/magnific.webp';
import trebloMark from './brand/ai/treblo.webp';
import type {
  ActiveModelState,
  AiProvider,
  AiRolesState,
  AppUpdateState,
  CatalogState,
  ClaudeAccountState,
  CleanCutState,
  CodexAccountState,
  CodexApproval,
  CodexEvent,
  DesktopInfo,
  GeminiAccountState,
  ImageGenState,
  MemberAuthState,
  OverlayClip,
  Phase2RenderState,
  ProjectSummary,
  ProjectWorkspace,
  RemotionRuntimeState,
  RuntimeCheck,
  RuntimePackState,
  SourceWaveform,
  TimelineClip,
  TimelineModel,
  WhisperModelState,
} from './shared';
import { AI_CATALOG, catalogEntry, type AiCatalogEntry } from './ai-catalog';
import { LivePreview, type PlayerRef } from './live-preview';
import { notify, onToast, type ToastData } from './notify';
import { activeSplitIndexAt, type EditOperation, type OverlayKind } from './edit-data-edits';
import { SPLIT_DIVIDER } from './image-format';
import { DEFAULT_TIER, TIERS, TIER_LABEL, TIER_NOTE, type GenerationKind } from './generation-tier';
import {
  VIDEO_TRACK_ID,
  VOICE_TRACK_ID,
  applyTrim,
  PREVIEW_SOURCE_ID,
  clipDuration,
  clipEnd,
  deleteClipLeaveGap,
  deriveSegments,
  edlRangesFromModel,
  modelRemovesMaterial,
  modelsEqual,
  nextProgrammeIndexAfter,
  playbackProgramme,
  programmeIndexAt,
  razorAtTime,
  rippleDeleteClip,
  round3,
  snapCandidateTimes,
  snapTime,
  sortedTrackClips,
  timelineModelDuration,
  trimAllowedDelta,
  type PlaybackSegment,
  type TrimEdge,
} from './timeline-model';

const labels: Record<RuntimeCheck['name'], string> = {
  node: 'Node.js',
  npm: 'npm',
  ffmpeg: 'FFmpeg',
  ffprobe: 'FFprobe',
  uv: 'uv',
  'yt-dlp': 'yt-dlp',
  python: 'Python',
  whisperx: 'WhisperX',
  'codex-app-server': 'Codex',
};

const runtimeNames = Object.keys(labels) as RuntimeCheck['name'][];

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
};

type CorrectionRange = {
  id: string;
  start: number;
  end: number;
  note: string;
};

type WorkTab = 'edit' | 'styles';
type EditStyle = 'limpa' | 'split' | 'split2';
type HeadlineStyle = 'outline' | 'card' | 'realce' | 'misto' | 'none';
type CaptionStyle =
  | 'karaoke'
  | 'stacked'
  | 'scatter'
  | 'simples'
  | 'serifada'
  | 'classica'
  | 'none';

// De onde vem a MIDIA da tela dividida: imagem gerada por IA, clipe gerado
// por IA, ou nenhuma — os espacos ficam vazios e o proprio aluno aponta os
// arquivos depois, selecionando o chip vazio na timeline.
type SplitMediaSource = 'imagem' | 'video' | 'nenhum';

type StyleSetup = {
  edit: EditStyle;
  // Opcional na LEITURA (projetos e estados guardados antes da 0.30.0 não têm
  // o campo); o padrão entra no defaultStyleSetup.
  splitMedia?: SplitMediaSource;
  headline: HeadlineStyle;
  headlineText: string;
  captions: CaptionStyle;
  accent: string;
  elements: {
    tracking: boolean;
    zoomAuto: boolean;
    zoomCuts: boolean;
    flashCut: boolean;
    musicAI: boolean;
  };
  note: string;
};

type IconName =
  | 'add'
  | 'alert'
  | 'arrowDown'
  | 'captions'
  | 'chat'
  | 'check'
  | 'chevron'
  | 'enter'
  | 'folder'
  | 'image'
  | 'layers'
  | 'more'
  | 'music'
  | 'pause'
  | 'pin'
  | 'play'
  | 'redo'
  | 'scissors'
  | 'send'
  | 'settings'
  | 'skipBack'
  | 'stop'
  | 'skipForward'
  | 'sparkles'
  | 'undo'
  | 'text'
  | 'trash'
  | 'video'
  | 'volume'
  | 'volumeOff'
  | 'waveform';

const initialAccount: CodexAccountState = {
  status: 'starting',
  account: null,
  requiresOpenaiAuth: true,
};

const defaultStyleSetup: StyleSetup = {
  edit: 'limpa',
  splitMedia: 'imagem',
  headline: 'outline',
  headlineText: '',
  captions: 'karaoke',
  accent: '#ff5200',
  elements: {
    tracking: false,
    zoomAuto: true,
    zoomCuts: true,
    flashCut: false,
    musicAI: false,
  },
  note: '',
};

const editStyles: Array<{ id: EditStyle; name: string; description: string }> = [
  { id: 'limpa', name: 'Limpa', description: 'Pessoa em tela cheia; imagens entram como inserts.' },
  { id: 'split', name: 'Tela dividida', description: 'Imagem em cima e pessoa na parte inferior.' },
  { id: 'split2', name: 'Tela dividida 2', description: 'Pessoa em cima e imagem na parte inferior.' },
];

const headlineStyles: Array<{ id: HeadlineStyle; name: string }> = [
  { id: 'outline', name: 'Outline' },
  { id: 'card', name: 'Card' },
  { id: 'realce', name: 'Realce' },
  { id: 'misto', name: 'Misto' },
  { id: 'none', name: 'Sem headline' },
];

const captionStyles: Array<{ id: CaptionStyle; name: string; kind: string }> = [
  { id: 'karaoke', name: 'Karaokê', kind: 'Animada' },
  { id: 'stacked', name: 'Empilhada', kind: 'Animada' },
  { id: 'scatter', name: 'Dispersa', kind: 'Animada' },
  { id: 'simples', name: 'Simples', kind: 'Estática' },
  { id: 'serifada', name: 'Serifada', kind: 'Estática' },
  { id: 'classica', name: 'Clássica', kind: 'Estática' },
  { id: 'none', name: 'Sem legendas', kind: 'Desativada' },
];

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    add: <path d="M8 2.3v11.4M2.3 8h11.4" />,
    alert: <><path d="M8 2 14.6 13.6H1.4z" /><path d="M8 6.6v3" /><path d="M8 11.8v.01" /></>,
    arrowDown: <path d="m3.2 6 4.8 4.7L12.8 6" />,
    captions: <><rect x="1.5" y="3" width="13" height="10" rx="2.2" /><path d="M4 8.5h3M9 8.5h3" /></>,
    chat: <path d="M2 2.5h12v8.6H7l-3.7 2.4.9-2.4H2z" />,
    check: <path d="m2.6 8.2 3.2 3.1 7.6-7.4" />,
    chevron: <path d="m6 3.2 4.8 4.8L6 12.8" />,
    enter: <path d="M12.8 3.6v3.6a2.4 2.4 0 0 1-2.4 2.4H3.6M6.5 6.6 3.4 9.6l3.1 3" />,
    folder: <path d="M1.5 4.2h5l1.2 1.5h6.8v7.2h-13z" />,
    image: <><rect x="1.5" y="2.2" width="13" height="11.6" rx="2" /><path d="m3.5 11 3-3 2.1 2 1.7-1.5 2.2 2.5M11.3 5.5h.1" /></>,
    layers: <><path d="m8 1.8 6.2 3.4L8 8.6 1.8 5.2z" /><path d="m2 8 6 3.3L14 8M2 10.8l6 3.3 6-3.3" /></>,
    more: <path d="M3.4 8h.01M8 8h.01M12.6 8h.01" />,
    music: <><path d="M6 12.2V4l7-1.5v8" /><circle cx="3.9" cy="12.3" r="2" /><circle cx="10.9" cy="10.7" r="2" /></>,
    pause: <><path d="M5.2 3v10M10.8 3v10" /></>,
    pin: <path d="m5 2 6 1-1.4 3 2.1 2.1-3 1.1-2.5 4.5-.5-4.9-3-1.4 2.4-1.8z" />,
    play: <path d="m5 2.5 8 5.5-8 5.5z" />,
    scissors: <><circle cx="4.2" cy="4.4" r="1.9" /><circle cx="4.2" cy="11.6" r="1.9" /><path d="m5.7 5.6 8 6.6M5.7 10.4l8-6.6" /></>,
    send: <path d="M8 12.8V3.4M3.9 7.4 8 3.3l4.1 4.1" />,
    stop: <rect x="4.4" y="4.4" width="7.2" height="7.2" rx="1.6" />,
    undo: <path d="M3.2 6.4h6.2a3.4 3.4 0 0 1 0 6.8H6.6M3.2 6.4l3-3M3.2 6.4l3 3" />,
    redo: <path d="M12.8 6.4H6.6a3.4 3.4 0 0 0 0 6.8h2.8M12.8 6.4l-3-3M12.8 6.4l-3 3" />,
    settings: <g transform="scale(.6667)"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></g>,
    skipBack: <><path d="M4 3v10M12.8 3.2 5.4 8l7.4 4.8z" /></>,
    skipForward: <><path d="M12 3v10M3.2 3.2 10.6 8l-7.4 4.8z" /></>,
    sparkles: <><path d="M8 1.5 9.2 5 12.5 6.2 9.2 7.4 8 11 6.8 7.4 3.5 6.2 6.8 5z" /><path d="m12.8 10 .5 1.5 1.4.5-1.4.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5z" /></>,
    text: <path d="M3.2 3.2h9.6M8 3.2v9.6M5.8 12.8h4.4" />,
    trash: <><path d="M3.2 4.6h9.6M6 4.6V2.8h4v1.8M4.5 4.6l.7 8.5h5.6l.7-8.5M6.8 7v3.7M9.2 7v3.7" /></>,
    video: <><rect x="1.4" y="3" width="10" height="10" rx="2" /><path d="m11.4 6.2 3.2-1.8v7.2l-3.2-1.8" /></>,
    volume: <><path d="M2 6h3l3-2.7v9.4L5 10H2z" /><path d="M10 5.4a3.2 3.2 0 0 1 0 5.2M12 3.5a5.7 5.7 0 0 1 0 9" /></>,
    volumeOff: <><path d="M2 6h3l3-2.7v9.4L5 10H2z" /><path d="m10.3 6 3.7 4M14 6l-3.7 4" /></>,
    waveform: <path d="M1 8h2l1.2-4 2 8 2.2-9 2 7 1.2-4 1.2 2H15" />,
  };
  return <svg className="icon" viewBox="0 0 16 16" aria-hidden="true">{paths[name]}</svg>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Erro de turno vindo do provedor: nunca mostrar JSON cru nem inglês no chat.
// Extrai a mensagem interna quando o texto é um corpo de erro da API e traduz
// os casos conhecidos; o resto passa adiante como veio.
function friendlyAiError(raw: string): string {
  let text = raw.trim();
  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string }; message?: string };
      text = parsed.error?.message ?? parsed.message ?? text;
    } catch {
      // Não era JSON completo: segue com o texto original.
    }
  }
  if (/model is not supported|unsupported model|model_not_found|invalid model/iu.test(text)) {
    return 'O modelo de IA desta conta mudou e esta versão do Edvid ainda não o acompanha. Atualize o Edvid e tente de novo.';
  }
  return text;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function formatTimecode(seconds: number, fps: number): string {
  const nominalFps = Math.max(1, Math.round(fps || 30));
  const totalFrames = Math.max(0, Math.round((Number.isFinite(seconds) ? seconds : 0) * nominalFps));
  const frames = totalFrames % nominalFps;
  const totalSeconds = Math.floor(totalFrames / nominalFps);
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
}

const TIMELINE_LANE_START = 46;

function timelinePoint(progress: number): string {
  const clamped = Math.max(0, Math.min(progress, 1));
  return `calc(${TIMELINE_LANE_START}px + ${clamped * 100}% - ${clamped * TIMELINE_LANE_START}px)`;
}

function timelineSpan(progress: number): string {
  const clamped = Math.max(0, Math.min(progress, 1));
  return `calc(${clamped * 100}% - ${clamped * TIMELINE_LANE_START}px)`;
}

function cleanAssistantText(text: string): string {
  return text
    .replace(/^\s*\[[^\]\n]+\]\s*\(\s*<?(?:file:\/\/)?\/(?:Users|home|Volumes)\/[^)\n>]+>?\s*\)\s*$/gimu, '')
    .replace(/^\s*(?:arquivo|caminho|saída|output)\s*:\s*<?\/(?:Users|home|Volumes)\/.*$/gimu, '')
    .replace(/^\s*<?(?:file:\/\/)?\/(?:Users|home|Volumes)\/[^>\n]+>?\s*$/gimu, '')
    .replace(/^\s*(?:aprova\s+este\s+corte\?|se\s+aprovar.*(?:diga|responda)).*$/gimu, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function asksForCleanCutApproval(text: string): boolean {
  // Sem limite de distância entre as âncoras: a frase real do agente varia
  // ("Corte limpo preparado com 16,3 segundos. … me diga se aprova") e o
  // limite de 80 caracteres escondia o gate — e com ele o botão de J-Cut.
  // "aprovado" (particípio, relato de aprovação já feita) fica de fora.
  return /\bcorte\b/iu.test(text) && /\b(?:aprova|aprovar|aprove|aprovação)\b/iu.test(text);
}

function styleStorageKey(directory: string): string {
  return `edvid:style:${directory}`;
}

// Historico do chat por projeto. Fechar e reabrir o aplicativo nao pode zerar
// a conversa nem reoferecer os botoes de inicio com o processo ja andando.
type StoredChat = {
  messages: ChatMessage[];
  handledCutApprovalId: string | null;
  jcutApplied: boolean;
};

function chatStorageKey(directory: string): string {
  return `edvid:chat:${directory}`;
}

function readStoredChat(directory: string): StoredChat {
  const empty: StoredChat = { messages: [], handledCutApprovalId: null, jcutApplied: false };
  try {
    const parsed = JSON.parse(localStorage.getItem(chatStorageKey(directory)) ?? 'null') as
      | Partial<StoredChat>
      | null;
    if (!parsed || !Array.isArray(parsed.messages)) return empty;
    return {
      messages: parsed.messages.filter((message): message is ChatMessage => (
        Boolean(message) &&
        typeof message.id === 'string' &&
        (message.role === 'user' || message.role === 'assistant' || message.role === 'system') &&
        typeof message.text === 'string'
      )),
      handledCutApprovalId:
        typeof parsed.handledCutApprovalId === 'string' ? parsed.handledCutApprovalId : null,
      jcutApplied: parsed.jcutApplied === true,
    };
  } catch {
    return empty;
  }
}

function readStoredStyle(directory: string, fallback: StyleSetup = defaultStyleSetup): StyleSetup {
  try {
    const parsed = JSON.parse(localStorage.getItem(styleStorageKey(directory)) ?? 'null') as Partial<StyleSetup> | null;
    if (!parsed) return fallback;
    return {
      ...fallback,
      ...parsed,
      elements: { ...fallback.elements, ...parsed.elements },
    };
  } catch {
    return fallback;
  }
}

function EditStylePreview({ style }: { style: EditStyle }) {
  return (
    <div className={`edit-style-preview ${style}`}>
      <div className="preview-art" />
      <div className="preview-person"><span /></div>
      <div className="preview-caption" />
    </div>
  );
}

function HeadlinePreview({ style }: { style: HeadlineStyle }) {
  if (style === 'none') return <div className="none-preview">Sem texto</div>;
  // Frame real renderizado pelo template; o accent das thumbnails e o padrao
  // laranja — a cor escolhida vale no render final.
  return <img className="style-thumb" src={headlineThumbs[style]} alt="" draggable={false} />;
}

function CaptionPreview({ style }: { style: CaptionStyle }) {
  if (style === 'none') return <div className="none-preview">Sem legendas</div>;
  const thumb = captionThumbs[style];
  if (thumb.kind === 'video') {
    return <video className="style-thumb" src={thumb.src} autoPlay loop muted playsInline disablePictureInPicture />;
  }
  return <img className="style-thumb" src={thumb.src} alt="" draggable={false} />;
}

function ChoiceCard({
  selected,
  title,
  subtitle,
  label,
  onClick,
  children,
}: {
  selected: boolean;
  title?: string;
  subtitle?: string;
  label?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`choice-card ${selected ? 'selected' : ''}`}
      aria-pressed={selected}
      aria-label={title ?? label}
      onClick={onClick}
    >
      <div className="choice-visual">{children}</div>
      {title && <span className="choice-name">{title}</span>}
      {subtitle && <span className="choice-description">{subtitle}</span>}
      <span className="choice-check"><Icon name="check" /></span>
    </button>
  );
}

function TimelineTrack({
  icon,
  label,
  tone,
  children,
}: {
  icon: IconName;
  label: string;
  tone: string;
  children: ReactNode;
}) {
  return (
    <div className="studio-track">
      <div className={`studio-track-label ${tone}`} title={label}>
        <Icon name={icon} />
      </div>
      <div className="studio-lane">{children}</div>
    </div>
  );
}

function EditorWorkspace({
  workspace,
  style,
  styleApplied,
  corrections,
  onCorrectionsChange,
  onApplyCorrections,
  applyingCorrections,
  onTimelineModelChange,
  onApplyTimelineEdits,
  renderStamp,
  onRenderPendingChange,
  onCutsPendingChange,
  chatConnected,
  imageAiConnected,
  videoAiConnected,
}: {
  workspace: ProjectWorkspace | null;
  style: StyleSetup;
  styleApplied: boolean;
  corrections: CorrectionRange[];
  onCorrectionsChange: (corrections: CorrectionRange[]) => void;
  onApplyCorrections: (corrections: CorrectionRange[]) => Promise<boolean>;
  applyingCorrections: boolean;
  onTimelineModelChange: (model: TimelineModel, commit: boolean) => void;
  onApplyTimelineEdits: () => Promise<boolean>;
  // Muda quando um render da Fase 2 termina: pede dados novos da previa (e o
  // renderPending atualizado que esconde o botao Renderizar).
  renderStamp: string;
  onRenderPendingChange: (pending: boolean) => void;
  // Cortes pendentes na timeline: o Renderizar da barra aplica-os antes de
  // renderizar — o botao de aplicar deixou de existir.
  onCutsPendingChange: (pending: boolean) => void;
  // Quem esta conectado decide os botoes do espaco vazio no palco: gerar
  // imagem, gerar clipe, e o "Gerar automaticamente" do prompt (agente).
  chatConnected: boolean;
  imageAiConnected: boolean;
  videoAiConnected: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const currentTimeRef = useRef(0);
  const [currentTime, setCurrentTime] = useState(0);
  // PREVIA AO VIVO: nao e mais um modo — e O preview, sempre que o projeto
  // tem a Fase 2 montada. O aluno nao escolhe entre "render" e "ao vivo"
  // (pedido de uso real da 0.28.0): ele ve a edicao acontecer, e o render
  // virou uma acao de exportar na barra de abas, que so aparece quando ha o
  // que renderizar. Sem edit-data (Fase 1) ou com cortes pendentes (mapped),
  // o player de video continua sendo o preview.
  const [liveData, setLiveData] = useState<import('./shared').LivePreviewData>(null);
  const liveDirectory = workspace?.project.directory ?? null;
  useEffect(() => {
    if (!liveDirectory) {
      setLiveData(null);
      return;
    }
    let alive = true;
    void window.edvidDesktop.getLivePreview(liveDirectory)
      .then((data) => { if (alive) setLiveData(data); })
      .catch(() => { if (alive) setLiveData(null); });
    return () => { alive = false; };
    // timelineLoadStamp muda a cada turno/render aplicado; renderStamp vem do
    // App quando um render termina — os dois pedem dados novos.
  }, [liveDirectory, workspace?.timelineLoadStamp, renderStamp]);
  // QUEM COMANDA A PREVIA E A TIMELINE. O Player fica sem controles proprios
  // (controls=false) e o play/agulha/mudo de baixo valem para os dois modos —
  // dois transportes na mesma tela foi o primeiro relato de confusao da
  // 0.27.0. liveReady conta remontagens: o ref enche DEPOIS do import
  // dinamico da composicao, e os ouvintes precisam esperar por ele.
  const livePlayerRef = useRef<PlayerRef | null>(null);
  const [liveReady, setLiveReady] = useState(0);
  const liveActiveRef = useRef(false);
  const liveFps = liveData ? Number(liveData.editData.fps) || 30 : 0;
  const liveFpsRef = useRef(30);
  liveFpsRef.current = liveFps || 30;
  const liveDuration = liveData ? Number(liveData.editData.durationSec) || 0 : 0;
  // MANIPULACAO DIRETA (0.28.0). O arrasto muda o liveData na hora (a
  // composicao re-renderiza sozinha — e React) e persiste no soltar. dirty
  // acende o botao de renderizar: o render agora e UMA acao no fim, nao um
  // efeito colateral de cada ajuste.
  const [liveDirty, setLiveDirty] = useState(false);
  const liveDataRef = useRef<typeof liveData>(null);
  liveDataRef.current = liveData;
  useEffect(() => {
    onRenderPendingChange(Boolean(liveData?.renderPending));
    // A referencia da callback muda por render do App; o que importa e o dado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveData?.renderPending]);
  const overlayDragRef = useRef<{
    kind: OverlayKind; index: number; mode: 'move' | 'start' | 'end';
    // A duracao viaja no arrasto porque o encaixe olha as DUAS pontas do
    // elemento: grudar so pela ponta que o mouse segura deixa a outra a um
    // quadro do vizinho, que e exatamente o buraco que o aluno ve no render.
    grabOffset: number; dur: number; moved: boolean;
  } | null>(null);
  // SELECAO UNIVERSAL: tudo na timeline e selecionavel. Elementos com corpo
  // no quadro (splits, inserts) ganham o gizmo no palco — mover, tamanho e
  // giro. Legendas, headline e trilha selecionam; os controles espaciais
  // deles entram por elemento (cada um tem um motor de layout proprio).
  type SelectedElement =
    | { kind: OverlayKind; index: number }
    | { kind: 'captions' | 'headline' | 'soundtrack' };
  const [selectedElement, setSelectedElement] = useState<SelectedElement | null>(null);
  // Pedido de mídia por IA para um espaço vazio da tela dividida. `aberto`
  // guarda o índice do trecho (0 é válido, por isso null e não falsy) — quem
  // escreve o prompt é o aluno, e sem agente conectado é o único caminho.
  const [faixaIa, setFaixaIa] = useState<{
    aberto: number | null;
    // O TIPO vem do botao clicado, nao do kind gravado no espaco: o mesmo
    // espaco vazio oferece imagem E clipe, conforme as contas conectadas.
    tipo: 'imagem' | 'video';
    texto: string;
    gerando: boolean;
    // "Gerar automaticamente": o agente escrevendo o prompt deste trecho.
    sugerindo: boolean;
    erro: string | null;
  }>({ aberto: null, tipo: 'imagem', texto: '', gerando: false, sugerindo: false, erro: null });
  const gizmoDragRef = useRef<{
    mode: 'move' | 'scale' | 'rotate' | 'crop';
    kind: 'splits' | 'inserts';
    index: number;
    startX: number; startY: number;
    baseTransform: { x: number; y: number; scale: number; rotation: number };
    centerX: number; centerY: number;
    startDist: number; startAngle: number;
    // So no modo crop: qual borda esta sendo arrastada, o inset de partida e
    // a caixa do ELEMENTO em pixels de composicao (o clip-path e relativo a
    // ela, nunca a caixa visivel).
    edge?: 'n' | 's' | 'e' | 'w';
    baseCrop?: { left: number; top: number; right: number; bottom: number };
    elementPx?: { w: number; h: number };
    moved: boolean;
  } | null>(null);

  // Geometria do elemento no quadro, em FRACOES da composicao. Espelha o
  // template: a faixa do split sai da mesma conta do splitGeometry e o cartao
  // do insert e 780x500 a 90px do topo num quadro 1080x1920 (CARD_W/H/TOP,
  // exportados la — nao importamos o modulo aqui porque carregar o Main fora
  // de hora dispararia o carregamento de fontes sem a base configurada).
  // DIMENSOES NATURAIS da midia selecionada, para o gizmo desenhar a caixa
  // onde a midia REALMENTE esta (fit contain centra a midia dentro da faixa; a
  // caixa presa nas extremidades da faixa foi defeito relatado com print). O
  // cache vive por src; imagem mede por <img>, video por loadedmetadata.
  const mediaDimsRef = useRef(new Map<string, { w: number; h: number }>());
  const [mediaDimsStamp, setMediaDimsStamp] = useState(0);
  const mediaDimsFor = (src: string): { w: number; h: number } | null => {
    const cache = mediaDimsRef.current;
    if (cache.has(src)) return cache.get(src) ?? null;
    const base = liveData?.staticBase;
    if (!base) return null;
    cache.set(src, null as unknown as { w: number; h: number });
    const url = `${base}/${src}`;
    const guardar = (w: number, h: number) => {
      if (w > 0 && h > 0) {
        cache.set(src, { w, h });
        setMediaDimsStamp((atual) => atual + 1);
      }
    };
    if (/\.(mp4|mov|webm)$/iu.test(src)) {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => guardar(video.videoWidth, video.videoHeight);
      video.src = url;
    } else {
      const imagem = new Image();
      imagem.onload = () => guardar(imagem.naturalWidth, imagem.naturalHeight);
      imagem.src = url;
    }
    return null;
  };

  const elementRegion = (kind: 'splits' | 'inserts', item: Record<string, unknown>) => {
    if (kind === 'splits') {
      const divider = Math.min(0.85, Math.max(0.15, Number(item.divider ?? SPLIT_DIVIDER)));
      const onTop = (item.position ?? 'top') === 'top';
      return onTop
        ? { x: 0, y: 0, w: 1, h: divider }
        : { x: 0, y: divider, w: 1, h: 1 - divider };
    }
    const w = 780 / 1080;
    const h = 500 / 1920;
    return { x: (1 - w) / 2, y: 90 / 1920, w, h };
  };


  const dividerDragRef = useRef<{ index: number; moved: boolean } | null>(null);
  const textDragRef = useRef<{
    mode: 'move' | 'scale'; startY: number; basePadding: number; baseCorpo: number;
    centerY: number; startDist: number; moved: boolean;
    alturaComposicao: number; alturaPalco: number;
  } | null>(null);
  const [headlineDraft, setHeadlineDraft] = useState<string | null>(null);

  const applyLiveOperation = (operation: EditOperation, persist: boolean) => {
    const atual = liveDataRef.current;
    if (!atual) return;
    // Otimista: a mesma mutacao do main roda aqui para o quadro responder ao
    // mouse; o disco so e tocado no soltar.
    // applyEditOperations (plural) e nao applyEditOperation: e a versao que
    // arredonda para quadro, e o otimista TEM de decidir igual ao disco —
    // senao o elemento anda um pouco no arrasto e pula ao soltar.
    import('./edit-data-edits').then(({ applyEditOperations }) => {
      const result = applyEditOperations(atual.editData, [operation]);
      if (!result.ok || !liveDataRef.current) return;
      if (result.changed) {
        setLiveData({ ...liveDataRef.current, editData: result.data });
      }
      if (persist && liveDirectory) {
        window.edvidDesktop.applyPreviewEdits(liveDirectory, [operation])
          .then((persisted) => {
            if (liveDataRef.current) {
              setLiveData({ ...liveDataRef.current, editData: persisted, renderPending: true });
            }
          })
          .catch(() => {
            // A escrita falhou: recarrega a verdade do disco em vez de deixar
            // a tela mentindo um ajuste que nao existe.
            if (liveDirectory) {
              void window.edvidDesktop.getLivePreview(liveDirectory).then(setLiveData).catch(() => {});
            }
          });
      }
    }).catch(() => {});
  };
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [markIn, setMarkIn] = useState<number | null>(null);
  const [draftRange, setDraftRange] = useState<{ start: number; end: number } | null>(null);
  const [draftNote, setDraftNote] = useState('');
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const zoomStateRef = useRef(1);
  const pinchZoomRef = useRef<(event: WheelEvent) => void>(() => {});
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [inGap, setInGap] = useState(false);
  const correctionHistoryRef = useRef<CorrectionRange[][]>([]);
  const modelHistoryRef = useRef<TimelineModel[]>([]);
  const modelFutureRef = useRef<TimelineModel[]>([]);
  const actionOrderRef = useRef<Array<'model' | 'corrections'>>([]);
  const baselineModelRef = useRef<TimelineModel | null>(null);
  const baselineKeyRef = useRef<string | null>(null);
  const modelRef = useRef<TimelineModel | null>(null);
  const mappedRef = useRef(false);
  const playingRef = useRef(false);
  const inGapRef = useRef(false);
  const programmeRef = useRef<PlaybackSegment[]>([]);
  const mappedIndexRef = useRef(-1);
  const gapClockRef = useRef<number | null>(null);
  const pendingVideoSeekRef = useRef<{ sourceTime: number; resume: boolean } | null>(null);
  const trimDragRef = useRef<{
    clipId: string;
    edge: TrimEdge;
    baseModel: TimelineModel;
    originX: number;
    secondsPerPixel: number;
    appliedDelta: number;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const zoomAnchorRef = useRef<{ progress: number; viewportX: number } | null>(null);
  const activeSourceIdRef = useRef<string | null>(null);
  const timelineSeekPointerRef = useRef<number | null>(null);
  const seekRef = useRef<(value: number) => void>(() => {});
  const setVideoToProgrammeRef = useRef<(index: number, sourceTime: number, resume: boolean) => void>(() => {});

  const media = workspace?.media ?? null;
  const model = workspace?.timelineModel ?? null;
  const synced = workspace?.timelineModelSynced ?? true;
  const sources = workspace?.sources ?? [];
  const sourceById = useMemo(
    () => new Map(sources.map((source) => [source.id, source])),
    [sources],
  );
  const sourceDurations = useMemo(
    () => Object.fromEntries(sources.map((source) => [source.id, source.duration])),
    [sources],
  );
  modelRef.current = model;

  // A referência de comparação para "há edições pendentes" é o modelo recebido
  // ao abrir/atualizar o projeto. O token da mídia muda a cada carga.
  const loadKey = `${workspace?.project.directory ?? ''}:${media?.url ?? ''}`;
  if (baselineKeyRef.current !== loadKey) {
    baselineKeyRef.current = loadKey;
    baselineModelRef.current = model;
  }

  const timelineSegments = workspace?.timeline?.segments ?? [];
  const timelineDuration = timelineSegments.reduce(
    (maximum, segment) => Math.max(maximum, segment.start + segment.duration),
    0,
  );
  const [duration, setDuration] = useState(workspace?.media?.duration ?? timelineDuration);
  const modelDuration = model ? timelineModelDuration(model) : 0;
  const dirty = useMemo(
    () => (model ? !synced || !modelsEqual(model, baselineModelRef.current) : false),
    [model, synced],
  );
  const programme = useMemo(() => (model ? playbackProgramme(model) : []), [model]);

  // Com edições pendentes o render deixa de corresponder ao modelo; o preview
  // passa a mapear a timeline para os arquivos-fonte, sem render completo.
  // O espelho pré-corte de pasta com vários vídeos também é mapeado: o
  // media.url é só um dos arquivos, e a sequência inteira vive nas fontes.
  const sourceMirror =
    media?.kind === 'source' &&
    programme.some((segment) => segment.sourceId !== PREVIEW_SOURCE_ID);
  const mapped = (dirty || sourceMirror) && programme.length > 0;
  mappedRef.current = mapped;
  // A previa ao vivo assume sempre que ha Fase 2 montada E nao ha corte
  // pendente: cortes em edicao precisam do preview mapeado por fontes, que a
  // composicao (que le o cut.mp4 antigo) nao sabe mostrar.
  const liveActive = Boolean(liveData) && !mapped;
  liveActiveRef.current = liveActive;
  // Sem previa ao vivo o edit-data nao esta em maos: manter as faixas
  // visiveis e o comportamento antigo, correto para o preview de render.
  const editDataAtual = (liveData?.editData ?? null) as Record<string, unknown> | null;
  const captionsEnabled = !editDataAtual
    || ((editDataAtual.captions ?? {}) as Record<string, unknown>).enabled !== false;
  const headlineEnabled = !editDataAtual
    || ((editDataAtual.hook ?? {}) as Record<string, unknown>).enabled !== false;
  // Selecao presa a um elemento que sumiu deixaria o gizmo apontando para o
  // nada — e o Delete seguinte tentaria apagar de novo.
  useEffect(() => {
    if (!selectedElement) return;
    if (selectedElement.kind === 'captions' && !captionsEnabled) setSelectedElement(null);
    if (selectedElement.kind === 'headline' && !headlineEnabled) setSelectedElement(null);
    if ('index' in selectedElement) {
      const lista = editDataAtual?.[selectedElement.kind];
      if (Array.isArray(lista) && !lista[selectedElement.index]) setSelectedElement(null);
    }
  }, [selectedElement, captionsEnabled, headlineEnabled, editDataAtual]);
  useEffect(() => {
    onCutsPendingChange(dirty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty]);
  // Caixa do TEXTO (legenda/headline) no quadro, em frações. Não há x/y no
  // arquivo: a posição sai dos tunáveis que o template respeita —
  // paddingBottom/fontSize na legenda, paddingTop/maxFontPx na headline.
  const textRegion = (kind: 'captions' | 'headline') => {
    const d = (liveData?.editData ?? {}) as Record<string, unknown>;
    const altura = Number(d.height) || 1920;
    if (kind === 'captions') {
      const c = (d.captions ?? {}) as Record<string, unknown>;
      const fonte = Number(c.fontSize) || 61;
      const alturaCaixa = (fonte * 1.6) / altura;
      // A legenda NAO fica sempre no paddingBottom: o template a centra na
      // DIVISA durante um split, e uma janela em captions.windows tem
      // prioridade sobre os dois. Espelhar so o paddingBottom desenhava a
      // caixa la embaixo enquanto o texto estava na divisa — foi o que o
      // aluno viu. A ordem aqui e a MESMA do captionPaddingBottomAt.
      const janelas = Array.isArray(c.windows) ? (c.windows as Array<Record<string, unknown>>) : [];
      const janela = janelas.find((w) => currentTime >= Number(w.start) && currentTime < Number(w.end));
      let base = Number(c.paddingBottom) || 420;
      if (janela) {
        base = Number(janela.paddingBottom) || base;
      } else {
        const indice = activeSplitIndexAt(d, currentTime);
        if (indice >= 0) {
          const split = (d.splits as Array<Record<string, unknown>>)[indice];
          const divisa = Math.min(0.85, Math.max(0.15, Number(split.divider ?? SPLIT_DIVIDER)));
          // seam = altura * divisa; a legenda fica centrada nela, e a metade
          // visual do bloco de texto e o que o template chama de textHalfPx.
          base = altura - altura * divisa - (fonte * 1.6) / 2;
        }
      }
      return { x: 0.06, y: 1 - base / altura - alturaCaixa, w: 0.88, h: alturaCaixa };
    }
    const h = (d.hook ?? {}) as Record<string, unknown>;
    const corpo = Number(h.maxFontPx ?? h.fontSizePx) || 51;
    const topo = Number(h.paddingTop) || 330;
    const alturaCaixa = (corpo * 2.3) / altura;
    return { x: 0.06, y: topo / altura, w: 0.88, h: alturaCaixa };
  };

  const selectedText = useMemo(() => {
    if (!liveActive || !liveData || !selectedElement) return null;
    if (selectedElement.kind !== 'captions' && selectedElement.kind !== 'headline') return null;
    const d = liveData.editData as Record<string, unknown>;
    const alvo = (selectedElement.kind === 'captions' ? d.captions : d.hook) as Record<string, unknown> | undefined;
    if (!alvo || alvo.enabled === false) return null;
    // A headline só existe nos primeiros segundos: fora da janela o gizmo
    // apontaria para um texto que não está na tela.
    if (selectedElement.kind === 'headline') {
      const fim = Number(alvo.endSec) || 0;
      if (fim > 0 && currentTime >= fim) return null;
    }
    return {
      kind: selectedElement.kind,
      region: textRegion(selectedElement.kind),
      text: selectedElement.kind === 'headline'
        ? String(alvo.text ?? (Array.isArray(alvo.lines) ? (alvo.lines as string[]).join(' ') : '')).trim()
        : null,
      altura: Number(d.height) || 1920,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveActive, liveData, selectedElement, currentTime]);

  const selectedGizmo = useMemo(() => {
    if (!liveActive || !liveData || !selectedElement) return null;
    if (selectedElement.kind !== 'splits' && selectedElement.kind !== 'inserts') return null;
    const list = liveData.editData[selectedElement.kind];
    const item = Array.isArray(list)
      ? (list as Array<Record<string, unknown>>)[selectedElement.index]
      : undefined;
    if (!item) return null;
    const start = Number(item.start);
    const end = Number.isFinite(Number(item.end)) ? Number(item.end) : start + Number(item.dur);
    if (!(currentTime >= start && currentTime < end)) return null;
    const t = (item.transform ?? {}) as { x?: number; y?: number; scale?: number; rotation?: number };
    const caixa = elementRegion(selectedElement.kind, item);
    // A caixa que o gizmo desenha e a da MIDIA VISIVEL, repetindo as decisoes
    // do template NA MESMA ORDEM: fit posiciona o desenho dentro da caixa do
    // elemento, o crop (clip-path) recorta no espaco do elemento, e o
    // transform (translate/rotate/scale sobre o centro) vem por cima. A regra
    // da casa: quem desenha por cima do render nao recalcula — repete.
    const src = String(item.src ?? '').trim();
    const dims = selectedElement.kind === 'splits' && src && item.fit === 'contain' ? mediaDimsFor(src) : null;
    let desenho = caixa;
    if (dims) {
      // contain: o desenho da midia cabe inteiro na caixa, centrado. As
      // contas em PIXELS da composicao (largura 1080), porque proporcao
      // mistura os dois eixos.
      const compW = Number(liveData.editData.width) || 1080;
      const compH = Number(liveData.editData.height) || 1920;
      const caixaPxW = caixa.w * compW;
      const caixaPxH = caixa.h * compH;
      const escala = Math.min(caixaPxW / dims.w, caixaPxH / dims.h);
      const desenhoW = (dims.w * escala) / compW;
      const desenhoH = (dims.h * escala) / compH;
      desenho = {
        x: caixa.x + (caixa.w - desenhoW) / 2,
        y: caixa.y + (caixa.h - desenhoH) / 2,
        w: desenhoW,
        h: desenhoH,
      };
    }
    // O crop recorta no espaco do ELEMENTO (a faixa/o cartao): a caixa
    // visivel e a intersecao do desenho com o retangulo interno do inset.
    const crop = (item.crop ?? {}) as { left?: number; top?: number; right?: number; bottom?: number };
    const interL = caixa.x + (Number(crop.left) || 0) * caixa.w;
    const interT = caixa.y + (Number(crop.top) || 0) * caixa.h;
    const interR = caixa.x + caixa.w - (Number(crop.right) || 0) * caixa.w;
    const interB = caixa.y + caixa.h - (Number(crop.bottom) || 0) * caixa.h;
    const visX = Math.max(desenho.x, interL);
    const visY = Math.max(desenho.y, interT);
    const visW = Math.max(0.01, Math.min(desenho.x + desenho.w, interR) - visX);
    const visH = Math.max(0.01, Math.min(desenho.y + desenho.h, interB) - visY);
    return {
      kind: selectedElement.kind,
      index: selectedElement.index,
      // A caixa do ELEMENTO continua disponivel: as alcas de recorte gravam
      // insets relativos a ela, exatamente como o clip-path le.
      element: caixa,
      region: { x: visX, y: visY, w: visW, h: visH },
      transform: { x: t.x ?? 0, y: t.y ?? 0, scale: t.scale ?? 1, rotation: t.rotation ?? 0 },
      crop: {
        left: Number(crop.left) || 0,
        top: Number(crop.top) || 0,
        right: Number(crop.right) || 0,
        bottom: Number(crop.bottom) || 0,
      },
    };
    // mediaDimsStamp entra nas dependencias porque as dimensoes chegam por
    // carga assincrona: sem ele a primeira selecao desenharia a faixa cheia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveActive, liveData, selectedElement, currentTime, mediaDimsStamp]);
  programmeRef.current = programme;
  const effectiveDuration = liveActive && liveDuration > 0
    ? liveDuration
    : mapped ? modelDuration : duration || timelineDuration || modelDuration;
  const fps = model?.fps ?? media?.fps ?? 30;
  const phase = media?.kind === 'final' || styleApplied ? 2 : 1;
  const overlays = workspace?.overlays ?? null;
  // Chip de overlay (imagem/video/animacao) posicionado pelos ranges reais.
  const renderOverlayChip = (clip: OverlayClip, index: number, className: string) => (
    <div
      key={`${className}:${index}:${clip.start}`}
      className={`timeline-chip ${className}`}
      style={{
        left: `${effectiveDuration > 0 ? (clip.start / effectiveDuration) * 100 : 0}%`,
        width: `${effectiveDuration > 0 ? Math.max(1.5, ((clip.end - clip.start) / effectiveDuration) * 100) : 0}%`,
      }}
      title={`${clip.label} · ${formatTime(clip.end - clip.start)}`}
    >
      {clip.label}
    </div>
  );
  // Chips EDITAVEIS do modo ao vivo: derivam do liveData (a mesma verdade que
  // a composicao desenha), enderecados por (kind, index) do edit-data cru —
  // o overlays do workspace achata as listas e nao daria para gravar de volta.
  type LiveChip = { kind: OverlayKind; index: number; start: number; end: number; label: string };
  const liveChips = useMemo(() => {
    if (!liveActive || !liveData) return null;
    const d = liveData.editData as Record<string, unknown>;
    // Imagem e video dividem UMA faixa: para o aluno e tudo midia da tela
    // dividida, e duas pistas obrigavam a olhar em dois lugares — pedido de
    // uso real da 0.32.
    const rows = { animations: [] as LiveChip[], media: [] as LiveChip[] };
    const push = (row: keyof typeof rows, kind: OverlayKind, index: number, item: Record<string, unknown>, fallback: string) => {
      const start = Number(item.start);
      const end = Number.isFinite(Number(item.end)) ? Number(item.end) : start + Number(item.dur);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
      const semArquivo = kind === 'splits' && String(item.src ?? '').trim() === '';
      const label = semArquivo
        ? 'Escolher mídia…'
        : String(item.label ?? '').trim()
          || (typeof item.src === 'string' ? item.src.split('/').pop() ?? '' : '')
          || fallback;
      rows[row].push({ kind, index, start, end, label });
    };
    const list = (value: unknown) => (Array.isArray(value) ? (value as Record<string, unknown>[]) : []);
    list(d.splits).forEach((item, index) => push('media', 'splits', index, item, 'Tela dividida'));
    list(d.inserts).forEach((item, index) => push('media', 'inserts', index, item, 'Insert'));
    list(d.behind).forEach((item, index) => push('animations', 'behind', index, item, 'Atrás do sujeito'));
    list(d.animations).forEach((item, index) => push('animations', 'animations', index, item, 'Animação'));
    return rows;
  }, [liveActive, liveData]);

  // --- FAIXAS DE TEXTO: legenda e headline tambem tem trim ------------------
  // Nenhuma das duas tinha janela no arquivo. A legenda valia o video inteiro
  // (chip decorativo em left:2%/width:96%, sem relacao com tempo nenhum) e a
  // headline sempre comecava no quadro 0, com so o fim ajustavel pelo hook.
  // Agora as pontas arrastam de verdade e o campo nasce no primeiro arrasto.
  const faixaTextoDragRef = useRef<{ kind: 'captions' | 'headline'; edge: 'start' | 'end'; moved: boolean } | null>(null);

  const textWindow = (kind: 'captions' | 'headline'): { start: number; end: number } => {
    const d = liveData?.editData as Record<string, unknown> | undefined;
    const alvo = (kind === 'captions' ? d?.captions : d?.hook) as Record<string, unknown> | undefined;
    const inicio = Number(alvo?.startSec);
    const fim = Number(alvo?.endSec);
    return {
      start: Number.isFinite(inicio) ? inicio : 0,
      // Sem fim declarado a legenda vale o video inteiro; a headline sem
      // endSec cai no mesmo padrao do template.
      end: Number.isFinite(fim) ? fim : (kind === 'headline' ? 4 : effectiveDuration),
    };
  };

  // Tempo sob o ponteiro, medido na pista do proprio chip: a pista cobre a
  // duracao inteira, entao a fracao horizontal E o tempo.
  const timeAtPointer = (event: { clientX: number }, lane: HTMLElement | null): number => {
    if (!lane || effectiveDuration <= 0) return 0;
    const rect = lane.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return ((event.clientX - rect.left) / rect.width) * effectiveDuration;
  };

  // --- ENCAIXE (sticky) e QUADRO --------------------------------------------
  // Duas regras que andam juntas. O quadro e a verdade do render: a timeline
  // mede em segundos fracionarios e o template converte com Math.round, entao
  // sem arredondar duas pontas que o aluno encostou na tela gravam numeros
  // diferentes e nunca encostam de verdade. O encaixe e o que torna encostar
  // POSSIVEL com o mouse: sem ele, acertar a juncao de um corte exige uma
  // precisao de meio pixel.
  const emQuadro = (time: number): number => {
    const fps = liveFpsRef.current || 30;
    return Math.round(time * fps) / fps;
  };

  // As bordas que o aluno VE sao as que grudam: comeco e fim do video, as
  // juncoes do corte, as pontas dos outros elementos e a agulha.
  const pontosDeEncaixe = (excluir?: { kind: OverlayKind; index: number }): number[] => {
    const pontos: number[] = [0, currentTime];
    if (effectiveDuration > 0) pontos.push(effectiveDuration);
    const segmentos = (liveData?.segments as { segments?: { start?: unknown; dur?: unknown }[] } | undefined)?.segments;
    for (const segmento of segmentos ?? []) {
      const inicio = Number(segmento.start);
      const dur = Number(segmento.dur);
      if (!Number.isFinite(inicio)) continue;
      pontos.push(inicio);
      if (Number.isFinite(dur)) pontos.push(inicio + dur);
    }
    for (const linha of [liveChips?.animations, liveChips?.media]) {
      for (const chip of linha ?? []) {
        if (excluir && chip.kind === excluir.kind && chip.index === excluir.index) continue;
        pontos.push(chip.start, chip.end);
      }
    }
    return pontos.filter((ponto) => Number.isFinite(ponto));
  };

  // 8px: mais que isso e a ponta gruda quando o aluno queria parar perto dela;
  // menos e impossivel de acertar com o mouse.
  const toleranciaDeEncaixe = (lane: HTMLElement | null): number => {
    const largura = lane?.getBoundingClientRect().width ?? 0;
    if (largura <= 0 || effectiveDuration <= 0) return 0;
    return (8 / largura) * effectiveDuration;
  };

  const encaixarPonta = (
    time: number,
    lane: HTMLElement | null,
    excluir?: { kind: OverlayKind; index: number },
  ): number => {
    let melhor = time;
    let menor = toleranciaDeEncaixe(lane);
    for (const ponto of pontosDeEncaixe(excluir)) {
      const distancia = Math.abs(ponto - time);
      if (distancia <= menor) {
        menor = distancia;
        melhor = ponto;
      }
    }
    return emQuadro(melhor);
  };

  // No MOVIMENTO as duas pontas procuram encaixe e vence a que precisa do
  // menor empurrao — o elemento inteiro desliza junto.
  const encaixarMovimento = (
    start: number,
    dur: number,
    lane: HTMLElement | null,
    excluir?: { kind: OverlayKind; index: number },
  ): number => {
    let ajuste = 0;
    let menor = toleranciaDeEncaixe(lane);
    for (const ponto of pontosDeEncaixe(excluir)) {
      for (const borda of [start, start + dur]) {
        const distancia = Math.abs(ponto - borda);
        if (distancia <= menor) {
          menor = distancia;
          ajuste = ponto - borda;
        }
      }
    }
    return emQuadro(start + ajuste);
  };

  const overlayOperationFor = (
    drag: NonNullable<typeof overlayDragRef.current>,
    event: { clientX: number },
    lane: HTMLElement | null,
  ): EditOperation => {
    const bruto = timeAtPointer(event, lane);
    return drag.mode === 'move'
      ? {
        op: 'move',
        kind: drag.kind,
        index: drag.index,
        start: encaixarMovimento(bruto - drag.grabOffset, drag.dur, lane, drag),
      }
      : {
        op: 'resize',
        kind: drag.kind,
        index: drag.index,
        edge: drag.mode,
        time: encaixarPonta(bruto, lane, drag),
      };
  };

  const renderLiveChip = (chip: LiveChip, className: string) => {
    const EDGE_PX = 9;
    return (
      <div
        key={`${chip.kind}:${chip.index}`}
        className={`timeline-chip ${className} editable${selectedElement && 'index' in selectedElement && selectedElement.kind === chip.kind && selectedElement.index === chip.index ? ' selected' : ''}`}
        style={{
          left: `${effectiveDuration > 0 ? (chip.start / effectiveDuration) * 100 : 0}%`,
          width: `${effectiveDuration > 0 ? Math.max(1.5, ((chip.end - chip.start) / effectiveDuration) * 100) : 0}%`,
        }}
        title={`${chip.label} · ${formatTime(chip.end - chip.start)} — arraste para mover; as pontas redimensionam`}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const alvo = event.currentTarget;
          const rect = alvo.getBoundingClientRect();
          const x = event.clientX - rect.left;
          const mode = x <= EDGE_PX ? 'start' : x >= rect.width - EDGE_PX ? 'end' : 'move';
          overlayDragRef.current = {
            kind: chip.kind,
            index: chip.index,
            mode,
            grabOffset: timeAtPointer(event, alvo.parentElement) - chip.start,
            dur: chip.end - chip.start,
            moved: false,
          };
          alvo.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const drag = overlayDragRef.current;
          if (!drag) return;
          drag.moved = true;
          applyLiveOperation(overlayOperationFor(drag, event, event.currentTarget.parentElement), false);
        }}
        onPointerUp={(event) => {
          const drag = overlayDragRef.current;
          overlayDragRef.current = null;
          if (!drag) return;
          if (!drag.moved) {
            // Clique sem arrasto SELECIONA — e SO seleciona. A agulha nao se
            // move (pedido de uso real): navegar e papel da regua e do scrub
            // na cabeca da agulha, nunca efeito colateral de selecionar.
            setSelectedElement({ kind: chip.kind, index: chip.index });
            return;
          }
          applyLiveOperation(overlayOperationFor(drag, event, event.currentTarget.parentElement), true);
        }}
        onPointerCancel={() => { overlayDragRef.current = null; }}
      >
        {chip.label}
      </div>
    );
  };

  const renderTextChip = (
    kind: 'captions' | 'headline',
    label: string,
    className: string,
    estatico: React.CSSProperties,
  ) => {
    const selecionado = selectedElement?.kind === kind;
    // Sem previa ao vivo nao ha edit-data para gravar: o chip volta a ser o
    // decorativo de antes, que ao menos seleciona.
    if (!liveActive) {
      return (
        <div
          className={`timeline-chip ${className} selectable${selecionado ? ' selected' : ''}`}
          style={estatico}
          onClick={() => setSelectedElement({ kind })}
        >{label}</div>
      );
    }
    const janela = textWindow(kind);
    const operacaoFor = (edge: 'start' | 'end', time: number): EditOperation => (
      kind === 'captions'
        ? { op: 'set-caption-window', [edge]: time } as EditOperation
        : { op: 'set-headline-window', [edge]: time } as EditOperation
    );
    const EDGE_PX = 9;
    return (
      <div
        className={`timeline-chip ${className} editable${selecionado ? ' selected' : ''}`}
        style={{
          left: `${effectiveDuration > 0 ? (janela.start / effectiveDuration) * 100 : 0}%`,
          width: `${effectiveDuration > 0 ? Math.max(1.5, ((janela.end - janela.start) / effectiveDuration) * 100) : 0}%`,
        }}
        title={`${label} · ${formatTime(janela.end - janela.start)} — as pontas ajustam quando a faixa aparece`}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const alvo = event.currentTarget;
          const rect = alvo.getBoundingClientRect();
          const x = event.clientX - rect.left;
          // So as PONTAS arrastam. O meio seleciona: mover a faixa inteira
          // deslocaria a legenda para longe das palavras que ela legenda.
          const edge = x <= EDGE_PX ? 'start' : x >= rect.width - EDGE_PX ? 'end' : null;
          if (!edge) {
            setSelectedElement({ kind });
            return;
          }
          faixaTextoDragRef.current = { kind, edge, moved: false };
          alvo.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const drag = faixaTextoDragRef.current;
          if (!drag) return;
          drag.moved = true;
          const lane = event.currentTarget.parentElement;
          applyLiveOperation(operacaoFor(drag.edge, encaixarPonta(timeAtPointer(event, lane), lane)), false);
        }}
        onPointerUp={(event) => {
          const drag = faixaTextoDragRef.current;
          faixaTextoDragRef.current = null;
          if (!drag) return;
          setSelectedElement({ kind });
          if (!drag.moved) return;
          const lane = event.currentTarget.parentElement;
          applyLiveOperation(operacaoFor(drag.edge, encaixarPonta(timeAtPointer(event, lane), lane)), true);
        }}
        onPointerCancel={() => { faixaTextoDragRef.current = null; }}
      >{label}</div>
    );
  };

  const progress = effectiveDuration > 0 ? Math.min(1, currentTime / effectiveDuration) : 0;
  const activeSource = activeSourceId ? sourceById.get(activeSourceId) ?? null : null;
  const videoSrc = mapped ? activeSource?.url ?? undefined : media?.url;
  const selectedClip = selectedClipId
    ? model?.clips.find((clip) => clip.id === selectedClipId) ?? null
    : null;
  const selectedLinkId = selectedClip?.linkId ?? null;
  const videoClips = model ? sortedTrackClips(model, VIDEO_TRACK_ID) : [];
  const voiceClips = useMemo(
    () => (model ? sortedTrackClips(model, VOICE_TRACK_ID) : []),
    [model],
  );
  const canDiscard = Boolean(
    model && baselineModelRef.current && !modelsEqual(model, baselineModelRef.current),
  );

  // Ondas sonoras: os picos vêm do main uma vez por fonte e cada clipe recorta
  // o próprio trecho. null marca fonte sem áudio (não insiste de novo).
  const [waveforms, setWaveforms] = useState<Record<string, SourceWaveform | null>>({});
  const requestedWaveformsRef = useRef<Set<string>>(new Set());
  const workspaceDirectory = workspace?.project.directory ?? null;

  useEffect(() => {
    requestedWaveformsRef.current.clear();
    setWaveforms({});
  }, [workspaceDirectory]);

  useEffect(() => {
    for (const clip of voiceClips) {
      const sourceId = clip.sourceId;
      if (requestedWaveformsRef.current.has(sourceId)) continue;
      const url = sourceById.get(sourceId)?.url;
      if (!url) continue;
      requestedWaveformsRef.current.add(sourceId);
      void window.edvidDesktop.getSourceWaveform(url)
        .then((waveform) => setWaveforms((current) => ({ ...current, [sourceId]: waveform })))
        .catch(() => setWaveforms((current) => ({ ...current, [sourceId]: null })));
    }
  }, [voiceClips, sourceById]);

  const waveformPaths = useMemo(() => {
    const paths = new Map<string, string>();
    for (const clip of voiceClips) {
      const waveform = waveforms[clip.sourceId];
      if (!waveform || waveform.peaks.length === 0) continue;
      const speed = clip.speed || 1;
      const start = clip.sourceIn;
      const end = clip.sourceIn + clipDuration(clip) * speed;
      const buckets = waveform.bucketsPerSecond;
      const first = Math.max(0, Math.floor(start * buckets));
      const last = Math.min(waveform.peaks.length, Math.ceil(end * buckets));
      const available = last - first;
      if (available < 2) continue;
      const count = Math.min(240, available);
      const top: string[] = [];
      const bottom: string[] = [];
      for (let index = 0; index < count; index += 1) {
        const bucket = first + Math.floor(((available - 1) * index) / (count - 1));
        const amplitude = Math.max(0.03, Math.min(1, waveform.peaks[bucket] ?? 0));
        const x = ((index / (count - 1)) * 100).toFixed(2);
        top.push(`${index === 0 ? 'M' : 'L'}${x} ${(16 - amplitude * 13).toFixed(2)}`);
        bottom.push(`L${x} ${(16 + amplitude * 13).toFixed(2)}`);
      }
      bottom.reverse();
      paths.set(clip.id, `${top.join(' ')} ${bottom.join(' ')} Z`);
    }
    return paths;
  }, [voiceClips, waveforms]);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    currentTimeRef.current = 0;
    setCurrentTime(0);
    setPlaying(false);
    setMarkIn(null);
    setDraftRange(null);
    setDraftNote('');
    setSelectedClipId(null);
    setZoom(1);
    setActiveSourceId(null);
    setInGap(false);
    inGapRef.current = false;
    activeSourceIdRef.current = null;
    correctionHistoryRef.current = [];
    modelHistoryRef.current = [];
    modelFutureRef.current = [];
    actionOrderRef.current = [];
    trimDragRef.current = null;
    mappedIndexRef.current = -1;
    gapClockRef.current = null;
    pendingVideoSeekRef.current = null;
    setDuration(media?.duration ?? timelineDuration);
    // Reset apenas na troca de projeto/mídia (o token muda a cada carga);
    // edições do modelo alteram a duração e não podem limpar o histórico.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadKey]);

  function syncCurrentTime(value: number) {
    currentTimeRef.current = value;
    setCurrentTime(value);
  }

  function setGap(value: boolean) {
    inGapRef.current = value;
    setInGap(value);
  }

  function sourceUrlOf(sourceId: string | null): string | null {
    if (!sourceId) return null;
    return sourceById.get(sourceId)?.url ?? null;
  }

  function setVideoToProgramme(index: number, sourceTime: number, resume: boolean) {
    const segment = programmeRef.current[index];
    if (!segment) return;
    mappedIndexRef.current = index;
    setGap(false);
    const nextUrl = sourceUrlOf(segment.sourceId);
    const currentUrl = activeSourceIdRef.current
      ? sourceUrlOf(activeSourceIdRef.current)
      : media?.url ?? null;
    activeSourceIdRef.current = segment.sourceId;
    setActiveSourceId(segment.sourceId);
    const video = videoRef.current;
    if (video) video.playbackRate = segment.speed || 1;
    if (nextUrl && nextUrl !== currentUrl) {
      // O src muda; o seek acontece quando os novos metadados carregarem.
      pendingVideoSeekRef.current = { sourceTime, resume };
      return;
    }
    if (!video) return;
    try {
      video.currentTime = sourceTime;
    } catch {
      // A agulha continua responsiva enquanto os metadados carregam.
    }
    if (resume) void video.play().catch(() => setPlaying(false));
  }
  setVideoToProgrammeRef.current = setVideoToProgramme;

  // Rede de segurança do modo mapeado. O motor de rAF só roda enquanto o
  // React acha que está tocando; se o elemento voltar a tocar por fora desse
  // estado (retomada do navegador, promessa de play resolvendo tarde), o
  // motor não existe para segurar o corte e o arquivo-fonte corre inteiro.
  // O timeupdate vem do próprio elemento, então o limite vale sempre.
  function enforceMappedBoundary(video: HTMLVideoElement): void {
    if (!mappedRef.current || inGapRef.current) return;
    // Um seek em voo (troca de fonte pendente ou busca num arquivo grande)
    // ainda reporta o tempo antigo; tratar isso como "passou do fim" fazia a
    // borda avançar de segmento sozinha no meio de um clique na timeline.
    if (pendingVideoSeekRef.current || video.seeking) return;
    const currentProgramme = programmeRef.current;
    const index = mappedIndexRef.current;
    const segment = index >= 0 ? currentProgramme[index] : undefined;
    if (!segment) {
      video.pause();
      return;
    }
    const speed = segment.speed || 1;
    const sourceEnd = segment.sourceIn + (segment.timelineEnd - segment.timelineStart) * speed;
    // Só age quando o tempo PASSOU do fim do segmento. Antes do início não é
    // estouro: é um seek aterrissando.
    if (video.currentTime < sourceEnd - 0.01) {
      return;
    }
    const nextSegment = currentProgramme[index + 1];
    if (!nextSegment) {
      video.pause();
      syncCurrentTime(segment.timelineEnd);
      setPlaying(false);
      return;
    }
    if (nextSegment.timelineStart - segment.timelineEnd > 0.02) {
      inGapRef.current = true;
      setInGap(true);
      gapClockRef.current = null;
      mappedIndexRef.current = index + 1;
      video.pause();
      syncCurrentTime(segment.timelineEnd);
      return;
    }
    syncCurrentTime(nextSegment.timelineStart);
    setVideoToProgrammeRef.current(index + 1, nextSegment.sourceIn, !video.paused);
  }

  function seek(value: number) {
    const nextTime = Math.max(0, Math.min(value, effectiveDuration || 0));
    syncCurrentTime(nextTime);
    if (liveActiveRef.current) {
      livePlayerRef.current?.seekTo(Math.round(nextTime * liveFpsRef.current));
      return;
    }
    if (!mapped) {
      if (videoRef.current) {
        try {
          videoRef.current.currentTime = nextTime;
        } catch {
          // O estado da agulha continua responsivo enquanto os metadados carregam.
        }
      }
      return;
    }
    const currentProgramme = programmeRef.current;
    const index = programmeIndexAt(currentProgramme, nextTime);
    if (index >= 0) {
      const segment = currentProgramme[index];
      setVideoToProgramme(
        index,
        segment.sourceIn + (nextTime - segment.timelineStart) * segment.speed,
        playingRef.current,
      );
      return;
    }
    mappedIndexRef.current = nextProgrammeIndexAfter(currentProgramme, nextTime);
    gapClockRef.current = null;
    setGap(mappedIndexRef.current >= 0);
    videoRef.current?.pause();
  }
  seekRef.current = seek;

  async function togglePlayback() {
    if (liveActiveRef.current) {
      livePlayerRef.current?.toggle();
      return;
    }
    if (mappedRef.current) {
      if (playingRef.current) {
        setPlaying(false);
        playingRef.current = false;
        // Uma troca de fonte em andamento não pode retomar contra esta pausa.
        if (pendingVideoSeekRef.current) {
          pendingVideoSeekRef.current = { ...pendingVideoSeekRef.current, resume: false };
        }
        videoRef.current?.pause();
        return;
      }
      const currentProgramme = programmeRef.current;
      if (currentProgramme.length === 0) return;
      const atEnd = currentTimeRef.current >= (effectiveDuration || 0) - 0.05;
      const target = atEnd ? 0 : currentTimeRef.current;
      syncCurrentTime(target);
      const index = programmeIndexAt(currentProgramme, target);
      if (index >= 0) {
        setPlaying(true);
        playingRef.current = true;
        const segment = currentProgramme[index];
        setVideoToProgramme(
          index,
          segment.sourceIn + (target - segment.timelineStart) * segment.speed,
          true,
        );
      } else {
        const nextIndex = nextProgrammeIndexAfter(currentProgramme, target);
        if (nextIndex < 0) return; // depois do último take não há o que tocar
        setPlaying(true);
        playingRef.current = true;
        mappedIndexRef.current = nextIndex;
        gapClockRef.current = null;
        setGap(true);
      }
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      try {
        await video.play();
      } catch {
        setPlaying(false);
      }
    } else {
      video.pause();
    }
  }

  function jumpBy(seconds: number) {
    seek(currentTimeRef.current + seconds);
  }

  function stepByFrames(frames: number) {
    // O ref é atualizado na hora: o seek abaixo não pode "retomar" a
    // reprodução por ler um playingRef ainda não sincronizado pelo efeito.
    setPlaying(false);
    playingRef.current = false;
    videoRef.current?.pause();
    livePlayerRef.current?.pause();
    const stepFps = liveActiveRef.current ? liveFpsRef.current : Math.max(fps, 1);
    seek(currentTimeRef.current + frames / stepFps);
  }

  function toggleMute() {
    if (liveActiveRef.current) {
      const player = livePlayerRef.current;
      if (!player) return;
      if (player.isMuted()) player.unmute();
      else player.mute();
      setMuted(player.isMuted());
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  }

  // A PREVIA devolve o estado para a timeline: agulha segue o quadro, o botao
  // de play espelha o player, e o fim volta o botao para play. Sem este
  // efeito a agulha ficava morta no modo ao vivo — a metade que faltava do
  // relato "o play da timeline parou de funcionar".
  useEffect(() => {
    if (!liveActive) return;
    const player = livePlayerRef.current;
    if (!player) return;
    // Entrar no modo ao vivo carrega a posicao atual da agulha: o aluno
    // continua olhando o MESMO instante, so que agora montado ao vivo.
    player.seekTo(Math.round(currentTimeRef.current * liveFpsRef.current));
    // POLLING, nao eventos. Os comandos do PlayerRef funcionam (play, seek),
    // mas o addEventListener dele ficou mudo neste arranjo — medido na
    // bancada: video andando e nenhum frameupdate entregue. Um raf lendo
    // getCurrentFrame()/isPlaying() nao depende do emissor de ninguem, e e o
    // mesmo custo de um listener de frame.
    // setInterval e nao requestAnimationFrame: rAF PARA em janela oculta, e a
    // agulha congelaria sempre que o app perdesse o foco — na bancada foi
    // exatamente assim que o espelho "nao funcionava" sem nenhum erro.
    const tick = () => {
      const current = livePlayerRef.current;
      if (!current) return;
      const seconds = current.getCurrentFrame() / liveFpsRef.current;
      if (Math.abs(seconds - currentTimeRef.current) > 0.0005) {
        currentTimeRef.current = seconds;
        setCurrentTime(seconds);
      }
      const isPlaying = current.isPlaying();
      if (isPlaying !== playingRef.current) {
        playingRef.current = isPlaying;
        setPlaying(isPlaying);
      }
    };
    const handle = window.setInterval(tick, 33);
    return () => {
      window.clearInterval(handle);
      player.pause();
    };
    // liveReady re-executa quando o Player monta de verdade (import dinamico).
  }, [liveActive, liveReady]);

  // APAGAR o elemento selecionado com Delete/Backspace. Item de lista some;
  // legenda/headline/trilha viram enabled:false — reversivel e o que o
  // template entende. Nao dispara quando o foco esta num campo de texto.
  useEffect(() => {
    if (!liveActive || !selectedElement) return;
    const aoTeclar = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      const foco = document.activeElement as HTMLElement | null;
      if (foco && (foco.tagName === 'INPUT' || foco.tagName === 'TEXTAREA' || foco.isContentEditable)) return;
      event.preventDefault();
      const operacao: EditOperation = 'index' in selectedElement
        ? { op: 'remove', kind: selectedElement.kind, index: selectedElement.index }
        : {
            op: 'disable',
            kind: selectedElement.kind === 'headline' ? 'hook' : selectedElement.kind,
          };
      applyLiveOperation(operacao, true);
      setSelectedElement(null);
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveActive, selectedElement]);

  // Trocar de preview nao pode deixar os DOIS tocando: o que sai, pausa.
  useEffect(() => {
    if (liveActive) {
      videoRef.current?.pause();
      setPlaying(false);
    } else {
      livePlayerRef.current?.pause();
    }
  }, [liveActive]);

  // Motor de reprodução: no modo normal a agulha segue o vídeo; no modo
  // mapeado o vídeo pula entre segmentos e um relógio próprio cobre os vazios.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    gapClockRef.current = null;
    const updatePlayhead = (timestamp: number) => {
      const video = videoRef.current;
      if (!mappedRef.current) {
        if (video) syncCurrentTime(video.currentTime);
      } else {
        const currentProgramme = programmeRef.current;
        const index = mappedIndexRef.current;
        if (inGapRef.current) {
          const previous = gapClockRef.current ?? timestamp;
          gapClockRef.current = timestamp;
          const nextTime = currentTimeRef.current + (timestamp - previous) / 1000;
          const segment = index >= 0 ? currentProgramme[index] : undefined;
          if (segment && nextTime >= segment.timelineStart) {
            syncCurrentTime(segment.timelineStart);
            setVideoToProgrammeRef.current(index, segment.sourceIn, true);
          } else if (!segment) {
            inGapRef.current = false;
            setInGap(false);
            setPlaying(false);
          } else {
            syncCurrentTime(nextTime);
          }
        } else if (video && index >= 0) {
          const segment = currentProgramme[index];
          const speed = segment.speed || 1;
          const sourceEnd = segment.sourceIn + (segment.timelineEnd - segment.timelineStart) * speed;
          if (video.currentTime >= sourceEnd - 0.03 || video.ended) {
            const nextSegment = currentProgramme[index + 1];
            if (!nextSegment) {
              video.pause();
              syncCurrentTime(segment.timelineEnd);
              setPlaying(false);
            } else if (nextSegment.timelineStart - segment.timelineEnd > 0.02) {
              inGapRef.current = true;
              setInGap(true);
              gapClockRef.current = null;
              mappedIndexRef.current = index + 1;
              video.pause();
              syncCurrentTime(segment.timelineEnd);
            } else {
              syncCurrentTime(nextSegment.timelineStart);
              setVideoToProgrammeRef.current(index + 1, nextSegment.sourceIn, true);
            }
          } else {
            const mappedTime = segment.timelineStart + (video.currentTime - segment.sourceIn) / speed;
            syncCurrentTime(Math.min(Math.max(mappedTime, segment.timelineStart), segment.timelineEnd));
          }
        } else if (index < 0) {
          // Sem segmento ativo nem gap: nada a reproduzir. Pausar o elemento
          // aqui e essencial — parar so o motor deixava o <video> correndo
          // sozinho pelo arquivo-fonte, exibindo o material bruto sem cortes.
          video?.pause();
          setPlaying(false);
        }
      }
      frame = window.requestAnimationFrame(updatePlayhead);
    };
    frame = window.requestAnimationFrame(updatePlayhead);
    return () => window.cancelAnimationFrame(frame);
  }, [playing]);

  // Invariante do transporte: parado significa vídeo parado. No modo mapeado
  // quem manda no <video> é o motor; sem isto, qualquer caminho que encerre o
  // motor sem pausar deixa o arquivo-fonte tocando inteiro por conta própria.
  useEffect(() => {
    if (!playing) videoRef.current?.pause();
  }, [playing]);

  // Ao entrar/sair do modo mapeado, realinha o vídeo com a agulha.
  useEffect(() => {
    if (mapped) {
      // Entrada (inclusive durante reprodução, ex.: razor com o vídeo
      // tocando): configura fonte e índice imediatamente; o seek retoma a
      // reprodução quando playingRef indicar.
      seekRef.current(currentTimeRef.current);
      return;
    }
    inGapRef.current = false;
    setInGap(false);
    setActiveSourceId(null);
    activeSourceIdRef.current = null;
    pendingVideoSeekRef.current = { sourceTime: currentTimeRef.current, resume: false };
    const video = videoRef.current;
    if (video) {
      try {
        video.currentTime = currentTimeRef.current;
      } catch {
        // O seek pendente cobre o caso de metadados ainda carregando.
      }
    }
  }, [mapped]);

  useEffect(() => {
    if (mapped && !playingRef.current && !trimDragRef.current) {
      seekRef.current(currentTimeRef.current);
    }
  }, [programme, mapped]);

  function seekTimelineAt(clientX: number, timeline: HTMLDivElement) {
    if (effectiveDuration <= 0) return;
    const rect = timeline.getBoundingClientRect();
    const laneStart = TIMELINE_LANE_START;
    const laneEndPadding = 0;
    const laneWidth = Math.max(1, rect.width - laneStart - laneEndPadding);
    const pointer = clientX - rect.left - laneStart;
    const bruto = (Math.max(0, Math.min(pointer, laneWidth)) / laneWidth) * effectiveDuration;
    // A AGULHA GRUDA NAS PONTAS dos elementos e nas juncoes do corte. E o que
    // torna "parar exatamente onde a midia comeca" um gesto, e nao uma
    // pontaria — e a tesoura por elemento depende disso para cortar onde o
    // aluno esta vendo que vai cortar.
    if (!liveActive) {
      seek(bruto);
      return;
    }
    let melhor = bruto;
    let menor = laneWidth > 0 ? (8 / laneWidth) * effectiveDuration : 0;
    for (const ponto of pontosDeEncaixe()) {
      const distancia = Math.abs(ponto - bruto);
      if (distancia <= menor) {
        menor = distancia;
        melhor = ponto;
      }
    }
    seek(emQuadro(melhor));
  }

  function beginTimelineSeek(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || trimDragRef.current) return;
    event.currentTarget.focus({ preventScroll: true });
    // Clicar no vazio limpa a selecao; clicar num clipe mantem o que o
    // proprio clipe acabou de selecionar.
    const target = event.target as HTMLElement;
    if (!target.closest('.timeline-clip')) {
      setSelectedClipId(null);
    }
    // Clicar no VAZIO da timeline desseleciona. Sem isto a unica saida da
    // selecao era selecionar outra coisa, e o gizmo ficava no palco enquanto o
    // aluno tentava so mexer a agulha.
    //
    // Os CONTROLES ficam de fora. A tesoura vive dentro desta area, e o
    // pointerdown dela chegava aqui antes do clique: a selecao era limpa e o
    // corte que devia partir o elemento partia a tomada inteira. Medido na
    // bancada — o take foi de 3 para 8 clipes com uma midia selecionada.
    // A REGUA e a AGULHA tambem ficam de fora: posicionar a agulha e parte de
    // mirar o corte no elemento selecionado, nao um jeito de largar a selecao.
    // Com a regua limpando, o fluxo "seleciona a midia, leva a agulha ate o
    // ponto, corta" era impossivel — media na bancada, a tomada e que era
    // cortada.
    if (!target.closest('.timeline-chip, button, .timeline-ruler, .timeline-playhead')) {
      setSelectedElement(null);
    }
    // A AGULHA so anda pela REGUA ou pela propria cabeca (pedido de uso real
    // da 0.29: clicar num chip para selecionar tambem movia a agulha, e
    // selecionar nao e navegar). O corpo das pistas seleciona e arrasta —
    // nunca faz seek.
    if (!target.closest('.timeline-ruler') && !target.closest('.timeline-playhead')) {
      return;
    }
    // A captura e para o SCRUB (continuar arrastando fora do elemento); se
    // falhar, o clique simples ainda tem de posicionar a agulha.
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Sem captura o arrasto para na borda; o clique funciona igual.
    }
    timelineSeekPointerRef.current = event.pointerId;
    seekTimelineAt(event.clientX, event.currentTarget);
  }

  function continueTimelineSeek(event: ReactPointerEvent<HTMLDivElement>) {
    if (trimDragRef.current) return;
    // Só faz scrubbing de um gesto iniciado na própria timeline; sem isso um
    // clique num clipe (que não captura) viraria seek ao mover o ponteiro.
    if (timelineSeekPointerRef.current !== event.pointerId) return;
    seekTimelineAt(event.clientX, event.currentTarget);
  }

  function endTimelineSeek(event: ReactPointerEvent<HTMLDivElement>) {
    if (timelineSeekPointerRef.current === event.pointerId) {
      timelineSeekPointerRef.current = null;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function setInPoint() {
    if (!media || dirty) return;
    setMarkIn(currentTimeRef.current);
  }

  function setOutPoint() {
    const outPoint = currentTimeRef.current;
    if (markIn === null || outPoint <= markIn) return;
    videoRef.current?.pause();
    setDraftRange({ start: markIn, end: outPoint });
    setDraftNote('');
    setMarkIn(null);
  }

  function saveDraftCorrection(event: FormEvent) {
    event.preventDefault();
    if (!draftRange || !draftNote.trim()) return;
    commitCorrections([
      ...corrections,
      {
        id: `correction:${Date.now()}`,
        start: draftRange.start,
        end: draftRange.end,
        note: draftNote.trim(),
      },
    ]);
    setDraftRange(null);
    setDraftNote('');
  }

  function commitCorrections(next: CorrectionRange[]) {
    correctionHistoryRef.current.push(corrections);
    actionOrderRef.current.push('corrections');
    onCorrectionsChange(next);
  }

  function deleteCorrection(id: string) {
    commitCorrections(corrections.filter((correction) => correction.id !== id));
  }

  function commitModel(next: TimelineModel, before: TimelineModel | null = modelRef.current) {
    if (!before || modelsEqual(before, next)) {
      onTimelineModelChange(next, true);
      return;
    }
    modelHistoryRef.current.push(before);
    modelFutureRef.current = [];
    actionOrderRef.current.push('model');
    onTimelineModelChange(next, true);
  }

  function undoModelEdit() {
    const previous = modelHistoryRef.current.pop();
    const current = modelRef.current;
    if (!previous || !current) return;
    modelFutureRef.current.push(current);
    onTimelineModelChange(previous, true);
  }

  function redoModelEdit() {
    const next = modelFutureRef.current.pop();
    const current = modelRef.current;
    if (!next || !current) return;
    modelHistoryRef.current.push(current);
    actionOrderRef.current.push('model');
    onTimelineModelChange(next, true);
  }

  function undoTimelineAction() {
    if (draftRange) {
      setMarkIn(draftRange.start);
      setDraftRange(null);
      setDraftNote('');
      return;
    }
    if (markIn !== null) {
      setMarkIn(null);
      return;
    }
    const lastAction = actionOrderRef.current.pop();
    if (lastAction === 'model') {
      undoModelEdit();
      return;
    }
    if (lastAction === 'corrections') {
      const previous = correctionHistoryRef.current.pop();
      if (previous) onCorrectionsChange(previous);
    }
  }

  // A agulha esta DENTRO do elemento selecionado com folga para as duas
  // metades? E o que decide se a tesoura corta o elemento ou a tomada.
  const cortavelNaAgulha = (() => {
    if (!liveActive || !selectedElement || !('index' in selectedElement)) return false;
    const lista = (liveData?.editData as Record<string, unknown> | undefined)?.[selectedElement.kind];
    const item = Array.isArray(lista) ? (lista as Record<string, unknown>[])[selectedElement.index] : undefined;
    if (!item) return false;
    const start = Number(item.start);
    const end = Number.isFinite(Number(item.end)) ? Number(item.end) : start + Number(item.dur);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
    return currentTime - start >= 0.2 && end - currentTime >= 0.2;
  })();

  function razorAtPlayhead() {
    // COM ELEMENTO SELECIONADO a tesoura corta SO ele: uma midia vira duas
    // midias, com o mesmo arquivo. Cortar a tomada inteira quando o aluno tem
    // uma imagem selecionada era o comportamento errado — ele estava olhando
    // para a imagem.
    if (cortavelNaAgulha && selectedElement && 'index' in selectedElement) {
      applyLiveOperation(
        { op: 'split-at', kind: selectedElement.kind, index: selectedElement.index, time: currentTimeRef.current },
        true,
      );
      return;
    }
    // Elemento selecionado que a agulha nao alcanca: nao corta NADA. Cair na
    // tomada aqui seria cortar o que ele nao esta olhando.
    if (liveActive && selectedElement) return;
    const current = modelRef.current;
    if (!current) return;
    const next = razorAtTime(current, currentTimeRef.current);
    if (next) commitModel(next);
  }

  function deleteSelectedClip(leaveGap: boolean) {
    const current = modelRef.current;
    if (!current || !selectedClipId) return;
    const next = leaveGap
      ? deleteClipLeaveGap(current, selectedClipId)
      : rippleDeleteClip(current, selectedClipId);
    if (next) {
      setSelectedClipId(null);
      commitModel(next);
    }
  }

  function discardTimelineEdits() {
    const baseline = baselineModelRef.current;
    if (!baseline) return;
    setSelectedClipId(null);
    commitModel(baseline);
  }

  function beginTrim(event: ReactPointerEvent<HTMLElement>, clip: TimelineClip, edge: TrimEdge) {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    const current = modelRef.current;
    if (!current) return;
    setPlaying(false);
    playingRef.current = false;
    videoRef.current?.pause();
    const lane = (event.currentTarget as HTMLElement).closest('.studio-lane');
    const laneWidth = Math.max(1, lane?.getBoundingClientRect().width ?? 1);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Sem captura o arrasto ainda funciona enquanto o ponteiro estiver
      // sobre a alça; perder o capture não pode abortar o trim inteiro.
    }
    trimDragRef.current = {
      clipId: clip.id,
      edge,
      baseModel: current,
      originX: event.clientX,
      secondsPerPixel: (effectiveDuration || 1) / laneWidth,
      appliedDelta: 0,
    };
  }

  function moveTrim(event: ReactPointerEvent<HTMLElement>) {
    const drag = trimDragRef.current;
    if (!drag) return;
    event.stopPropagation();
    const allowed = trimAllowedDelta(drag.baseModel, drag.clipId, drag.edge, sourceDurations);
    const baseClip = drag.baseModel.clips.find((clip) => clip.id === drag.clipId);
    if (!allowed || !baseClip) return;
    const rawDelta = (event.clientX - drag.originX) * drag.secondsPerPixel;
    let delta = Math.max(allowed.min, Math.min(rawDelta, allowed.max));
    const excludeIds = new Set([baseClip.id]);
    if (baseClip.linkId) {
      for (const clip of drag.baseModel.clips) {
        if (clip.linkId === baseClip.linkId) excludeIds.add(clip.id);
      }
    }
    const edgeTime = drag.edge === 'start'
      ? baseClip.timelineStart + delta
      : clipEnd(baseClip) + delta;
    const snapped = snapTime(
      edgeTime,
      [...snapCandidateTimes(drag.baseModel, excludeIds), currentTimeRef.current],
      8 * drag.secondsPerPixel,
    );
    // O trim da tomada ja grudava; o que faltava era cair em QUADRO. Sem isto
    // a ponta parava em 3,4831s, o corte real acontecia no quadro 104 e o
    // numero guardado nunca era o que o render usava.
    const fpsDoCorte = drag.baseModel.fps || 30;
    const emQuadro = Math.round(snapped * fpsDoCorte) / fpsDoCorte;
    delta = Math.max(
      allowed.min,
      Math.min(
        drag.edge === 'start' ? emQuadro - baseClip.timelineStart : emQuadro - clipEnd(baseClip),
        allowed.max,
      ),
    );
    // Na borda inicial a prévia acompanha o ponteiro (abre espaço); o ripple
    // fecha o espaço ao soltar. Na borda final o ripple já acontece ao vivo.
    const preview = applyTrim(drag.baseModel, drag.clipId, drag.edge, delta, sourceDurations, {
      ripple: drag.edge === 'end',
    });
    drag.appliedDelta = preview.applied;
    onTimelineModelChange(preview.model, false);
  }

  function endTrim(event: ReactPointerEvent<HTMLElement>) {
    const drag = trimDragRef.current;
    if (!drag) return;
    event.stopPropagation();
    trimDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (Math.abs(drag.appliedDelta) < 0.001) {
      onTimelineModelChange(drag.baseModel, false);
      return;
    }
    const final = applyTrim(
      drag.baseModel,
      drag.clipId,
      drag.edge,
      drag.appliedDelta,
      sourceDurations,
      { ripple: true },
    );
    commitModel(final.model, drag.baseModel);
  }

  function changeZoom(nextZoom: number, anchorClientX?: number) {
    // Fracionário por causa da pinça do trackpad; botões continuam em passos.
    const clamped = Math.max(1, Math.min(8, Math.round(nextZoom * 100) / 100));
    if (clamped === zoomStateRef.current) return;
    const scroller = scrollRef.current;
    const content = contentRef.current;
    if (scroller && content) {
      const width = content.getBoundingClientRect().width;
      if (anchorClientX !== undefined) {
        // Pinça: o ponto da timeline sob o cursor permanece parado.
        const contentX = anchorClientX - content.getBoundingClientRect().left;
        const lane = Math.max(1, width - TIMELINE_LANE_START);
        const pointerProgress = Math.min(1, Math.max(0, (contentX - TIMELINE_LANE_START) / lane));
        zoomAnchorRef.current = {
          progress: pointerProgress,
          viewportX: anchorClientX - scroller.getBoundingClientRect().left,
        };
      } else {
        const playheadX = TIMELINE_LANE_START + progress * Math.max(0, width - TIMELINE_LANE_START);
        zoomAnchorRef.current = { progress, viewportX: playheadX - scroller.scrollLeft };
      }
    }
    setZoom(clamped);
  }

  // Zoom ancorado na agulha: mantém a agulha no mesmo ponto do viewport.
  useLayoutEffect(() => {
    zoomStateRef.current = zoom;
    const anchor = zoomAnchorRef.current;
    zoomAnchorRef.current = null;
    if (!anchor) return;
    const scroller = scrollRef.current;
    const content = contentRef.current;
    if (!scroller || !content) return;
    const width = content.getBoundingClientRect().width;
    const playheadX = TIMELINE_LANE_START + anchor.progress * Math.max(0, width - TIMELINE_LANE_START);
    scroller.scrollLeft = Math.max(0, playheadX - anchor.viewportX);
  }, [zoom]);

  // Pinça do trackpad: o Chromium entrega o gesto como wheel com ctrlKey.
  // Listener nativo com passive: false — o onWheel do React não permite
  // preventDefault e a página daria zoom inteira.
  pinchZoomRef.current = (event: WheelEvent) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    changeZoom(zoomStateRef.current * Math.exp(-event.deltaY * 0.01), event.clientX);
  };
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const listener = (event: WheelEvent) => pinchZoomRef.current(event);
    scroller.addEventListener('wheel', listener, { passive: false });
    return () => scroller.removeEventListener('wheel', listener);
  }, []);

  async function applyCorrections() {
    if (corrections.length === 0) return;
    if (await onApplyCorrections(corrections)) {
      onCorrectionsChange([]);
      correctionHistoryRef.current = [];
      setMarkIn(null);
    }
  }

  useEffect(() => {
    const handleEditorShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('textarea, input, [contenteditable="true"]')) return;
      // Durante um trim, teclas que desmontariam o handle capturado (Escape,
      // Delete...) deixariam o drag órfão. Escape cancela o trim; o resto espera.
      if (trimDragRef.current) {
        if (event.key === 'Escape') {
          event.preventDefault();
          onTimelineModelChange(trimDragRef.current.baseModel, false);
          trimDragRef.current = null;
        }
        return;
      }
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === 'z' && !event.altKey) {
        event.preventDefault();
        if (event.shiftKey) redoModelEdit();
        else undoTimelineAction();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.code === 'Space') {
        event.preventDefault();
        if (!event.repeat) void togglePlayback();
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        stepByFrames(event.key === 'ArrowLeft' ? -1 : 1);
        return;
      }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        if (!selectedClipId) return;
        event.preventDefault();
        deleteSelectedClip(event.shiftKey);
        return;
      }
      if (event.key === 'Escape') {
        if (draftRange) {
          setDraftRange(null);
          setDraftNote('');
        } else {
          setSelectedClipId(null);
        }
        return;
      }
      if (key === 'c') {
        event.preventDefault();
        razorAtPlayhead();
        return;
      }
      if (key === '=' || key === '+') {
        event.preventDefault();
        changeZoom(Math.round(zoom) + 1);
        return;
      }
      if (key === '-') {
        event.preventDefault();
        changeZoom(Math.round(zoom) - 1);
        return;
      }
      if (key === '0') {
        event.preventDefault();
        changeZoom(1);
        return;
      }
      if (key === 'm') {
        event.preventDefault();
        if (markIn === null) setInPoint();
        else setOutPoint();
      } else if (key === 'i') {
        event.preventDefault();
        setInPoint();
      } else if (key === 'o') {
        event.preventDefault();
        setOutPoint();
      }
    };
    window.addEventListener('keydown', handleEditorShortcut);
    return () => window.removeEventListener('keydown', handleEditorShortcut);
  }, [corrections, draftRange, markIn, media?.fps, media?.url, model, selectedClipId, dirty, zoom, mapped, effectiveDuration, fps]);

  const trackStyle = {
    '--timeline-playhead-left': timelinePoint(progress),
  } as CSSProperties;
  const orientation = media?.orientation ?? 'horizontal';
  const displayedSegments = model
    ? deriveSegments(model)
    : timelineSegments.length > 0
      ? timelineSegments
      : [{
          label: media?.name ?? 'Vídeo',
          start: 0,
          duration: effectiveDuration || 1,
          audioStart: 0,
          audioDuration: effectiveDuration || 1,
        }];
  // Com J-Cut os clipes de Voz se sobrepõem nas junções (o áudio da cena
  // seguinte entra antes do corte); o xadrez em duas faixas Voz A/Voz B é o
  // que torna a sobreposição visível na timeline.
  const voiceOverlapping = model
    ? voiceClips.some((clip, index) => index > 0 && clip.timelineStart < clipEnd(voiceClips[index - 1]) - 0.005)
    : displayedSegments.some((segment) => (segment.audioStart ?? segment.start) < segment.start - 0.005);
  const rulerTicks = useMemo(() => {
    if (!(effectiveDuration > 0)) return [0];
    // Passo mínimo de 1s: formatTime não tem precisão sub-segundo.
    const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
    const ideal = effectiveDuration / (4 * zoom);
    const step = steps.find((candidate) => candidate >= ideal) ?? 900;
    const ticks: number[] = [];
    for (let tick = 0; tick <= effectiveDuration - step * 0.35; tick += step) {
      ticks.push(round3(tick));
    }
    ticks.push(round3(effectiveDuration));
    return ticks;
  }, [effectiveDuration, zoom]);

  function renderModelClip(clip: TimelineClip, index: number, kindClass: string) {
    const left = effectiveDuration > 0 ? (clip.timelineStart / effectiveDuration) * 100 : 0;
    const widthPct = effectiveDuration > 0
      ? (clipDuration(clip) / effectiveDuration) * 100
      : 100;
    const isSelected = clip.id === selectedClipId;
    const isLinkedSelected = !isSelected && selectedLinkId !== null && clip.linkId === selectedLinkId;
    return (
      <div
        className={`timeline-clip ${kindClass} ${index % 2 ? 'alt' : ''} ${isSelected ? 'selected' : ''} ${isLinkedSelected ? 'linked-selected' : ''} ${clip.enabled ? '' : 'disabled'}`}
        key={clip.id}
        style={{ left: `${left}%`, width: `calc(${Math.max(widthPct, 0.4)}% - 2px)` }}
        title={`${clip.label} · ${formatTime(clipDuration(clip))}`}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          // Sem stopPropagation: o clique tambem chega a timeline e leva a
          // agulha ate ele, como em qualquer ponto da régua ou das pistas.
          setSelectedClipId(clip.id);
        }}
      >
        {waveformPaths.has(clip.id) && (
          <svg className="clip-waveform" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
            <path d={waveformPaths.get(clip.id)} />
          </svg>
        )}
        <span className="clip-label">{clip.label}</span>
        {isSelected && (
          <>
            <span
              className="clip-handle left"
              title="Ajustar início do take (arraste)"
              onPointerDown={(event) => beginTrim(event, clip, 'start')}
              onPointerMove={moveTrim}
              onPointerUp={endTrim}
              onPointerCancel={endTrim}
            />
            <span
              className="clip-handle right"
              title="Ajustar fim do take (arraste)"
              onPointerDown={(event) => beginTrim(event, clip, 'end')}
              onPointerMove={moveTrim}
              onPointerUp={endTrim}
              onPointerCancel={endTrim}
            />
          </>
        )}
      </div>
    );
  }

  return (
    <div className={`editor-workspace ${orientation}`}>
      <section className="preview-section">
        {/* --live-ar alimenta os width em cqw/cqh do CSS: prévia ao vivo e
            vídeo cru se encaixam nos DOIS eixos do palco, sem nunca cortar. */}
        <div className={`video-stage ${orientation}`} style={{ '--live-ar': String(media ? media.width / Math.max(1, media.height) : 1) } as React.CSSProperties}>
          {media && liveActive ? (
            <div
              className="live-stage"
              style={{ aspectRatio: `${media.width} / ${media.height}` }}
              onPointerDownCapture={(event) => {
                // Clicar FORA do elemento no palco desseleciona, igual ao vazio
                // da timeline. Em captura porque o Player engole o pointerdown
                // no clickToPlay — sem isso o clique no vídeo tocava e a
                // seleção continuava pendurada.
                const alvo = event.target as HTMLElement;
                if (alvo.closest('.stage-gizmo, .pick-media-box, .headline-editor')) return;
                setSelectedElement(null);
              }}
            >
              {liveData
                ? (
                  <>
                  <LivePreview
                    data={liveData}
                    playerRef={livePlayerRef}
                    onPlayerReady={() => setLiveReady((count) => count + 1)}
                    controls={false}
                  />
                  {/* A ALCA DA DIVISA: aparece quando a agulha esta dentro de
                      uma tela dividida. Arrastar move a divisa NO QUADRO — a
                      composicao redesenha na hora porque o dado muda, nao
                      porque ha algum truque de CSS por cima. */}
                  {(() => {
                    const splitIndex = activeSplitIndexAt(liveData.editData, currentTime);
                    if (splitIndex < 0) return null;
                    const splits = liveData.editData.splits as Array<Record<string, unknown>>;
                    const divider = Number(splits[splitIndex]?.divider ?? SPLIT_DIVIDER);
                    return (
                      <div
                        className="divider-handle"
                        style={{ top: `${divider * 100}%` }}
                        title="Arraste para mover a divisa da tela dividida"
                        onPointerDown={(event) => {
                          event.preventDefault();
                          dividerDragRef.current = { index: splitIndex, moved: false };
                          event.currentTarget.setPointerCapture(event.pointerId);
                        }}
                        onPointerMove={(event) => {
                          const drag = dividerDragRef.current;
                          const palco = event.currentTarget.parentElement;
                          if (!drag || !palco) return;
                          drag.moved = true;
                          const rect = palco.getBoundingClientRect();
                          const fraction = (event.clientY - rect.top) / Math.max(1, rect.height);
                          applyLiveOperation({ op: 'set-divider', index: drag.index, divider: fraction }, false);
                        }}
                        onPointerUp={(event) => {
                          const drag = dividerDragRef.current;
                          dividerDragRef.current = null;
                          const palco = event.currentTarget.parentElement;
                          if (!drag || !drag.moved || !palco) return;
                          const rect = palco.getBoundingClientRect();
                          const fraction = (event.clientY - rect.top) / Math.max(1, rect.height);
                          applyLiveOperation({ op: 'set-divider', index: drag.index, divider: fraction }, true);
                        }}
                        onPointerCancel={() => { dividerDragRef.current = null; }}
                      >
                        <span />
                      </div>
                    );
                  })()}
                  {/* O GIZMO: mover (corpo), tamanho (cantos) e giro (haste).
                      Nos splits a caixa e a FAIXA e os controles reenquadram a
                      midia dentro dela (o recorte da faixa e do layout); no
                      insert a caixa acompanha o cartao. Cada arrasto e a
                      mutacao set-transform — otimista no movimento, disco no
                      soltar, mesma disciplina do resto. */}
                  {/* Espaço vazio selecionado (origem "nenhum"): o botão de
                      apontar o arquivo aparece SOBRE a faixa. A cópia entra em
                      public/ e o src é gravado no split — a prévia troca o
                      tracejado pela mídia na hora. */}
                  {(() => {
                    if (!selectedElement || !('index' in selectedElement) || selectedElement.kind !== 'splits' || !liveData) return null;
                    const splits = liveData.editData.splits;
                    const item = Array.isArray(splits) ? (splits as Array<Record<string, unknown>>)[selectedElement.index] : undefined;
                    if (!item || String(item.src ?? '').trim() !== '') return null;
                    const start = Number(item.start);
                    const end = Number.isFinite(Number(item.end)) ? Number(item.end) : start + Number(item.dur);
                    if (!(currentTime >= start && currentTime < end)) return null;
                    const indice = selectedElement.index;
                    const abertoAqui = faixaIa.aberto === indice;
                    const guardar = (updated: Record<string, unknown> | null) => {
                      if (updated && liveDataRef.current) {
                        setLiveData({ ...liveDataRef.current, editData: updated, renderPending: true });
                      }
                    };
                    const gerar = () => {
                      const texto = faixaIa.texto.trim();
                      if (!liveDirectory || !texto || faixaIa.gerando) return;
                      setFaixaIa((atual) => ({ ...atual, gerando: true, erro: null }));
                      const tipoPedido = faixaIa.tipo;
                      void window.edvidDesktop.generateSplitMedia(liveDirectory, indice, texto, tipoPedido)
                        .then((updated) => {
                          guardar(updated);
                          setFaixaIa({ aberto: null, tipo: 'imagem', texto: '', gerando: false, sugerindo: false, erro: null });
                          // Geração leva de segundos a minutos e o aluno sai
                          // da frente: o sino avisa que a mídia entrou.
                          notify('ok', tipoPedido === 'video' ? 'Clipe gerado' : 'Imagem gerada', 'A mídia já está na faixa e na prévia.');
                        })
                        .catch((error: unknown) => {
                          // O erro fica NO CAMPO, com o texto preservado: a
                          // geração pode ter falhado por rede ou crédito, e
                          // reescrever o pedido do zero seria castigo duplo.
                          setFaixaIa((atual) => ({ ...atual, gerando: false, erro: errorMessage(error) }));
                          notify('erro', tipoPedido === 'video' ? 'A geração do clipe falhou' : 'A geração da imagem falhou', errorMessage(error));
                        });
                    };
                    const sugerir = () => {
                      if (!liveDirectory || faixaIa.sugerindo || faixaIa.gerando) return;
                      setFaixaIa((atual) => ({ ...atual, sugerindo: true, erro: null }));
                      void window.edvidDesktop.suggestSplitPrompt(liveDirectory, indice, faixaIa.tipo)
                        .then((resultado) => {
                          setFaixaIa((atual) => ({ ...atual, sugerindo: false, texto: resultado.prompt }));
                        })
                        .catch((error: unknown) => {
                          setFaixaIa((atual) => ({ ...atual, sugerindo: false, erro: errorMessage(error) }));
                        });
                    };
                    // O VEU cobre a faixa inteira com blur: os botoes entravam
                    // por cima do texto de instrucao do placeholder e o
                    // conjunto ficava encavalado — relato de uso real.
                    const banda = elementRegion('splits', item);
                    return (
                      <div
                        className="pick-media-veil"
                        style={{
                          left: `${banda.x * 100}%`,
                          top: `${banda.y * 100}%`,
                          width: `${banda.w * 100}%`,
                          height: `${banda.h * 100}%`,
                        }}
                      >
                      <div className="pick-media-box">
                        {abertoAqui ? (
                          <div className="pick-media-prompt">
                            <textarea
                              rows={3}
                              autoFocus
                              value={faixaIa.texto}
                              disabled={faixaIa.gerando || faixaIa.sugerindo}
                              placeholder={faixaIa.sugerindo
                                ? 'O agente está escrevendo o prompt deste trecho…'
                                : faixaIa.tipo === 'video' ? 'Descreva a cena do clipe…' : 'Descreva a imagem…'}
                              onChange={(event) => setFaixaIa((atual) => ({ ...atual, texto: event.target.value }))}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) gerar();
                                if (event.key === 'Escape') setFaixaIa({ aberto: null, tipo: 'imagem', texto: '', gerando: false, sugerindo: false, erro: null });
                              }}
                            />
                            {/* O prompt vai para o modelo COMO ESTÁ — o Edvid
                                não traduz, e o pedido já proíbe texto na cena
                                por conta própria. */}
                            <small className="pick-media-hint"><i className="hint-i">i</i>Prompts em inglês geram melhores resultados</small>
                            {faixaIa.erro && <p className="pick-media-error">{faixaIa.erro}</p>}
                            <div className="pick-media-actions">
                              <button
                                type="button"
                                className="pick-media"
                                disabled={faixaIa.gerando || faixaIa.sugerindo || !faixaIa.texto.trim()}
                                onClick={gerar}
                              >
                                {faixaIa.gerando
                                  ? (faixaIa.tipo === 'video' ? 'Gerando o clipe…' : 'Gerando a imagem…')
                                  : 'Gerar'}
                              </button>
                              {/* O agente escreve o prompt a partir da fala
                                  DESTE trecho. Só o texto: gerar (e gastar
                                  crédito) continua sendo o clique acima. */}
                              {chatConnected && !faixaIa.gerando && (
                                <button
                                  type="button"
                                  className="pick-media ghost"
                                  disabled={faixaIa.sugerindo}
                                  onClick={sugerir}
                                >
                                  {faixaIa.sugerindo ? 'Escrevendo…' : 'Gerar automaticamente'}
                                </button>
                              )}
                              {!faixaIa.gerando && (
                                <button
                                  type="button"
                                  className="pick-media ghost"
                                  onClick={() => setFaixaIa({ aberto: null, tipo: 'imagem', texto: '', gerando: false, sugerindo: false, erro: null })}
                                >
                                  Cancelar
                                </button>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="pick-media-actions">
                            {/* TRES ICONES na horizontal, decididos pelas
                                CONTAS e nao pelo kind gravado: imagem com
                                sparkle de IA, video com sparkle, pasta. O
                                texto vive no title — tres frases inteiras nao
                                cabiam na faixa. */}
                            {imageAiConnected && (
                              <button
                                type="button"
                                className="pick-media-icon"
                                title="Gerar imagem com IA"
                                aria-label="Gerar imagem com IA"
                                onClick={() => setFaixaIa({ aberto: indice, tipo: 'imagem', texto: '', gerando: false, sugerindo: false, erro: null })}
                              >
                                <Icon name="image" />
                                <span className="ia-spark"><Icon name="sparkles" /></span>
                              </button>
                            )}
                            {videoAiConnected && (
                              <button
                                type="button"
                                className="pick-media-icon"
                                title="Gerar vídeo com IA"
                                aria-label="Gerar vídeo com IA"
                                onClick={() => setFaixaIa({ aberto: indice, tipo: 'video', texto: '', gerando: false, sugerindo: false, erro: null })}
                              >
                                <Icon name="video" />
                                <span className="ia-spark"><Icon name="sparkles" /></span>
                              </button>
                            )}
                            <button
                              type="button"
                              className="pick-media-icon"
                              title="Escolher arquivo"
                              aria-label="Escolher arquivo"
                              onClick={() => {
                                if (!liveDirectory) return;
                                void window.edvidDesktop.pickSplitMedia(liveDirectory, indice)
                                  .then(guardar)
                                  .catch(() => {});
                              }}
                            >
                              <Icon name="folder" />
                            </button>
                          </div>
                        )}
                      </div>
                      </div>
                    );
                  })()}
                                    {/* GIZMO DE TEXTO (legenda e headline): arrastar move na
                      vertical (é o eixo que o motor de layout deles aceita),
                      os cantos mudam o corpo da fonte, e duplo clique edita a
                      headline no lugar. x/y livre brigaria com o auto-ajuste
                      de duas linhas e com a centralização na divisa. */}
                  {selectedText && (() => {
                    const { region, altura } = selectedText;
                    const inicio = () => (selectedText.kind === 'captions'
                      ? Number((liveDataRef.current?.editData as Record<string, unknown> | undefined)?.captions instanceof Object
                        ? ((liveDataRef.current!.editData as { captions: Record<string, unknown> }).captions.paddingBottom ?? 420) : 420)
                      : Number(((liveDataRef.current!.editData as { hook?: Record<string, unknown> }).hook ?? {}).paddingTop ?? 330));
                    const corpoAtual = () => {
                      const d = (liveDataRef.current?.editData ?? {}) as Record<string, unknown>;
                      if (selectedText.kind === 'captions') return Number((d.captions as Record<string, unknown>)?.fontSize) || 61;
                      const h = (d.hook ?? {}) as Record<string, unknown>;
                      return Number(h.maxFontPx ?? h.fontSizePx) || 51;
                    };
                    const opFor = (padding: number, corpo?: number): EditOperation => (
                      selectedText.kind === 'captions'
                        ? { op: 'set-caption-layout', paddingBottom: padding, ...(corpo === undefined ? {} : { fontSize: corpo }) }
                        : { op: 'set-headline-layout', paddingTop: padding, ...(corpo === undefined ? {} : { maxFontPx: corpo }) }
                    );
                    return (
                      <div
                        className="stage-gizmo text-gizmo"
                        style={{
                          left: `${region.x * 100}%`,
                          top: `${Math.max(0, region.y) * 100}%`,
                          width: `${region.w * 100}%`,
                          // Piso de 4%: uma caixa de 3px não dá para pegar
                          // com o mouse (medido na bancada).
                          height: `${Math.max(0.04, region.h) * 100}%`,
                        }}
                        title={selectedText.kind === 'headline' ? 'Arraste para mover · duplo clique para editar o texto' : 'Arraste para mover · cantos mudam o tamanho'}
                        onPointerDown={(event) => {
                          if ((event.target as HTMLElement).closest('.gizmo-corner')) return;
                          event.preventDefault();
                          const palco = event.currentTarget.closest('.live-stage') as HTMLElement | null;
                          if (!palco) return;
                          // Palco sem altura medível (janela oculta, layout
                          // ainda montando): dividir por isso transformava um
                          // arrasto de 80px num salto para o limite — medido
                          // na bancada com o painel fechado. Sem medida, sem
                          // arrasto.
                          const alturaPalco = palco.getBoundingClientRect().height;
                          if (alturaPalco < 40) return;
                          textDragRef.current = {
                            mode: 'move', startY: event.clientY, basePadding: inicio(),
                            baseCorpo: corpoAtual(), centerY: 0, startDist: 1, moved: false,
                            alturaComposicao: altura, alturaPalco,
                          };
                          event.currentTarget.setPointerCapture(event.pointerId);
                        }}
                        onPointerMove={(event) => {
                          const drag = textDragRef.current;
                          if (!drag) return;
                          drag.moved = true;
                          const deslocado = ((event.clientY - drag.startY) / Math.max(1, drag.alturaPalco)) * drag.alturaComposicao;
                          // A legenda mede do PÉ do quadro: arrastar para
                          // baixo diminui o padding. A headline mede do topo.
                          const padding = selectedText.kind === 'captions'
                            ? drag.basePadding - deslocado
                            : drag.basePadding + deslocado;
                          applyLiveOperation(
                            drag.mode === 'move' ? opFor(padding) : opFor(drag.basePadding, drag.baseCorpo * (1 + deslocado / 300)),
                            false,
                          );
                        }}
                        onPointerUp={(event) => {
                          const drag = textDragRef.current;
                          textDragRef.current = null;
                          if (!drag || !drag.moved) return;
                          const deslocado = ((event.clientY - drag.startY) / Math.max(1, drag.alturaPalco)) * drag.alturaComposicao;
                          const padding = selectedText.kind === 'captions'
                            ? drag.basePadding - deslocado
                            : drag.basePadding + deslocado;
                          applyLiveOperation(
                            drag.mode === 'move' ? opFor(padding) : opFor(drag.basePadding, drag.baseCorpo * (1 + deslocado / 300)),
                            true,
                          );
                        }}
                        onPointerCancel={() => { textDragRef.current = null; }}
                        onDoubleClick={() => {
                          if (selectedText.kind !== 'headline') return;
                          setHeadlineDraft(selectedText.text ?? '');
                        }}
                      >
                        {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
                          <span
                            key={corner}
                            className={`gizmo-corner ${corner}`}
                            title="Tamanho do texto"
                            onPointerDown={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              const palco = event.currentTarget.closest('.live-stage') as HTMLElement | null;
                              if (!palco) return;
                              const alturaPalco = palco.getBoundingClientRect().height;
                              if (alturaPalco < 40) return;
                              textDragRef.current = {
                                mode: 'scale', startY: event.clientY, basePadding: inicio(),
                                baseCorpo: corpoAtual(), centerY: 0, startDist: 1, moved: false,
                                alturaComposicao: altura, alturaPalco,
                              };
                              event.currentTarget.setPointerCapture(event.pointerId);
                            }}
                            onPointerMove={(event) => {
                              const drag = textDragRef.current;
                              if (!drag || drag.mode !== 'scale') return;
                              drag.moved = true;
                              // Puxar para BAIXO aumenta (canto de baixo) e
                              // para cima diminui: o sinal segue o canto.
                              const sentido = corner.startsWith('s') ? 1 : -1;
                              const fator = 1 + (sentido * (event.clientY - drag.startY)) / 160;
                              applyLiveOperation(opFor(drag.basePadding, drag.baseCorpo * fator), false);
                            }}
                            onPointerUp={(event) => {
                              const drag = textDragRef.current;
                              textDragRef.current = null;
                              if (!drag || !drag.moved) return;
                              const sentido = corner.startsWith('s') ? 1 : -1;
                              const fator = 1 + (sentido * (event.clientY - drag.startY)) / 160;
                              applyLiveOperation(opFor(drag.basePadding, drag.baseCorpo * fator), true);
                            }}
                          />
                        ))}
                      </div>
                    );
                  })()}
                  {/* Edição do texto da headline NO PALCO, sobre o próprio
                      lugar dela. Enter grava, Esc desiste. */}
                  {headlineDraft !== null && (
                    <div className="headline-editor" style={{ top: `${textRegion('headline').y * 100}%` }}>
                      <textarea
                        autoFocus
                        value={headlineDraft}
                        onChange={(event) => setHeadlineDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') { setHeadlineDraft(null); return; }
                          if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault();
                            applyLiveOperation({ op: 'set-headline-text', text: headlineDraft }, true);
                            setHeadlineDraft(null);
                          }
                        }}
                        onBlur={() => {
                          applyLiveOperation({ op: 'set-headline-text', text: headlineDraft }, true);
                          setHeadlineDraft(null);
                        }}
                      />
                      <small>Enter grava · Esc desiste</small>
                    </div>
                  )}
                  {selectedGizmo && (() => {
                    const { region, element, transform: t, crop } = selectedGizmo;
                    // A composicao em pixels: rotacao mistura os dois eixos e
                    // fracao de largura nao soma com fracao de altura.
                    const compW = Number(liveData.editData.width) || 1080;
                    const compH = Number(liveData.editData.height) || 1920;
                    // O transform do template age sobre o CENTRO DO ELEMENTO
                    // (a faixa/o cartao), nao sobre o centro da caixa visivel
                    // — e vale para os DOIS tipos. A caixa presa na faixa era
                    // exatamente o gizmo ignorando o transform nos splits.
                    const origemX = (element.x + element.w / 2) * compW;
                    const origemY = (element.y + element.h / 2) * compH;
                    const visX = (region.x + region.w / 2) * compW;
                    const visY = (region.y + region.h / 2) * compH;
                    const rad = (t.rotation * Math.PI) / 180;
                    const dx = (visX - origemX) * t.scale;
                    const dy = (visY - origemY) * t.scale;
                    const cx = (origemX + dx * Math.cos(rad) - dy * Math.sin(rad) + t.x * compW) / compW;
                    const cy = (origemY + dx * Math.sin(rad) + dy * Math.cos(rad) + t.y * compH) / compH;
                    const w = region.w * t.scale;
                    const h = region.h * t.scale;
                    const beginGizmo = (mode: 'move' | 'scale' | 'rotate' | 'crop', edge?: 'n' | 's' | 'e' | 'w') => (event: React.PointerEvent<HTMLElement>) => {
                      event.preventDefault();
                      event.stopPropagation();
                      const palco = (event.currentTarget.closest('.live-stage') as HTMLElement | null);
                      if (!palco) return;
                      const rect = palco.getBoundingClientRect();
                      const centerX = rect.left + cx * rect.width;
                      const centerY = rect.top + cy * rect.height;
                      gizmoDragRef.current = {
                        mode,
                        kind: selectedGizmo.kind,
                        index: selectedGizmo.index,
                        startX: event.clientX,
                        startY: event.clientY,
                        baseTransform: t,
                        centerX,
                        centerY,
                        startDist: Math.max(8, Math.hypot(event.clientX - centerX, event.clientY - centerY)),
                        startAngle: Math.atan2(event.clientY - centerY, event.clientX - centerX),
                        edge,
                        baseCrop: crop,
                        elementPx: { w: element.w * compW, h: element.h * compH },
                        moved: false,
                      };
                      event.currentTarget.setPointerCapture(event.pointerId);
                    };
                    // O drag vem por PARAMETRO, nunca do ref: o soltar zera o
                    // ref antes de persistir, e ler o ref aqui devolveria null
                    // — foi exatamente o defeito que engoliu o primeiro
                    // arrasto de escala sem nenhum erro visivel.
                    const gizmoOperation = (drag: NonNullable<typeof gizmoDragRef.current>, event: { clientX: number; clientY: number }, palco: HTMLElement): EditOperation | null => {
                      const rect = palco.getBoundingClientRect();
                      if (drag.mode === 'crop' && drag.edge && drag.baseCrop && drag.elementPx) {
                        // O arrasto chega em pixels do PALCO; o inset vive no
                        // espaco do ELEMENTO, antes do transform. Desfazer o
                        // transform e: dividir pela escala e girar de volta.
                        const paraCompX = compW / Math.max(1, rect.width);
                        const paraCompY = compH / Math.max(1, rect.height);
                        const dxComp = (event.clientX - drag.startX) * paraCompX;
                        const dyComp = (event.clientY - drag.startY) * paraCompY;
                        const desRad = (-drag.baseTransform.rotation * Math.PI) / 180;
                        const dxLocal = (dxComp * Math.cos(desRad) - dyComp * Math.sin(desRad)) / Math.max(0.05, drag.baseTransform.scale);
                        const dyLocal = (dxComp * Math.sin(desRad) + dyComp * Math.cos(desRad)) / Math.max(0.05, drag.baseTransform.scale);
                        const cropNovo =
                          drag.edge === 'w' ? { left: drag.baseCrop.left + dxLocal / drag.elementPx.w }
                            : drag.edge === 'e' ? { right: drag.baseCrop.right - dxLocal / drag.elementPx.w }
                              : drag.edge === 'n' ? { top: drag.baseCrop.top + dyLocal / drag.elementPx.h }
                                : { bottom: drag.baseCrop.bottom - dyLocal / drag.elementPx.h };
                        return { op: 'set-crop', kind: drag.kind, index: drag.index, crop: cropNovo };
                      }
                      if (drag.mode === 'move') {
                        return {
                          op: 'set-transform', kind: drag.kind, index: drag.index,
                          transform: {
                            x: drag.baseTransform.x + (event.clientX - drag.startX) / Math.max(1, rect.width),
                            y: drag.baseTransform.y + (event.clientY - drag.startY) / Math.max(1, rect.height),
                          },
                        };
                      }
                      if (drag.mode === 'scale') {
                        const dist = Math.hypot(event.clientX - drag.centerX, event.clientY - drag.centerY);
                        return {
                          op: 'set-transform', kind: drag.kind, index: drag.index,
                          transform: { scale: drag.baseTransform.scale * (dist / drag.startDist) },
                        };
                      }
                      const angle = Math.atan2(event.clientY - drag.centerY, event.clientX - drag.centerX);
                      return {
                        op: 'set-transform', kind: drag.kind, index: drag.index,
                        transform: { rotation: drag.baseTransform.rotation + ((angle - drag.startAngle) * 180) / Math.PI },
                      };
                    };
                    const onGizmoMove = (event: React.PointerEvent<HTMLElement>) => {
                      const drag = gizmoDragRef.current;
                      const palco = event.currentTarget.closest('.live-stage') as HTMLElement | null;
                      if (!drag || !palco) return;
                      drag.moved = true;
                      const operation = gizmoOperation(drag, event, palco);
                      if (operation) applyLiveOperation(operation, false);
                    };
                    const onGizmoUp = (event: React.PointerEvent<HTMLElement>) => {
                      const drag = gizmoDragRef.current;
                      gizmoDragRef.current = null;
                      const palco = event.currentTarget.closest('.live-stage') as HTMLElement | null;
                      if (!drag || !drag.moved || !palco) return;
                      const operation = gizmoOperation(drag, event, palco);
                      if (operation) applyLiveOperation(operation, true);
                    };
                    return (
                      <div
                        className="stage-gizmo"
                        style={{
                          left: `${(cx - w / 2) * 100}%`,
                          top: `${(cy - h / 2) * 100}%`,
                          width: `${w * 100}%`,
                          height: `${h * 100}%`,
                          rotate: t.rotation ? `${t.rotation}deg` : undefined,
                        }}
                        onPointerDown={beginGizmo('move')}
                        onPointerMove={onGizmoMove}
                        onPointerUp={onGizmoUp}
                        onPointerCancel={() => { gizmoDragRef.current = null; }}
                      >
                        <span className="gizmo-rotate" title="Girar" onPointerDown={beginGizmo('rotate')} onPointerMove={onGizmoMove} onPointerUp={onGizmoUp} />
                        {['nw', 'ne', 'sw', 'se'].map((corner) => (
                          <span key={corner} className={`gizmo-corner ${corner}`} title="Tamanho" onPointerDown={beginGizmo('scale')} onPointerMove={onGizmoMove} onPointerUp={onGizmoUp} />
                        ))}
                        {/* RECORTE pelas bordas: segurar a linha e arrastar
                            corta a midia daquele lado — os cantos continuam
                            sendo tamanho. O inset e gravado no espaco do
                            elemento, exatamente como o clip-path le. */}
                        {(['n', 's', 'e', 'w'] as const).map((edge) => (
                          <span key={edge} className={`gizmo-edge ${edge}`} title="Cortar a mídia deste lado" onPointerDown={beginGizmo('crop', edge)} onPointerMove={onGizmoMove} onPointerUp={onGizmoUp} />
                        ))}
                      </div>
                    );
                  })()}
                  </>
                )
                : (
                  <div className="video-placeholder">
                    <span><Icon name="video" /></span>
                    <strong>Prévia ao vivo indisponível</strong>
                    <small>Monte a edição (Fase 2) para ver ao vivo. O vídeo renderizado continua no botão Render.</small>
                  </div>
                )}
            </div>
          ) : null}
          {media && !liveActive ? (
            <>
              <video
                key={media.url}
                ref={videoRef}
                src={videoSrc}
                preload="metadata"
                playsInline
                style={{
                  aspectRatio: `${media.width} / ${media.height}`,
                  ...(mapped && (inGap || !activeSource?.url) ? { opacity: 0 } : null),
                }}
                onLoadedMetadata={(event) => {
                  const pending = pendingVideoSeekRef.current;
                  if (pending) {
                    pendingVideoSeekRef.current = null;
                    try {
                      event.currentTarget.currentTime = pending.sourceTime;
                    } catch {
                      // A agulha continua responsiva enquanto os metadados carregam.
                    }
                    // A retomada só vale se o transporte ainda estiver rodando
                    // e houver segmento ativo: uma troca de fonte lenta podia
                    // dar play depois de o motor já ter parado.
                    if (pending.resume && playingRef.current && !inGapRef.current) {
                      void event.currentTarget.play().catch(() => setPlaying(false));
                    }
                  }
                  if (!mappedRef.current) setDuration(event.currentTarget.duration);
                }}
                onTimeUpdate={(event) => {
                  if (!mappedRef.current) {
                    syncCurrentTime(event.currentTarget.currentTime);
                    return;
                  }
                  enforceMappedBoundary(event.currentTarget);
                }}
                onSeeking={(event) => {
                  if (!mappedRef.current) syncCurrentTime(event.currentTarget.currentTime);
                }}
                onClick={() => void togglePlayback()}
                onPlay={() => setPlaying(true)}
                onPause={() => {
                  if (!mappedRef.current || !inGapRef.current) setPlaying(false);
                }}
                onEnded={() => {
                  if (!mappedRef.current) setPlaying(false);
                }}
              />
              {mapped && inGap && <div className="video-stage-note">Espaço vazio na timeline</div>}
              {mapped && activeSourceId && !activeSource?.url && (
                <div className="video-stage-note">Arquivo-fonte indisponível para a prévia</div>
              )}
            </>
          ) : null}
          {!media && (
            <div className="video-placeholder">
              <span><Icon name="video" /></span>
              <strong>O preview aparecerá aqui</strong>
              <small>Abra um projeto que contenha um vídeo.</small>
            </div>
          )}
        </div>
      </section>

      <section className="timeline-section">
        <div className="timeline-toolbar slim">
          {mapped && (dirty
            ? <span className="mapped-badge" title="O preview mostra as edições ainda não renderizadas">Prévia das edições</span>
            : <span className="mapped-badge" title="O preview toca os vídeos da pasta em sequência, na ordem da limpeza">Vídeos em sequência</span>)}
          <div className="history-buttons" aria-label="Histórico de edições">
            <button
              type="button"
              className="history-button"
              onClick={undoTimelineAction}
              disabled={!model || (actionOrderRef.current.length === 0 && markIn === null && !draftRange)}
              title="Desfazer (⌘Z)"
            >
              <Icon name="undo" />
            </button>
            <button
              type="button"
              className="history-button"
              onClick={redoModelEdit}
              disabled={modelFutureRef.current.length === 0}
              title="Refazer (⇧⌘Z)"
            >
              <Icon name="redo" />
            </button>
          </div>
          {/* O "Aplicar ajustes" MORREU (0.30.0): a timeline mostra os cortes
              em tempo real pelo preview mapeado, e aplicar de verdade virou
              parte do Renderizar — uma decisão só, no fim, como num editor.
              Descartar continua: é o único caminho de volta. */}
          {dirty && canDiscard && (
            <button type="button" className="discard-edits" onClick={discardTimelineEdits} title="Voltar ao corte atual sem aplicar">
              Descartar
            </button>
          )}
          <div className="timeline-time">{formatTimecode(currentTime, fps)} <span>/ {formatTimecode(effectiveDuration, fps)}</span></div>
        </div>
        <div className="timeline-scroll" ref={scrollRef}>
          <div
            className="timeline-content"
            ref={contentRef}
            style={{ ...trackStyle, width: `${zoom * 100}%` }}
            tabIndex={media || model ? 0 : -1}
            aria-label="Timeline de edição. Use as setas para mover um frame."
            onPointerDown={beginTimelineSeek}
            onPointerMove={continueTimelineSeek}
            onPointerUp={endTimelineSeek}
            onPointerCancel={endTimelineSeek}
          >
            <div className="timeline-ruler">
              {rulerTicks.map((tick) => (
                <span
                  key={tick}
                  style={{ left: timelinePoint(effectiveDuration > 0 ? tick / effectiveDuration : 0) }}
                >
                  {formatTime(tick)}
                </span>
              ))}
            </div>
            {/* Ordem das tracks de estilo: Legendas, Texto, Animações e por
                fim Imagem/Vídeo (verde) — as bases Vídeo/Voz ficam abaixo. Os
                chips vêm dos ranges REAIS do edit-data.json (overlays). */}
            {/* A faixa some quando o elemento foi APAGADO: a verdade e o
                edit-data (enabled:false), nao o estilo salvo — apagar a
                headline a tirava do palco e ela continuava na timeline. */}
            {phase === 2 && style.captions !== 'none' && captionsEnabled && (
              <TimelineTrack icon="captions" label="Legendas" tone="teal">
                {renderTextChip('captions', 'Legendas', 'captions-chip', { left: '2%', width: '96%' })}
              </TimelineTrack>
            )}
            {phase === 2 && style.headline !== 'none' && headlineEnabled && (
              <TimelineTrack icon="text" label="Texto" tone="orange">
                {renderTextChip(
                  'headline',
                  `Headline · ${style.headline}`,
                  'headline-chip',
                  { width: overlays?.hookEnd && effectiveDuration > 0 ? `${Math.min(100, (overlays.hookEnd / effectiveDuration) * 100)}%` : '31%' },
                )}
              </TimelineTrack>
            )}
            {(liveChips ? liveChips.animations.length > 0 : Boolean(overlays && overlays.animations.length > 0)) && (
              <TimelineTrack icon="sparkles" label="Animações" tone="olive">
                {liveChips
                  ? liveChips.animations.map((chip) => renderLiveChip(chip, 'animation-chip'))
                  : overlays?.animations.map((clip, index) => renderOverlayChip(clip, index, 'animation-chip'))}
              </TimelineTrack>
            )}
            {/* UMA faixa de midia: imagem e clipe juntos. Sem previa ao vivo,
                as duas listas do overlay entram concatenadas na mesma pista. */}
            {(liveChips
              ? liveChips.media.length > 0
              : Boolean(overlays && (overlays.images.length > 0 || overlays.videos.length > 0))) && (
              <TimelineTrack icon="image" label="Mídia" tone="green">
                {liveChips
                  ? liveChips.media.map((chip) => renderLiveChip(chip, 'image-chip'))
                  : [...(overlays?.images ?? []), ...(overlays?.videos ?? [])]
                    .sort((a, b) => a.start - b.start)
                    .map((clip, index) => renderOverlayChip(clip, index, 'image-chip'))}
              </TimelineTrack>
            )}
            <TimelineTrack icon="video" label="Vídeo" tone="orange">
              {model
                ? videoClips.map((clip, index) => renderModelClip(clip, index, 'video-clip'))
                : displayedSegments.map((segment, index) => (
                    <div
                      className={`timeline-clip video-clip ${index % 2 ? 'alt' : ''}`}
                      key={`${segment.start}:${segment.label}`}
                      style={{
                        left: `${effectiveDuration > 0 ? (segment.start / effectiveDuration) * 100 : 0}%`,
                        width: `calc(${effectiveDuration > 0 ? (segment.duration / effectiveDuration) * 100 : 100}% - ${index < displayedSegments.length - 1 ? 2 : 0}px)`,
                      }}
                      title={`${segment.label} · ${formatTime(segment.duration)}`}
                    >
                      <span>{segment.label}</span>
                    </div>
                  ))}
            </TimelineTrack>
            {(voiceOverlapping ? [0, 1] : [null]).map((lane) => (
              <TimelineTrack
                icon="waveform"
                label={lane === null ? 'Voz' : lane === 0 ? 'Voz A' : 'Voz B'}
                tone="teal"
                key={`voz:${lane ?? 'unica'}`}
              >
                {model
                  ? voiceClips
                      .map((clip, index) => ({ clip, index }))
                      .filter(({ index }) => lane === null || index % 2 === lane)
                      .map(({ clip, index }) => renderModelClip(clip, index, 'audio-clip'))
                  : displayedSegments
                      .map((segment, index) => ({ segment, index }))
                      .filter(({ index }) => lane === null || index % 2 === lane)
                      .map(({ segment, index }) => {
                        const start = segment.audioStart ?? segment.start;
                        const segmentDuration = segment.audioDuration ?? segment.duration;
                        return (
                          <div
                            className={`timeline-clip audio-clip ${index % 2 ? 'alt' : ''}`}
                            key={`audio:${segment.start}:${segment.label}`}
                            style={{
                              left: `${effectiveDuration > 0 ? (start / effectiveDuration) * 100 : 0}%`,
                              width: `calc(${effectiveDuration > 0 ? (segmentDuration / effectiveDuration) * 100 : 100}% - 2px)`,
                            }}
                            title={`${segment.label} · ${formatTime(segmentDuration)}`}
                          >
                            <span>{segment.label}</span>
                          </div>
                        );
                      })}
              </TimelineTrack>
            ))}
            {phase === 2 && style.elements.musicAI && (
              <TimelineTrack icon="music" label="Trilha" tone="olive">
                <div
                  className={`timeline-chip music-chip selectable${selectedElement?.kind === 'soundtrack' ? ' selected' : ''}`}
                  style={{ left: '0%', width: '100%' }}
                  onClick={() => setSelectedElement({ kind: 'soundtrack' })}
                >Trilha sonora</div>
              </TimelineTrack>
            )}
            {corrections.map((correction, index) => (
              <div
                className="timeline-correction-range"
                key={correction.id}
                style={{
                  '--correction-left': timelinePoint(effectiveDuration > 0 ? correction.start / effectiveDuration : 0),
                  '--correction-width': timelineSpan(effectiveDuration > 0 ? (correction.end - correction.start) / effectiveDuration : 0),
                } as CSSProperties}
                title={`${formatTime(correction.start)}–${formatTime(correction.end)} · ${correction.note}`}
              >
                <span>{index + 1}</span>
                <button
                  type="button"
                  className="delete-correction"
                  title={`Excluir marcação ${index + 1}`}
                  aria-label={`Excluir marcação ${index + 1}`}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => { event.stopPropagation(); deleteCorrection(correction.id); }}
                >
                  <Icon name="trash" />
                </button>
              </div>
            ))}
            {markIn !== null && (
              <div
                className="timeline-in-marker"
                style={{ '--marker-left': timelinePoint(effectiveDuration > 0 ? markIn / effectiveDuration : 0) } as CSSProperties}
              >
                <span>IN</span>
              </div>
            )}
            <div className="timeline-playhead" />
          </div>
        </div>
        <div className="timeline-transport" aria-label="Controles de reprodução">
          <div className="marker-controls">
            <button type="button" className={`marker-button ${markIn !== null ? 'active' : ''}`} onClick={setInPoint} disabled={!media || dirty} title={dirty ? 'Aplique ou descarte as edições antes de marcar correções' : 'Marcar início da correção (I ou M)'}>IN</button>
            <button type="button" className="marker-button" onClick={setOutPoint} disabled={!media || dirty || markIn === null || currentTime <= markIn} title={dirty ? 'Aplique ou descarte as edições antes de marcar correções' : 'Marcar fim da correção (O ou M)'}>OUT</button>
            <button
              type="button"
              className="marker-button razor"
              onClick={razorAtPlayhead}
              disabled={!model || (liveActive && Boolean(selectedElement) && !cortavelNaAgulha)}
              title={liveActive && selectedElement
                ? 'Recortar o elemento selecionado na agulha (C)'
                : 'Dividir o take na agulha (C)'}
            ><Icon name="scissors" /></button>
            {corrections.length > 0 && !dirty && <span className="correction-count">{corrections.length} {corrections.length === 1 ? 'marcação' : 'marcações'}</span>}
          </div>
          <div className="transport-center">
            <button type="button" className="transport-button" onClick={() => jumpBy(-5)} disabled={!media} title="Voltar 5 segundos">
              <Icon name="skipBack" /><span>5s</span>
            </button>
            <button type="button" className="transport-button transport-play" onClick={() => void togglePlayback()} disabled={!media} title={playing ? 'Pausar' : 'Reproduzir'}>
              <Icon name={playing ? 'pause' : 'play'} />
            </button>
            <button type="button" className="transport-button" onClick={() => jumpBy(5)} disabled={!media} title="Avançar 5 segundos">
              <Icon name="skipForward" /><span>5s</span>
            </button>
          </div>
          <div className="transport-right">
            <div className="timeline-zoom" aria-label="Zoom da timeline">
              <button type="button" onClick={() => changeZoom(Math.round(zoom) - 1)} disabled={zoom <= 1} title="Reduzir zoom (-)">−</button>
              <span>{(Math.round(zoom * 10) / 10).toLocaleString('pt-BR')}×</span>
              <button type="button" onClick={() => changeZoom(Math.round(zoom) + 1)} disabled={zoom >= 8} title="Aumentar zoom (+)">+</button>
              <button type="button" className="fit" onClick={() => changeZoom(1)} disabled={zoom <= 1} title="Ver a timeline inteira (0)">Fit</button>
            </div>
            <button type="button" className="transport-button" onClick={toggleMute} disabled={!media} title={muted ? 'Ativar áudio' : 'Silenciar'}>
              <Icon name={muted ? 'volumeOff' : 'volume'} />
            </button>
            {!dirty && corrections.length > 0 && (
              <button type="button" className="apply-corrections" onClick={() => void applyCorrections()} disabled={applyingCorrections}>
                {applyingCorrections ? 'Aplicando...' : 'Aplicar'}
              </button>
            )}
          </div>
        </div>
        {draftRange && (
          <form className="correction-note-popover" onSubmit={saveDraftCorrection}>
            <span className="eyebrow">Correção na timeline</span>
            <strong>{formatTime(draftRange.start)} → {formatTime(draftRange.end)}</strong>
            <textarea autoFocus rows={3} value={draftNote} onChange={(event) => setDraftNote(event.target.value)} placeholder="Descreva o que precisa ser corrigido neste trecho..." />
            <div>
              <button type="button" className="btn ghost small" onClick={() => { setDraftRange(null); setDraftNote(''); }}>Cancelar</button>
              <button type="submit" className="btn primary small" disabled={!draftNote.trim()}>Salvar marcação</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

function StyleWorkspace({
  style,
  onChange,
  onApply,
  canApply,
  applying,
  runtime,
  chatConnected,
  imageAiConnected,
  videoAiConnected,
}: {
  style: StyleSetup;
  onChange: (style: StyleSetup) => void;
  onApply: () => void;
  canApply: boolean;
  applying: boolean;
  runtime: RemotionRuntimeState;
  // Agente de chat conectado: e ele quem escreve os prompts por trecho de
  // fala. Sem agente o seletor de origem nem aparece — a tela dividida sai
  // como uma faixa unica que o aluno recorta e preenche pelo palco.
  chatConnected: boolean;
  imageAiConnected: boolean;
  videoAiConnected: boolean;
}) {
  const accentUsed = style.headline === 'realce' || style.headline === 'misto' || style.captions === 'stacked';
  const updateElements = (key: keyof StyleSetup['elements']) => {
    onChange({ ...style, elements: { ...style.elements, [key]: !style.elements[key] } });
  };

  return (
    <div className="style-workspace" style={{ '--style-accent': style.accent } as CSSProperties}>
      <div className="style-scroll">
        <div className="style-intro">
          <div>
            <h2>Escolha estilos e elementos de edição</h2>
          </div>
        </div>

        <section className="style-group">
          <div className="style-group-head"><div><h3>Tipo de edição</h3></div></div>
          <div className="choice-grid edit-choice-grid">
            {editStyles.map((option) => (
              <ChoiceCard key={option.id} selected={style.edit === option.id} onClick={() => onChange({ ...style, edit: option.id })} label={option.name}>
                <EditStylePreview style={option.id} />
              </ChoiceCard>
            ))}
          </div>
          {/* Origem da mídia da tela dividida — SÓ COM AGENTE conectado: é ele
              quem escreve os prompts por trecho da fala. Sem agente a escolha
              não existe e a faixa sai inteira para o aluno recortar e
              preencher pelo palco. As opções de IA continuam exigindo conta
              capaz de gerar; "Nenhum" existe sempre. */}
          {(style.edit === 'split' || style.edit === 'split2') && chatConnected && (
            <div className="split-media-row">
              <span>Conteúdo da faixa</span>
              <div className="split-media-options" role="radiogroup" aria-label="Conteúdo da faixa da tela dividida">
                {([
                  ['imagem', 'Imagens por IA', imageAiConnected],
                  ['video', 'Clipes por IA', videoAiConnected],
                  ['nenhum', 'Nenhum — eu escolho os arquivos', true],
                ] as const).filter(([, , available]) => available).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`split-media-option${style.splitMedia === id ? ' on' : ''}`}
                    onClick={() => onChange({ ...style, splitMedia: id })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="style-group accent-group">
          <div className="style-group-head"><div><h3>Cor de destaque</h3></div></div>
          <div className={`accent-control ${accentUsed ? '' : 'unused'}`}>
            <input type="color" value={style.accent} onChange={(event) => onChange({ ...style, accent: event.target.value })} aria-label="Cor de destaque" />
            <input className="accent-hex" value={style.accent.toUpperCase()} onChange={(event) => {
              const value = event.target.value;
              if (/^#[0-9a-f]{6}$/iu.test(value)) onChange({ ...style, accent: value });
            }} aria-label="Cor de destaque em hexadecimal" />
            <span>{accentUsed ? 'Aplicada aos estilos escolhidos' : 'A cor não será usada com as escolhas atuais'}</span>
          </div>
        </section>

        <section className="style-group">
          <div className="style-group-head"><div><h3>Estilo de headline</h3></div></div>
          <div className="choice-grid headline-choice-grid">
            {headlineStyles.map((option) => (
              <ChoiceCard key={option.id} selected={style.headline === option.id} title={option.name} onClick={() => onChange({ ...style, headline: option.id })}>
                <HeadlinePreview style={option.id} />
              </ChoiceCard>
            ))}
          </div>
          {/* O TEXTO da headline. Era a única parte criativa desta aba que
              dependia do agente, e ele já mandou o texto de exemplo do
              template para um vídeo real. Vazio, o Edvid usa a frase de
              abertura da fala — nunca fica sem nada. */}
          {style.headline !== 'none' && (
            <label className="style-note">
              <span>Texto da headline</span>
              <textarea
                rows={2}
                value={style.headlineText}
                onChange={(event) => onChange({ ...style, headlineText: event.target.value })}
                placeholder="Deixe vazio para usar a primeira frase do vídeo"
              />
            </label>
          )}
        </section>

        <section className="style-group">
          <div className="style-group-head"><div><h3>Estilo de legenda</h3></div></div>
          <div className="choice-grid caption-choice-grid">
            {captionStyles.map((option) => (
              <ChoiceCard key={option.id} selected={style.captions === option.id} title={option.name} onClick={() => onChange({ ...style, captions: option.id })}>
                <CaptionPreview style={option.id} />
              </ChoiceCard>
            ))}
          </div>
        </section>

        <section className="style-group">
          <div className="style-group-head"><div><h3>Elementos da edição</h3><p>Desmarcado significa que o elemento ficará fora.</p></div></div>
          <div className="element-grid">
            {([
              ['tracking', 'Tracking do rosto', 'Mantém olhos e rosto na zona segura.'],
              ['zoomAuto', 'Zoom automático', 'Push-in sutil dentro de cada take.'],
              ['zoomCuts', 'Zoom nos cortes', 'Varia a escala a cada mudança de take.'],
              ['flashCut', 'Flash na transição', 'Clarão curto nas trocas de take e de layout.'],
              ['musicAI', 'Trilha sonora com IA', 'Composição instrumental em volume de referência.'],
            ] as Array<[keyof StyleSetup['elements'], string, string]>).map(([key, name, description]) => (
              <button type="button" className={`element-toggle ${style.elements[key] ? 'enabled' : ''}`} key={key} onClick={() => updateElements(key)} aria-pressed={style.elements[key]}>
                <span className="toggle-box"><Icon name="check" /></span>
                <span><strong>{name}</strong><small>{description}</small></span>
              </button>
            ))}
          </div>
          <label className="style-note">
            <span>Observação para a edição</span>
            <textarea rows={3} value={style.note} onChange={(event) => onChange({ ...style, note: event.target.value })} placeholder="Ex.: preservar o rosto sem inserts durante a demonstração do produto." />
          </label>
        </section>
      </div>
      <div className="style-footer">
        {runtime.status === 'installing' ? (
          <div>
            <strong>Preparando o motor de render</strong>
            <span>
              {runtime.step === 'navegador'
                ? 'Baixando o navegador de render. Isso acontece uma única vez.'
                : runtime.step === 'fontes'
                  ? 'Baixando as fontes da edição. Isso acontece uma única vez.'
                  : `Instalando as dependências${runtime.installedBytes ? ` · ${Math.round(runtime.installedBytes / 1e6)} MB` : ''}. Isso acontece uma única vez.`}
            </span>
          </div>
        ) : runtime.status === 'error' ? (
          <div>
            <strong>Motor de render indisponível</strong>
            <span>{runtime.error || 'Falha ao preparar o Remotion.'} Clique em “Salvar e aplicar” para tentar de novo.</span>
          </div>
        ) : <div />}
        <button type="button" className="btn primary apply-style" onClick={onApply} disabled={!canApply || applying || runtime.status === 'installing'}>
          <Icon name="sparkles" /> {runtime.status === 'installing' ? 'Preparando...' : applying ? 'Enviando...' : 'Salvar e aplicar'}
        </button>
      </div>
    </div>
  );
}

function MemberGate({
  auth,
  onLogin,
  onLogout,
}: {
  auth: MemberAuthState;
  onLogin: (email: string, password: string) => Promise<void>;
  onLogout: () => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const busy = submitting || auth.status === 'checking';

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !email.trim() || !password) return;
    setSubmitting(true);
    try {
      await onLogin(email.trim(), password);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="member-gate">
      <section className="member-card">
        <img className="member-logo" src={edvidLogo} alt="Edvid" />
        {auth.status === 'no-access' ? (
          <>
            <h1>Sua matrícula não está ativa</h1>
            <p>
              O Edvid é liberado para alunos com o <strong>IA Edit Pro</strong> ativo na Creator
              Factory. A conta {auth.email ? <strong>{auth.email}</strong> : 'informada'} não tem essa
              matrícula no momento — se você acabou de comprar ou renovou, feche e reabra o aplicativo.
            </p>
            <p className="member-hint">Dúvidas? Fale com o suporte da Creator Factory.</p>
            <button type="button" className="btn ghost" onClick={() => void onLogout()}>Entrar com outra conta</button>
          </>
        ) : (
          <>
            <h1>Entre com sua conta de aluno</h1>
            <p>Use o mesmo e-mail e senha da área de membros da Creator Factory.</p>
            <form onSubmit={submit}>
              <label>
                <span>E-mail</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="username"
                  placeholder="voce@exemplo.com"
                  disabled={busy}
                />
              </label>
              <label>
                <span>Senha</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  placeholder="Sua senha da Creator Factory"
                  disabled={busy}
                />
              </label>
              {auth.error && <div className="inline-error">{auth.error}</div>}
              <button type="submit" className="btn primary" disabled={busy || !email.trim() || !password}>
                {busy ? 'Entrando...' : 'Entrar'}
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}

export function App() {
  const [desktopInfo, setDesktopInfo] = useState<DesktopInfo | null>(null);
  const [runtimes, setRuntimes] = useState<RuntimeCheck[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [workspace, setWorkspace] = useState<ProjectWorkspace | null>(null);
  const [account, setAccount] = useState<CodexAccountState>(initialAccount);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [approvals, setApprovals] = useState<CodexApproval[]>([]);
  const [answeringApprovalId, setAnsweringApprovalId] = useState<string | number | null>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [composer, setComposer] = useState('');
  const [checking, setChecking] = useState(true);
  const [sending, setSending] = useState(false);
  const [cleanCut, setCleanCut] = useState<CleanCutState>({ status: 'idle' });
  const [musicBusy, setMusicBusy] = useState(false);
  const cleanCutRunning = cleanCut.status === 'transcrevendo'
    || cleanCut.status === 'analisando'
    || cleanCut.status === 'cortando';
  const [openingProject, setOpeningProject] = useState(false);
  const [activeTurn, setActiveTurn] = useState<{ threadId: string; turnId: string } | null>(null);
  const [railPinned, setRailPinned] = useState(() => localStorage.getItem('edvid:rail-pinned') === 'true');
  const [workTab, setWorkTab] = useState<WorkTab>('edit');
  const [style, setStyle] = useState<StyleSetup>(defaultStyleSetup);
  const [styleApplied, setStyleApplied] = useState(false);
  const [corrections, setCorrections] = useState<CorrectionRange[]>([]);
  const [handledCutApprovalId, setHandledCutApprovalId] = useState<string | null>(null);
  const [approvingCut, setApprovingCut] = useState(false);
  const [followingOutput, setFollowingOutput] = useState(true);
  const [whisperModel, setWhisperModel] = useState<WhisperModelState>({
    status: 'unknown',
    model: '',
  });
  const [remotionRuntime, setRemotionRuntime] = useState<RemotionRuntimeState>({
    status: 'unknown',
  });
  const [phase2Render, setPhase2Render] = useState<Phase2RenderState>({ status: 'idle' });
  // "Ha algo para renderizar" — decidido pela impressao digital no main e
  // reportado pelo EditorWorkspace. O botao vive na barra de abas: renderizar
  // e EXPORTAR, nao um modo de ver.
  const [renderPending, setRenderPending] = useState(false);
  const [cutsPending, setCutsPending] = useState(false);
  // Muda quando um render termina: o EditorWorkspace re-busca os dados da
  // previa (e o pendente cai sozinho, pela impressao digital).
  const [renderStamp, setRenderStamp] = useState('');
  const phase2Status = phase2Render.status;
  useEffect(() => {
    if (phase2Status === 'ready') setRenderStamp(String(Date.now()));
  }, [phase2Status]);
  // Fim de tarefa (0.34.0): a pilha de toasts do sino. O som e a notificação
  // do sistema saem no notify() (src/notify.ts); aqui só a parte visual.
  // Cada aviso vive 7s ou até o clique; a pilha guarda no máximo 4.
  const [toasts, setToasts] = useState<ToastData[]>([]);
  useEffect(() => onToast((toast) => {
    setToasts((current) => [...current.slice(-3), toast]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== toast.id));
    }, 7000);
  }), []);
  // Quando o turno começou: só turnos LONGOS tocam o sino no sucesso — quem
  // espera 10s+ já saiu da frente; resposta rápida não precisa de fanfarra.
  const turnStartedAtRef = useRef(0);
  const [appUpdate, setAppUpdate] = useState<AppUpdateState>({ status: 'idle' });
  const [memberAuth, setMemberAuth] = useState<MemberAuthState>({ status: 'unconfigured' });
  // O gate so decide DEPOIS da primeira resposta real: antes dela (e durante
  // "checking") o app mostra a abertura com o logo — quem ja esta logado nunca
  // mais ve o formulario piscar no boot.
  const [memberLoaded, setMemberLoaded] = useState(false);
  const [runtimePack, setRuntimePack] = useState<RuntimePackState>({ status: 'unknown' });
  const [claudeAccount, setClaudeAccount] = useState<ClaudeAccountState>({ status: 'signed-out', email: null });
  const [claudeLoaded, setClaudeLoaded] = useState(false);
  const [geminiAccount, setGeminiAccount] = useState<GeminiAccountState>({ status: 'signed-out', maskedKey: null });
  const [aiCatalog, setAiCatalog] = useState<CatalogState>({ connections: [], freeOnly: false, chatProviderId: null });
  // Modal de conexão: qual IA está aberta e o resultado do teste da chave.
  const [connectTarget, setConnectTarget] = useState<string | null>(null);
  const [connectTesting, setConnectTesting] = useState(false);
  const [connectTested, setConnectTested] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updateChecked, setUpdateChecked] = useState<string | null>(null);
  const [catalogDraft, setCatalogDraft] = useState<Record<string, Record<string, string>>>({});
  const [catalogError, setCatalogError] = useState<string | null>(null);
  // Quem está atendendo agora: mostrado abaixo do campo de texto do chat.
  const [activeModel, setActiveModel] = useState<ActiveModelState>(null);
  const [geminiLoaded, setGeminiLoaded] = useState(false);
  const [aiRoles, setAiRoles] = useState<AiRolesState>({ chat: 'chatgpt', image: null, imageCatalog: null, chatPinned: false, imagePinned: false,
  videoCatalog: null, tiers: { imagem: DEFAULT_TIER.imagem, video: DEFAULT_TIER.video } });
  const [imageGen, setImageGen] = useState<ImageGenState>({ status: 'idle' });
  const [imageContinuationAt, setImageContinuationAt] = useState<number | null>(null);
  // Cobrança da animação sob medida prometida e não escrita: uma por projeto.
  const [customAnimationRequest, setCustomAnimationRequest] = useState<{ directory: string; labels: string[] } | null>(null);
  const customAnimationChasedRef = useRef<Set<string>>(new Set());
  const [claudeCode, setClaudeCode] = useState('');
  // Entrada de chave de API: qual provedor esta com o campo aberto.
  const [keyEntry, setKeyEntry] = useState<AiProvider | null>(null);
  const [keyValue, setKeyValue] = useState('');
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [nameDialog, setNameDialog] = useState<{ mode: 'create' } | { mode: 'rename'; directory: string } | null>(null);
  const [nameValue, setNameValue] = useState('');
  const [projectMenu, setProjectMenu] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [jcutApplied, setJcutApplied] = useState(false);
  const [jcutBusy, setJcutBusy] = useState(false);
  const phase2StatusRef = useRef<Phase2RenderState['status']>('idle');
  const imageGenStatusRef = useRef<ImageGenState['status']>('idle');
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const activeProjectDirectoryRef = useRef<string | null>(null);
  const timelineSaveTimerRef = useRef<number | null>(null);
  const pendingTimelineSaveRef = useRef<{
    directory: string;
    model: TimelineModel;
    loadStamp: string;
  } | null>(null);
  const booted = useRef(false);

  const projectDirectory = workspace?.project.directory ?? null;
  const chatgptConnected = account.status === 'signed-in';
  const claudeConnected = claudeAccount.status === 'signed-in';
  const geminiConnected = geminiAccount.status === 'signed-in';
  const aiConnected: Record<AiProvider, boolean> = {
    chatgpt: chatgptConnected,
    claude: claudeConnected,
    gemini: geminiConnected,
  };
  const aiProvider = aiRoles.chat;
  // Quem PODE gerar imagem: ChatGPT em qualquer modo (assinatura usa a
  // ferramenta do Codex na cota do plano; chave usa a API de imagens, paga
  // por imagem), Gemini por chave; Claude nunca.
  const imageCapable: Record<AiProvider, boolean> = {
    chatgpt: chatgptConnected,
    claude: false,
    gemini: geminiConnected,
  };
  // O chat conversa com o provedor do papel "chat"; os outros ficam
  // conectados em espera. A troca acontece nos seletores do composer, nas
  // Configurações, ou sozinha (regras automáticas abaixo).
  // Com um provedor do CATÁLOGO conduzindo a conversa, o chat está conectado
  // mesmo sem ChatGPT/Claude/Gemini. Sem isto, remover o ChatGPT travava o
  // campo de texto com "Conecte a conta" enquanto o Ollama já estava escolhido.
  const catalogChatConnected = Boolean(
    aiCatalog.chatProviderId
    && aiCatalog.connections.some((item) => item.id === aiCatalog.chatProviderId && item.connected),
  );
  const activeAiConnected = catalogChatConnected || aiConnected[aiProvider];
  const canChat = Boolean(projectDirectory) && activeAiConnected;
  // APLICAR ESTILOS NÃO É CONVERSAR. O botão usava `canChat` e ficava
  // desligado sem nenhuma IA de chat conectada — e quem monta a Fase 2
  // inteira (corte, legendas, headline, zoom, trilha, tela dividida, flash) é
  // o aplicativo. Um aluno com só o Higgsfield conectado não conseguia nem
  // chegar à edição: o caminho sem agente existia e estava trancado na porta.
  const canApplyStyles = Boolean(projectDirectory);
  // Contas capazes de GERAR mídia — coisa diferente do agente de chat. Vivem
  // aqui, e não no meio do JSX, porque a mensagem do "Salvar e aplicar"
  // precisa da mesma resposta que o seletor "Conteúdo da faixa": prometer
  // "descreva e deixe a IA gerar" para quem não tem conta é a mesma mentira
  // que esta versão veio desfazer.
  // As duas perguntas têm de ser A MESMA pergunta. Eram diferentes: vídeo
  // olhava o CATÁLOGO (existe conta conectada capaz?) e imagem olhava o PAPEL
  // (`aiRoles.imageCatalog`, que só é preenchido quando o aluno escolhe um
  // provedor de imagem nas Configurações). Com o Higgsfield conectado e sem
  // essa escolha, aparecia "Clipes por IA" e não aparecia "Imagens por IA" —
  // embora o main gerasse imagem numa boa: o hubForRole dele já resolve "único
  // hub conectado atende sozinho". A interface dizia que não dava, e dava.
  const catalogCapaz = (capacidade: 'imagem' | 'video') => AI_CATALOG.some((entry) => (
    entry.capabilities.includes(capacidade)
    && aiCatalog.connections.some((item) => item.id === entry.id && item.connected)
  ));
  const imageAiConnected = Boolean(
    aiRoles.imageCatalog || aiRoles.image || imageCapable.chatgpt || imageCapable.gemini,
  ) || catalogCapaz('imagem');
  const videoAiConnected = Boolean(aiRoles.videoCatalog) || catalogCapaz('video');
  // A ORIGEM ESCOLHIDA TEM DE SER UMA DAS OFERECIDAS. O seletor esconde a
  // opção sem conta capaz e o valor guardado continuava apontando para ela:
  // nenhum botão aparecia marcado (foi assim que o defeito acima ficou
  // visível) e, pior, o plano ainda escreveria `kind: "image"` nos espaços —
  // o palco ofereceria um "Gerar imagem" que só podia falhar.
  //
  // DERIVADO, não guardado. A primeira tentativa foi um efeito corrigindo o
  // estado, e ele PERDIA a briga: o carregamento do projeto regravava o
  // estilo do disco por cima. Aqui a interface e a aplicação leem a mesma
  // conta, sempre. Cai em "Nenhum", a opção que nunca gasta crédito de
  // surpresa — nunca no outro tipo de geração, que custa mais.
  // SEM AGENTE DE CHAT o seletor de origem nem aparece: gerar por trecho de
  // fala exige alguem que escreva os prompts. O caminho vira o manual — uma
  // faixa de ponta a ponta que o aluno recorta e preenche (com IA pelo palco,
  // ou arquivo), e o palco decide os botoes pelas CONTAS conectadas.
  const splitMediaEfetivo: NonNullable<StyleSetup['splitMedia']> = !activeAiConnected
    ? 'nenhum'
    : style.splitMedia === 'video'
      ? (videoAiConnected ? 'video' : 'nenhum')
      : style.splitMedia === 'nenhum'
        ? 'nenhum'
        : (imageAiConnected ? 'imagem' : 'nenhum');
  const readyRuntimes = runtimes.filter((runtime) => runtime.available).length;
  const accountLabel = account.account?.type === 'apiKey'
    ? 'Chave de API conectada'
    : account.account?.email ?? (account.status === 'waiting-for-browser' ? 'Conclua no navegador' : 'ChatGPT desconectado');
  const claudeLabel = claudeAccount.mode === 'api-key'
    ? `Chave ${claudeAccount.email ?? 'de API'} conectada`
    : claudeAccount.email ?? (
      claudeAccount.status === 'waiting-for-browser'
        ? claudeAccount.finishing
          ? 'Concluindo o login…'
          : claudeAccount.manual ? 'Cole o código exibido no site' : 'Conclua no navegador'
        : 'Claude desconectado'
    );
  const geminiLabel = geminiAccount.maskedKey
    ? `Chave ${geminiAccount.maskedKey} conectada`
    : 'Gemini desconectado';
  const activeApproval = approvals[0] ?? null;
  // Versão mostrada em Configurações → Geral, junto do botão de atualizar.
  const appVersion = desktopInfo?.appVersion ?? null;
  const capabilityIcons: Record<string, IconName> = {
    texto: 'chat',
    imagem: 'image',
    video: 'video',
    musica: 'music',
    voz: 'waveform',
  };
  const aiMarks: Record<string, string> = {
    chatgpt: chatgptMark,
    claude: claudeMark,
    gemini: geminiMark,
    higgsfield: higgsfieldMark,
    magnific: magnificMark,
    treblo: trebloMark,
  };
  const connectEntry = connectTarget ? catalogEntry(connectTarget) : null;
  // IAs do catálogo (não-builtIn) conectadas e capazes de imagem: entram no
  // seletor junto das contas, porque para o aluno é tudo a mesma lista.
  const catalogMusicProviders = AI_CATALOG.filter((entry) => (
    entry.capabilities.includes('musica')
    && aiCatalog.connections.some((item) => item.id === entry.id && item.connected)
  ));
  const catalogChatProviders = AI_CATALOG.filter((entry) => (
    !entry.builtIn
    && Boolean(entry.openaiBaseUrl)
    && entry.models.some((model) => model.capability === 'texto')
    && aiCatalog.connections.some((item) => item.id === entry.id && item.connected)
  ));
  const chatSelection = aiCatalog.chatProviderId
    ? `catalogo:${aiCatalog.chatProviderId}`
    : aiProvider;
  const catalogImageProviders = AI_CATALOG.filter((entry) => (
    !entry.builtIn
    && entry.capabilities.includes('imagem')
    && aiCatalog.connections.some((item) => item.id === entry.id && item.connected)
  ));
  const catalogVideoProviders = AI_CATALOG.filter((entry) => (
    entry.capabilities.includes('video')
    && aiCatalog.connections.some((item) => item.id === entry.id && item.connected)
  ));
  const videoSelection = aiRoles.videoCatalog
    ? `catalogo:${aiRoles.videoCatalog}`
    : (catalogVideoProviders[0] ? `catalogo:${catalogVideoProviders[0].id}` : '');
  const imageSelection = aiRoles.imageCatalog
    ? `catalogo:${aiRoles.imageCatalog}`
    : aiRoles.image ?? (catalogImageProviders[0] ? `catalogo:${catalogImageProviders[0].id}` : '');
  // Já conectada: o modal mostra o que está valendo (e-mail do login ou chave
  // mascarada) em vez de abrir vazio, como se não houvesse conexão.
  const connectSaved = Boolean(connectEntry && providerStatus(connectEntry).connected);
  const connectedByLogin = Boolean(
    connectEntry
    && ((connectEntry.builtIn === 'chatgpt' && account.account?.type === 'chatgpt')
      || (connectEntry.builtIn === 'claude' && claudeAccount.status === 'signed-in' && claudeAccount.mode !== 'api-key')),
  );
  // Chave salva de verdade: só aí o campo aparece preenchido com a lixeira.
  const connectedByKey = connectSaved && !connectedByLogin;
  const loginEmail = connectEntry?.builtIn === 'chatgpt'
    ? account.account?.email ?? null
    : connectEntry?.builtIn === 'claude' ? claudeAccount.email ?? null : null;
  const fieldValue = (entry: AiCatalogEntry, field: { key: string; secret: boolean }) => {
    const draft = catalogDraft[entry.id]?.[field.key] ?? '';
    if (!providerStatus(entry).connected) return draft;
    if (entry.builtIn === 'chatgpt') {
      return account.account?.type === 'apiKey' ? 'chave conectada' : draft;
    }
    if (entry.builtIn === 'claude') {
      return claudeAccount.mode === 'api-key' ? (claudeAccount.email ?? 'chave conectada') : draft;
    }
    if (entry.builtIn === 'gemini') return geminiAccount.maskedKey ?? draft;
    const connection = aiCatalog.connections.find((item) => item.id === entry.id);
    return field.secret ? (connection?.maskedKey ?? '') : (connection?.fields[field.key] ?? '');
  };
  const connectReady = Boolean(
    connectEntry?.credentials.every((field) => (catalogDraft[connectEntry.id]?.[field.key] ?? '').trim()),
  );
  // Evidência de corte REAL, verificada pelo aplicativo — nenhum gate de
  // aprovação (nem o ancorado em mensagem, nem o fixo) aparece sem ela. Três
  // condições: o preview toca um render de edit/ (clean-cut), o modelo vem de
  // EDL com fontes reais e o corte removeu material de fato. Um texto do
  // agente dizendo "aprova o corte?" com a transcrição quebrada (aconteceu no
  // mac e no Windows) não abre mais botões de Aprovado/J-Cut.
  const realCleanCutReady = useMemo(() => {
    const model = workspace?.timelineModel;
    if (workspace?.media?.kind !== 'clean-cut' || !model) return false;
    const durations = Object.fromEntries(
      (workspace.sources ?? []).map((source) => [source.id, source.duration]),
    );
    return modelRemovesMaterial(model, durations);
  }, [workspace]);
  const pendingCutApprovalId = useMemo(
    () => (styleApplied || !realCleanCutReady ? null : [...messages].reverse().find((message) => (
      message.role === 'assistant' &&
      message.id !== handledCutApprovalId &&
      !message.id.startsWith('style-gate:') &&
      asksForCleanCutApproval(message.text)
    ))?.id ?? null),
    [handledCutApprovalId, messages, styleApplied, realCleanCutReady],
  );
  // Rede de segurança: se o preview já é um corte limpo não aprovado mas
  // NENHUMA mensagem casou com a detecção (o agente fraseia como quiser), o
  // gate aparece fixo depois da última mensagem — com o Aprovado e o J-Cut.
  const showPinnedCutGate = Boolean(
    !pendingCutApprovalId &&
    !handledCutApprovalId &&
    !styleApplied &&
    realCleanCutReady &&
    !activeTurn &&
    !sending &&
    messages.some((message) => message.role === 'assistant'),
  );

  const missingRuntimeNames = useMemo(
    () => runtimes.filter((runtime) => !runtime.available).map((runtime) => labels[runtime.name]),
    [runtimes],
  );

  async function refreshRuntimes() {
    setChecking(true);
    try {
      setRuntimes(await window.edvidDesktop.checkRuntimes());
    } finally {
      setChecking(false);
    }
  }

  function activateWorkspace(next: ProjectWorkspace) {
    activeProjectDirectoryRef.current = next.project.directory;
    const storedChat = readStoredChat(next.project.directory);
    setWorkspace(next);
    setMessages(storedChat.messages);
    setApprovals([]);
    setAnsweringApprovalId(null);
    setApprovalError(null);
    // O estilo do disco entra POR CIMA do padrão, nunca no lugar dele: um
    // projeto salvo antes de um campo existir (splitMedia, da 0.30.0) voltava
    // sem ele, e o seletor "Conteúdo da faixa" abria sem nenhuma opção
    // marcada — mesmo o app tratando o ausente como "Imagens por IA".
    setStyle(readStoredStyle(
      next.project.directory,
      next.style ? { ...defaultStyleSetup, ...next.style } : defaultStyleSetup,
    ));
    setStyleApplied(next.media?.kind === 'final' || Boolean(next.style));
    setCorrections([]);
    setHandledCutApprovalId(storedChat.handledCutApprovalId);
    setJcutApplied(storedChat.jcutApplied);
    setWorkTab('edit');
    setFollowingOutput(true);
  }

  async function reloadProjects() {
    setProjects(await window.edvidDesktop.listRecentProjects());
  }

  async function chooseProjectDirectory(name?: string) {
    setOpeningProject(true);
    try {
      const selected = await window.edvidDesktop.selectProjectDirectory(name);
      if (selected) {
        activateWorkspace(selected);
        await reloadProjects();
      }
    } catch (error) {
      setMessages((current) => [...current, { id: `error:${Date.now()}`, role: 'system', text: errorMessage(error) }]);
    } finally {
      setOpeningProject(false);
    }
  }

  function startCreateProject() {
    setNameValue('');
    setNameDialog({ mode: 'create' });
  }

  function startRenameProject(project: ProjectSummary) {
    setProjectMenu(null);
    setNameValue(project.name);
    setNameDialog({ mode: 'rename', directory: project.directory });
  }

  async function confirmNameDialog() {
    const dialog = nameDialog;
    if (!dialog) return;
    const name = nameValue.trim();
    setNameDialog(null);
    if (dialog.mode === 'create') {
      await chooseProjectDirectory(name || undefined);
      return;
    }
    if (!name) return;
    try {
      setProjects(await window.edvidDesktop.renameProject(dialog.directory, name));
      if (dialog.directory === projectDirectory) {
        setWorkspace((current) => current
          ? { ...current, project: { ...current.project, name } }
          : current);
      }
    } catch (error) {
      setMessages((current) => [...current, { id: `error:${Date.now()}`, role: 'system', text: errorMessage(error) }]);
    }
  }

  async function togglePinProject(project: ProjectSummary) {
    setProjectMenu(null);
    try {
      setProjects(await window.edvidDesktop.pinProject(project.directory, !project.pinned));
    } catch (error) {
      setMessages((current) => [...current, { id: `error:${Date.now()}`, role: 'system', text: errorMessage(error) }]);
    }
  }

  async function removeProjectFromList(project: ProjectSummary) {
    setProjectMenu(null);
    try {
      // Remove apenas da lista de recentes; a pasta continua intacta no disco.
      setProjects(await window.edvidDesktop.removeRecentProject(project.directory));
      // Apagar o projeto ABERTO fecha o projeto: ele continuava na tela e so
      // sumia reabrindo o app. O estado volta ao de "nenhum projeto" — a tela
      // inicial assume sozinha.
      if (activeProjectDirectoryRef.current === project.directory) {
        activeProjectDirectoryRef.current = null;
        setWorkspace(null);
        setMessages([]);
        setApprovals([]);
        setCorrections([]);
        setStyleApplied(false);
        setHandledCutApprovalId(null);
        setJcutApplied(false);
      }
    } catch (error) {
      setMessages((current) => [...current, { id: `error:${Date.now()}`, role: 'system', text: errorMessage(error) }]);
    }
  }

  async function openRecentProject(project: ProjectSummary) {
    if (project.directory === projectDirectory || openingProject || activeTurn) return;
    setOpeningProject(true);
    try {
      activateWorkspace(await window.edvidDesktop.openRecentProject(project.directory));
      await reloadProjects();
    } catch (error) {
      setMessages((current) => [...current, { id: `error:${Date.now()}`, role: 'system', text: errorMessage(error) }]);
    } finally {
      setOpeningProject(false);
    }
  }

  async function flushPendingTimelineSave() {
    const pending = pendingTimelineSaveRef.current;
    if (!pending) return;
    pendingTimelineSaveRef.current = null;
    if (timelineSaveTimerRef.current !== null) {
      window.clearTimeout(timelineSaveTimerRef.current);
      timelineSaveTimerRef.current = null;
    }
    try {
      await window.edvidDesktop.saveTimelineModel(pending.directory, pending.model, pending.loadStamp);
    } catch (error) {
      setMessages((current) => [...current, { id: `error:${Date.now()}`, role: 'system', text: errorMessage(error) }]);
    }
  }

  // O QUE O EDVID ESTÁ FAZENDO AGORA, em uma frase.
  //
  // Uma fonte só para todos os processos: chat, corte, render, imagem. O
  // rodapé antes só olhava o turno do chat e dizia "Pronto" com o aplicativo
  // renderizando — o aluno via o contrário do que estava escrito. A ordem
  // abaixo é de prioridade: o que estiver mais em cima é o que ele lê.
  const trabalho = useMemo((): string | null => {
    if (cleanCut.status === 'transcrevendo') {
      const total = cleanCut.total ?? 0;
      return total > 1 ? `Ouvindo o vídeo · ${(cleanCut.done ?? 0) + 1} de ${total}` : 'Ouvindo o vídeo';
    }
    if (cleanCut.status === 'analisando') return 'Medindo as pausas';
    if (cleanCut.status === 'cortando') return 'Montando o corte';
    if (approvingCut) return 'Preparando a edição';
    if (jcutBusy) return 'Antecipando o áudio dos cortes';
    if (phase2Render.status === 'rendering') {
      return phase2Render.totalFrames
        ? `Renderizando a edição · ${Math.round((phase2Render.progress ?? 0) * 100)}%`
        : 'Renderizando a edição';
    }
    if (imageGen.status === 'generating') {
      const total = imageGen.total ?? 0;
      // Quando o hub atende, a nota já diz o que está sendo feito, em que
      // nível e quanto custa — e crédito precisa aparecer ANTES de gastar.
      if (imageGen.note) {
        return total > 1 ? `${imageGen.note} · ${imageGen.done ?? 0} de ${total}` : imageGen.note;
      }
      return total > 1 ? `Gerando as imagens · ${imageGen.done ?? 0} de ${total}` : 'Gerando a imagem';
    }
    if (musicBusy) return 'Compondo a trilha sonora';
    if (whisperModel.status === 'downloading') return 'Preparando a transcrição';
    if (runtimePack.status === 'downloading' || runtimePack.status === 'extracting') {
      return 'Preparando as ferramentas';
    }
    if (activeTurn || sending) return 'Escrevendo';
    return null;
  }, [
    activeTurn, approvingCut, cleanCut, imageGen, jcutBusy, musicBusy,
    phase2Render, runtimePack.status, sending, whisperModel.status,
  ]);

  // O corte limpo NAO passa pelo chat: quem transcreve, mede o silencio e
  // corta e o proprio Edvid. Antes isso era um pedido ao agente, e com IA
  // gratuita ele respondia com um tutorial em vez de trabalhar.
  async function startCleanCut() {
    const directory = activeProjectDirectoryRef.current;
    if (!directory || cleanCutRunning) return;
    setFollowingOutput(true);
    setMessages((current) => [...current, {
      id: `user:${Date.now()}`,
      role: 'user',
      text: 'Iniciar o corte limpo',
    }]);
    setCleanCut({ status: 'transcrevendo' });
    try {
      await window.edvidDesktop.runCleanCut(directory);
    } catch (error) {
      setCleanCut({ status: 'erro', error: errorMessage(error) });
    }
  }

  // O corte terminou: a mensagem entra no chat como se o Edvid tivesse falado
  // (e o gate de aprovacao aparece por ela), e o workspace recarrega para a
  // timeline e o preview mostrarem o corte novo.
  function handleCleanCutState(state: CleanCutState) {
    setCleanCut(state);
    if (state.status === 'pronto') {
      setMessages((current) => [...current, {
        id: `assistant:corte-${Date.now()}`,
        role: 'assistant',
        text: state.summary ?? 'Corte limpo pronto. Assista no preview e aprove para escolher os estilos.',
      }]);
      void refreshWorkspace();
      return;
    }
    if (state.status === 'erro') {
      setMessages((current) => [...current, {
        id: `error:corte-${Date.now()}`,
        role: 'system',
        text: state.error || 'Não consegui fazer o corte limpo.',
      }]);
    }
  }

  async function refreshWorkspace() {
    const directory = activeProjectDirectoryRef.current;
    if (!directory) return;
    try {
      // Garante que a última edição da timeline está no disco antes de reler
      // o projeto; sem isso o refresh reverteria a edição na interface.
      await flushPendingTimelineSave();
      const refreshed = await window.edvidDesktop.refreshProjectWorkspace(directory);
      setWorkspace(refreshed);
      if (refreshed.style) {
        setStyle(readStoredStyle(directory, refreshed.style));
      }
      if (refreshed.media?.kind === 'final' || refreshed.style) setStyleApplied(true);
    } catch (error) {
      setMessages((current) => [...current, { id: `error:${Date.now()}`, role: 'system', text: errorMessage(error) }]);
    }
  }

  // RENDER SO NO BOTAO (0.30.0, pedido de uso real): antes, todo turno do
  // agente, abrir projeto, J-Cut e aplicar estilos disparavam o render
  // completo — o aluno via "Renderizando…" sem ter pedido. Agora a previa ao
  // vivo mostra tudo e esta funcao so e chamada pelo Renderizar da barra.
  function requestPhase2Render() {
    const directory = activeProjectDirectoryRef.current;
    if (!directory) return;
    // Antes de renderizar: o agente prometeu uma animação sob medida (kind
    // "custom") e não escreveu o componente? Renderizar agora gastaria minutos
    // para entregar um vídeo sem ela. Cobra o turno que falta — uma vez por
    // projeto, para nunca virar pingue-pongue — e o render vem depois dele.
    void window.edvidDesktop.pendingCustomAnimations(directory).then((pendentes) => {
      if (pendentes.length > 0 && !customAnimationChasedRef.current.has(directory)) {
        customAnimationChasedRef.current.add(directory);
        setCustomAnimationRequest({ directory, labels: pendentes });
        return;
      }
      // O andamento e o desfecho chegam por onPhase2RenderState.
      void window.edvidDesktop.renderPhase2(directory).catch(() => {});
    }).catch(() => {
      void window.edvidDesktop.renderPhase2(directory).catch(() => {});
    });
  }

  function requestImageFulfillment() {
    const directory = activeProjectDirectoryRef.current;
    if (!directory) return;
    // O andamento chega por onImageGenState; sem pedidos o main devolve idle.
    void window.edvidDesktop.fulfillImageRequests(directory).catch(() => {});
    // Clipes seguem o mesmo caminho, em fila própria: um vídeo leva minutos e
    // não pode segurar as imagens, que levam segundos.
    void window.edvidDesktop.fulfillVideoRequests(directory).catch(() => {});
    // Trilha segue o mesmo caminho: sem pedido em edit/musica/, volta na hora.
    void window.edvidDesktop.fulfillMusicRequests(directory)
      .then((result) => {
        if (result.done > 0) {
          // O app já colocou o arquivo em public/ e ligou o soundtrack: o
          // agente só precisa seguir. Pedir cópia falhou em uso real.
          void dispatchMessage(
            'A trilha sonora já está aplicada na edição pelo Edvid. Não copie arquivos nem mexa no soundtrack: apenas siga com o restante da edição e encerre o turno.',
            'Trilha pronta',
          );
        }
      })
      .catch(() => {});
  }

  // Se o J-Cut ja foi aplicado e o agente re-renderizou o corte neste turno,
  // o main reaplica sozinho; a timeline e a Fase 2 acompanham o arquivo novo.
  function requestJcutSync() {
    const directory = activeProjectDirectoryRef.current;
    if (!directory) return;
    void window.edvidDesktop.syncJcut(directory).then((result) => {
      if (result?.changed) void refreshWorkspace();
    }).catch(() => {});
  }

  function handleImageGenState(state: ImageGenState) {
    const previous = imageGenStatusRef.current;
    imageGenStatusRef.current = state.status;
    setImageGen(state);
    // Geracao terminou com sucesso: fecha o ciclo sozinho — o agente pediu
    // as imagens e encerrou o turno, entao alguem precisa acorda-lo para
    // aplica-las. O despacho real acontece num efeito, com closures atuais.
    if (state.status === 'ready' && previous === 'generating' && (state.done ?? 0) > 0) {
      setImageContinuationAt(Date.now());
    }
  }

  function handlePhase2RenderState(state: Phase2RenderState) {
    const previous = phase2StatusRef.current;
    phase2StatusRef.current = state.status;
    setPhase2Render(state);
    if (state.status === 'ready' && previous === 'rendering') {
      // Um render novo terminou; recarrega o workspace para o preview trocar
      // para o resultado estilizado.
      notify('ok', 'Render concluído', 'O vídeo final está pronto — a prévia já mostra o resultado.');
      void refreshWorkspace();
    }
    if (state.status === 'error' && previous !== 'error' && state.error) {
      notify('erro', 'O render falhou', state.error);
      setMessages((current) => [...current, {
        id: `error:${Date.now()}`,
        role: 'system',
        text: `O render da edição estilizada falhou: ${state.error}`,
      }]);
    }
  }

  // --- Catálogo unificado: estado de cada IA e ações do modal de conexão ----
  // Os três provedores antigos (ChatGPT, Claude, Gemini) têm fluxo próprio no
  // main; aqui eles só emprestam o estado para o MESMO card dos demais.
  function providerStatus(entry: AiCatalogEntry): { connected: boolean; label: string } {
    if (entry.builtIn === 'chatgpt') {
      return { connected: chatgptConnected, label: chatgptConnected ? 'Conectado' : 'Não conectado' };
    }
    if (entry.builtIn === 'claude') {
      return {
        connected: claudeAccount.status === 'signed-in',
        label: claudeAccount.status === 'signed-in' ? 'Conectado' : 'Não conectado',
      };
    }
    if (entry.builtIn === 'gemini') {
      return {
        connected: Boolean(geminiAccount.maskedKey),
        label: geminiAccount.maskedKey ? 'Conectado' : 'Não conectado',
      };
    }
    const connection = aiCatalog.connections.find((item) => item.id === entry.id);
    return {
      connected: Boolean(connection?.connected),
      label: connection?.connected ? 'Conectado' : 'Não conectado',
    };
  }

  // Testa a chave ANTES de salvar: colar errado e só descobrir na hora de
  // gerar é o tipo de atrito que faz o aluno desistir.
  async function testConnection(entry: AiCatalogEntry) {
    const draft = catalogDraft[entry.id] ?? {};
    setConnectTesting(true);
    setConnectError(null);
    setConnectTested(null);
    try {
      const result = await window.edvidDesktop.testCatalogProvider(entry.id, draft);
      if (result.ok) setConnectTested(result.detail || 'Chave válida.');
      else setConnectError(result.detail || 'A chave não foi aceita.');
    } catch (error) {
      setConnectError(errorMessage(error));
    } finally {
      setConnectTesting(false);
    }
  }

  async function saveConnection(entry: AiCatalogEntry) {
    const draft = catalogDraft[entry.id] ?? {};
    setConnectError(null);
    try {
      if (entry.builtIn === 'chatgpt') {
        setAccount(await window.edvidDesktop.loginCodexWithApiKey(draft.apiKey ?? ''));
      } else if (entry.builtIn === 'claude') {
        setClaudeAccount(await window.edvidDesktop.connectClaudeApiKey(draft.apiKey ?? ''));
      } else if (entry.builtIn === 'gemini') {
        setGeminiAccount(await window.edvidDesktop.connectGeminiApiKey(draft.apiKey ?? ''));
      } else {
        setAiCatalog(await window.edvidDesktop.connectCatalogProvider(entry.id, draft));
      }
      setCatalogDraft((current) => ({ ...current, [entry.id]: {} }));
      setConnectTarget(null);
    } catch (error) {
      setConnectError(errorMessage(error));
    }
  }

  async function removeConnection(entry: AiCatalogEntry) {
    try {
      if (entry.builtIn === 'chatgpt') setAccount(await window.edvidDesktop.logoutCodex());
      else if (entry.builtIn === 'claude') setClaudeAccount(await window.edvidDesktop.logoutClaude());
      else if (entry.builtIn === 'gemini') setGeminiAccount(await window.edvidDesktop.disconnectGemini());
      else setAiCatalog(await window.edvidDesktop.disconnectCatalogProvider(entry.id));
      setConnectTarget(null);
    } catch (error) {
      setConnectError(errorMessage(error));
    }
  }

  async function login() {
    setAccount({ ...initialAccount, status: 'starting' });
    try {
      setAccount(await window.edvidDesktop.loginWithChatGPT());
    } catch (error) {
      setAccount({ status: 'error', account: null, requiresOpenaiAuth: true, error: errorMessage(error) });
    }
  }

  async function logout() {
    try {
      setAccount(await window.edvidDesktop.logoutCodex());
      // O histórico não é apagado: a conversa pertence ao projeto, não à conta.
    } catch (error) {
      setAccount({ ...account, status: 'error', error: errorMessage(error) });
    }
  }

  async function cancelLogin() {
    try {
      setAccount(await window.edvidDesktop.cancelChatGPTLogin());
    } catch (error) {
      setAccount({ ...initialAccount, status: 'error', error: errorMessage(error) });
    }
  }

  async function claudeLogin() {
    try {
      setClaudeAccount(await window.edvidDesktop.loginWithClaude());
    } catch (error) {
      setClaudeAccount({ status: 'error', email: null, error: errorMessage(error) });
    }
  }

  async function claudeCancelLogin() {
    setClaudeCode('');
    try {
      setClaudeAccount(await window.edvidDesktop.cancelClaudeLogin());
    } catch (error) {
      setClaudeAccount({ status: 'error', email: null, error: errorMessage(error) });
    }
  }

  async function claudeLogout() {
    try {
      setClaudeAccount(await window.edvidDesktop.logoutClaude());
    } catch (error) {
      setClaudeAccount({ ...claudeAccount, status: 'error', error: errorMessage(error) });
    }
  }

  async function claudeSubmitCode() {
    const code = claudeCode.trim();
    if (!code) return;
    try {
      setClaudeAccount(await window.edvidDesktop.submitClaudeLoginCode(code));
      setClaudeCode('');
    } catch (error) {
      setClaudeAccount({ status: 'error', email: null, error: errorMessage(error) });
    }
  }

  function switchAiProvider(provider: AiProvider, pinned = true) {
    void window.edvidDesktop.setAiRole('chat', provider, pinned).then(setAiRoles);
  }

  function switchImageProvider(provider: AiProvider | null, pinned = true) {
    void window.edvidDesktop.setAiRole('image', provider, pinned).then(setAiRoles);
  }

  function openKeyEntry(provider: AiProvider) {
    setKeyEntry(provider);
    setKeyValue('');
    setKeyError(null);
  }

  async function submitProviderKey() {
    const apiKey = keyValue.trim();
    if (!apiKey || !keyEntry || keyBusy) return;
    setKeyBusy(true);
    setKeyError(null);
    try {
      if (keyEntry === 'chatgpt') {
        const state = await window.edvidDesktop.loginCodexWithApiKey(apiKey);
        setAccount(state);
        if (state.status === 'signed-in') setKeyEntry(null);
      } else if (keyEntry === 'claude') {
        const state = await window.edvidDesktop.connectClaudeApiKey(apiKey);
        setClaudeAccount(state);
        if (state.status === 'signed-in' && state.mode === 'api-key') setKeyEntry(null);
      } else {
        const state = await window.edvidDesktop.connectGeminiApiKey(apiKey);
        setGeminiAccount(state);
        if (state.status === 'signed-in') setKeyEntry(null);
      }
      setKeyValue('');
    } catch (error) {
      setKeyError(errorMessage(error));
    } finally {
      setKeyBusy(false);
    }
  }

  const keyPlaceholders: Record<AiProvider, string> = {
    chatgpt: 'Cole a chave da OpenAI (sk-…)',
    claude: 'Cole a chave da Anthropic (sk-ant-…)',
    gemini: 'Cole a chave do Google AI Studio (AIza…)',
  };

  // Campo de chave compartilhado entre o onboarding e as Configurações.
  const keyEntryRow = keyEntry && (
    <div className="ai-code-row">
      <input
        type="password"
        value={keyValue}
        placeholder={keyPlaceholders[keyEntry]}
        onChange={(event) => setKeyValue(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter') void submitProviderKey(); }}
        autoFocus
      />
      <button type="button" className="btn primary small" onClick={() => void submitProviderKey()} disabled={!keyValue.trim() || keyBusy}>
        {keyBusy ? 'Validando…' : 'Conectar'}
      </button>
    </div>
  );

  const keyEntryError = keyEntry && (
    keyError
    ?? (keyEntry === 'claude' ? claudeAccount.error : keyEntry === 'gemini' ? geminiAccount.error : null)
  );

  function handleCodexEvent(event: CodexEvent) {
    if (event.type === 'account') {
      setAccount(event.state);
      return;
    }
    if (event.type === 'assistant-delta') {
      const id = `assistant:${event.turnId}`;
      setMessages((current) => {
        const existing = current.findIndex((message) => message.id === id);
        if (existing < 0) return [...current, { id, role: 'assistant', text: event.delta }];
        return current.map((message, index) => index === existing ? { ...message, text: message.text + event.delta } : message);
      });
      return;
    }
    if (event.type === 'assistant-final') {
      const id = `assistant:${event.turnId}`;
      setMessages((current) => {
        const existing = current.some((message) => message.id === id);
        return existing ? current.map((message) => message.id === id ? { ...message, text: event.text } : message) : [...current, { id, role: 'assistant', text: event.text }];
      });
      if (/(escolh|selecion).{0,60}(estilo|headline|legenda)|estilo.{0,60}(headline|legenda)/isu.test(event.text)) {
        setWorkTab('styles');
      }
      return;
    }
    if (event.type === 'turn-state') {
      if (event.status === 'started') {
        turnStartedAtRef.current = Date.now();
        setActiveTurn({ threadId: event.threadId, turnId: event.turnId });
      } else {
        setActiveTurn(null);
        setSending(false);
        // O SINO DA CASA: falha avisa sempre (o motivo já está no chat);
        // sucesso só quando o turno foi longo o bastante para o aluno ter
        // saído da frente. Interrupção foi o aluno — não toca nada.
        if (event.status === 'failed' || event.error) {
          notify('erro', 'A tarefa do chat falhou', 'O motivo está no chat.');
        } else if (event.status === 'completed' && Date.now() - turnStartedAtRef.current >= 10_000) {
          notify('ok', 'O Edvid terminou', 'A tarefa pedida no chat foi concluída.');
        }
        // Limite de uso: o erro cru do provedor (em inglês) nunca chega ao
        // aluno. Com outro chat conectado, troca o preferencial sozinha e
        // avisa — mas nunca reenvia a mensagem, para não executar uma edição
        // duas vezes. Sem alternativa, mostra a mensagem padrão em PT-BR.
        const hitLimit = event.status === 'failed' && Boolean(event.error)
          && /usage limit|rate.?limit|limite de uso|resource_exhausted|too many requests|\b429\b|quota|exceeded/iu.test(event.error ?? '');
        if (hitLimit) {
          const { roles, connected } = aiRuntimeRef.current;
          const names: Record<AiProvider, string> = { chatgpt: 'ChatGPT', claude: 'Claude', gemini: 'Gemini' };
          const fallback = (['claude', 'chatgpt', 'gemini'] as AiProvider[])
            .find((provider) => provider !== roles.chat && connected[provider]);
          if (fallback) {
            const previous = names[roles.chat];
            switchAiProvider(fallback, false);
            setMessages((current) => [...current, {
              id: `system:${Date.now()}`,
              role: 'system',
              text: `O ${previous} atingiu o limite de uso. Troquei o chat para o ${names[fallback]} — reenvie a última mensagem para continuar do ponto atual.`,
            }]);
          } else {
            setMessages((current) => [...current, {
              id: `error:${event.turnId}`,
              role: 'system',
              text: 'Você chegou ao limite de uso da IA. Tente novamente mais tarde ou conecte outra IA.',
            }]);
          }
        } else if (event.error) {
          setMessages((current) => [...current, { id: `error:${event.turnId}`, role: 'system', text: friendlyAiError(event.error ?? '') }]);
        }
        void refreshWorkspace();
        // O turno pode ter mudado os dados da Fase 2 — a previa ao vivo
        // recarrega pelo refreshWorkspace e o botao Renderizar acende pela
        // impressao digital. RENDER AUTOMATICO NAO EXISTE MAIS: só o botão.
        // Imagens/clipes pedidos e o J-Cut continuam automáticos — são
        // gerações de ELEMENTO, não o vídeo inteiro.
        requestJcutSync();
        requestImageFulfillment();
      }
      return;
    }
    if (event.type === 'approval-requested') {
      setApprovalError(null);
      setApprovals((current) => (
        current.some((approval) => approval.id === event.approval.id)
          ? current
          : [...current, event.approval]
      ));
      return;
    }
    if (event.type === 'approval-resolved') {
      setApprovals((current) => current.filter((approval) => approval.id !== event.approvalId));
      setAnsweringApprovalId((current) => current === event.approvalId ? null : current);
      setApprovalError(null);
      return;
    }
    if (event.type === 'error') {
      setSending(false);
      setMessages((current) => [...current, { id: `error:${Date.now()}`, role: 'system', text: friendlyAiError(event.message) }]);
    }
  }

  async function dispatchMessage(text: string, displayText = text) {
    const trimmed = text.trim();
    if (!trimmed || !projectDirectory || !activeAiConnected || sending) return false;
    setSending(true);
    setFollowingOutput(true);
    setMessages((current) => [...current, { id: `user:${Date.now()}`, role: 'user', text: displayText.trim() || trimmed }]);
    try {
      const result = await window.edvidDesktop.sendCodexMessage({ projectDirectory, text: trimmed });
      setActiveTurn(result);
      return true;
    } catch (error) {
      setSending(false);
      setMessages((current) => [...current, { id: `error:${Date.now()}`, role: 'system', text: errorMessage(error) }]);
      return false;
    }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const text = composer.trim();
    if (!text) return;
    setComposer('');
    await dispatchMessage(text);
  }

  async function applyStyleSelection() {
    if (!projectDirectory) return;
    // A origem da mídia que a interface MOSTRA é a que vale — ver
    // splitMediaEfetivo. Aplicar o valor guardado faria o Edvid planejar
    // "Imagens por IA" enquanto o seletor oferecia só "Nenhum".
    const escolhas: StyleSetup = { ...style, splitMedia: splitMediaEfetivo };
    // A Fase 2 renderiza no Remotion. O aplicativo prepara o motor e monta o
    // projeto antes de falar com o agente, para ele nunca precisar de rede
    // nem inventar um pipeline proprio.
    const runtime = await window.edvidDesktop.ensureRemotionRuntime();
    setRemotionRuntime(runtime);
    if (runtime.status !== 'ready') {
      const reason = runtime.status === 'error' && runtime.error ? ` Motivo: ${runtime.error}` : '';
      setMessages((current) => [...current, {
        id: `error:${Date.now()}`,
        role: 'system',
        text: `Não foi possível preparar o motor de render da Fase 2.${reason} Clique em "Salvar e aplicar" para tentar de novo.`,
      }]);
      return;
    }
    // O EDVID MONTA A FASE 2 INTEIRA: copia o corte aprovado, mede o arquivo,
    // gera legenda e segmentos e escreve os dados da edição a partir deste
    // formulário. Isto era um pedido ao agente, e o que voltava era um corte
    // de 91s declarado como 30s, legendas vazias, a headline de exemplo do
    // template e nenhum vídeo na pasta — nada renderizava.
    // O plano volta com o que o APLICATIVO escreveu sozinho — janelas de tela
    // dividida e flashes. Sem esse número a interface não tem como dizer a
    // verdade quando não há agente para preencher as janelas.
    let plano = { splits: 0, flashes: 0 };
    try {
      plano = await window.edvidDesktop.buildPhase2(projectDirectory, escolhas);
    } catch (error) {
      setMessages((current) => [...current, { id: `error:${Date.now()}`, role: 'system', text: errorMessage(error) }]);
      return;
    }
    localStorage.setItem(styleStorageKey(projectDirectory), JSON.stringify(escolhas));
    setStyleApplied(true);
    // A trilha, quando escolhida, foi PEDIDA pelo app na montagem. Gerar aqui
    // e o que faltava: numa edição limpa o agente nem é chamado, e antes era
    // ele quem disparava isso.
    if (escolhas.elements.musicAI) {
      setMusicBusy(true);
      void window.edvidDesktop.fulfillMusicRequests(projectDirectory)
        .catch(() => ({ done: 0 }))
        .then(() => setMusicBusy(false))
        .catch(() => {});
    }
    // Sem render aqui: a previa ao vivo mostra os estilos assim que o
    // edit-data muda, e exportar e decisao do aluno no botao Renderizar.
    const enabled = Object.entries(escolhas.elements).filter(([, value]) => value).map(([key]) => key).join(', ') || 'nenhum';
    const disabled = Object.entries(escolhas.elements).filter(([, value]) => !value).map(([key]) => key).join(', ') || 'nenhum';
    const prompt = [
      'Aplique estas escolhas de estilo na Fase 2 do projeto:',
      `- Tipo de edição: ${escolhas.edit}`,
      `- Headline: ${escolhas.headline}${escolhas.headlineText.trim() ? ` (texto já escrito pelo aluno — não mude)` : ''}`,
      `- Legendas: ${escolhas.captions}`,
      `- Cor de destaque: ${escolhas.accent}`,
      `- Elementos incluídos: ${enabled}`,
      `- Elementos fora: ${disabled}`,
      `- Observação: ${escolhas.note.trim() || 'nenhuma'}`,
      // Trilha com IA: o Edvid gera fora do sandbox, como as imagens.
      ...(escolhas.elements.musicAI
        ? [
            '',
            'Trilha sonora: o Edvid já pediu a música, já gerou e já ligou na edição. Não escreva pedidos.json, não copie arquivo e não mexa no campo soundtrack.',
          ]
        : []),
      // Tela dividida sem conteúdo definido fazia o agente improvisar (já
      // duplicou o próprio vídeo nas duas metades). A regra padrão é gerar
      // imagens com IA ilustrando a fala; a Observação pode apontar outra
      // fonte (ex.: imagens da pasta do projeto).
      ...((escolhas.edit === 'split' || escolhas.edit === 'split2') && plano.splits > 0
        ? [
            '',
            // AS JANELAS JÁ EXISTEM. O Edvid as escreve a partir da própria
            // fala (src/edit-plan.ts), em fronteira de frase e com respiro
            // entre uma e outra. Antes quem as inventava era o agente — e sem
            // agente conectado elas simplesmente não existiam. O que sobrou
            // para ele é o CONTEÚDO: o que cada imagem ou clipe mostra.
            `Tela dividida: o campo splits do edit-data.json JÁ ESTÁ ESCRITO, com ${plano.splits} ${plano.splits === 1 ? 'janela' : 'janelas'} de tempo e "src": "" em cada uma. NÃO crie, apague, mova nem redimensione janela nenhuma, e não mexa em "position" — o tempo e o layout já estão decididos.`,
            escolhas.splitMedia === 'video'
              ? 'Sua parte é o CONTEÚDO de cada janela: para cada uma, peça um clipe em edit/clipes/pedidos.json com "uso": "tela-dividida", "segundos" igual à duração daquela janela e um prompt em inglês ilustrando o que está sendo dito NAQUELE trecho da fala. Depois preencha só o "src" da janela correspondente com "clipes/nome.mp4" e "kind": "video".'
              : escolhas.splitMedia === 'nenhum'
                ? 'O aluno vai apontar os próprios arquivos: NÃO gere imagem nem clipe e NÃO preencha "src". Deixe as janelas vazias como estão.'
                : 'Sua parte é o CONTEÚDO de cada janela: para cada uma, peça uma imagem em edit/imagens/pedidos.json com "uso": "tela-dividida" e um prompt em inglês ilustrando o que está sendo dito NAQUELE trecho da fala. Depois preencha só o "src" da janela correspondente com "imagens/nome.png".',
            'NUNCA use o próprio vídeo do aluno como mídia da outra metade da divisão.',
            'Exceção: se a Observação acima indicar outra fonte (por exemplo, "insira as imagens que estão na pasta do projeto"), use a fonte indicada em vez de gerar imagens novas.',
          ]
        : []),
      '',
      'O EDVID JÁ APLICOU TUDO ISSO. O corte já está em edit/remotion/public/cut.mp4, as legendas, os segmentos e o edit-data.json já foram escritos com as escolhas acima, com as medidas reais do arquivo. NÃO reescreva esses campos e NÃO monte o esqueleto de novo — sobrescrever apaga o que já está certo.',
      'Sua parte é só o que ficou de fora: o conteúdo visual pedido acima (tela dividida, inserts, animações) e a observação do aluno. Some ao edit-data.json existente, sem apagar o que já está lá.',
      'Não execute remotion render: quando terminar, encerre o turno com um resumo curto — o Edvid renderiza sozinho.',
    ].join('\n');
    setWorkTab('edit');
    // O agente só entra quando SOBRA algo criativo: tela dividida (que precisa
    // de imagens ilustrando a fala) ou um pedido escrito na observação. O
    // resto — legenda, zoom, cor, trilha, medidas — o Edvid já escreveu, e
    // pedir de novo era o que fazia o agente sobrescrever tudo com um
    // esqueleto vazio.
    const precisaDoAgente = escolhas.edit !== 'limpa' || escolhas.note.trim().length > 0;
    if (!precisaDoAgente || !activeAiConnected) {
      // ESTA MENSAGEM MENTIA DUAS VEZES. Dizia "estou renderizando o vídeo
      // agora" — e desde a prévia ao vivo o render só acontece no botão — e
      // dizia "estilos aplicados" mesmo quando a tela dividida escolhida no
      // formulário não tinha saído, porque só o agente escrevia os splits e
      // ele não estava conectado. Agora as janelas existem (o app as escreve)
      // e o texto diz exatamente o que ficou pronto e o que falta.
      const partes = ['Estilos aplicados na edição.'];
      if (plano.splits > 0) {
        // Origem "nenhum" (o único caminho sem agente): a faixa sai INTEIRA e
        // o aluno recorta com a tesoura onde quiser. Com IA de geração
        // conectada, cada pedaço oferece gerar imagem/clipe pelo palco.
        const temGeracao = imageAiConnected || videoAiConnected;
        partes.push(escolhas.splitMedia === 'nenhum'
          ? `Deixei a faixa de mídia da tela dividida na timeline, de ponta a ponta: recorte com a tesoura onde quiser e preencha cada trecho ${temGeracao ? 'gerando com IA pelo palco ou apontando um arquivo' : 'apontando os arquivos'}.`
          : `São ${plano.splits === 1 ? 'um espaço' : `${plano.splits} espaços`} de tela dividida na timeline, prontos para receber a mídia.`);
      }
      // A observação é a única parte que continua exigindo um agente: é texto
      // livre, e não há como o aplicativo adivinhar o que ela pede.
      if (escolhas.note.trim() && !activeAiConnected) {
        partes.push('A observação que você escreveu ficou de fora: ela precisa de uma IA de chat conectada para virar edição.');
      }
      partes.push('A prévia já mostra tudo — quando quiser o arquivo final, clique em Renderizar.');
      setMessages((current) => [...current,
        { id: `user:${Date.now()}`, role: 'user', text: 'Aplicar os estilos escolhidos na edição' },
        {
          id: `assistant:estilos-${Date.now()}`,
          role: 'assistant',
          text: partes.join(' '),
        },
      ]);
      return;
    }
    void dispatchMessage(prompt, 'Aplicar os estilos escolhidos na edição');
  }

  async function approveCleanCut(messageId: string) {
    if (approvingCut || sending) return;
    setApprovingCut(true);
    const prompt = [
      'Aprovado. Considere o corte limpo oficialmente aprovado e preserve este gate.',
      'Não faça perguntas de estilo no chat: o usuário escolherá tipo de edição, headline, legendas e elementos visualmente na aba Estilos.',
      'Aguarde o briefing estruturado que será enviado automaticamente ao clicar em “Salvar e aplicar”.',
    ].join(' ');
    const sent = await dispatchMessage(prompt, 'Aprovado');
    if (sent) {
      setHandledCutApprovalId(messageId);
      setWorkTab('styles');
      setMessages((current) => [...current, {
        id: `style-gate:${Date.now()}`,
        role: 'assistant',
        text: 'Corte aprovado. Escolha os estilos visuais na aba Estilos e clique em “Salvar e aplicar” para a Fase 2 começar — ou, se quiser, aplique antes o J-Cut nas transições.',
      }]);
    }
    setApprovingCut(false);
  }

  // O J-Cut é uma operação DETERMINÍSTICA do aplicativo (src/jcut.ts): o
  // vídeo do corte é copiado byte a byte e só o áudio é remontado. O agente
  // não participa — era o improviso dele que dessincronizava o vídeo.
  async function applyJcut() {
    if (jcutApplied || jcutBusy || !projectDirectory) return;
    setJcutBusy(true);
    try {
      const result = await window.edvidDesktop.applyJcut(projectDirectory);
      if (result.applied) {
        // Sem mensagem no chat: o próprio botão fica verde ("J-Cut
        // aplicado") — falha continua avisando por mensagem.
        setJcutApplied(true);
        await refreshWorkspace();
      } else if (result.error) {
        const failure = result.error;
        setMessages((current) => [...current, { id: `error:${Date.now()}`, role: 'system', text: failure }]);
      }
    } catch (error) {
      setMessages((current) => [...current, { id: `error:${Date.now()}`, role: 'system', text: errorMessage(error) }]);
    } finally {
      setJcutBusy(false);
    }
  }

  function handleTimelineModelChange(model: TimelineModel, commit: boolean) {
    const directory = activeProjectDirectoryRef.current;
    const loadStamp = workspace?.timelineLoadStamp ?? '';
    setWorkspace((current) => (
      current
        ? { ...current, timelineModel: model, timeline: { segments: deriveSegments(model) } }
        : current
    ));
    if (!commit || !directory) return;
    pendingTimelineSaveRef.current = { directory, model, loadStamp };
    if (timelineSaveTimerRef.current !== null) window.clearTimeout(timelineSaveTimerRef.current);
    timelineSaveTimerRef.current = window.setTimeout(() => {
      timelineSaveTimerRef.current = null;
      const pending = pendingTimelineSaveRef.current;
      if (!pending) return;
      pendingTimelineSaveRef.current = null;
      void window.edvidDesktop.saveTimelineModel(pending.directory, pending.model, pending.loadStamp).catch((error) => {
        setMessages((current) => [...current, { id: `error:${Date.now()}`, role: 'system', text: errorMessage(error) }]);
      });
    }, 400);
  }

  // Recortar segundo uma lista de intervalos é exatamente o que o corte limpo
  // faz — a única diferença é de onde vem a lista. Isto era um pedido ao
  // agente, que escrevia o EDL, dizia que o Edvid renderizaria e nada
  // acontecia; e o J-Cut seguinte colava o áudio novo no vídeo antigo.
  async function applyTimelineEdits() {
    const directory = activeProjectDirectoryRef.current;
    const model = workspace?.timelineModel;
    if (!directory || !model || cleanCutRunning) return false;
    const ranges = edlRangesFromModel(model);
    if (ranges.length === 0) return false;
    setFollowingOutput(true);
    setMessages((current) => [...current, {
      id: `user:${Date.now()}`,
      role: 'user',
      text: `Aplicar ajustes da timeline (${ranges.length} ${ranges.length === 1 ? 'trecho' : 'trechos'})`,
    }]);
    setCleanCut({ status: 'cortando' });
    try {
      await window.edvidDesktop.applyTimelineRanges(directory, ranges.map((range) => ({
        sourceId: range.sourceId,
        start: range.start,
        end: range.end,
        label: range.label,
      })));
    } catch (error) {
      setCleanCut({ status: 'erro', error: errorMessage(error) });
    }
    return true;
  }

  async function applyTimelineCorrections(items: CorrectionRange[]) {
    const prompt = [
      `Aplique as ${items.length} correções marcadas na timeline do preview atual.`,
      'Os tempos abaixo são In/Out do vídeo renderizado exibido no preview:',
      ...items.map((item, index) => `${index + 1}. IN ${item.start.toFixed(3)}s | OUT ${item.end.toFixed(3)}s | ${item.note}`),
      'Aplique todas as correções em uma única passagem, valide o novo resultado e atualize o preview.',
      'Crie ou atualize edit/edl.json com um range por cena mantida para a timeline refletir todos os cortes. Não peça para eu reenviar estas marcações.',
    ].join('\n');
    return dispatchMessage(
      prompt,
      `Aplicar ${items.length} ${items.length === 1 ? 'correção marcada' : 'correções marcadas'} na timeline`,
    );
  }

  async function interruptTurn() {
    if (!activeTurn) return;
    try {
      await window.edvidDesktop.interruptCodexTurn(activeTurn.threadId, activeTurn.turnId);
    } catch (error) {
      setMessages((current) => [...current, { id: `error:${Date.now()}`, role: 'system', text: errorMessage(error) }]);
    }
  }

  async function answerApproval(approval: CodexApproval, decision: 'accept' | 'acceptForSession' | 'decline') {
    if (answeringApprovalId !== null) return;
    setAnsweringApprovalId(approval.id);
    setApprovalError(null);
    try {
      await window.edvidDesktop.respondToCodexApproval(approval.id, decision);
    } catch (error) {
      setApprovalError(errorMessage(error));
      setAnsweringApprovalId(null);
    }
  }

  function toggleRailPinned() {
    setRailPinned((current) => {
      localStorage.setItem('edvid:rail-pinned', String(!current));
      return !current;
    });
  }

  useEffect(() => {
    const unsubscribe = window.edvidDesktop.onCodexEvent(handleCodexEvent);
    const unsubscribeModel = window.edvidDesktop.onWhisperModelState(setWhisperModel);
    const unsubscribeRemotion = window.edvidDesktop.onRemotionRuntimeState(setRemotionRuntime);
    const unsubscribePhase2 = window.edvidDesktop.onPhase2RenderState(handlePhase2RenderState);
    const unsubscribeCleanCut = window.edvidDesktop.onCleanCutState(handleCleanCutState);
    const unsubscribeUpdate = window.edvidDesktop.onAppUpdateState(setAppUpdate);
    const unsubscribeMember = window.edvidDesktop.onMemberAuthState((state) => {
      setMemberAuth(state);
      if (state.status !== 'checking') setMemberLoaded(true);
    });
    const unsubscribeClaude = window.edvidDesktop.onClaudeAccount(setClaudeAccount);
    const unsubscribeGemini = window.edvidDesktop.onGeminiAccount(setGeminiAccount);
    const unsubscribeCatalog = window.edvidDesktop.onAiCatalog(setAiCatalog);
    const unsubscribeActiveModel = window.edvidDesktop.onActiveModel(setActiveModel);
    void window.edvidDesktop.getAiCatalog().then(setAiCatalog).catch(() => {});
    const unsubscribeRoles = window.edvidDesktop.onAiRoles(setAiRoles);
    const unsubscribeImageGen = window.edvidDesktop.onImageGenState(handleImageGenState);
    void window.edvidDesktop.getMemberAuth().then((state) => {
      setMemberAuth(state);
      if (state.status !== 'checking') setMemberLoaded(true);
    });
    const unsubscribePack = window.edvidDesktop.onRuntimePackState((state) => {
      setRuntimePack(state);
      // Com as ferramentas instaladas, a lista de dependências da rail deixa
      // de acusar ausências.
      if (state.status === 'ready') void refreshRuntimes();
    });
    void window.edvidDesktop.ensureRuntimePack().then(setRuntimePack);
    if (!booted.current) {
      booted.current = true;
      void window.edvidDesktop.getDesktopInfo().then(setDesktopInfo);
      void window.edvidDesktop.getCodexAccount().then(setAccount);
      void window.edvidDesktop.getClaudeAccount().then((state) => {
        setClaudeAccount(state);
        setClaudeLoaded(true);
      });
      void window.edvidDesktop.getGeminiAccount().then((state) => {
        setGeminiAccount(state);
        setGeminiLoaded(true);
      });
      void window.edvidDesktop.getAiRoles().then(setAiRoles);
      void refreshRuntimes();
      // O modelo de transcricao e preparado pelo aplicativo, antes de o
      // usuario pedir o corte: assim a edicao nunca para para baixar nada.
      void window.edvidDesktop.ensureWhisperModel().then(setWhisperModel);
      void window.edvidDesktop.listRecentProjects().then(async (recent) => {
        setProjects(recent);
        if (recent[0]) {
          try {
            activateWorkspace(await window.edvidDesktop.openRecentProject(recent[0].directory));
            setProjects(await window.edvidDesktop.listRecentProjects());
          } catch {
            // A lista continua visível; o usuário pode escolher outra pasta.
          }
        }
      });
    }
    return () => {
      unsubscribe();
      unsubscribeModel();
      unsubscribeRemotion();
      unsubscribePhase2();
      unsubscribeCleanCut();
      unsubscribeUpdate();
      unsubscribeMember();
      unsubscribePack();
      unsubscribeClaude();
      unsubscribeGemini();
      unsubscribeCatalog();
      unsubscribeActiveModel();
      unsubscribeRoles();
      unsubscribeImageGen();
    };
  }, []);

  useEffect(() => {
    if (!followingOutput) return;
    const element = messageListRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [messages, followingOutput, phase2Render.status]);

  // Persiste a conversa e os gates do projeto aberto. As últimas 200 mensagens
  // bastam: o estado real da edição vive nos arquivos do projeto.
  useEffect(() => {
    if (!projectDirectory) return;
    localStorage.setItem(chatStorageKey(projectDirectory), JSON.stringify({
      messages: messages.slice(-200),
      handledCutApprovalId,
      jcutApplied,
    } satisfies StoredChat));
  }, [messages, handledCutApprovalId, jcutApplied, projectDirectory]);

  // Regras automáticas dos papéis. Escolha explícita do aluno (pinned) só é
  // desfeita quando o provedor escolhido deixa de estar conectado/capaz.
  // - Chat: se o preferencial está desconectado (estado já resolvido) e outro
  //   está pronto, troca sozinho — o aluno nunca fica com o chat travado.
  // - Imagem: segue a capacidade (ChatGPT assinatura > Gemini chave > nada),
  //   exatamente as regras combinadas: só Claude conectado = sem imagem até
  //   entrar uma chave do Gemini.
  useEffect(() => {
    const resolvedDisconnected: Record<AiProvider, boolean> = {
      chatgpt: account.status === 'signed-out' || account.status === 'error',
      claude: claudeLoaded && claudeAccount.status === 'signed-out',
      gemini: geminiLoaded && geminiAccount.status !== 'signed-in',
    };
    if (!aiConnected[aiRoles.chat] && resolvedDisconnected[aiRoles.chat]) {
      const fallback = (['chatgpt', 'claude', 'gemini'] as AiProvider[]).find((provider) => aiConnected[provider]);
      if (fallback) switchAiProvider(fallback, false);
    }
    const imageAuto = imageCapable.chatgpt ? 'chatgpt' : imageCapable.gemini ? 'gemini' : null;
    if (aiRoles.imagePinned && aiRoles.image && imageCapable[aiRoles.image]) return;
    if (aiRoles.image !== imageAuto) switchImageProvider(imageAuto, false);
  }, [aiRoles, chatgptConnected, claudeConnected, geminiConnected, claudeLoaded, geminiLoaded, account.status, account.account?.type, claudeAccount.status, geminiAccount.status]);

  // O fallback de limite e o pedido de imagens pós-turno precisam dos valores
  // atuais dentro do handleCodexEvent (registrado uma única vez no boot).
  const aiRuntimeRef = useRef({ roles: aiRoles, connected: aiConnected });
  useEffect(() => {
    aiRuntimeRef.current = { roles: aiRoles, connected: aiConnected };
  }, [aiRoles, chatgptConnected, claudeConnected, geminiConnected]);

  // Continuação automática das imagens: o agente pediu, o app gerou, e este
  // turno avisa o agente para aplicá-las — sem o aluno digitar nada.
  useEffect(() => {
    if (!imageContinuationAt) return;
    setImageContinuationAt(null);
    void dispatchMessage(
      'As imagens pedidas foram geradas e já estão em edit/imagens/. Aplique cada uma na edição exatamente onde você planejou; não crie novos pedidos de imagem se não precisar de imagens novas.',
      'Imagens prontas — aplicando na edição',
    );
  }, [imageContinuationAt]);

  // Animação sob medida prometida e não escrita: o agente marcou "custom" no
  // edit-data.json e deixou o CustomGraphics.tsx intacto, então o vídeo sairia
  // sem ela. O app cobra sozinho, com o rótulo que ele mesmo escreveu.
  useEffect(() => {
    if (!customAnimationRequest) return;
    const { labels } = customAnimationRequest;
    setCustomAnimationRequest(null);
    const lista = labels.map((label) => `- ${label}`).join('\n');
    void dispatchMessage(
      [
        'Você registrou como "custom" a(s) animação(ões) abaixo, mas o edit/remotion/src/CustomGraphics.tsx continua idêntico ao template — nenhum componente foi escrito, então elas não aparecem no vídeo:',
        lista,
        'Escreva agora o componente de cada uma no CustomGraphics.tsx, com exatamente o visual que o aluno descreveu (cores, tipografia, layout, tela cheia se foi pedido), monte no return do CustomGraphics dentro da janela registrada e mantenha o "kind": "custom" no edit-data.json. Não troque por um efeito pronto.',
      ].join('\n'),
      'Escrevendo a animação que faltou',
    );
  }, [customAnimationRequest]);

  const claudeWaiting = claudeAccount.status === 'waiting-for-browser';
  const someLoginWaiting = account.status === 'waiting-for-browser' || claudeWaiting;

  // Modal do primeiro boot: o pacote de ferramentas baixando com o app
  // inteiro desfocado atrás. Aparece sobre o gate e sobre o estúdio.
  const packModal = (runtimePack.status === 'downloading' || runtimePack.status === 'extracting' || runtimePack.status === 'error') && (
    <div className="pack-overlay" role="dialog" aria-modal="true" aria-label="Preparando o Edvid">
      <div className="pack-modal">
        <strong>Preparando o Edvid</strong>
        {runtimePack.status === 'error' ? (
          <>
            <p className="pack-error">{runtimePack.error ?? 'Não foi possível baixar as ferramentas.'}</p>
            <button type="button" className="btn primary" onClick={() => void window.edvidDesktop.ensureRuntimePack().then(setRuntimePack)}>
              Tentar de novo
            </button>
          </>
        ) : (
          <>
            <div className={`pack-track ${runtimePack.status === 'extracting' ? 'indeterminate' : ''}`}>
              <span
                style={runtimePack.status === 'downloading' && runtimePack.totalBytes
                  ? { width: `${Math.min(100, Math.round(((runtimePack.downloadedBytes ?? 0) / runtimePack.totalBytes) * 100))}%` }
                  : undefined}
              />
            </div>
            <small>Quando terminar você já pode iniciar suas edições</small>
          </>
        )}
      </div>
    </div>
  );

  // ABERTURA: enquanto a sessão é verificada, só o logo. O formulário de
  // login piscava aqui para quem já estava logado — a decisão de mostrar o
  // gate agora espera a primeira resposta que não seja "checking".
  if (!memberLoaded || memberAuth.status === 'checking') {
    return (
      <div className="app-splash">
        <img src={edvidLogo} alt="Edvid" />
      </div>
    );
  }

  // Gate do aluno: sem sessão válida, o estúdio inteiro fica atrás do login.
  // "unconfigured" (sem as chaves do Supabase) mantém o app aberto como antes.
  if (memberAuth.status === 'signed-out' || memberAuth.status === 'no-access') {
    return (
      <>
        {packModal}
        {appUpdate.status === 'ready' && (
          <button
            type="button"
            className="btn primary small update-ready update-floating"
            onClick={() => void window.edvidDesktop.installAppUpdate()}
            title="A nova versão já foi baixada; o Edvid reinicia atualizado."
          >
            {appUpdate.version ? `Atualizar para ${appUpdate.version}` : 'Atualizar o Edvid'} · Reiniciar
          </button>
        )}
        <MemberGate
          auth={memberAuth}
          onLogin={async (email, password) => {
            setMemberAuth(await window.edvidDesktop.memberLogin(email, password));
          }}
          onLogout={async () => {
            setMemberAuth(await window.edvidDesktop.memberLogout());
          }}
        />
      </>
    );
  }

  return (
    <div className={`studio-shell ${railPinned ? 'rail-pinned' : ''}`}>
      {packModal}
      {/* Menu ⋯ aberto força a rail expandida: o backdrop fica fora dela e
          mataria o hover, colapsando a rail com o menu no ar. */}
      <aside className={`project-rail ${railPinned || projectMenu ? 'pinned' : ''}`}>
        <div className="rail-brand">
          <div className="rail-logo">
            <img className="rail-brand-icon" src={edvidIcon} alt="" />
            <img className="rail-brand-wordmark" src={edvidLogo} alt="Edvid" />
          </div>
          <button type="button" className={`rail-pin ${railPinned ? 'active' : ''}`} onClick={toggleRailPinned} title={railPinned ? 'Recolher barra lateral' : 'Manter barra expandida'}><Icon name="pin" /></button>
        </div>
        <button type="button" className="new-project" onClick={startCreateProject} disabled={openingProject || Boolean(activeTurn)}>
          <span><Icon name="add" /></span><strong>Novo projeto</strong>
        </button>
        <div className="project-list-heading">Recentes</div>
        <nav className="project-list" aria-label="Projetos recentes">
          {projects.map((project) => (
            <div className="project-row" key={project.directory}>
              <button type="button" className={`project-item ${project.directory === projectDirectory ? 'active' : ''}`} onClick={() => openRecentProject(project)} title={project.directory} disabled={Boolean(activeTurn)}>
                <span className="project-item-icon"><Icon name="folder" /></span>
                <span className="project-item-copy">
                  <strong>{project.name}{project.pinned && <span className="pin-flag"><Icon name="pin" /></span>}</strong>
                  <small>{project.directory}</small>
                </span>
              </button>
              <button type="button" className="project-more" onClick={(event) => { event.stopPropagation(); setProjectMenu((current) => current === project.directory ? null : project.directory); }} title="Opções do projeto">
                <Icon name="more" />
              </button>
              {projectMenu === project.directory && (
                <div className="project-menu" role="menu">
                  <button type="button" onClick={() => void togglePinProject(project)}>{project.pinned ? 'Desafixar' : 'Fixar'}</button>
                  <button type="button" onClick={() => startRenameProject(project)}>Renomear</button>
                  <button type="button" className="danger" onClick={() => void removeProjectFromList(project)}>Excluir</button>
                </div>
              )}
            </div>
          ))}
          {projects.length === 0 && <div className="project-list-empty">Seus projetos aparecerão aqui.</div>}
        </nav>
        <div className="rail-footer">
          <div className="rail-account">
            <span className="account-avatar signed-in">{(memberAuth.name ?? memberAuth.email ?? 'E').slice(0, 1).toUpperCase()}</span>
            <span className="rail-account-copy">
              <strong>{memberAuth.name ?? memberAuth.email ?? 'Edvid'}</strong>
              <small>{memberAuth.status === 'signed-in' ? memberAuth.email : 'Creator Factory'}</small>
            </span>
            <button type="button" className="account-action gear" onClick={() => setSettingsOpen(true)} title="Configurações"><Icon name="settings" /></button>
          </div>
        </div>
      </aside>

      <main className="studio-main">
        <header className="studio-topbar">
          <div className="active-project">
            <div><span>Projeto</span><strong>{workspace?.project.name ?? 'Nenhum projeto selecionado'}</strong></div>
          </div>
          {workspace && (
            <div className="project-subcard">
              <span className="project-path" title={workspace.project.directory}>{workspace.project.directory}</span>
              <button
                type="button"
                className="subcard-action"
                onClick={() => void window.edvidDesktop.openProjectFolder(workspace.project.directory).catch(() => {})}
                title="Abrir a pasta do projeto"
              >
                <Icon name="folder" />
              </button>
              {workspace.media && (
                <span className="subcard-meta">{workspace.media.orientation === 'vertical' ? '9:16 vertical' : '16:9 horizontal'} · {workspace.media.width}×{workspace.media.height}</span>
              )}
            </div>
          )}
          <div className="topbar-actions">
            {/* Versão e checagem ficam à mão no topo, não escondidas nas
                Configurações. */}
            <button
              type="button"
              className="topbar-version"
              onClick={() => {
                setUpdateChecking(true);
                setUpdateChecked(null);
                void window.edvidDesktop.checkForUpdates()
                  .then((state) => setUpdateChecked(state.status === 'ready'
                    ? `Atualização ${state.version ?? ''} pronta`
                    : 'Você já está na versão mais recente'))
                  .catch((error) => setUpdateChecked(errorMessage(error)))
                  .finally(() => setUpdateChecking(false));
              }}
              disabled={updateChecking}
              title={updateChecked ?? 'Verificar atualização'}
            >
              Edvid {appVersion ?? ''}
              <span className="topbar-version-hint">{updateChecking ? 'verificando…' : updateChecked ? '✓' : 'verificar'}</span>
            </button>
            {appUpdate.status === 'ready' && (
              <button
                type="button"
                className="btn primary small update-ready"
                onClick={() => void window.edvidDesktop.installAppUpdate()}
                title="A nova versão já foi baixada; o Edvid reinicia atualizado."
              >
                {appUpdate.version ? `Atualizar para ${appUpdate.version}` : 'Atualizar o Edvid'} · Reiniciar
              </button>
            )}
          </div>
        </header>

        <div className="studio-grid">
          <section className="chat-panel">
            <div className="chat-head">
              <div><span className="eyebrow">Direção da edição</span><h1>Converse com o Edvid</h1></div>
              {!canChat && <span className="work-status"><span />Configuração pendente</span>}
            </div>
            <div
              className="chat-transcript"
              ref={messageListRef}
              onScroll={(event) => {
                const element = event.currentTarget;
                setFollowingOutput(element.scrollHeight - element.scrollTop - element.clientHeight < 64);
              }}
            >
              {!workspace && (
                <div className="chat-empty">
                  <span className="chat-empty-icon"><Icon name="folder" /></span>
                  <h2>Comece por um projeto</h2>
                  <p>Escolha a pasta do vídeo. O preview, a timeline e a conversa ficarão reunidos nesta janela.</p>
                  <button type="button" className="btn primary" onClick={startCreateProject}>Novo projeto</button>
                </div>
              )}
              {/* O corte limpo é do aplicativo, não do chat: ele aparece
                  mesmo sem nenhuma IA conectada. Só a conversa e os estilos
                  precisam de IA — e o aviso disso vem junto, sem esconder o
                  botão que o aluno veio usar. */}
              {workspace && messages.length === 0 && (
                <div className="chat-empty compact">
                  <span className="chat-empty-icon"><Icon name="sparkles" /></span>
                  <h2>O que vamos editar?</h2>
                  <p>O corte limpo vem primeiro. Depois da aprovação, os estilos aparecem visualmente na aba ao lado.</p>
                  <div className="prompt-examples">
                    <button type="button" onClick={() => void startCleanCut()} disabled={cleanCutRunning || whisperModel.status === 'downloading' || (runtimePack.status !== 'ready' && runtimePack.status !== 'unknown')}>{cleanCutRunning ? 'Cortando...' : 'Iniciar corte limpo'}</button>
                    {activeAiConnected && (
                      <button type="button" onClick={() => void dispatchMessage('Analise os vídeos e imagens da pasta assets.')} disabled={sending}>Analisar assets</button>
                    )}
                  </div>
                  {!activeAiConnected && (
                    <div className="model-status">
                      <span>Para conversar e aplicar estilos, conecte uma IA.</span>
                      <button type="button" className="btn ghost small" onClick={() => setSettingsOpen(true)}>Conectar IA</button>
                    </div>
                  )}
                  {account.error && <div className="inline-error">{account.error}</div>}
                  {whisperModel.status === 'downloading' && (
                    <div className="model-status">
                      <span className="model-status-orb" />
                      Preparando a transcrição{whisperModel.downloadedBytes ? ` · ${Math.round(whisperModel.downloadedBytes / 1e6)} MB` : ''}
                    </div>
                  )}
                  {whisperModel.status === 'error' && (
                    <div className="model-status error">
                      <span>Não foi possível preparar a transcrição{whisperModel.error ? `: ${whisperModel.error}` : ''}.</span>
                      <button type="button" className="btn ghost small" onClick={() => void window.edvidDesktop.ensureWhisperModel().then(setWhisperModel)}>
                        Tentar de novo
                      </button>
                    </div>
                  )}
                </div>
              )}
              {messages.map((message) => {
                const visibleText = message.role === 'assistant' ? cleanAssistantText(message.text) : message.text;
                const showsCutApproval = message.id === pendingCutApprovalId;
                return (
                  <article className={`chat-message ${message.role}`} key={message.id}>
                    <span className="chat-role">{message.role === 'user' ? 'Você' : message.role === 'assistant' ? 'Edvid' : 'Sistema'}</span>
                    <p>{visibleText || '...'}</p>
                    {showsCutApproval && (
                      <div className="clean-cut-gate">
                        <div><strong>Corte limpo pronto</strong><span>Assista no preview e confirme para escolher os estilos.</span></div>
                        <button type="button" className="btn primary" onClick={() => void approveCleanCut(message.id)} disabled={sending || approvingCut}>
                          <Icon name="check" /> {approvingCut ? 'Aprovando...' : 'Aprovado'}
                        </button>
                        <button type="button" className={`btn ghost small ${jcutApplied ? 'jcut-applied' : ''}`} onClick={() => void applyJcut()} disabled={jcutBusy || jcutApplied}>
                          <Icon name="waveform" /> {jcutApplied ? 'J-Cut aplicado' : jcutBusy ? 'Aplicando…' : 'Aplicar J-Cut'}
                        </button>
                      </div>
                    )}
                    {message.id.startsWith('style-gate:') && (
                      <div className="clean-cut-gate jcut-gate">
                        <div><strong>J-Cut opcional</strong><span>Antecipa o áudio da próxima cena nas transições do corte aprovado.</span></div>
                        <button type="button" className={`btn ghost small ${jcutApplied ? 'jcut-applied' : ''}`} onClick={() => void applyJcut()} disabled={jcutBusy || jcutApplied}>
                          <Icon name="waveform" /> {jcutApplied ? 'J-Cut aplicado' : jcutBusy ? 'Aplicando…' : 'Aplicar J-Cut'}
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
              {/* Com um modelo do catálogo conduzindo, o texto do agente só
                  aparece depois de revisado (sem inglês cru na tela), então o
                  chat ficaria mudo durante o turno. Esta bolha é o sinal de
                  que ele está escrevendo. */}
              {activeTurn && !messages.some((message) => message.id === `assistant:${activeTurn.turnId}`) && (
                <article className="chat-message assistant pending">
                  <span className="chat-role">Edvid</span>
                  <p className="chat-typing"><span /><span /><span /></p>
                </article>
              )}
              {showPinnedCutGate && (
                <div className="clean-cut-gate">
                  <div><strong>Corte limpo pronto</strong><span>Assista no preview e confirme para escolher os estilos.</span></div>
                  <button type="button" className="btn primary" onClick={() => void approveCleanCut(`pinned:${Date.now()}`)} disabled={sending || approvingCut}>
                    <Icon name="check" /> {approvingCut ? 'Aprovando...' : 'Aprovado'}
                  </button>
                  <button type="button" className={`btn ghost small ${jcutApplied ? 'jcut-applied' : ''}`} onClick={() => void applyJcut()} disabled={jcutBusy || jcutApplied}>
                    <Icon name="waveform" /> {jcutApplied ? 'J-Cut aplicado' : jcutBusy ? 'Aplicando…' : 'Aplicar J-Cut'}
                  </button>
                </div>
              )}
              {messages.length > 0 && whisperModel.status === 'downloading' && (
                <div className="model-status">
                  <span className="model-status-orb" />
                  Preparando a transcrição{whisperModel.downloadedBytes ? ` · ${Math.round(whisperModel.downloadedBytes / 1e6)} MB` : ''}
                </div>
              )}
              {messages.length > 0 && whisperModel.status === 'error' && (
                <div className="model-status error">
                  <span>A transcrição não está pronta{whisperModel.error ? `: ${whisperModel.error}` : ''}. O corte limpo depende dela.</span>
                  <button type="button" className="btn ghost small" onClick={() => void window.edvidDesktop.ensureWhisperModel().then(setWhisperModel)}>
                    Tentar de novo
                  </button>
                </div>
              )}
              {/* UM indicador para TUDO. Antes ele só enxergava o turno do
                  chat e dizia "Pronto" enquanto o Edvid renderizava — o aluno
                  via o aplicativo trabalhando e o rodapé afirmando o
                  contrário. Agora o rótulo diz o que está acontecendo, e
                  "Pronto" só aparece quando nada está. */}
              {messages.length > 0 && (
                <div className={`chat-status work-status ${trabalho ? 'working' : 'ready'}`}>
                  <span />{trabalho ?? 'Pronto'}
                </div>
              )}
              {phase2Render.status === 'rendering' && phase2Render.totalFrames ? (
                <div className="phase2-render-track" role="status" aria-label="Progresso do render">
                  <span style={{ width: `${Math.min(100, Math.round((phase2Render.progress ?? 0) * 100))}%` }} />
                </div>
              ) : null}
              {/* O trecho alterado, pronto antes do vídeo inteiro. Fica AQUI e
                  não no player principal de propósito: trocar o vídeo que o
                  aluno está assistindo por um clipe de três segundos assusta
                  mais do que ajuda. O render completo segue em segundo plano. */}
              {phase2Render.status === 'rendering' && phase2Render.preview && (
                <div className="render-preview">
                  <video
                    key={phase2Render.preview.url}
                    src={phase2Render.preview.url}
                    autoPlay
                    loop
                    controls
                    playsInline
                  />
                  <span>
                    Prévia do trecho alterado ({formatTime(phase2Render.preview.start)} – {formatTime(phase2Render.preview.end)}).
                    O vídeo completo está sendo renderizado.
                  </span>
                </div>
              )}
              {imageGen.status === 'generating' && imageGen.total ? (
                <div className="phase2-render-track" role="status" aria-label="Progresso das imagens">
                  <span style={{ width: `${Math.round(((imageGen.done ?? 0) / imageGen.total) * 100)}%` }} />
                </div>
              ) : null}
            </div>
            {!followingOutput && <button type="button" className="scroll-to-latest" onClick={() => { setFollowingOutput(true); const element = messageListRef.current; if (element) element.scrollTop = element.scrollHeight; }}><Icon name="arrowDown" /> Ir para o fim</button>}
            <form className="chat-composer" onSubmit={sendMessage}>
              <textarea value={composer} onChange={(event) => setComposer(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder={canChat ? 'Descreva a próxima alteração...' : 'Conecte a conta e escolha um projeto'} disabled={!canChat || sending} rows={2} />
              {activeTurn
                ? <button className="composer-inline stop" type="button" onClick={interruptTurn} title="Parar"><Icon name="stop" /></button>
                : <button className="composer-inline send" type="submit" disabled={!canChat || !composer.trim() || sending} title="Enviar (Enter)"><Icon name="enter" /></button>}
              {/* Preferenciais rápidos: trocam chat/imagem sem abrir as
                  Configurações. Só listam provedores conectados e capazes. */}
              {/* Seletor por PAPEL: o ícone diz qual é o papel (chat, imagem,
                  vídeo…) e o texto mostra a IA escolhida, em vez de gastar
                  espaço com a palavra "Chat". As IAs do catálogo entram aqui
                  junto das contas — para o aluno é tudo a mesma lista. */}
              <div className="composer-roles">
                <label className="role-select" title="IA que conduz a conversa">
                  <Icon name="chat" />
                  <select
                    value={chatSelection}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value.startsWith('catalogo:')) {
                        // Provedor do catálogo conduz a conversa: o Codex passa
                        // a falar com ele, mantendo sandbox e ferramentas.
                        void window.edvidDesktop
                          .setCatalogChatProvider(value.slice('catalogo:'.length))
                          .then(setAiCatalog)
                          .catch(() => {});
                        return;
                      }
                      if (aiCatalog.chatProviderId) {
                        void window.edvidDesktop.setCatalogChatProvider(null).then(setAiCatalog).catch(() => {});
                      }
                      switchAiProvider(value as AiProvider);
                    }}
                  >
                    {/* Sem NENHUM agente conectado, o selecionado aparece
                        como "Nenhuma": mostrar "ChatGPT" com a conta
                        desconectada dizia que havia um agente quando nao
                        havia — relato com print. A opcao continua na lista
                        (desabilitada) so quando ha o que escolher. */}
                    {!activeAiConnected && (
                      <option value={aiProvider} disabled>Nenhuma</option>
                    )}
                    {(['chatgpt', 'claude', 'gemini'] as AiProvider[])
                      .filter((provider) => aiConnected[provider])
                      .map((provider) => (
                        <option key={provider} value={provider}>
                          {provider === 'chatgpt' ? 'ChatGPT' : provider === 'claude' ? 'Claude' : 'Gemini'}
                        </option>
                      ))}
                    {catalogChatProviders.map((entry) => (
                      <option key={entry.id} value={`catalogo:${entry.id}`}>{entry.name}</option>
                    ))}
                  </select>
                </label>
                <label className="role-select" title="IA que gera as imagens pedidas pela edição">
                  <Icon name="image" />
                  <select
                    value={imageSelection}
                    onChange={(event) => {
                      const value = event.target.value;
                      // Escolher um provedor do catálogo RETORNAVA sem fazer
                      // nada, e a seleção voltava sozinha para o Gemini: o
                      // aluno via a Cloudflare na lista e não conseguia usá-la.
                      if (value.startsWith('catalogo:')) {
                        void window.edvidDesktop
                          .setImageCatalogProvider(value.slice('catalogo:'.length))
                          .then(setAiRoles);
                        return;
                      }
                      void window.edvidDesktop.setImageCatalogProvider(null).then(setAiRoles);
                      switchImageProvider((value || null) as AiProvider | null);
                    }}
                  >
                    {!aiRoles.image && catalogImageProviders.length === 0 && <option value="">Nenhuma</option>}
                    {(['chatgpt', 'gemini'] as AiProvider[])
                      .filter((provider) => imageCapable[provider])
                      .map((provider) => (
                        <option key={provider} value={provider}>
                          {provider === 'chatgpt' ? 'ChatGPT' : 'Gemini'}
                        </option>
                      ))}
                    {catalogImageProviders.map((entry) => (
                      <option key={entry.id} value={`catalogo:${entry.id}`}>{entry.name}</option>
                    ))}
                  </select>
                </label>
                {/* VÍDEO. Não existe par conta-fixa/catálogo como na imagem:
                    nenhuma das três contas do topo gera vídeo, então o papel é
                    só do catálogo. */}
                <label className="role-select" title="IA que gera os clipes pedidos pela edição">
                  <Icon name="video" />
                  <select
                    value={videoSelection}
                    onChange={(event) => {
                      const value = event.target.value;
                      void window.edvidDesktop
                        .setVideoCatalogProvider(value.startsWith('catalogo:') ? value.slice('catalogo:'.length) : null)
                        .then(setAiRoles)
                        .catch(() => {});
                    }}
                  >
                    {catalogVideoProviders.length === 0 && <option value="">Nenhuma</option>}
                    {catalogVideoProviders.map((entry) => (
                      <option key={entry.id} value={`catalogo:${entry.id}`}>{entry.name}</option>
                    ))}
                  </select>
                </label>
                <label className="role-select" title="IA que compõe a trilha sonora">
                  <Icon name="music" />
                  <select
                    value={catalogMusicProviders[0] ? `catalogo:${catalogMusicProviders[0].id}` : ''}
                    onChange={() => {
                      // A trilha tem um provedor só; a lista existe para o
                      // aluno ver qual é, e conectar se faz nas configurações.
                    }}
                  >
                    {catalogMusicProviders.length === 0 && <option value="">Nenhuma</option>}
                    {catalogMusicProviders.map((entry) => (
                      <option key={entry.id} value={`catalogo:${entry.id}`}>{entry.name}</option>
                    ))}
                  </select>
                </label>
              </div>
              {/* Qual IA está atendendo AGORA. Com a cadeia do catálogo o
                  provedor troca sozinho no meio do trabalho; sem isto o aluno
                  não teria como saber quem respondeu. */}
              {activeModel && (
                <p className="active-model" title={`${activeModel.role === 'image' ? 'Imagem' : 'Chat'} · ${activeModel.providerName} · ${activeModel.modelLabel}`}>
                  <span className="active-model-dot" aria-hidden="true" />
                  {/* Só o ícone do papel e o MODELO: o provedor já está escrito
                      no seletor logo acima, e repeti-lo aqui fazia a linha
                      quebrar em duas. Ele segue no title, para quem passar o
                      mouse. */}
                  <Icon name={activeModel.role === 'image' ? 'image' : 'chat'} />
                  {activeModel.modelLabel}
                  {activeModel.free && <span className="badge free">Gratuito</span>}
                </p>
              )}
            </form>
          </section>

          <section className="work-panel">
            <nav className="work-tabs" aria-label="Área de trabalho">
              <button type="button" className={workTab === 'edit' ? 'active' : ''} onClick={() => setWorkTab('edit')}><Icon name="layers" /><strong>Edição</strong></button>
              <button type="button" className={workTab === 'styles' ? 'active' : ''} onClick={() => setWorkTab('styles')}><Icon name="sparkles" /><strong>Estilos</strong></button>
              {/* Renderizar = exportar. So existe quando o estado atual difere
                  do ultimo render (impressao digital); a previa ja mostra tudo
                  ao vivo, entao nao ha botao nenhum quando nao ha nada novo. */}
              {(renderPending || cutsPending || phase2Status === 'rendering') && projectDirectory && (
                <button
                  type="button"
                  className="render-action"
                  disabled={phase2Status === 'rendering' || sending}
                  title={cutsPending
                    ? 'Aplica os cortes da timeline e gera o vídeo final'
                    : 'Gera o vídeo final com tudo o que está na prévia'}
                  onClick={() => {
                    // UMA decisao, no fim: cortes pendentes aplicam primeiro
                    // (viram o novo cut.mp4), e o render vem em seguida. O
                    // botao de aplicar da timeline deixou de existir.
                    void (async () => {
                      if (cutsPending) {
                        const applied = await applyTimelineEdits();
                        if (!applied) return;
                      }
                      requestPhase2Render();
                    })();
                  }}
                >
                  <Icon name="video" />
                  <strong>
                    {phase2Status === 'rendering'
                      ? `Renderizando… ${Math.round((phase2Render.progress ?? 0) * 100)}%`
                      : sending && cutsPending ? 'Aplicando cortes…' : 'Renderizar'}
                  </strong>
                </button>
              )}
            </nav>
            <div className="work-content">
              {workTab === 'edit' ? (
                <EditorWorkspace
                  workspace={workspace}
                  renderStamp={renderStamp}
                  onRenderPendingChange={setRenderPending}
                  onCutsPendingChange={setCutsPending}
                  style={style}
                  styleApplied={styleApplied}
                  corrections={corrections}
                  onCorrectionsChange={setCorrections}
                  onApplyCorrections={applyTimelineCorrections}
                  applyingCorrections={sending}
                  onTimelineModelChange={handleTimelineModelChange}
                  onApplyTimelineEdits={applyTimelineEdits}
                  chatConnected={activeAiConnected}
                  imageAiConnected={imageAiConnected}
                  videoAiConnected={videoAiConnected}
                />
              ) : <StyleWorkspace style={{ ...style, splitMedia: splitMediaEfetivo }} onChange={setStyle} onApply={applyStyleSelection} canApply={canApplyStyles} applying={sending} runtime={remotionRuntime} chatConnected={activeAiConnected} imageAiConnected={imageAiConnected} videoAiConnected={videoAiConnected} />}
            </div>
          </section>
        </div>
      </main>

      {activeApproval && (
        <div className="approval-overlay">
          <section
            className="approval-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="approval-title"
            aria-describedby="approval-description"
          >
            <header className="approval-dialog-head">
              <span className="approval-dialog-icon"><Icon name="settings" /></span>
              <div>
                <span className="approval-kicker">Permissão local</span>
                <h2 id="approval-title">
                  {activeApproval.kind === 'command' ? 'Permitir execução no computador?' : 'Permitir alteração nos arquivos?'}
                </h2>
              </div>
              {approvals.length > 1 && <span className="approval-queue">1 de {approvals.length}</span>}
            </header>

            <p id="approval-description" className="approval-description">
              O Edvid precisa desta autorização para continuar a tarefa. O processo ficará pausado até você decidir.
            </p>

            <div className="approval-detail">
              <span>{activeApproval.kind === 'command' ? 'Comando solicitado' : 'Alteração solicitada'}</span>
              <strong>{activeApproval.title}</strong>
              {activeApproval.detail && <code>{activeApproval.detail}</code>}
              {activeApproval.cwd && (
                <div className="approval-project">
                  <span>Projeto</span>
                  <small>{activeApproval.cwd}</small>
                </div>
              )}
            </div>

            {approvalError && <div className="approval-error">{approvalError}</div>}
            <p className="approval-privacy">Esta autorização é local e não fará parte do histórico do chat.</p>

            <div className="approval-actions">
              <button
                type="button"
                className="btn ghost danger"
                onClick={() => void answerApproval(activeApproval, 'decline')}
                disabled={answeringApprovalId !== null}
              >
                Recusar
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => void answerApproval(activeApproval, 'acceptForSession')}
                disabled={answeringApprovalId !== null}
              >
                Permitir nesta sessão
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() => void answerApproval(activeApproval, 'accept')}
                disabled={answeringApprovalId !== null}
              >
                {answeringApprovalId === activeApproval.id ? 'Autorizando...' : 'Permitir uma vez'}
              </button>
            </div>
          </section>
        </div>
      )}

      {projectMenu && <div className="menu-backdrop" onClick={() => setProjectMenu(null)} />}

      {nameDialog && (
        <div className="modal-overlay" onClick={(event) => { if (event.target === event.currentTarget) setNameDialog(null); }}>
          <section className="name-dialog" role="dialog" aria-modal="true">
            <h2>{nameDialog.mode === 'create' ? 'Novo projeto' : 'Renomear projeto'}</h2>
            <p>{nameDialog.mode === 'create' ? 'Dê um nome ao projeto e escolha a pasta com o vídeo.' : 'O novo nome aparece na lista e no topo do Edvid.'}</p>
            <input
              type="text"
              value={nameValue}
              autoFocus
              maxLength={60}
              placeholder="Nome do projeto"
              onChange={(event) => setNameValue(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') void confirmNameDialog(); if (event.key === 'Escape') setNameDialog(null); }}
            />
            <div className="name-dialog-actions">
              <button type="button" className="btn ghost" onClick={() => setNameDialog(null)}>Cancelar</button>
              <button type="button" className="btn primary" onClick={() => void confirmNameDialog()} disabled={nameDialog.mode === 'rename' && !nameValue.trim()}>
                {nameDialog.mode === 'create' ? 'Escolher pasta...' : 'Salvar'}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* CONFIGURAÇÕES COMO PÁGINA (0.16.0): era um modal, e a tela vai crescer
          (mais IAs, MCPs, preferências). Ocupa o lugar do workspace e volta
          pelo botão, sem sobreposição. */}
      {settingsOpen && (
        <section className="settings-page" aria-label="Configurações">
          <header className="settings-page-head">
            <button type="button" className="settings-back" onClick={() => setSettingsOpen(false)}>
              <Icon name="chevron" /> Voltar
            </button>
            <h2>Configurações</h2>
          </header>

          <div className="settings-page-body">
            <div className="settings-block">
              <h3>Geral</h3>
              <div className="settings-row">
                <div>
                  <strong>{memberAuth.status === 'signed-in' ? (memberAuth.name ?? memberAuth.email) : 'Aluno'}</strong>
                  <small>{memberAuth.status === 'signed-in' ? memberAuth.email : 'Login de aluno não ativo nesta instalação'}</small>
                </div>
                {memberAuth.status === 'signed-in' && (
                  <button type="button" className="account-action" onClick={() => void window.edvidDesktop.memberLogout().then(setMemberAuth)}>Sair</button>
                )}
              </div>
            </div>

            {/* UMA lista só de IAs. Antes eram duas seções com formatos
                diferentes ("Conexão de IA" e "Catálogo"), para a mesma coisa. */}
            <div className="settings-block">
              <h3>Conexões de IA</h3>
              <div className="ai-grid">
                {AI_CATALOG.map((entry) => {
                  const status = providerStatus(entry);
                  return (
                    <article className={`ai-card${status.connected ? ' connected' : ''}`} key={entry.id}>
                      <div className="ai-card-head">
                        {aiMarks[entry.id] ? <img src={aiMarks[entry.id]} alt="" /> : <span className="ai-mark-fallback">{entry.name.slice(0, 1)}</span>}
                        <div>
                          <strong>{entry.name}</strong>
                          <small className={status.connected ? 'connected-label' : undefined}>{status.label}</small>
                        </div>
                      </div>
                      {/* Ícone por capacidade em vez de etiqueta escrita: o
                          card fica baixo e o aluno lê de relance. */}
                      <div className="capability-icons">
                        {entry.capabilities.map((capability) => (
                          <span className="capability" key={capability} title={capability}>
                            <Icon name={capabilityIcons[capability]} />
                          </span>
                        ))}
                      </div>
                      <button type="button" className="account-action" onClick={() => { setConnectTarget(entry.id); setConnectError(null); setConnectTested(null); }}>
                        {status.connected ? 'Gerenciar' : 'Conectar'}
                      </button>
                    </article>
                  );
                })}
              </div>
              {/* O aviso sobre IAs gratuitas saiu junto com elas (0.22.0). */}
              <p className="settings-note">Conecte a conta que você já paga. O Treblo é o que compõe a trilha sonora.</p>
            </div>

            <div className="settings-block">
              <h3>Dependências</h3>
              <div className="settings-row">
                <div>
                  <strong>{checking ? 'Verificando...' : `${readyRuntimes}/${runtimeNames.length} ferramentas prontas`}</strong>
                  <small>{desktopInfo ? `${desktopInfo.platform} ${desktopInfo.arch}` : ''}</small>
                </div>
                <button type="button" className="account-action" onClick={refreshRuntimes} disabled={checking}>Verificar</button>
              </div>
            </div>

            <div className="settings-block">
              <h3>MCPs</h3>
              <p className="settings-note">Em breve: conexões MCP para ampliar o Edvid.</p>
            </div>
          </div>
        </section>
      )}

      {/* Modal de conexão: um por IA, com o que ELA aceita — entrar com a
          conta (só ChatGPT e Claude hoje) e/ou chave, com teste antes de
          salvar. O filtro de gratuitos mora aqui porque é decisão de conta. */}
      {connectEntry && (
        <div className="modal-overlay" onClick={(event) => { if (event.target === event.currentTarget) setConnectTarget(null); }}>
          <section className="connect-modal" role="dialog" aria-modal="true" aria-label={`Conectar ${connectEntry.name}`}>
            <header className="settings-head">
              <div className="ai-card-head">
                {aiMarks[connectEntry.id] ? <img src={aiMarks[connectEntry.id]} alt="" /> : null}
                <h2>{connectEntry.name}</h2>
              </div>
              <button type="button" className="settings-close" onClick={() => setConnectTarget(null)} title="Fechar">✕</button>
            </header>
            <div className="connect-body">
              {connectEntry.note && <p className="settings-note">{connectEntry.note}</p>}

              {/* Login das contas FIXAS (ChatGPT e Claude), que têm fluxo
                  próprio no main. O hub por MCP também declara auth:['login'],
                  e sem este `!oauthHub` o modal abria com DUAS seções "Entrar
                  com a conta" — a de cima com um botão que não fazia nada,
                  porque o clique só sabe tratar builtIn. */}
              {connectEntry.auth.includes('login') && !connectEntry.oauthHub && (
                <div className="connect-section">
                  <h4>Entrar com a conta</h4>
                  {connectedByLogin
                    ? (
                      <div className="connect-account">
                        <div>
                          <strong className="connected-label">Conectado</strong>
                          <small>{loginEmail ?? 'Conta conectada'}</small>
                        </div>
                        <button type="button" className="account-action" onClick={() => void removeConnection(connectEntry)}>Sair</button>
                      </div>
                    )
                    : (
                      <>
                        <p className="settings-note">Usa a assinatura que você já paga.</p>
                        <button
                          type="button"
                          className="account-action primary"
                          onClick={() => {
                            if (connectEntry.builtIn === 'chatgpt') void login();
                            if (connectEntry.builtIn === 'claude') void claudeLogin();
                          }}
                        >
                          Entrar
                        </button>
                      </>
                    )}
                </div>
              )}

              {/* HUB DE GERAÇÃO por MCP: não há chave para colar. O aluno
                  entra com a conta e o gasto sai do crédito do plano dele.
                  Com o login feito aparecem os dois níveis — é aqui que ele
                  decide quanto vale gastar, e vale para todos os projetos. */}
              {connectEntry.oauthHub && (
                <div className="connect-section">
                  <h4>Entrar com a conta</h4>
                  {connectSaved
                    ? (
                      <>
                        <div className="connect-account">
                          <div>
                            <strong className="connected-label">Conectado</strong>
                            <small>Gerando pelo crédito do seu plano</small>
                          </div>
                          <button
                            type="button"
                            className="account-action"
                            onClick={() => void window.edvidDesktop
                              .disconnectHub(connectEntry.id)
                              .then(setAiCatalog)
                              .catch((error) => setConnectError(errorMessage(error)))}
                          >
                            Sair
                          </button>
                        </div>
                        <div className="tier-grid">
                          {(['imagem', 'video'] as GenerationKind[])
                            .filter((kind) => connectEntry.capabilities.includes(kind))
                            .map((kind) => (
                              <label className="tier-select" key={kind}>
                                <span><Icon name={kind === 'imagem' ? 'image' : 'video'} />Nível {kind === 'imagem' ? 'das imagens' : 'dos vídeos'}</span>
                                <select
                                  value={aiRoles.tiers[kind] ?? DEFAULT_TIER[kind]}
                                  onChange={(event) => void window.edvidDesktop
                                    .setGenerationTier(kind, event.target.value)
                                    .then(setAiRoles)
                                    .catch((error) => setConnectError(errorMessage(error)))}
                                >
                                  {TIERS.map((tier) => (
                                    <option key={tier} value={tier}>{TIER_LABEL[tier]}</option>
                                  ))}
                                </select>
                                <small>{TIER_NOTE[kind][(aiRoles.tiers[kind] ?? DEFAULT_TIER[kind]) as keyof typeof TIER_LABEL]}</small>
                              </label>
                            ))}
                        </div>
                      </>
                    )
                    : (
                      <>
                        <p className="settings-note">Sem chave de API: o login abre no navegador e o Edvid gera com o crédito do seu plano.</p>
                        <button
                          type="button"
                          className="account-action primary"
                          disabled={connectTesting}
                          onClick={() => {
                            setConnectError(null);
                            setConnectTesting(true);
                            void window.edvidDesktop
                              .loginHub(connectEntry.id)
                              .then(setAiCatalog)
                              .catch((error) => setConnectError(errorMessage(error)))
                              .finally(() => setConnectTesting(false));
                          }}
                        >
                          {connectTesting ? 'Conclua no navegador…' : 'Entrar'}
                        </button>
                      </>
                    )}
                  {connectError && <p className="settings-note error">{connectError}</p>}
                </div>
              )}

              {/* Sem credencial declarada não há seção de chave: o hub por MCP
                  mostrava um campo vazio e um link para "criar chave" que não
                  existe. */}
              {connectEntry.credentials.length > 0 && (
              <div className="connect-section">
                <h4>Chave de API</h4>
                {!connectedByKey && (
                  <p className="settings-note">
                    <a href={connectEntry.keyUrl} target="_blank" rel="noreferrer">Criar chave em {new URL(connectEntry.keyUrl).host}</a>
                  </p>
                )}
                {/* Campo com o TESTE colado nele e a lixeira dentro, na ponta.
                    Antes eram três botões soltos embaixo (Testar/Salvar/Remover),
                    e a IA já conectada abria o modal sem nenhum sinal disso. */}
                {connectEntry.credentials.map((field, index) => (
                  <div className="key-field" key={field.key}>
                    <input
                      type={field.secret ? 'password' : 'text'}
                      placeholder={field.placeholder ?? field.label}
                      value={fieldValue(connectEntry, field)}
                      readOnly={connectedByKey}
                      onChange={(event) => {
                        setConnectTested(null);
                        setCatalogDraft((current) => ({
                          ...current,
                          [connectEntry.id]: { ...current[connectEntry.id], [field.key]: event.target.value },
                        }));
                      }}
                    />
                    {connectedByKey
                      ? (
                        <button
                          type="button"
                          className="key-remove"
                          title="Remover conexão"
                          onClick={() => void removeConnection(connectEntry)}
                        >
                          <Icon name="trash" />
                        </button>
                      )
                      // O teste fica ao lado do ÚLTIMO campo, quando tudo está preenchido.
                      : index === connectEntry.credentials.length - 1 && (
                        <button
                          type="button"
                          className="key-test"
                          disabled={!connectReady || connectTesting}
                          onClick={() => void testConnection(connectEntry)}
                        >
                          {connectTesting ? 'Testando…' : 'Testar'}
                        </button>
                      )}
                  </div>
                ))}
                {/* Salvar só aparece depois do teste passar — e some ao salvar. */}
                {!connectedByKey && connectTested && (
                  <button
                    type="button"
                    className="account-action primary"
                    onClick={() => void saveConnection(connectEntry)}
                  >
                    Salvar
                  </button>
                )}
                {connectTested && <p className="settings-note ok">{connectTested}</p>}
                {connectError && <p className="settings-note error">{connectError}</p>}
              </div>
              )}

              {connectEntry.pricing !== 'free' && connectEntry.models.some((model) => model.free) && (
                <label className="catalog-toggle">
                  <input
                    type="checkbox"
                    checked={aiCatalog.freeOnly}
                    onChange={(event) => void window.edvidDesktop
                      .setCatalogFreeOnly(event.target.checked)
                      .then(setAiCatalog)
                      .catch((error) => setConnectError(errorMessage(error)))}
                  />
                  <span>Usar apenas modelos gratuitos</span>
                </label>
              )}
            </div>
          </section>
        </div>
      )}

      {/* Fim de tarefa: os toasts do sino (src/notify.ts). Clicar fecha. */}
      {toasts.length > 0 && (
        <div className="toast-stack" role="status" aria-live="polite">
          {toasts.map((toast) => (
            <button
              key={toast.id}
              type="button"
              // task-toast, não .toast: o CSS da marca (preview-base) já tem um
              // .toast fixo centralizado e as regras vazavam para cá.
              className={`task-toast ${toast.kind}`}
              title="Fechar aviso"
              onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}
            >
              <span className="toast-icon"><Icon name={toast.kind === 'ok' ? 'check' : 'alert'} /></span>
              <span className="toast-copy">
                <strong>{toast.title}</strong>
                {toast.body && <small>{toast.body}</small>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
