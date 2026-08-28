"""Decide os cortes do CORTE LIMPO — pausas de verdade, não achismo do agente.

O agente escolhia os trechos "no olho" a partir do texto e o resultado ficava
grosseiro: pausas curtas viravam corte, respirações naturais sumiam e o começo
da fala era decepado. Este helper faz a decisão de forma determinística e a
mesma coisa em qualquer máquina.

Quem manda é o ÁUDIO, não a transcrição. Medido numa fala real com pausas de
duração conhecida: o alinhador do WhisperX ESTICA a última palavra da frase
por cima do silêncio ("longa." marcada de 8,37s a 10,81s quando a voz parou em
8,75s). Quem procura pausa no intervalo entre palavras não enxerga silêncio
nenhum ali — foi assim que uma pausa de 2 segundos passou batido e o corte
saiu grosseiro.

Então:

1. O SILÊNCIO REAL (silencedetect do FFmpeg) define onde cortar. É medida
   objetiva do sinal, imune ao alinhamento.
2. A TRANSCRIÇÃO diz onde há fala, e serve para descartar blocos que ficaram
   sem palavra nenhuma (ruído, batida de mesa, respiração isolada).

Cada bloco mantido conserva uma respiração nas bordas (--keep), e o resultado
sai no formato do edit/edl.json que a timeline do Edvid entende.

Uso:

  clean_cut.py --transcript transcricao.json --audio entrada.MOV \\
      --source IMG_0001.MOV -o edit/edl.json

Vários arquivos (a pasta inteira do aluno), na ordem em que serão concatenados:

  clean_cut.py --transcript a.json --audio A.MOV --source A.MOV \\
               --transcript b.json --audio B.MOV --source B.MOV -o edit/edl.json

Saída: edl.json com um range por bloco mantido + um resumo no stdout para o
agente relatar ao aluno (quantos cortes, quanto foi removido).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _transcript import read_segments, read_words  # noqa: E402

# Pausa mínima para virar corte. Abaixo disso é ritmo de fala, não pausa.
#
# Era 0,45s e deixava pausa demais. Medido no vídeo real do aluno (175s de
# fala de câmera): com 0,45 sobravam 111,0s, sendo que o arquivo tem 103,5s de
# fala de verdade; com 0,30 sobram 104,7s. Abaixo de 0,25 o corte começa a
# comer fala (102,3s < 103,5s) e a edição fica ofegante.
DEFAULT_MIN_PAUSE = 0.30
# Respiração preservada em cada borda do bloco.
#
# Este número é literalmente o silêncio que sobra no começo e no fim de CADA
# bloco — foi o que o aluno viu ("muitos frames em silêncio no fim e no
# começo"). Com 0,12 eram 4,47s de ar morto nas bordas de 19 blocos; com 0,04
# são 1,30s, e o pior bloco caiu de 0,80s para 0,30s. Zero corta o ataque da
# consoante, então não vai a zero.
DEFAULT_KEEP = 0.04
# Limiar de silêncio do silencedetect. -32 dB tolera ar-condicionado e ruído de
# sala sem considerar fala baixa como silêncio.
DEFAULT_NOISE_DB = -32.0
# Bloco menor que isso não sobrevive sozinho: vira ruído de edição.
MIN_BLOCK = 0.30


def ffmpeg_binary() -> str:
    """O FFmpeg do Edvid, por caminho absoluto quando disponível."""
    return os.environ.get("EDVID_FFMPEG") or "ffmpeg"


def detect_silences(media: Path, noise_db: float, min_pause: float) -> list[tuple[float, float]]:
    """Silêncios reais do áudio: [(início, fim)] em segundos."""
    command = [
        ffmpeg_binary(),
        "-hide_banner",
        "-nostats",
        "-i",
        str(media),
        "-map",
        "0:a:0",
        "-af",
        f"silencedetect=noise={noise_db}dB:d={max(0.10, min_pause / 2):.3f}",
        "-f",
        "null",
        "-",
    ]
    try:
        result = subprocess.run(command, capture_output=True, text=True, check=False)
    except FileNotFoundError:
        return []
    silences: list[tuple[float, float]] = []
    start: float | None = None
    for match in re.finditer(
        r"silence_(start|end):\s*(-?\d+(?:\.\d+)?)", result.stderr or ""
    ):
        kind, value = match.group(1), float(match.group(2))
        if kind == "start":
            start = value
        elif start is not None:
            silences.append((start, value))
            start = None
    return silences


def words_in(words: list[dict], start: float, end: float) -> list[dict]:
    """As palavras cujo miolo cai dentro deste trecho."""
    return [
        word for word in words
        if start <= (word["start"] + word["end"]) / 2 <= end
    ]


def words_between(words: list[dict], start: float, end: float) -> int:
    """Quantas palavras têm o miolo dentro deste trecho."""
    return len(words_in(words, start, end))


# --- TAKES REFEITOS --------------------------------------------------------
# O aluno erra, para e recomeça a frase. O silêncio separa as duas tentativas
# em blocos vizinhos, e as DUAS sobreviviam ao corte limpo — o vídeo saía com
# a pessoa dizendo a mesma coisa duas vezes. Foi o que ele relatou vendo o
# resultado ("muitas repetições que deveriam ter ficado de fora").
#
# Medido no vídeo real dele, três casos em dezessete blocos:
#   "Por fim, uma das maiores novidades que a Apple vai lançar agora em..."
#   "Por fim, uma das maiores novidades que a Apple vai lançar agora no começo…"
#   "Mas me diz aí, você vai comprar um..."   /  "…um iPhone novo?"
#   "O design dos novos iPhones, o design dos iPhones 18, o design dos iPhones"
# As duas regras abaixo pegam os três e não disparam em nenhum dos catorze
# blocos legítimos.

# Prefixo comum mínimo para dois blocos serem a MESMA frase recomeçada.
RETAKE_MIN_PREFIX = 3
# Quanto do bloco anterior precisa ser esse prefixo. Alto de propósito: dois
# blocos que só começam igual ("E aí…") não são retake.
RETAKE_PREFIX_RATIO = 0.70

# --- A TENTATIVA QUE NÃO COMEÇA IGUAL --------------------------------------
# O prefixo só enxerga o erro que acontece DEPOIS de um começo idêntico. O
# relato do aluno era outro: ele troca uma palavra no meio e refaz a frase.
# Medido no projeto real dele:
#
#   "Eles acabaram de ANUNCIAR a nova GoPro Mission One Pro"       (abandonada)
#   "Eles acabaram de LANÇAR a nova GoPro Mission One Pro e LS…"   (a boa)
#
# O prefixo comum morre na quarta palavra de dez — 30%, longe dos 70% da regra
# — e a tentativa sobrevivia ao corte. Mas NOVE das dez palavras dela aparecem,
# NA ORDEM, dentro da frase seguinte. É essa a medida certa: quanto do que ele
# disse foi redito depois, e não quanto do começo bateu.
#
# CALIBRADO em seis projetos reais, não escolhido no olho. As duas tentativas
# abandonadas de verdade dão 90,0% e 68,2%; o par legítimo mais parecido de
# todos os projetos dá 45,5%, e a maioria fica abaixo de 25%. O limiar cai no
# meio desse vão, com cerca de onze pontos de folga para cada lado.
RETAKE_MIN_COVERAGE = 0.58
# Bloco curto demais não entra nesta regra: em três ou quatro palavras a
# cobertura vira ruído — "e tem" dentro de qualquer frase dá 100%.
RETAKE_MIN_WORDS = 6


def subsequence_length(first: list[str], second: list[str]) -> int:
    """Maior subsequência comum: quantas palavras de `first` reaparecem, na
    ordem, dentro de `second`."""
    if not first or not second:
        return 0
    previous = [0] * (len(second) + 1)
    for a in first:
        current = [0] * (len(second) + 1)
        for j, b in enumerate(second):
            current[j + 1] = previous[j] + 1 if a == b else max(previous[j + 1], current[j])
        previous = current
    return previous[len(second)]


def normalized_words(text: str) -> list[str]:
    """Palavras em minúscula, sem acento e sem pontuação."""
    lowered = unicodedata.normalize("NFD", text.lower())
    stripped = "".join(c for c in lowered if unicodedata.category(c) != "Mn")
    return re.findall(r"[a-z0-9]+", stripped)


def common_prefix(first: list[str], second: list[str]) -> int:
    total = 0
    while total < len(first) and total < len(second) and first[total] == second[total]:
        total += 1
    return total


def is_retake(previous: list[str], following: list[str]) -> bool:
    """`previous` é uma tentativa abandonada de dizer o que vem em `following`?"""
    if not previous or not following:
        return False
    # 1. Tentativa interrompida: quase tudo o que ele disse é o começo da
    #    próxima frase ("…vai lançar agora em…" / "…vai lançar agora no começo").
    prefix = common_prefix(previous, following)
    if prefix >= RETAKE_MIN_PREFIX and prefix / len(previous) >= RETAKE_PREFIX_RATIO:
        return True
    # 2. Gaguejo: ele repete a própria abertura dentro do bloco E o bloco
    #    seguinte começa com ela ("o design dos… o design dos… o design dos").
    opening = previous[:RETAKE_MIN_PREFIX]
    if len(previous) >= RETAKE_MIN_PREFIX * 2 and following[:RETAKE_MIN_PREFIX] == opening:
        repeats = sum(
            1 for i in range(1, len(previous) - RETAKE_MIN_PREFIX + 1)
            if previous[i:i + RETAKE_MIN_PREFIX] == opening
        )
        if repeats >= 1:
            return True
    # 3. Frase REDITA com outras palavras no meio: quase tudo o que ele disse
    #    reaparece, na ordem, na frase seguinte — mesmo que o começo divirja
    #    cedo. Ver RETAKE_MIN_COVERAGE para a calibração.
    if len(previous) >= RETAKE_MIN_WORDS:
        cobertura = subsequence_length(previous, following) / len(previous)
        if cobertura >= RETAKE_MIN_COVERAGE:
            return True
    return False


def retake_ranges(segments: list[dict]) -> list[tuple[float, float]]:
    """Os trechos de tempo em que ele começou a frase e recomeçou.

    A comparação é entre FRASES, não entre blocos de silêncio: um take
    abandonado costuma virar três ou quatro blocos curtos ("o design dos
    iPhones 18," / "design dos iPhones"), e comparando bloco com bloco a
    tentativa passava pela metade — sobrava justamente o pedaço solto que o
    aluno vê no vídeo.
    """
    said = [normalized_words(segment["text"]) for segment in segments]
    ranges: list[tuple[float, float]] = []
    for index in range(len(segments) - 1):
        # Compara com a próxima frase que ainda não foi descartada: numa
        # sequência de três tentativas, todas menos a última saem.
        following = index + 1
        while following < len(segments) and (segments[following]["start"], segments[following]["end"]) in ranges:
            following += 1
        if following >= len(segments):
            continue
        if is_retake(said[index], said[following]):
            ranges.append((segments[index]["start"], segments[index]["end"]))
    return ranges


def inside_retake(start: float, end: float, ranges: list[tuple[float, float]]) -> bool:
    """O bloco caiu dentro de uma tentativa abandonada?"""
    middle = (start + end) / 2
    return any(a <= middle <= b for a, b in ranges)


def blocks_from_silences(
    words: list[dict],
    silences: list[tuple[float, float]],
    duration: float,
    min_pause: float,
    keep: float,
) -> list[dict]:
    """Blocos de fala = o que sobra depois de remover os silêncios longos."""
    cuts = [(start, end) for start, end in silences if end - start >= min_pause]
    spans: list[tuple[float, float]] = []
    cursor = 0.0
    for start, end in cuts:
        # A respiração cabe DENTRO do silêncio: o bloco termina um pouco depois
        # da última sílaba e o próximo começa um pouco antes da próxima.
        block_end = min(start + keep, end)
        if block_end - cursor >= MIN_BLOCK:
            spans.append((cursor, block_end))
        cursor = max(end - keep, block_end)
    tail_end = duration or (words[-1]["end"] + keep if words else cursor)
    if tail_end - cursor >= MIN_BLOCK:
        spans.append((cursor, tail_end))

    out: list[dict] = []
    for start, end in spans:
        spoken = words_in(words, start, end)
        # Sem palavra nenhuma o bloco é ruído (batida, respiração solta).
        if words and not spoken:
            continue
        out.append({
            "start": round(start, 3),
            "end": round(end, 3),
            "words": len(spoken),
            "said": normalized_words(" ".join(str(w.get("text", "")) for w in spoken)),
        })
    return out


def blocks_from_words(
    words: list[dict],
    duration: float,
    min_pause: float,
    keep: float,
) -> list[dict]:
    """Plano B, sem análise de áudio: agrupa pelos intervalos da transcrição.

    Menos confiável (o alinhador estica palavras sobre o silêncio), usado só
    quando o arquivo não tem trilha analisável ou o FFmpeg não respondeu.
    """
    if not words:
        return []
    groups: list[dict] = []
    current = {"start": words[0]["start"], "end": words[0]["end"], "words": 1}
    for previous, word in zip(words, words[1:]):
        if word["start"] - previous["end"] >= min_pause:
            groups.append(current)
            current = {"start": word["start"], "end": word["end"], "words": 1}
        else:
            current["end"] = word["end"]
            current["words"] += 1
    groups.append(current)

    out: list[dict] = []
    for index, group in enumerate(groups):
        previous_end = out[-1]["end"] if out else 0.0
        next_start = groups[index + 1]["start"] if index + 1 < len(groups) else (duration or group["end"] + keep)
        start = max(previous_end, group["start"] - keep)
        end = min(group["end"] + keep, next_start - keep / 2 if index + 1 < len(groups) else (duration or group["end"] + keep))
        if end - start >= MIN_BLOCK:
            spoken = words_in(words, start, end)
            out.append({
                "start": round(start, 3),
                "end": round(end, 3),
                "words": group["words"],
                "said": normalized_words(" ".join(str(w.get("text", "")) for w in spoken)),
            })
    return out


# --- FALA SECUNDÁRIA -------------------------------------------------------
# Outra pessoa falando ao fundo, ou o próprio aluno LENDO O ROTEIRO em voz
# baixa antes de gravar a tomada. O silencedetect não pega: está acima de
# -32 dB, é fala de verdade, e a transcrição não distingue quem falou.
#
# O que distingue é o NÍVEL. A fala principal fica num patamar; a secundária
# vive bem abaixo dele — foi o que o aluno descreveu, e é a única medida
# objetiva disponível sem separação de locutor.
#
# O NÍVEL DE CADA BLOCO É O PERCENTIL 90 das janelas de 50 ms, não a média. A
# média afunda com as pausas dentro do bloco e com o fim de frase morrendo, e
# aí um bloco legítimo pareceria secundário. O p90 mede a VOZ.
#
# O LIMIAR É LARGO DE PROPÓSITO, e isto precisa ficar escrito: no projeto real
# que originou o pedido NÃO HÁ fala secundária nenhuma — medido, os quinze
# blocos ficam entre -12,8 e -20,5 dB, uma variação de 7,7 dB de ponta a
# ponta, e o mais ALTO é justamente uma tentativa abandonada. Ou seja: esta
# regra não foi validada contra material que a exercite, e por isso ela está
# ajustada para não poder errar contra o que eu medi. 14 dB é quase o dobro da
# maior variação observada dentro da mesma voz. Quando aparecer material com
# fala secundária de verdade, MEÇA antes de apertar este número.
LIMIAR_SECUNDARIA_DB = 14.0
# Abaixo disto não há patamar para comparar: com dois ou três blocos, a
# "mediana" é o próprio bloco.
MIN_BLOCOS_PARA_NIVEL = 5
# Válvula de segurança: se a regra quiser derrubar mais de um terço da fala,
# a premissa está errada (gravação inteira baixa, mudança de microfone no
# meio) e é melhor não cortar nada do que devolver um corte mutilado.
MAX_FRACAO_SECUNDARIA = 0.34


def block_levels(media: Path, blocks: list[dict]) -> list[float] | None:
    """Nível (dBFS, percentil 90) de cada bloco. None quando não deu para medir."""
    if not blocks:
        return None
    try:
        import numpy as np
    except ImportError:
        return None
    taxa = 8000
    try:
        bruto = subprocess.run(
            [ffmpeg_binary(), "-v", "error", "-i", str(media), "-map", "0:a:0",
             "-ac", "1", "-ar", str(taxa), "-f", "s16le", "-"],
            capture_output=True, check=False,
        )
    except FileNotFoundError:
        return None
    if bruto.returncode != 0 or not bruto.stdout:
        return None
    onda = np.abs(np.frombuffer(bruto.stdout, dtype=np.int16).astype(np.float32) / 32768.0)
    janela = taxa // 20  # 50 ms
    niveis: list[float] = []
    for bloco in blocks:
        trecho = onda[int(bloco["start"] * taxa):int(bloco["end"] * taxa)]
        quantas = trecho.size // janela
        if quantas < 1:
            niveis.append(float("-inf"))
            continue
        rms = np.sqrt((trecho[:quantas * janela].reshape(quantas, janela).astype(np.float64) ** 2).mean(axis=1))
        alto = float(np.percentile(rms, 90))
        niveis.append(20.0 * float(np.log10(max(alto, 1e-9))))
    return niveis


def main_level(blocks: list[dict], levels: list[float]) -> float:
    """O patamar da fala principal: mediana dos níveis PESADA PELA DURAÇÃO.

    Pesar pela duração é o que impede o contrário do que se quer: numa
    gravação com muitos apartes curtos e baixos, a mediana simples seria a voz
    secundária, e a regra derrubaria a fala principal.
    """
    pares = sorted(
        ((nivel, max(0.0, bloco["end"] - bloco["start"]))
         for bloco, nivel in zip(blocks, levels) if nivel > float("-inf")),
        key=lambda item: item[0],
    )
    total = sum(peso for _, peso in pares)
    if not pares or total <= 0:
        return float("-inf")
    meio = total / 2
    acumulado = 0.0
    for nivel, peso in pares:
        acumulado += peso
        if acumulado >= meio:
            return nivel
    return pares[-1][0]


def drop_secondary_speech(media: Path, blocks: list[dict]) -> tuple[list[dict], int]:
    """Remove os blocos que estão muito abaixo do patamar da fala principal."""
    if len(blocks) < MIN_BLOCOS_PARA_NIVEL:
        return blocks, 0
    levels = block_levels(media, blocks)
    if not levels:
        return blocks, 0
    patamar = main_level(blocks, levels)
    if patamar == float("-inf"):
        return blocks, 0
    corte = patamar - LIMIAR_SECUNDARIA_DB
    mantidos = [b for b, nivel in zip(blocks, levels) if nivel >= corte]
    total = sum(b["end"] - b["start"] for b in blocks)
    perdido = total - sum(b["end"] - b["start"] for b in mantidos)
    if total > 0 and perdido / total > MAX_FRACAO_SECUNDARIA:
        print(
            f"AVISO: a regra de fala secundária derrubaria {perdido / total * 100:.0f}% da fala "
            f"de {media.name}; premissa errada, nada removido por nível.",
            file=sys.stderr,
        )
        return blocks, 0
    return mantidos, len(blocks) - len(mantidos)


def media_duration(media: Path) -> float:
    probe = os.environ.get("EDVID_FFPROBE") or "ffprobe"
    try:
        result = subprocess.run(
            [probe, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(media)],
            capture_output=True,
            text=True,
            check=False,
        )
        return float((result.stdout or "0").strip() or 0)
    except (FileNotFoundError, ValueError):
        return 0.0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--transcript", action="append", required=True, type=Path,
                        help="JSON do WhisperX (repita junto com --audio/--source por arquivo)")
    parser.add_argument("--audio", action="append", required=True, type=Path,
                        help="arquivo de mídia correspondente à transcrição")
    parser.add_argument("--source", action="append", default=None,
                        help="nome da fonte no EDL (padrão: nome do arquivo de mídia)")
    parser.add_argument("-o", "--output", type=Path, required=True, help="caminho do edl.json")
    parser.add_argument("--min-pause", type=float, default=DEFAULT_MIN_PAUSE)
    parser.add_argument("--keep", type=float, default=DEFAULT_KEEP)
    parser.add_argument("--noise-db", type=float, default=DEFAULT_NOISE_DB)
    parser.add_argument("--keep-retakes", action="store_true",
                        help="nao descarta as tentativas abandonadas de uma frase")
    parser.add_argument("--keep-secondary", action="store_true",
                        help="nao descarta fala muito abaixo do nivel da fala principal")
    args = parser.parse_args()

    if len(args.transcript) != len(args.audio):
        parser.error("informe um --audio para cada --transcript, na mesma ordem")
    sources = args.source or [media.name for media in args.audio]
    if len(sources) != len(args.audio):
        parser.error("informe um --source para cada --audio, na mesma ordem")

    ranges: list[dict] = []
    source_map: dict[str, str] = {}
    original_total = 0.0
    kept_total = 0.0
    beat = 0
    retakes = 0
    secundarias = 0
    retake_spans: list[dict] = []

    for transcript_path, media_path, source_id in zip(args.transcript, args.audio, sources):
        words = read_words(transcript_path)
        duration = media_duration(media_path)
        original_total += duration
        if not words:
            print(f"AVISO: {transcript_path.name} não tem palavras alinhadas; arquivo ignorado.", file=sys.stderr)
            continue
        silences = detect_silences(media_path, args.noise_db, args.min_pause)
        blocks = (
            blocks_from_silences(words, silences, duration, args.min_pause, args.keep)
            if silences
            else blocks_from_words(words, duration, args.min_pause, args.keep)
        )
        if not silences:
            print(f"AVISO: sem análise de áudio em {media_path.name}; cortes derivados só da transcrição.", file=sys.stderr)
        if not args.keep_retakes:
            discard = retake_ranges(read_segments(transcript_path))
            # Guardado no EDL: descartar fala e decisao editorial, e decisao
            # editorial tem de poder ser revista sem refazer a transcricao.
            retake_spans += [
                {"source": source_id, "start": round(a, 3), "end": round(b, 3)}
                for a, b in discard
            ]
            before = len(blocks)
            blocks = [b for b in blocks if not inside_retake(b["start"], b["end"], discard)]
            retakes += before - len(blocks)
        if not args.keep_secondary:
            # DEPOIS dos retakes: uma tentativa abandonada costuma ser dita
            # mais baixo, e medir o patamar com ela dentro puxaria a mediana
            # para baixo justamente por causa do que ja vai sair.
            blocks, caiu = drop_secondary_speech(media_path, blocks)
            secundarias += caiu
        source_map[source_id] = str(media_path.name if media_path.parent == Path(".") else media_path)
        for block in blocks:
            beat += 1
            kept_total += block["end"] - block["start"]
            ranges.append({
                "source": source_id,
                "beat": f"Bloco {beat:02d}",
                "start": block["start"],
                "end": block["end"],
            })

    if not ranges:
        print("ERRO: nenhuma fala encontrada; não há corte limpo a fazer.", file=sys.stderr)
        return 1

    document = {
        "version": 1,
        "sources": source_map,
        "ranges": ranges,
        "total_duration_s": round(kept_total, 3),
        "retakes_removed": retakes,
        "retakes_ranges": retake_spans,
        "secondary_removed": secundarias,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    removed = max(0.0, original_total - kept_total)
    percent = (removed / original_total * 100) if original_total else 0.0
    print(
        f"{len(ranges)} blocos mantidos | original {original_total:.2f}s "
        f"| final {kept_total:.2f}s | removido {removed:.2f}s ({percent:.0f}%)"
        + (f" | {retakes} repeticoes descartadas" if retakes else "")
        + (f" | {secundarias} trechos de fala secundaria" if secundarias else "")
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
