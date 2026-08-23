# Experimento: prévia ao vivo (sem render)

Responde UMA pergunta: o `@remotion/player` aguenta o material real do aluno em
tempo real? Se aguentar, a prévia deixa de ser um render de minutos, e as
camadas podem virar arrastáveis — porque passam a ser DOM em vez de pixel
dentro de um MP4.

Nada aqui é produção. Se a resposta fosse não, era só apagar a pasta.

## Rodar

```bash
node spike/prepare.mjs "/caminho/do/projeto"
npx vite --config spike/live-preview/vite.config.ts
```

`prepare.mjs` liga `spike/public` ao `edit/remotion/public` do projeto e traz as
fontes do runtime compartilhado (que o app só copia na hora do render). Ele
também limpa o cache do Vite: sem isso, trocar de projeto mede o ANTERIOR e
parece que mediu o novo.

Reinicie o servidor ao trocar de projeto.

## O que foi medido (agosto/2026, MacBook, navegador Chromium)

| Projeto | Composição | Quadros/s | Scrub |
|---|---|---|---|
| Rodrigo DN.IA — karaokê, trilha, face tracking | 1080×1920, 30 fps, 95,2 s | **29,7** | 69 ms (pior 109) |
| Edição ChatGPT Mac — tela dividida, imagem gerada, legenda `stacked`, gráficos sob medida | 1080×1920, 30 fps, 13,7 s | **27,7** | — |

Toca em tempo real nos dois, sem proxy. Medido em navegador, não no Electron —
é o mesmo Chromium, mas a medida no app empacotado ainda não foi feita.

## O que o experimento descobriu

**O `CustomGraphics.tsx` é o pedaço difícil, e apareceu na primeira tentativa.**
Ele é o único arquivo que o agente escreve sob medida por projeto. Usar o do
template com os dados de outro projeto estoura em `staticFile(undefined)`. Aqui
o Vite compila o do projeto na hora; um app empacotado teria de compilar TSX em
tempo de execução, ou aceitar que motion graphic sob medida só aparece no
render.

**O medidor precisou aprender a recusar.** A primeira medição anunciou
"29,2 quadros por segundo" sobre uma tela de erro: o Player continua avançando
o quadro mesmo com a composição estourada, então media o relógio, não o vídeo.
Agora há duas travas — o evento de erro do Player e uma checagem de que ele
desenhou mesmo — e a medida é descartada quando qualquer uma dispara.
Para ver a recusa funcionando:

```bash
EDVID_SPIKE_GRAFICOS=template npx vite --config spike/live-preview/vite.config.ts --port 4833
```
