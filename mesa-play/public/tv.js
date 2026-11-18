import { connect, esc } from '/net.js';

const tvId = new URLSearchParams(location.search).get('id') || '1';
const $ = (id) => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d');
let room = null, clockOffset = 0, ads = [], adIndex = 0, contentUrl = null;

$('qr').src = `/qr.svg?tv=${encodeURIComponent(tvId)}`;

connect({ role: 'tv', tv: tvId }, (msg) => {
  if (msg.t === '_open') $('offline').classList.add('hidden');
  if (msg.t === '_closed') $('offline').classList.remove('hidden');
  if (msg.t === 'config') applyConfig(msg);
  if (msg.t === 'room') { clockOffset = msg.now - Date.now(); room = msg; render(); }
});

// ---------- conteúdo, anúncios e recordes ----------
function youtubeEmbed(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const list = u.searchParams.get('list');
    let id = u.searchParams.get('v');
    if (u.hostname.includes('youtu.be')) id = u.pathname.slice(1);
    const m = u.pathname.match(/\/(embed|live|shorts)\/([\w-]+)/); if (m) id = m[2];
    const common = 'autoplay=1&mute=1&controls=0&rel=0&modestbranding=1&playsinline=1';
    if (list && !id) return `https://www.youtube.com/embed/videoseries?list=${list}&${common}&loop=1`;
    if (id) return `https://www.youtube.com/embed/${id}?${common}&loop=1&playlist=${id}${list ? `&list=${list}` : ''}`;
    return url; // outra URL embutível qualquer
  } catch { return null; }
}

function applyConfig(cfg) {
  $('venue').textContent = cfg.venueName;
  document.title = `${cfg.venueName} — Mesa Play`;
  const embed = youtubeEmbed(cfg.contentUrl);
  if (embed !== contentUrl) {
    contentUrl = embed;
    $('content').src = embed || 'about:blank';
    $('content').classList.toggle('hidden', !embed);
  }
  ads = cfg.ads || [];
  showAd();
  for (const g of ['corrida', 'memoria']) {
    const list = cfg.leaderboard?.[g] || [];
    $('lb-' + g).innerHTML = list.length ? list.map((s) => `<li>${esc(s.name)} — <b>${s.score}</b></li>`).join('') : '<li class="muted">seja o primeiro!</li>';
  }
}

function showAd() {
  const el = $('ad');
  if (!ads.length) { el.style.background = 'var(--panel)'; el.querySelector('h3').textContent = 'Espaço publicitário'; el.querySelector('p').textContent = 'Anuncie aqui'; return; }
  const ad = ads[adIndex % ads.length];
  el.classList.toggle('has-img', !!ad.image);
  el.style.background = ad.image ? `linear-gradient(transparent 40%, #000c), url("${encodeURI(ad.image)}") center/cover` : `linear-gradient(160deg, ${ad.color}, ${ad.color}bb)`;
  el.querySelector('h3').textContent = ad.title;
  el.querySelector('p').textContent = ad.text;
}
setInterval(() => { adIndex++; showAd(); }, 10_000);

// ---------- partida ----------
const now = () => Date.now() + clockOffset;
const secsLeft = () => Math.max(0, Math.ceil(((room?.endsAt || 0) - now()) / 1000));
const chips = (players) => players.map((p) => `<span class="chip" style="background:${p.color}">${esc(p.name)}</span>`).join('');

function render() {
  const r = room;
  const playing = r.phase === 'playing';
  canvas.classList.toggle('hidden', !playing);
  $('hud').classList.toggle('hidden', !playing);
  const ov = $('overlay');
  ov.classList.toggle('hidden', !(r.phase === 'lobby' || r.phase === 'results'));

  if (r.phase === 'lobby') {
    const surprise = r.game === 'reaction';
    ov.innerHTML = `<div>
      ${surprise ? '<div class="big" style="color:var(--accent)">🎁 RODADA SURPRESA!</div>' : `<h2>${esc(r.gameTitle)}</h2>`}
      <p>${surprise ? 'Abra o Mesa Play no celular e toque em <b>Participar</b>. O mais rápido ganha um prêmio!' : 'Escaneie o QR Code e entre na disputa — até 4 jogadores.'}</p>
      <p>${esc(r.help)}</p>
      <div class="big" data-countdown>${secsLeft()}</div>
      <div class="chips">${chips(r.players) || '<span class="muted">aguardando jogadores…</span>'}</div></div>`;
  } else if (r.phase === 'results') {
    const res = r.results || { ranking: [] };
    const fmt = (p) => r.game === 'reaction' ? (p.out ? 'queimou' : p.time ? `${p.time} ms` : '—') : r.game === 'tapRace' ? `${p.score}%` : `${p.score} 🪙`;
    ov.innerHTML = `<div>
      <h2>${res.winner ? `🏆 ${esc(res.winner.name)} venceu!` : 'Ninguém pontuou dessa vez'}</h2>
      ${res.prize ? `<p style="font-size:2vw;color:var(--accent)"><b>Prêmio: ${esc(res.prize)}</b> — o código apareceu no celular do vencedor.</p>` : ''}
      <div class="chips">${res.ranking.map((p, i) => `<span class="chip" style="background:${p.color}">${i + 1}º ${esc(p.name)} · ${fmt(p)}</span>`).join('')}</div>
      <p style="margin-top:2vw">Próxima disputa: escaneie o QR Code!</p></div>`;
  }
}

function resize() {
  const b = canvas.getBoundingClientRect();
  canvas.width = b.width * devicePixelRatio; canvas.height = b.height * devicePixelRatio;
}
addEventListener('resize', resize);

function frame() {
  requestAnimationFrame(frame);
  if (!room) return;
  const cd = document.querySelector('[data-countdown]'); if (cd) cd.textContent = secsLeft();
  if (room.phase !== 'playing') return;
  if (!canvas.width || canvas.width !== Math.round(canvas.getBoundingClientRect().width * devicePixelRatio)) resize();
  $('hud').textContent = `${room.gameTitle} · ${secsLeft()}s`;
  const W = canvas.width, H = canvas.height, u = H / 100;
  ctx.clearRect(0, 0, W, H);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (room.game === 'arena') drawArena(W, H, u);
  if (room.game === 'tapRace') drawRace(W, H, u);
  if (room.game === 'reaction') drawReaction(W, H, u);
}
requestAnimationFrame(frame);

function drawArena(W, H, u) {
  ctx.fillStyle = '#0d1530'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#1b2650'; ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 8 * u) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 8 * u) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  const t = performance.now() / 300;
  for (const c of room.data.coins || []) {
    ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.ellipse(c.x * W, c.y * H, 2.4 * u * Math.abs(Math.cos(t + c.x * 9)) + .6 * u, 2.4 * u, 0, 0, Math.PI * 2); ctx.fill();
  }
  for (const p of room.players) {
    ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x * W, p.y * H, 4 * u, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `800 ${3.2 * u}px system-ui`; ctx.fillText(p.name, p.x * W, p.y * H - 7 * u);
    // placar no canto de cada jogador
    const [cx, cy] = [[0.08, 0.06], [0.92, 0.06], [0.08, 0.94], [0.92, 0.94]][p.slot];
    ctx.fillStyle = p.color; ctx.font = `900 ${5 * u}px system-ui`; ctx.fillText(`${p.score} 🪙`, cx * W, cy * H);
  }
}

function drawRace(W, H, u) {
  ctx.fillStyle = '#1f2937'; ctx.fillRect(0, 0, W, H);
  const lanes = Math.max(room.players.length, 1), lh = H / lanes;
  room.players.slice().sort((a, b) => a.slot - b.slot).forEach((p, i) => {
    const y = i * lh;
    ctx.fillStyle = i % 2 ? '#273244' : '#2d3a4f'; ctx.fillRect(0, y, W, lh);
    ctx.fillStyle = '#fff'; ctx.fillRect(W * 0.92, y, W * 0.01, lh); // chegada
    const x = W * 0.06 + (W * 0.84) * (p.score / 100);
    ctx.font = `${Math.min(lh * 0.55, 14 * u)}px system-ui`; ctx.fillText('🏎️', x, y + lh / 2);
    ctx.fillStyle = p.color; ctx.font = `800 ${Math.min(lh * 0.22, 5 * u)}px system-ui`; ctx.textAlign = 'left';
    ctx.fillText(`${p.name} · ${Math.round(p.score)}%`, W * 0.02, y + lh * 0.18); ctx.textAlign = 'center';
  });
}

function drawReaction(W, H, u) {
  const go = room.data.go;
  ctx.fillStyle = go ? '#16a34a' : '#b91c1c'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fff'; ctx.font = `900 ${(go ? 30 : 14) * u}px system-ui`;
  ctx.fillText(go ? 'JÁ!' : 'AGUARDE…', W / 2, H * 0.4);
  ctx.font = `800 ${4.5 * u}px system-ui`;
  room.players.forEach((p, i) => {
    const label = p.out ? 'queimou 😅' : p.time ? `${p.time} ms` : '…';
    ctx.fillStyle = '#000a'; ctx.fillRect(W * 0.2, H * (0.62 + i * 0.09) - 3.5 * u, W * 0.6, 7 * u);
    ctx.fillStyle = p.color; ctx.fillText(`${p.name}: ${label}`, W / 2, H * (0.62 + i * 0.09));
  });
}
