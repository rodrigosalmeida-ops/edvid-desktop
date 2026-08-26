# EDIT AI RC2 — auditoria de licenças

Data da revisão: 26/08/2026

Base: Edvid Desktop 0.33.7, commit `db71373c2613333a80f399e864655c5891a9ea3b`

Escopo: código materializado na branch `editai-v1` e runtimes Windows x64 produzidos pelo pipeline RC2.

Este documento é um inventário técnico de conformidade, não aconselhamento jurídico.

## Resultado do gate

| Componente | Versão/variante | Licença ou termos | Tratamento no EDIT AI RC2 |
| --- | --- | --- | --- |
| Edvid Desktop | 0.33.7 / `db71373` | MIT | `LICENSE` original preservada e uso identificado em `EDITAI_THIRD_PARTY_NOTICE.txt`. |
| Electron | 43.4.0 | MIT | Metadados mantidos no lockfile; notices devem acompanhar o instalador. |
| React / React DOM | 19.2.8 | MIT | Metadados mantidos no lockfile; notices devem acompanhar o instalador. |
| Vite | 5.4.21 | MIT | Dependência de build; metadados mantidos no lockfile. |
| TypeScript | 5.9.3 | Apache-2.0 | Dependência de build; preservar licença e NOTICE quando aplicável. |
| Remotion / Player | 4.0.482 | Remotion License | Não é licença open source OSI. Confirmar elegibilidade gratuita ou licença comercial antes de distribuição/uso que ultrapasse os termos vigentes. |
| FFmpeg principal | 8.1.2, BtbN `win64-gpl`, `libx264`/`libvpx` | GPL-2.0-or-later para esta configuração | Distribuir como executável separado, preservar licença, configuração, proveniência e disponibilizar o código-fonte correspondente da compilação. Release pública fica condicionada a esse pacote de conformidade. |
| FFmpeg para TorchCodec | 7.1.5, BtbN `win64-lgpl-shared` | LGPL-2.1-or-later | DLLs compartilhadas, textos de licença, metadados, fonte assinada correspondente e possibilidade de substituição devem acompanhar a distribuição. |
| WhisperX | 3.8.6 | BSD-2-Clause | Licença e copyrights devem acompanhar o runtime Python. |
| PyTorch | versão travada em `python/whisperx/uv.lock` | BSD-style / BSD-3-Clause | Reproduzir copyright, condições e disclaimer na distribuição binária. |
| Modelo `Systran/faster-whisper-small` | download sob demanda | MIT | Registrar modelo/revisão no cache e manter o model card/licença acessíveis. |
| Modelo `jonatasgrosman/wav2vec2-large-xlsr-53-portuguese` | download sob demanda | Apache-2.0 | Registrar modelo/revisão e preservar licença/model card. |
| yt-dlp | 2026.07.04, executável PyInstaller | GPL-3.0-or-later no binário combinado | O stage já coleta licença principal e licenças de terceiros; esses arquivos devem entrar no runtime final. |
| uv | 0.12.3 | Apache-2.0 OR MIT | O stage baixa e valida ambos os textos. |
| Node.js / npm | 26.7.0 / 11.19.0 | MIT + licenças de terceiros | O runtime deve manter `LICENSE` e notices distribuídos pelo Node/npm. |
| Codex App Server | 0.147.0 / commit fixado no manifesto | Apache-2.0 | O stage valida hash da licença e deve preservá-la no runtime. |
| Fontes Poppins, Inter, Playfair Display, Lora e Libre Baskerville | arquivos locais do template | SIL Open Font License 1.1 | Preservar arquivos OFL e autoria junto ao template/runtime. |
| Ícones, logo e fundo EDIT AI | assets próprios do RC2 | autoria EDIT AI | Não reutilizam marca ou assets do IA Edit PRO. |
| SFX do template | herdados do repositório MIT do Edvid | MIT do repositório, salvo notice específico | Manter a atribuição do upstream; qualquer asset futuro precisa de origem/licença registrada antes do merge. |

## Gates obrigatórios antes de release pública

1. anexar ao artefato uma pasta de notices/licenças gerada a partir dos runtimes realmente empacotados;
2. publicar ou oferecer o código-fonte correspondente e a configuração exata do FFmpeg GPL 8.1.2;
3. confirmar por escrito a elegibilidade/licença do Remotion para a operação comercial do EDIT AI;
4. manter a build LGPL compartilhada do FFmpeg 7.1.5 substituível e acompanhada de seus textos/fonte correspondente;
5. registrar as revisões efetivamente baixadas dos dois modelos do Hugging Face;
6. não promover o RC2 sem assinatura Authenticode e sem revisar eventuais obrigações de patentes dos codecs H.264/AAC na jurisdição de distribuição.

## Fontes primárias verificadas

- FFmpeg: https://ffmpeg.org/legal.html
- WhisperX: https://github.com/m-bain/whisperX/blob/main/LICENSE
- PyTorch: https://github.com/pytorch/pytorch/blob/main/LICENSE
- Remotion: https://www.remotion.dev/docs/license
- yt-dlp: https://github.com/yt-dlp/yt-dlp#licensing
- Modelo Whisper small: https://huggingface.co/Systran/faster-whisper-small
- Modelo de alinhamento PT-BR: https://huggingface.co/jonatasgrosman/wav2vec2-large-xlsr-53-portuguese
