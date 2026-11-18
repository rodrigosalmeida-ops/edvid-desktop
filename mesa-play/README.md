# Mesa Play

Jogos por QR Code nas TVs do restaurante. O cliente lê o QR Code da TV, joga no
celular e disputa com as outras mesas na tela grande. Rodadas surpresa dão
prêmios (desconto, drink, sobremesa) e 1/3 da tela é espaço de anúncio que o
restaurante vende.

## Rodar

```bash
cd mesa-play
npm install
ADMIN_PIN=4321 npm start          # http://localhost:3000
npm test                          # teste ponta a ponta (TV + 2 celulares + painel)
```

| Tela | Endereço | Onde abre |
|---|---|---|
| TV | `/tv?id=1`, `/tv?id=2`… | navegador em tela cheia na TV (Smart TV, TV box, Fire Stick, mini PC) |
| Celular | `/play?tv=1` | é o link do QR Code, ninguém digita |
| Painel | `/admin` | celular ou PC do gerente, protegido por PIN |

Para os celulares alcançarem o servidor, rode-o numa máquina da rede do
restaurante (e use `PUBLIC_URL=http://IP-da-maquina:3000`) ou publique-o num
servidor com domínio (Render, Railway, Fly, VPS). Atrás de HTTPS o WebSocket
passa a usar `wss://` sozinho.

## O que já funciona

- **Tela da TV dividida**: 2/3 com conteúdo (link do YouTube: jogo, clipe,
  playlist, ao vivo) e 1/3 com anúncio rotativo, QR Code e recordes do dia.
- **Disputas na TV (até 4 pessoas, uma em cada canto)**:
  - *Arena de Moedas*: o celular vira joystick, quem pegar mais moedas vence.
  - *Corrida do Toque*: toque sem parar, o carro anda na TV.
- **Jogos solo no celular**: *Corrida* (desviar dos carros) e *Memória*. Os 5
  melhores do dia aparecem na TV.
- **Rodada surpresa**: em horário aleatório (ou no botão do painel), todos os
  celulares conectados recebem o convite. Quem tocar primeiro quando a TV
  mostrar "JÁ!" ganha um prêmio sorteado da lista do restaurante, com código de
  uso único (`MP-XXXXXX`).
- **Painel do restaurante**: nome, link do conteúdo, anúncios (texto, cor ou
  imagem), prêmios com peso de sorteio, frequência das rodadas surpresa, TVs ao
  vivo e validação dos códigos (cada código vale uma vez).

## Arquitetura

Um servidor Node (`server.js`) serve as páginas e roda as partidas pelo
WebSocket: as posições, os toques e os vencedores são decididos no servidor,
não no celular, para ninguém trapacear e levar prêmio. A configuração, os
recordes e os vouchers ficam em `data/*.json`. Dependências: `ws` e `qrcode`.

## Próximos passos sugeridos

1. Vários restaurantes num servidor só (multi-tenant) com login por cliente.
2. Mais jogos de disputa (quiz de futebol, pênaltis, trivia da casa).
3. Relatório para o anunciante: quantas pessoas jogaram e viram o anúncio.
4. App de TV (Android TV) para abrir direto em tela cheia ao ligar.

## Cuidados para vender

- As rodadas são **grátis e por habilidade**: ninguém aposta dinheiro. Manter
  assim evita que o produto vire jogo de azar (nada de mecânica tipo caça-níquel).
- Distribuir prêmios em promoção comercial pode exigir autorização no Brasil
  (Lei 5.768/71). Confirme com um advogado o formato antes de vender.
- Registre o software no INPI antes de apresentar e venda **licença de uso**
  em contrato: o cliente usa, vocês ficam com os direitos.
