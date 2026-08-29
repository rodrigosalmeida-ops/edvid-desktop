// Correcao manual de legenda do EDIT AI, preservando o timing medido pelo WhisperX.
//
// Regra principal: palavras que nao mudam reutilizam o objeto original; somente
// trechos realmente alterados sao redistribuidos dentro da propria janela de tempo.

export type PalavraLegenda = {
  text: string;
  startMs: number;
  endMs: number;
  [extra: string]: unknown;
};

const FIM_DE_FRASE = /[.!?…]$/u;
const MINIMO_POR_PALAVRA_MS = 80;
const TETO_DO_ALINHAMENTO = 900;

type Bloco = { originais: PalavraLegenda[]; novas: string[] };

export function textoEditavel(palavras: readonly PalavraLegenda[]): string {
  const linhas: string[] = [];
  let atual: string[] = [];
  for (const palavra of palavras) {
    const texto = String(palavra.text ?? '').trim();
    if (!texto) continue;
    atual.push(texto);
    if (FIM_DE_FRASE.test(texto)) {
      linhas.push(atual.join(' '));
      atual = [];
    }
  }
  if (atual.length) linhas.push(atual.join(' '));
  return linhas.join('\n');
}

export function palavrasDoTexto(texto: string): string[] {
  return String(texto ?? '').split(/\s+/u).filter(Boolean);
}

function alinhar(antigas: readonly string[], novas: readonly string[]): number[][] {
  const n = antigas.length;
  const m = novas.length;
  const tabela: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      tabela[i][j] = antigas[i] === novas[j]
        ? tabela[i + 1][j + 1] + 1
        : Math.max(tabela[i + 1][j], tabela[i][j + 1]);
    }
  }
  return tabela;
}

function blocosDaEdicao(
  palavras: readonly PalavraLegenda[],
  novas: readonly string[],
): Bloco[] {
  const antigas = palavras.map((palavra) => String(palavra.text ?? ''));
  const blocos: Bloco[] = [];
  const empurrar = (originais: PalavraLegenda[], texto: string[]) => {
    if (!originais.length && !texto.length) return;
    blocos.push({ originais, novas: texto });
  };

  if (antigas.length > TETO_DO_ALINHAMENTO || novas.length > TETO_DO_ALINHAMENTO) {
    empurrar([...palavras], [...novas]);
    return blocos;
  }

  const tabela = alinhar(antigas, novas);
  let i = 0;
  let j = 0;
  let pendenteOriginais: PalavraLegenda[] = [];
  let pendenteNovas: string[] = [];
  while (i < antigas.length && j < novas.length) {
    if (antigas[i] === novas[j]) {
      empurrar(pendenteOriginais, pendenteNovas);
      pendenteOriginais = [];
      pendenteNovas = [];
      empurrar([palavras[i]], [novas[j]]);
      i += 1;
      j += 1;
    } else if (tabela[i + 1][j] >= tabela[i][j + 1]) {
      pendenteOriginais.push(palavras[i]);
      i += 1;
    } else {
      pendenteNovas.push(novas[j]);
      j += 1;
    }
  }
  while (i < antigas.length) { pendenteOriginais.push(palavras[i]); i += 1; }
  while (j < novas.length) { pendenteNovas.push(novas[j]); j += 1; }
  empurrar(pendenteOriginais, pendenteNovas);
  return blocos;
}

export function aplicarTexto(
  palavras: readonly PalavraLegenda[],
  texto: string,
): PalavraLegenda[] {
  const novas = palavrasDoTexto(texto);
  if (!palavras.length || !novas.length) return [];

  const blocos = blocosDaEdicao(palavras, novas);
  const saida: PalavraLegenda[] = [];

  blocos.forEach((bloco, indice) => {
    if (bloco.novas.length === bloco.originais.length) {
      bloco.originais.forEach((original, posicao) => {
        saida.push(String(original.text) === bloco.novas[posicao]
          ? original
          : { ...original, text: bloco.novas[posicao] });
      });
      return;
    }
    if (!bloco.novas.length) return;

    const anterior = saida.at(-1);
    const seguinte = blocos.slice(indice + 1).flatMap((outro) => outro.originais)[0];
    let de = bloco.originais.length
      ? Number(bloco.originais[0].startMs)
      : Number(anterior?.endMs ?? 0);
    let ate = bloco.originais.length
      ? Number(bloco.originais[bloco.originais.length - 1].endMs)
      : Number(seguinte?.startMs ?? de + bloco.novas.length * MINIMO_POR_PALAVRA_MS);
    if (!Number.isFinite(de)) de = 0;
    if (!Number.isFinite(ate) || ate <= de) ate = de + bloco.novas.length * MINIMO_POR_PALAVRA_MS;

    const pesos = bloco.novas.map((palavra) => Math.max(1, palavra.length));
    const soma = pesos.reduce((total, peso) => total + peso, 0);
    let acumulado = 0;
    bloco.novas.forEach((palavra, posicao) => {
      const inicioMs = de + Math.round((acumulado / soma) * (ate - de));
      acumulado += pesos[posicao];
      const fimMs = Math.max(inicioMs + 1, de + Math.round((acumulado / soma) * (ate - de)));
      const base = bloco.originais[posicao] ?? {};
      saida.push({
        ...base,
        text: palavra,
        startMs: inicioMs,
        endMs: fimMs,
        timestampMs: Math.round((inicioMs + fimMs) / 2),
      });
    });
  });

  return saida;
}

export function quantasMudaram(
  antes: readonly PalavraLegenda[],
  depois: readonly PalavraLegenda[],
): number {
  const maior = Math.max(antes.length, depois.length);
  let contagem = 0;
  for (let i = 0; i < maior; i += 1) {
    if (String(antes[i]?.text ?? '') !== String(depois[i]?.text ?? '')) contagem += 1;
  }
  return contagem;
}
