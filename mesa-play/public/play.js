import { connect, toast, esc } from '/net.js';

const $ = (id) => document.getElementById(id);
const tvId = new URLSearchParams(location.search).get('tv') || '1';
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem('mp.' + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('mp.' + k, JSON.stringify(v)); } catch { /* modo privado */ } },
};
let pid = store.get('pid', null);
let name = store.get('name', '');
let myVouchers = store.get('vouchers', []);
let room = null, clockOffset = 0, net = null, inSolo = false;

function show(id) {
  for (const s of ['s-name', 's-menu', 's-ctrl']) $(s).classList.toggle('hidden', s !== id);
}

// ---------- entrada ----------
$('nameInput').value = name;
$('enterBtn').onclick = () => {
  const v = $('nameInput').value.trim();
  if (!v) return $('nameInput').focus();
  name = v.slice(0, 16); store.set('name', name);
  start();
};
$('nameInput').onkeydown = (e) => { if (e.key === 'Enter') $('enterBtn').click(); };
$('renameBtn').onclick = () => { net?.close(); net = null; show('s-name'); };

function start() {
  $('hello').textContent = `Oi, ${name}!`;
  show('s-menu');
  if (net) { net.hello.name = name; return; }
  net = connect({ role: 'player', tv: tvId, name, pid }, onMessage);
}

function onMessage(msg) {
  switch (msg.t) {
    case '_open': if (net) net.hello.pid = pid; break;
    case '_closed': $('roomStatus').textContent = 'Reconectando…'; break;
    case 'welcome':
      pid = msg.pid; store.set('pid', pid); net.hello.pid = pid;
      $('venueName').textContent = `${msg.venueName} · TV ${msg.tv}`;
      for (const v of msg.vouchers || []) addVoucher(v, false);
      renderVouchers();
      break;
    case 'room': clockOffset = msg.now - Date.now(); room = msg; renderRoom(); break;
    case 'surprise': onSurprise(); break;
    case 'voucher': addVoucher(msg.voucher, true); break;
    case 'toast': toast(msg.text); break;
  }
}

// ---------- vouchers ----------
function addVoucher(v, celebrate) {
  if (!myVouchers.some((x) => x.code === v.code)) myVouchers.unshift(v);
  myVouchers = myVouchers.slice(0, 20); store.set('vouchers', myVouchers); renderVouchers();
  if (celebrate) {
    navigator.vibrate?.([80, 60, 160]);
    modal(`<div style="font-size:54px">🏆</div><h1>Você ganhou!</h1><p>${esc(v.prize)}</p>
      <div class="code">${esc(v.code)}</div><p class="muted">Mostre este código ao garçom. Ele vale uma vez.</p>
      <button class="btn" data-close>Fechar</button>`);
  }
}
function renderVouchers() {
  const fresh = myVouchers.filter((v) => Date.now() - v.createdAt < 1000 * 60 * 60 * 12);
  $('vouchers').innerHTML = fresh.length
    ? fresh.map((v) => `<div class="voucher"><code>${esc(v.code)}</code><div>${esc(v.prize)}</div><small class="muted">mostre ao garçom · ${new Date(v.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</small></div>`).join('')
    : '<p class="muted">Ganhe uma rodada surpresa para levar um prêmio.</p>';
}

function modal(html) {
  $('modalBody').innerHTML = html; $('modal').classList.remove('hidden');
  $('modalBody').querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => $('modal').classList.add('hidden')));
}

// ---------- sala ----------
const secsLeft = () => Math.max(0, Math.ceil(((room?.endsAt || 0) - (Date.now() + clockOffset)) / 1000));
const me = () => room?.players.find((p) => p.pid === pid);

document.querySelectorAll('[data-join]').forEach((b) => (b.onclick = () => net?.send({ t: 'join', game: b.dataset.join })));
$('leaveBtn').onclick = () => net?.send({ t: 'leave' });

function onSurprise() {
  navigator.vibrate?.([100, 80, 100]);
  if (inSolo) closeSolo();
  modal(`<div style="font-size:54px">🎁</div><h1>Rodada surpresa!</h1>
    <p>Quem tocar primeiro quando a TV mostrar <b>JÁ!</b> ganha um prêmio. É grátis.</p>
    <button class="btn" id="joinSurprise">Participar</button><button class="btn ghost" data-close>Agora não</button>`);
  $('joinSurprise').onclick = () => { net?.send({ t: 'joinSurprise' }); $('modal').classList.add('hidden'); };
}

let padFor = null;
function renderRoom() {
  const r = room, mine = me();
  const st = $('roomStatus');
  st.classList.toggle('live', r.phase !== 'idle');
  if (r.phase === 'idle') st.textContent = `TV livre · ${r.phonesOnline} ${r.phonesOnline === 1 ? 'pessoa conectada' : 'pessoas conectadas'}. Escolha uma disputa!`;
  else if (r.phase === 'lobby') st.innerHTML = `<b>${esc(r.gameTitle)}</b> abrindo na TV — ${r.players.length}/4 jogadores. ${r.game === 'reaction' && !mine ? '<button class="btn" id="lateJoin" style="padding:10px;margin-top:8px">Participar</button>' : r.game !== 'reaction' && !mine ? 'Toque no jogo para entrar.' : ''}`;
  else if (r.phase === 'playing') st.innerHTML = `<b>${esc(r.gameTitle)}</b> rolando na TV. Espere a próxima!`;
  else st.innerHTML = r.results?.winner ? `🏆 ${esc(r.results.winner.name)} venceu ${esc(r.gameTitle)}!` : 'Partida encerrada.';
  $('lateJoin') && ($('lateJoin').onclick = () => net?.send({ t: 'joinSurprise' }));

  const inGame = mine && (r.phase === 'lobby' || r.phase === 'playing' || r.phase === 'results');
  if (!inGame) { padFor = null; if (!$('s-name').classList.contains('hidden')) return; return show('s-menu'); }
  if (inSolo) closeSolo();
  show('s-ctrl');
  $('ctrlTitle').textContent = r.gameTitle;
  $('ctrlTitle').style.color = mine.color;
  $('leaveBtn').classList.toggle('hidden', r.phase === 'results');
  if (r.phase === 'lobby') $('ctrlInfo').textContent = `Você é o ${mine.name} (${['canto superior esquerdo', 'canto superior direito', 'canto inferior esquerdo', 'canto inferior direito'][mine.slot]}). Começa em ${secsLeft()}s — olhe para a TV!`;
  else if (r.phase === 'playing') $('ctrlInfo').textContent = r.game === 'arena' ? `${mine.score} moedas · ${secsLeft()}s` : r.game === 'tapRace' ? `${Math.round(mine.score)}% · ${secsLeft()}s` : mine.out ? 'Queimou a largada 😅' : mine.time ? `Seu tempo: ${mine.time} ms` : r.data.go ? 'JÁ! TOQUE!' : 'Aguarde o JÁ! na TV…';
  else {
    const res = r.results, mineRes = res.ranking.find((p) => p.pid === pid);
    const pos = res.ranking.indexOf(mineRes) + 1;
    $('ctrlInfo').textContent = res.winner?.pid === pid ? '🏆 Você venceu!'
      : mineRes?.out ? 'Queimou a largada — fica para a próxima!'
      : !res.winner ? 'Ninguém pontuou dessa vez.'
      : `Você ficou em ${pos}º lugar.`;
  }
  const kind = r.game === 'arena' ? 'stick' : 'tap';
  if (padFor !== kind + mine.color) { padFor = kind + mine.color; buildPad(kind, mine.color); }
}
setInterval(() => room && room.phase !== 'idle' && renderRoom(), 500);

function buildPad(kind, color) {
  const pad = $('pad');
  if (kind === 'tap') {
    pad.innerHTML = `<button class="tap" id="tapBtn" style="background:${color}">TOQUE</button>`;
    const b = $('tapBtn');
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); net?.send({ t: 'tap' }); navigator.vibrate?.(8); });
    return;
  }
  pad.innerHTML = `<div class="stick" id="stick"><div class="knob" style="background:${color}"></div></div>`;
  const el = $('stick'), knob = el.querySelector('.knob');
  let active = null, last = 0, vec = [0, 0];
  const sendVec = (force) => { const t = performance.now(); if (force || t - last > 45) { last = t; net?.send({ t: 'stick', x: vec[0], y: vec[1] }); } };
  const move = (e) => {
    const b = el.getBoundingClientRect(), r = b.width / 2;
    let x = (e.clientX - b.left - r) / (r * 0.7), y = (e.clientY - b.top - r) / (r * 0.7);
    const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
    vec = [x, y]; knob.style.transform = `translate(${x * r * 0.62}px, ${y * r * 0.62}px)`; sendVec();
  };
  el.addEventListener('pointerdown', (e) => { active = e.pointerId; el.setPointerCapture(active); move(e); });
  el.addEventListener('pointermove', (e) => { if (e.pointerId === active) move(e); });
  const end = (e) => { if (e.pointerId !== active) return; active = null; vec = [0, 0]; knob.style.transform = ''; sendVec(true); };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
}

// ---------- jogos solo ----------
let stopSolo = null;
document.querySelectorAll('[data-solo]').forEach((b) => (b.onclick = () => openSolo(b.dataset.solo)));
$('soloBack').onclick = () => closeSolo();
function openSolo(game) {
  inSolo = true; $('s-solo').classList.remove('hidden'); $('soloBody').innerHTML = ''; $('soloScore').textContent = '';
  $('soloTitle').textContent = game === 'corrida' ? '🏎️ Corrida' : '🧠 Memória';
  stopSolo = game === 'corrida' ? soloRace() : soloMemory();
}
function closeSolo() { inSolo = false; stopSolo?.(); stopSolo = null; $('s-solo').classList.add('hidden'); }
function soloOver(game, score, retry) {
  net?.send({ t: 'score', game, score });
  const best = Math.max(store.get('best.' + game, 0), score); store.set('best.' + game, best);
  modal(`<h1>${score} pontos</h1><p class="muted">Seu recorde: ${best}. Os 5 melhores do dia aparecem na TV!</p>
    <button class="btn" id="again">Jogar de novo</button><button class="btn ghost" data-close id="quit">Voltar ao menu</button>`);
  $('again').onclick = () => { $('modal').classList.add('hidden'); retry(); };
  $('quit').onclick = () => { $('modal').classList.add('hidden'); closeSolo(); };
}

function soloRace() {
  const cv = document.createElement('canvas'); $('soloBody').append(cv);
  const g = cv.getContext('2d');
  let raf, state;
  const reset = () => { state = { lane: 1, x: 1, obs: [], t: 0, speed: 0.55, score: 0, spawn: 0, over: false }; };
  const fit = () => { const b = cv.getBoundingClientRect(); cv.width = b.width * devicePixelRatio; cv.height = b.height * devicePixelRatio; };
  const steer = (d) => { if (!state.over) state.lane = Math.max(0, Math.min(2, state.lane + d)); };
  let sx = null;
  cv.addEventListener('pointerdown', (e) => { sx = e.clientX; });
  cv.addEventListener('pointerup', (e) => {
    const dx = e.clientX - sx; const b = cv.getBoundingClientRect();
    if (Math.abs(dx) > 25) steer(Math.sign(dx)); else steer(e.clientX - b.left < b.width / 2 ? -1 : 1);
  });
  const key = (e) => { if (e.key === 'ArrowLeft') steer(-1); if (e.key === 'ArrowRight') steer(1); };
  addEventListener('keydown', key);
  let prev = performance.now();
  const loop = (now) => {
    raf = requestAnimationFrame(loop);
    if (cv.width === 0) fit();
    const dt = Math.min(0.05, (now - prev) / 1000); prev = now;
    const W = cv.width, H = cv.height, lw = W / 3;
    if (!state.over) {
      state.t += dt; state.speed = 0.55 + state.t * 0.025; state.score += dt * 10 * state.speed;
      state.x += (state.lane - state.x) * Math.min(1, dt * 14);
      state.spawn -= dt;
      if (state.spawn <= 0) {
        state.spawn = Math.max(0.35, 1.1 - state.t * 0.02);
        state.obs.push({ lane: Math.floor(Math.random() * 3), y: -0.1, car: ['🚙', '🚕', '🚌', '🚓'][Math.floor(Math.random() * 4)] });
      }
      for (const o of state.obs) o.y += dt * state.speed;
      state.obs = state.obs.filter((o) => o.y < 1.15);
      if (state.obs.some((o) => Math.abs(o.lane - state.x) < 0.55 && Math.abs(o.y - 0.85) < 0.07)) {
        state.over = true; navigator.vibrate?.(200); setTimeout(() => soloOver('corrida', Math.round(state.score), reset), 400);
      }
      $('soloScore').textContent = `${Math.round(state.score)} pts`;
    }
    g.fillStyle = '#1f2937'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#fff6'; g.lineWidth = 4 * devicePixelRatio; g.setLineDash([30 * devicePixelRatio, 30 * devicePixelRatio]);
    g.lineDashOffset = -(state.t * state.speed * H) % (60 * devicePixelRatio);
    for (const i of [1, 2]) { g.beginPath(); g.moveTo(i * lw, 0); g.lineTo(i * lw, H); g.stroke(); }
    g.setLineDash([]);
    const fs = Math.min(lw * 0.6, H * 0.09); g.font = `${fs}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const o of state.obs) { g.save(); g.translate(lw * (o.lane + 0.5), o.y * H); g.rotate(-Math.PI / 2); g.fillText(o.car, 0, 0); g.restore(); }
    g.save(); g.translate(lw * (state.x + 0.5), H * 0.85); g.rotate(Math.PI / 2); g.fillText(state.over ? '💥' : '🏎️', 0, 0); g.restore();
  };
  reset(); requestAnimationFrame(() => { fit(); raf = requestAnimationFrame(loop); });
  addEventListener('resize', fit);
  return () => { cancelAnimationFrame(raf); removeEventListener('keydown', key); removeEventListener('resize', fit); };
}

function soloMemory() {
  const icons = ['🍕', '🍔', '🍟', '🌮', '🍣', '🍩', '🍺', '🥤'];
  let timer;
  const startRound = () => {
    clearInterval(timer);
    const deck = [...icons, ...icons].sort(() => Math.random() - 0.5);
    let open = [], moves = 0, found = 0, t0 = Date.now(), lock = false;
    $('soloBody').innerHTML = `<div class="mem">${deck.map((e, i) => `<button data-i="${i}">${e}</button>`).join('')}</div>`;
    const tick = () => { $('soloScore').textContent = `${moves} jogadas · ${Math.floor((Date.now() - t0) / 1000)}s`; };
    timer = setInterval(tick, 500); tick();
    $('soloBody').querySelectorAll('button').forEach((b) => (b.onclick = () => {
      if (lock || b.classList.contains('open') || b.classList.contains('done')) return;
      b.classList.add('open'); open.push(b);
      if (open.length < 2) return;
      moves++; tick();
      const [a, c] = open; open = [];
      if (a.textContent === c.textContent) {
        a.classList.replace('open', 'done'); c.classList.replace('open', 'done'); found++;
        if (found === icons.length) {
          clearInterval(timer);
          const secs = (Date.now() - t0) / 1000;
          soloOver('memoria', Math.max(50, Math.round(2000 - moves * 40 - secs * 10)), startRound);
        }
      } else { lock = true; setTimeout(() => { a.classList.remove('open'); c.classList.remove('open'); lock = false; }, 700); }
    }));
  };
  startRound();
  return () => clearInterval(timer);
}

// ---------- início ----------
renderVouchers();
if (name) start(); else show('s-name');
