// Mesa Play — servidor único: serve as telas (TV, celular, painel) e roda os jogos
// de disputa de forma autoritativa via WebSocket. Sem banco: a configuração e os
// vouchers ficam em data/*.json.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const DATA = process.env.MESA_DATA_DIR || path.join(ROOT, 'data');
const PORT = Number(process.env.PORT || 3000);
const ADMIN_PIN = String(process.env.ADMIN_PIN || '1234');
const PUBLIC_URL = process.env.PUBLIC_URL || ''; // ex.: http://192.168.0.10:3000

fs.mkdirSync(DATA, { recursive: true });

// ---------- persistência ----------
const DEFAULT_CONFIG = {
  venueName: 'Restaurante Demo',
  contentUrl: '', // link do YouTube (vídeo, playlist ou ao vivo)
  surpriseEveryMin: 20, // 0 desliga as rodadas automáticas
  ads: [
    { id: 'a1', title: 'Chopp em dobro', text: 'Toda quinta, das 18h às 20h', color: '#f59e0b' },
    { id: 'a2', title: 'Seu anúncio aqui', text: 'Fale com o gerente: espaço disponível', color: '#22c55e' },
    { id: 'a3', title: 'Porção de fritas', text: 'Peça pelo garçom — R$ 24,90', color: '#ef4444' },
  ],
  prizes: [
    { id: 'p1', name: '10% de desconto na conta', weight: 5 },
    { id: 'p2', name: 'Um drink da casa', weight: 2 },
    { id: 'p3', name: 'Sobremesa grátis', weight: 3 },
  ],
};

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA, file), 'utf8')); } catch { return structuredClone(fallback); }
}
function writeJson(file, value) {
  const target = path.join(DATA, file);
  fs.writeFileSync(target + '.tmp', JSON.stringify(value, null, 2));
  fs.renameSync(target + '.tmp', target);
}

let config = { ...structuredClone(DEFAULT_CONFIG), ...readJson('config.json', {}) };
let vouchers = readJson('vouchers.json', []);
let scores = readJson('scores.json', {}); // { 'AAAA-MM-DD': { game: [{name, score}] } }

const today = () => new Date().toLocaleDateString('sv-SE');
const uid = (n = 8) => crypto.randomBytes(n).toString('hex').slice(0, n);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- salas (uma por TV) ----------
const COLORS = ['#38bdf8', '#f472b6', '#a3e635', '#fbbf24'];
const CORNERS = [[0.1, 0.12], [0.9, 0.12], [0.1, 0.88], [0.9, 0.88]];
const MAX_PLAYERS = 4;
const GAMES = {
  arena: { title: 'Arena de Moedas', seconds: 40, help: 'Use o joystick e pegue o máximo de moedas.' },
  tapRace: { title: 'Corrida do Toque', seconds: 30, help: 'Toque sem parar para acelerar o seu carro.' },
  reaction: { title: 'Rodada Surpresa', seconds: 12, help: 'Espere o JÁ! e toque primeiro. Antes da hora elimina.' },
};
const LOBBY_SECONDS = 12;
const SURPRISE_JOIN_SECONDS = 10;
const RESULTS_SECONDS = 9;

const rooms = new Map(); // tvId -> room
function getRoom(tvId) {
  if (!rooms.has(tvId)) {
    rooms.set(tvId, {
      id: tvId,
      tvs: new Set(),
      phones: new Map(), // pid -> { ws, name }
      phase: 'idle', // idle | lobby | playing | results
      game: null,
      players: new Map(), // pid -> player state in the current game
      endsAt: 0,
      timer: null,
      data: {},
      results: null,
      nextSurpriseAt: scheduleNextSurprise(),
    });
  }
  return rooms.get(tvId);
}

function scheduleNextSurprise() {
  if (!config.surpriseEveryMin) return 0;
  // aleatório entre 50% e 150% do intervalo configurado, para não ser previsível
  const base = config.surpriseEveryMin * 60_000;
  return Date.now() + base * (0.5 + Math.random());
}

function send(ws, msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function toTvs(room, msg) { for (const ws of room.tvs) send(ws, msg); }
function toPhones(room, msg) { for (const p of room.phones.values()) send(p.ws, msg); }

function publicPlayers(room) {
  return [...room.players.values()].map((p) => ({
    pid: p.pid, name: p.name, color: p.color, slot: p.slot,
    x: p.x, y: p.y, score: p.score, out: !!p.out, time: p.time ?? null,
  }));
}

function roomSnapshot(room) {
  return {
    t: 'room', tv: room.id, phase: room.phase, game: room.game,
    gameTitle: room.game ? GAMES[room.game].title : null,
    help: room.game ? GAMES[room.game].help : null,
    endsAt: room.endsAt, now: Date.now(), players: publicPlayers(room),
    data: room.game === 'arena' ? { coins: room.data.coins } : room.game === 'reaction' ? { go: !!room.data.goAt } : {},
    results: room.results, phonesOnline: room.phones.size,
  };
}

function broadcastRoom(room) {
  const snap = roomSnapshot(room);
  toTvs(room, snap);
  toPhones(room, snap);
}

function tvConfig() {
  return {
    t: 'config', venueName: config.venueName, contentUrl: config.contentUrl, ads: config.ads,
    leaderboard: leaderboard(),
  };
}
function leaderboard() {
  const day = scores[today()] || {};
  const out = {};
  for (const g of ['corrida', 'memoria']) out[g] = (day[g] || []).slice(0, 5);
  return out;
}
function pushConfigToTvs() { for (const r of rooms.values()) toTvs(r, tvConfig()); }

function clearTimer(room) { clearTimeout(room.timer); clearInterval(room.tick); room.timer = null; room.tick = null; }

function goIdle(room) {
  clearTimer(room);
  room.phase = 'idle'; room.game = null; room.players.clear(); room.data = {}; room.results = null; room.endsAt = 0;
  broadcastRoom(room);
}

function addPlayer(room, pid) {
  const phone = room.phones.get(pid);
  if (!phone || room.players.has(pid) || room.players.size >= MAX_PLAYERS) return false;
  const used = new Set([...room.players.values()].map((p) => p.slot));
  const slot = [0, 1, 2, 3].find((s) => !used.has(s));
  const [x, y] = CORNERS[slot];
  room.players.set(pid, { pid, name: phone.name, slot, color: COLORS[slot], x, y, vx: 0, vy: 0, score: 0 });
  return true;
}

// Um celular pede uma disputa: abre o lobby (ou entra no que já está aberto).
function joinGame(room, pid, game) {
  if (room.phase === 'idle') {
    if (!GAMES[game] || game === 'reaction') return;
    room.phase = 'lobby'; room.game = game; room.endsAt = Date.now() + LOBBY_SECONDS * 1000;
    room.timer = setTimeout(() => startGame(room), LOBBY_SECONDS * 1000);
  }
  if (room.phase !== 'lobby') return send(room.phones.get(pid)?.ws, { t: 'toast', text: 'Tem uma partida rolando. Espere a próxima!' });
  if (!addPlayer(room, pid)) return send(room.phones.get(pid)?.ws, { t: 'toast', text: 'Sala cheia (4 jogadores). Espere a próxima!' });
  broadcastRoom(room);
}

function leaveGame(room, pid) {
  if (!room.players.delete(pid)) return;
  if (room.phase === 'lobby' && room.players.size === 0) return goIdle(room);
  if (room.phase === 'playing' && room.players.size === 0) return goIdle(room);
  broadcastRoom(room);
}

function startSurprise(room, { forced = false } = {}) {
  if (room.phase !== 'idle') return false;
  if (!forced && room.phones.size === 0) return false;
  room.phase = 'lobby'; room.game = 'reaction'; room.endsAt = Date.now() + SURPRISE_JOIN_SECONDS * 1000;
  room.timer = setTimeout(() => startGame(room), SURPRISE_JOIN_SECONDS * 1000);
  toPhones(room, { t: 'surprise', endsAt: room.endsAt });
  broadcastRoom(room);
  return true;
}

function startGame(room) {
  clearTimer(room);
  if (room.players.size === 0) return goIdle(room);
  room.phase = 'playing';
  const spec = GAMES[room.game];
  room.endsAt = Date.now() + spec.seconds * 1000;
  for (const p of room.players.values()) { [p.x, p.y] = CORNERS[p.slot]; p.score = 0; p.out = false; p.time = null; }

  if (room.game === 'arena') {
    room.data.coins = Array.from({ length: 6 }, newCoin);
    room.tick = setInterval(() => arenaTick(room), 50);
  } else if (room.game === 'tapRace') {
    room.tick = setInterval(() => broadcastRoom(room), 100);
  } else if (room.game === 'reaction') {
    const delay = 2000 + Math.random() * 4000;
    room.data.goAt = 0;
    room.timer = setTimeout(() => { room.data.goAt = Date.now(); broadcastRoom(room); }, delay);
  }
  room.endTimer = setTimeout(() => finishGame(room), spec.seconds * 1000);
  broadcastRoom(room);
}

function newCoin() { return { id: uid(4), x: 0.08 + Math.random() * 0.84, y: 0.1 + Math.random() * 0.8 }; }

function arenaTick(room) {
  const dt = 0.05, speed = 0.45, r = 0.045;
  for (const p of room.players.values()) {
    p.x = clamp(p.x + p.vx * speed * dt, 0.03, 0.97);
    p.y = clamp(p.y + p.vy * speed * dt * 1.6, 0.05, 0.95); // a arena é 16:9: corrige o eixo y
    room.data.coins = room.data.coins.map((c) => {
      const dx = c.x - p.x, dy = (c.y - p.y) / 1.6;
      if (Math.hypot(dx, dy) < r) { p.score += 1; return newCoin(); }
      return c;
    });
  }
  broadcastRoom(room);
}

function onTap(room, pid) {
  const p = room.players.get(pid);
  if (!p || room.phase !== 'playing') return;
  if (room.game === 'tapRace') {
    if (p.score >= 100) return;
    p.score = Math.min(100, p.score + 1.5);
    if (p.score >= 100) { p.time = Date.now(); if ([...room.players.values()].every((q) => q.score >= 100)) finishGame(room); }
  } else if (room.game === 'reaction') {
    if (p.out || p.time) return;
    if (!room.data.goAt) { p.out = true; send(room.phones.get(pid)?.ws, { t: 'toast', text: 'Queimou a largada! 😅' }); }
    else { p.time = Date.now() - room.data.goAt; }
    broadcastRoom(room);
    const alive = [...room.players.values()].filter((q) => !q.out);
    if (alive.length === 0 || alive.every((q) => q.time)) finishGame(room);
  }
}

function rankPlayers(room) {
  const list = [...room.players.values()];
  if (room.game === 'reaction') {
    return list.filter((p) => !p.out && p.time).sort((a, b) => a.time - b.time)
      .concat(list.filter((p) => p.out || !p.time));
  }
  if (room.game === 'tapRace') {
    return list.sort((a, b) => (b.score - a.score) || ((a.time ?? Infinity) - (b.time ?? Infinity)));
  }
  return list.sort((a, b) => b.score - a.score);
}

function drawPrize() {
  const pool = config.prizes.filter((p) => Number(p.weight) > 0);
  if (!pool.length) return null;
  let roll = Math.random() * pool.reduce((s, p) => s + Number(p.weight), 0);
  for (const p of pool) { roll -= Number(p.weight); if (roll <= 0) return p; }
  return pool[pool.length - 1];
}

function issueVoucher(room, player) {
  const prize = drawPrize();
  if (!prize) return null;
  const code = 'MP-' + crypto.randomBytes(3).toString('hex').toUpperCase();
  const v = { code, prize: prize.name, name: player.name, tv: room.id, createdAt: Date.now(), usedAt: null };
  vouchers.unshift(v);
  vouchers = vouchers.slice(0, 1000);
  writeJson('vouchers.json', vouchers);
  broadcastAdmins({ t: 'vouchers', vouchers: vouchers.slice(0, 100) });
  return v;
}

function finishGame(room) {
  if (room.phase !== 'playing') return;
  clearTimer(room); clearTimeout(room.endTimer);
  const ranking = rankPlayers(room);
  let winner = ranking[0];
  if (room.game === 'reaction' && (!winner || winner.out || !winner.time)) winner = null;
  if (winner && winner.score === 0 && room.game !== 'reaction') winner = null;
  let voucher = null;
  if (winner && room.game === 'reaction') voucher = issueVoucher(room, winner);
  room.phase = 'results';
  room.results = {
    ranking: ranking.map((p) => ({ pid: p.pid, name: p.name, color: p.color, score: Math.round(p.score), time: p.time, out: !!p.out })),
    winner: winner ? { pid: winner.pid, name: winner.name, color: winner.color } : null,
    prize: voucher ? voucher.prize : null,
  };
  if (voucher) send(room.phones.get(winner.pid)?.ws, { t: 'voucher', voucher });
  room.endsAt = Date.now() + RESULTS_SECONDS * 1000;
  room.timer = setTimeout(() => { goIdle(room); room.nextSurpriseAt = scheduleNextSurprise(); }, RESULTS_SECONDS * 1000);
  broadcastRoom(room);
}

function recordScore(name, game, score) {
  if (!['corrida', 'memoria'].includes(game)) return;
  score = Math.round(Number(score));
  if (!Number.isFinite(score) || score <= 0 || score > 1e6) return;
  const day = (scores[today()] ||= {});
  const list = (day[game] ||= []);
  list.push({ name, score });
  list.sort((a, b) => b.score - a.score);
  day[game] = list.slice(0, 20);
  // guarda só os últimos 7 dias
  scores = Object.fromEntries(Object.entries(scores).sort().slice(-7));
  writeJson('scores.json', scores);
  pushConfigToTvs();
}

// Rodadas surpresa automáticas
setInterval(() => {
  for (const room of rooms.values()) {
    if (!room.nextSurpriseAt || Date.now() < room.nextSurpriseAt) continue;
    if (startSurprise(room)) room.nextSurpriseAt = 0; else room.nextSurpriseAt = Date.now() + 60_000;
  }
}, 5_000);

// ---------- admin ----------
const admins = new Set();
function broadcastAdmins(msg) { for (const ws of admins) send(ws, msg); }
function adminStatus() {
  return {
    t: 'status',
    tvs: [...rooms.values()].map((r) => ({
      id: r.id, screens: r.tvs.size, phones: r.phones.size, phase: r.phase,
      game: r.game ? GAMES[r.game].title : null,
      nextSurpriseAt: r.nextSurpriseAt,
    })),
  };
}
setInterval(() => broadcastAdmins(adminStatus()), 2000);

const cleanText = (s, n = 80) => String(s ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, n);

function handleAdmin(ws, msg) {
  switch (msg.t) {
    case 'saveConfig': {
      const c = msg.config || {};
      config = {
        venueName: cleanText(c.venueName, 60) || DEFAULT_CONFIG.venueName,
        contentUrl: cleanText(c.contentUrl, 300),
        surpriseEveryMin: clamp(Number(c.surpriseEveryMin) || 0, 0, 240),
        ads: (c.ads || []).slice(0, 12).map((a) => ({
          id: cleanText(a.id, 12) || uid(4), title: cleanText(a.title, 40), text: cleanText(a.text, 90),
          color: /^#[0-9a-f]{6}$/i.test(a.color) ? a.color : '#22c55e', image: cleanText(a.image, 300),
        })).filter((a) => a.title),
        prizes: (c.prizes || []).slice(0, 20).map((p) => ({
          id: cleanText(p.id, 12) || uid(4), name: cleanText(p.name, 60), weight: clamp(Number(p.weight) || 0, 0, 100),
        })).filter((p) => p.name),
      };
      writeJson('config.json', config);
      for (const r of rooms.values()) r.nextSurpriseAt = scheduleNextSurprise();
      pushConfigToTvs();
      send(ws, { t: 'config', config });
      send(ws, { t: 'toast', text: 'Configuração salva e enviada às TVs.' });
      break;
    }
    case 'surpriseNow': {
      const room = getRoom(cleanText(msg.tv, 20) || '1');
      const ok = startSurprise(room, { forced: true });
      send(ws, { t: 'toast', text: ok ? `Rodada surpresa iniciada na TV ${room.id}.` : `A TV ${room.id} está no meio de uma partida.` });
      break;
    }
    case 'redeem': {
      const v = vouchers.find((x) => x.code === cleanText(msg.code, 12).toUpperCase());
      if (!v) send(ws, { t: 'toast', text: 'Código não encontrado.' });
      else if (v.usedAt) send(ws, { t: 'toast', text: `Esse código já foi usado em ${new Date(v.usedAt).toLocaleString('pt-BR')}.` });
      else {
        v.usedAt = Date.now(); writeJson('vouchers.json', vouchers);
        send(ws, { t: 'toast', text: `✅ ${v.code} validado: ${v.prize} (${v.name}).` });
        broadcastAdmins({ t: 'vouchers', vouchers: vouchers.slice(0, 100) });
      }
      break;
    }
  }
}

// ---------- HTTP ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const PAGES = { '/': 'index.html', '/tv': 'tv.html', '/play': 'play.html', '/admin': 'admin.html' };

function originOf(req) {
  if (PUBLIC_URL) return PUBLIC_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || 'http';
  return `${proto}://${req.headers['x-forwarded-host'] || req.headers.host}`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/qr.svg') {
      const tv = cleanText(url.searchParams.get('tv'), 20) || '1';
      const svg = await QRCode.toString(`${originOf(req)}/play?tv=${encodeURIComponent(tv)}`, { type: 'svg', margin: 1, color: { dark: '#0b1020', light: '#ffffff' } });
      res.writeHead(200, { 'content-type': MIME['.svg'], 'cache-control': 'no-store' });
      return res.end(svg);
    }
    if (url.pathname === '/health') { res.writeHead(200); return res.end('ok'); }
    const file = PAGES[url.pathname] || url.pathname.slice(1);
    const full = path.normalize(path.join(PUBLIC, file));
    if (!full.startsWith(PUBLIC + path.sep) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('Não encontrado');
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(full)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    fs.createReadStream(full).pipe(res);
  } catch (err) {
    res.writeHead(500); res.end(String(err?.message || err));
  }
});

// ---------- WebSocket ----------
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });
wss.on('connection', (ws) => {
  let role = null, room = null, pid = null;

  ws.on('message', (raw) => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    if (!role) {
      if (msg.t !== 'hello') return;
      if (msg.role === 'tv') {
        role = 'tv'; room = getRoom(cleanText(msg.tv, 20) || '1'); room.tvs.add(ws);
        send(ws, tvConfig()); send(ws, roomSnapshot(room));
      } else if (msg.role === 'player') {
        role = 'player'; room = getRoom(cleanText(msg.tv, 20) || '1');
        pid = /^[a-f0-9]{8,16}$/.test(msg.pid) ? msg.pid : uid(12);
        const name = cleanText(msg.name, 16) || 'Jogador';
        const prev = room.phones.get(pid);
        if (prev && prev.ws !== ws) prev.ws.close();
        room.phones.set(pid, { ws, name });
        const p = room.players.get(pid); if (p) p.name = name;
        send(ws, { t: 'welcome', pid, venueName: config.venueName, tv: room.id, vouchers: vouchers.filter((v) => v.name === name && v.tv === room.id && !v.usedAt).slice(0, 10) });
        broadcastRoom(room);
      } else if (msg.role === 'admin') {
        if (String(msg.pin) !== ADMIN_PIN) { send(ws, { t: 'denied' }); return ws.close(); }
        role = 'admin'; admins.add(ws);
        send(ws, { t: 'config', config }); send(ws, adminStatus()); send(ws, { t: 'vouchers', vouchers: vouchers.slice(0, 100) });
      }
      return;
    }
    if (role === 'player') {
      switch (msg.t) {
        case 'join': return joinGame(room, pid, msg.game);
        case 'joinSurprise':
          if (room.phase === 'lobby' && room.game === 'reaction') { addPlayer(room, pid); broadcastRoom(room); }
          return;
        case 'leave': return leaveGame(room, pid);
        case 'tap': return onTap(room, pid);
        case 'stick': {
          const p = room.players.get(pid);
          if (p && room.game === 'arena') { const x = clamp(Number(msg.x) || 0, -1, 1), y = clamp(Number(msg.y) || 0, -1, 1); const m = Math.hypot(x, y); p.vx = m > 1 ? x / m : x; p.vy = m > 1 ? y / m : y; }
          return;
        }
        case 'score': return recordScore(room.phones.get(pid)?.name || 'Jogador', msg.game, msg.score);
      }
    }
    if (role === 'admin') handleAdmin(ws, msg);
  });

  ws.on('close', () => {
    if (role === 'tv') room.tvs.delete(ws);
    if (role === 'admin') admins.delete(ws);
    if (role === 'player' && room.phones.get(pid)?.ws === ws) {
      room.phones.delete(pid);
      // dá um respiro para quem só bloqueou a tela no meio do jogo
      setTimeout(() => { if (!room.phones.has(pid)) leaveGame(room, pid); else broadcastRoom(room); }, 8000);
      broadcastRoom(room);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Mesa Play rodando em http://localhost:${PORT}`);
  console.log(`  TV:     http://localhost:${PORT}/tv?id=1`);
  console.log(`  Painel: http://localhost:${PORT}/admin  (PIN ${ADMIN_PIN === '1234' ? '1234 — troque com ADMIN_PIN' : 'definido em ADMIN_PIN'})`);
});
