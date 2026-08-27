export type EditAiRuntimeDiagnostic = {
  name: string;
  ready: boolean;
  version?: string | null;
  detail?: string | null;
};

export type EditAiDiagnosticSource = {
  name: string;
  codec: string | null;
  needsProxy: boolean;
  proxyReady: boolean;
};

export type EditAiDiagnosticInput = {
  app: { name: string; version: string };
  machine: { platform: string; arch: string; memoryGb: number };
  runtimes: EditAiRuntimeDiagnostic[];
  runtimePackStatus: string;
  whisperStatus: string;
  freeDiskGb: number | null;
  aiConnected: boolean;
  hardwareFallback: boolean;
  project: { open: boolean; name?: string | null; path?: string | null; sources?: EditAiDiagnosticSource[] };
  events: Array<{ at: string; source: string; message: string }>;
};

const SECRET_PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{16,}/gu,
  /\bAIza[A-Za-z0-9_-]{20,}/gu,
  /\bhf_[A-Za-z0-9]{16,}/gu,
  /\bgh[pousr]_[A-Za-z0-9]{16,}/gu,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/gu,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/gu,
  /\b(?:bearer|basic|token)\s+[A-Za-z0-9._~+/=-]{8,}/giu,
  /\b(?:authorization|api[-_]?key|apikey|access[-_]?token|refresh[-_]?token|client[-_]?secret|password|senha|secret)\b\s*[:=]\s*["']?[^\s"',;}]{6,}/giu,
  /([?&](?:key|token|access_token|api_key|secret|password)=)[^\s&"']+/giu,
];

export function redactSecrets(value: string): string {
  let output = String(value ?? '');
  for (const pattern of SECRET_PATTERNS) {
    output = output.replace(pattern, (match) => {
      const separator = match.search(/[:=]/u);
      if (separator > 0 && /^[A-Za-z?&_-]/u.test(match)) {
        return `${match.slice(0, separator + 1)} [removed]`;
      }
      return '[removed]';
    });
  }
  return output;
}

export function anonymizeHome(value: string, home: string): string {
  if (!home) return String(value ?? '');
  return String(value ?? '').split(home).join('~');
}

export function diagnosticWarnings(input: EditAiDiagnosticInput): string[] {
  const warnings: string[] = [];
  const missing = input.runtimes.filter((runtime) => !runtime.ready).map((runtime) => runtime.name);
  if (missing.length) warnings.push(`Ferramentas ausentes: ${missing.join(', ')}.`);
  if (input.runtimePackStatus !== 'ready') warnings.push(`Pacote de runtimes: ${input.runtimePackStatus}.`);
  if (input.whisperStatus !== 'ready') warnings.push(`Modelo de transcrição: ${input.whisperStatus}.`);
  if (input.freeDiskGb !== null && input.freeDiskGb < 10) warnings.push(`Pouco espaço em disco: ${input.freeDiskGb.toFixed(1)} GB livres.`);
  if (!input.aiConnected) warnings.push('Nenhum provedor de IA conectado.');
  if (input.hardwareFallback) warnings.push('Aceleração por hardware indisponível; processamento caiu para software.');
  const pendingProxy = (input.project.sources ?? []).filter((source) => source.needsProxy && !source.proxyReady);
  if (pendingProxy.length) warnings.push(`${pendingProxy.length} fonte(s) aguardando proxy de prévia.`);
  if (input.machine.memoryGb > 0 && input.machine.memoryGb < 8) warnings.push(`Memória disponível baixa para edição pesada: ${input.machine.memoryGb} GB.`);
  return warnings;
}

export function buildDiagnosticReport(input: EditAiDiagnosticInput, home: string): string {
  const lines: string[] = [
    `# Diagnóstico do ${input.app.name} ${input.app.version}`,
    '',
    '## O que parece errado',
    '',
  ];
  const warnings = diagnosticWarnings(input);
  lines.push(...(warnings.length ? warnings.map((warning) => `- ${warning}`) : ['- Nada de evidente no estado coletado.']));
  lines.push('', '## Máquina', '', `- Sistema: ${input.machine.platform} ${input.machine.arch}`, `- Memória: ${input.machine.memoryGb} GB`, '');
  lines.push('## Ferramentas', '');
  for (const runtime of input.runtimes) {
    const detail = runtime.detail ? ` · ${redactSecrets(runtime.detail)}` : '';
    lines.push(`- ${runtime.name}: ${runtime.ready ? 'pronta' : 'FALTANDO'}${runtime.version ? ` · ${runtime.version}` : ''}${detail}`);
  }
  lines.push('', '## Preparo', '', `- Pacote de runtimes: ${input.runtimePackStatus}`, `- Transcrição: ${input.whisperStatus}`, `- Disco livre: ${input.freeDiskGb === null ? '—' : `${input.freeDiskGb.toFixed(1)} GB`}`, `- IA conectada: ${input.aiConnected ? 'sim' : 'não'}`, `- Fallback para software: ${input.hardwareFallback ? 'sim' : 'não'}`, '');
  lines.push('## Projeto', '');
  if (!input.project.open) {
    lines.push('- Nenhum projeto aberto.');
  } else {
    lines.push(`- Nome: ${input.project.name ?? '—'}`, `- Pasta: ${anonymizeHome(input.project.path ?? '—', home)}`);
    for (const source of input.project.sources ?? []) {
      lines.push(`- ${source.name}: codec=${source.codec ?? '?'} · preview=${source.needsProxy ? (source.proxyReady ? 'proxy pronto' : 'proxy pendente') : 'direto'}`);
    }
  }
  lines.push('', '## Últimas ocorrências', '');
  if (!input.events.length) lines.push('- Nenhum erro registrado nesta sessão.');
  for (const event of input.events) {
    const message = redactSecrets(anonymizeHome(event.message, home));
    lines.push(`- ${event.at} · ${event.source}: ${message}`);
  }
  return redactSecrets(anonymizeHome(lines.join('\n'), home));
}

export function diagnosticFileName(version: string, isoDate: string): string {
  const stamp = isoDate.replace(/[:.]/gu, '-').replace(/Z$/u, '');
  return `edit-ai-diagnostico-${version}-${stamp}.md`;
}
