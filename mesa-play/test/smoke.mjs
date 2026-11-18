// Teste ponta a ponta: sobe o servidor, conecta TV, dois celulares e o painel,
// roda uma Corrida do Toque e uma Rodada Surpresa até o voucher ser validado.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import WebSocket from 'ws';

const PORT = 3900 + Math.floor(Math.random() * 90);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mesa-play-'));
const srv = spawn(process.execPath, ['server.js'], { cwd: path.dirname(path.dirname(new URL(import.meta.url).pathname)), env: { ...process.env, PORT, MESA_DATA_DIR: dataDir, ADMIN_PIN: '9999' }, stdio: 'inherit' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function client(hello) {
  const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
  const c = { ws, msgs: [], last: {}, send: (m) => ws.send(JSON.stringify(m)) };
  ws.on('message', (d) => { const m = JSON.parse(d); c.msgs.push(m); c.last[m.t] = m; });
  return new Promise((res) => ws.on('open', () => { c.send({ t: 'hello', ...hello }); res(c); }));
}
async function until(fn, ms = 20000, label = 'condição') {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await fn()) return; await sleep(50); }
  throw new Error('tempo esgotado esperando ' + label);
}

try {
  await until(() => fetch(`http://localhost:${PORT}/health`).then((r) => r.ok).catch(() => false), 5000, 'servidor');
  for (const p of ['/', '/tv', '/play', '/admin', '/tv.js', '/play.js']) assert.equal((await fetch(`http://localhost:${PORT}${p}`)).status, 200, p);
  const qr = await (await fetch(`http://localhost:${PORT}/qr.svg?tv=1`)).text();
  assert.match(qr, /<svg/);
  assert.equal((await fetch(`http://localhost:${PORT}/../server.js`)).status, 404);

  const tv = await client({ role: 'tv', tv: '1' });
  const ana = await client({ role: 'player', tv: '1', name: 'Ana' });
  const bia = await client({ role: 'player', tv: '1', name: 'Bia' });
  await until(() => ana.last.welcome && bia.last.welcome, 3000, 'welcome');
  await until(() => tv.last.config && tv.last.room?.phonesOnline === 2, 3000, 'tv vê 2 celulares');

  // Corrida do Toque
  ana.send({ t: 'join', game: 'tapRace' });
  bia.send({ t: 'join', game: 'tapRace' });
  await until(() => tv.last.room.phase === 'lobby' && tv.last.room.players.length === 2, 3000, 'lobby');
  await until(() => tv.last.room.phase === 'playing', 15000, 'início da corrida');
  for (let i = 0; i < 70; i++) { ana.send({ t: 'tap' }); if (i % 2) bia.send({ t: 'tap' }); await sleep(5); }
  await until(() => tv.last.room.phase === 'results', 35000, 'resultado');
  assert.equal(tv.last.room.results.winner.name, 'Ana');
  console.log('✓ Corrida do Toque: Ana venceu');
  await until(() => tv.last.room.phase === 'idle', 12000, 'volta ao idle');

  // Rodada surpresa
  const adm = await client({ role: 'admin', pin: '9999' });
  await until(() => adm.last.config, 3000, 'admin');
  adm.send({ t: 'surpriseNow', tv: '1' });
  await until(() => ana.last.surprise && bia.last.surprise, 3000, 'aviso de surpresa');
  ana.send({ t: 'joinSurprise' }); bia.send({ t: 'joinSurprise' });
  await until(() => tv.last.room.phase === 'playing' && tv.last.room.game === 'reaction', 15000, 'início da surpresa');
  bia.send({ t: 'tap' }); // queimou a largada
  await until(() => tv.last.room.data.go, 8000, 'JÁ!');
  ana.send({ t: 'tap' });
  await until(() => tv.last.room.phase === 'results', 5000, 'resultado surpresa');
  assert.equal(tv.last.room.results.winner.name, 'Ana');
  await until(() => ana.last.voucher, 3000, 'voucher');
  const code = ana.last.voucher.voucher.code;
  assert.ok(!bia.last.voucher, 'Bia não ganha');
  console.log(`✓ Rodada surpresa: Ana ganhou "${ana.last.voucher.voucher.prize}" (${code})`);

  adm.send({ t: 'redeem', code });
  await until(() => adm.msgs.some((m) => m.t === 'toast' && m.text.includes('validado')), 3000, 'validação');
  adm.send({ t: 'redeem', code });
  await until(() => adm.msgs.some((m) => m.t === 'toast' && m.text.includes('já foi usado')), 3000, 'bloqueio de reuso');
  console.log('✓ Voucher validado uma vez e recusado na segunda');

  // Recorde solo aparece na TV
  ana.send({ t: 'score', game: 'corrida', score: 321 });
  await until(() => tv.last.config.leaderboard.corrida.some((s) => s.name === 'Ana' && s.score === 321), 3000, 'recorde na TV');
  console.log('✓ Recorde solo aparece na TV');

  // PIN errado é recusado
  const bad = await client({ role: 'admin', pin: '0000' });
  await until(() => bad.last.denied, 3000, 'pin recusado');
  console.log('✓ PIN errado recusado');
  console.log('\nTodos os testes passaram.');
  process.exitCode = 0;
} catch (err) {
  console.error('✗', err.message); process.exitCode = 1;
} finally {
  srv.kill(); fs.rmSync(dataDir, { recursive: true, force: true });
  setTimeout(() => process.exit(), 200);
}
