import { connect, toast, esc } from '/net.js';

const $ = (id) => document.getElementById(id);
let net = null, config = null;

function login(pin) {
  net?.close();
  net = connect({ role: 'admin', pin }, onMessage);
}
$('loginBtn').onclick = () => login($('pin').value);
$('pin').onkeydown = (e) => { if (e.key === 'Enter') $('loginBtn').click(); };
try { const saved = sessionStorage.getItem('mp.pin'); if (saved) { $('pin').value = saved; login(saved); } } catch { /* sem storage */ }

function onMessage(msg) {
  switch (msg.t) {
    case 'denied': net.close(); toast('PIN incorreto.'); try { sessionStorage.removeItem('mp.pin'); } catch {} break;
    case 'config':
      try { sessionStorage.setItem('mp.pin', $('pin').value); } catch {}
      $('login').classList.add('hidden'); $('app').classList.remove('hidden');
      config = msg.config; fillConfig(); break;
    case 'status': renderTvs(msg.tvs); break;
    case 'vouchers': renderVouchers(msg.vouchers); break;
    case 'toast': toast(msg.text, 3500); break;
  }
}

function renderTvs(tvs) {
  $('tvs').innerHTML = tvs.length ? tvs.map((t) => `<div class="tvcard"><b>TV ${esc(t.id)}</b> ${t.screens ? '🟢' : '⚪️'}<br>
    <span class="muted">${t.phones} celular(es) · ${t.phase === 'idle' ? 'livre' : esc(t.game || t.phase)}</span><br>
    <small class="muted">${t.nextSurpriseAt ? `próx. surpresa ~${new Date(t.nextSurpriseAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'surpresa automática desligada'}</small></div>`).join('')
    : '<p class="muted">Nenhuma TV conectada ainda.</p>';
}

function renderVouchers(list) {
  $('vouchers').innerHTML = list.length ? list.map((v) => `<tr><td><b>${esc(v.code)}</b></td><td>${esc(v.prize)}</td><td>${esc(v.name)}</td><td>${esc(v.tv)}</td>
    <td>${new Date(v.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td>
    <td>${v.usedAt ? '<span class="pill used">usado</span>' : `<button class="btn ghost" data-redeem="${esc(v.code)}" style="padding:4px 10px">validar</button>`}</td></tr>`).join('')
    : '<tr><td colspan="6" class="muted">Nenhum prêmio emitido ainda.</td></tr>';
  document.querySelectorAll('[data-redeem]').forEach((b) => (b.onclick = () => net.send({ t: 'redeem', code: b.dataset.redeem })));
}
$('redeemBtn').onclick = () => { net.send({ t: 'redeem', code: $('code').value.trim() }); $('code').value = ''; };
$('surpriseBtn').onclick = () => net.send({ t: 'surpriseNow', tv: $('surpriseTv').value.trim() || '1' });

// ---------- formulário ----------
function fillConfig() {
  $('title').textContent = `Painel · ${config.venueName}`;
  $('venueName').value = config.venueName;
  $('contentUrl').value = config.contentUrl;
  $('surpriseEveryMin').value = config.surpriseEveryMin;
  $('adsList').innerHTML = ''; config.ads.forEach(addAdRow);
  $('prizesList').innerHTML = ''; config.prizes.forEach(addPrizeRow);
}
function addAdRow(a = { title: '', text: '', image: '', color: '#22c55e' }) {
  const row = document.createElement('div'); row.className = 'row'; row.dataset.id = a.id || '';
  row.innerHTML = `<input data-k="title" placeholder="Título" maxlength="40"><input data-k="text" placeholder="Texto" maxlength="90">
    <input data-k="image" placeholder="Imagem (URL, opcional)"><input data-k="color" type="color"><button class="x" title="Remover">✕</button>`;
  for (const k of ['title', 'text', 'image', 'color']) row.querySelector(`[data-k=${k}]`).value = a[k] || (k === 'color' ? '#22c55e' : '');
  row.querySelector('.x').onclick = () => row.remove();
  $('adsList').append(row);
}
function addPrizeRow(p = { name: '', weight: 1 }) {
  const row = document.createElement('div'); row.className = 'row'; row.dataset.id = p.id || '';
  row.innerHTML = `<input data-k="name" placeholder="Ex.: 10% de desconto" maxlength="60"><input data-k="weight" type="number" min="0" max="100" title="peso"><button class="x" title="Remover">✕</button>`;
  row.querySelector('[data-k=name]').value = p.name; row.querySelector('[data-k=weight]').value = p.weight;
  row.querySelector('.x').onclick = () => row.remove();
  $('prizesList').append(row);
}
$('addAd').onclick = () => addAdRow();
$('addPrize').onclick = () => addPrizeRow();
const rows = (id) => [...$(id).querySelectorAll('.row')].map((r) => ({ id: r.dataset.id, ...Object.fromEntries([...r.querySelectorAll('[data-k]')].map((i) => [i.dataset.k, i.value])) }));
$('saveBtn').onclick = () => net.send({ t: 'saveConfig', config: {
  venueName: $('venueName').value, contentUrl: $('contentUrl').value, surpriseEveryMin: $('surpriseEveryMin').value,
  ads: rows('adsList'), prizes: rows('prizesList'),
} });
