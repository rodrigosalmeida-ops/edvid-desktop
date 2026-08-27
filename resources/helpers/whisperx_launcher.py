"""Sobe o WhisperX com o cache do HuggingFace a salvo do Windows.

POR QUE ESTE ARQUIVO EXISTE. Relato real de um aluno no Windows, ao iniciar a
edicao:

    OSError: [WinError 1314] O cliente nao tem o privilegio necessario:
    '..\\..\\blobs\\e5047537...' ->
    'C:\\Users\\...\\Edvid\\cache\\huggingface\\hub\\models--Systran--faster-
    whisper-small\\snapshots\\536b0662...\\config.json'

O huggingface_hub guarda cada arquivo baixado uma vez em `blobs/` e cria em
`snapshots/` um LINK SIMBOLICO apontando para o blob. Criar link simbolico no
Windows exige o Modo de Desenvolvedor ligado ou conta de administrador; sem
isso o sistema devolve o erro 1314 acima e a transcricao morre antes de
comecar — no primeiro uso, que e o pior momento possivel.

A biblioteca TEM um caminho sem link (ela move ou copia o arquivo para o lugar
do snapshot), mas so o usa quando decide de antemao que links nao funcionam
ali. Quando essa decisao sai errada, o `os.symlink` estoura, e o `except` que
deveria salvar so pega `PermissionError` — o 1314 chega como `OSError` puro,
porque o Python nao mapeia esse codigo do Windows para o errno de permissao.

Entao no Windows a gente nao aposta: desliga o suporte a link e deixa a
biblioteca usar o caminho de copia, que ela mesma mantem. Para download novo
nao custa disco nenhum (o blob e MOVIDO para o snapshot, nao duplicado). Fora
do Windows nada muda — la o link funciona e economiza espaco.

O launcher tambem cobre o modelo de ALINHAMENTO, que o WhisperX baixa no mesmo
processo: os dois passam por aqui.
"""
from __future__ import annotations

import os
import runpy

if os.name == "nt":
    try:
        from huggingface_hub import file_download

        # A funcao e consultada por _create_symlink pelo nome do modulo, entao
        # trocar o atributo aqui vale para todas as chamadas.
        file_download.are_symlinks_supported = lambda *_args, **_kwargs: False
    except Exception:
        # Sem huggingface_hub nao ha o que desarmar: o WhisperX vai reclamar
        # sozinho, com a mensagem dele, que e melhor que a nossa.
        pass

# alter_sys=True troca so o argv[0]; os argumentos do Edvid seguem intactos.
runpy.run_module("whisperx", run_name="__main__", alter_sys=True)
