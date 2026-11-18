// Conexão WebSocket com reconexão automática.
export function connect(hello, onMessage) {
  let ws, closed = false, retry = 500;
  const api = {
    send(msg) { if (ws?.readyState === 1) ws.send(JSON.stringify(msg)); },
    close() { closed = true; ws?.close(); },
    hello,
  };
  function open() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onopen = () => { retry = 500; ws.send(JSON.stringify({ t: 'hello', ...api.hello })); onMessage({ t: '_open' }); };
    ws.onmessage = (e) => { try { onMessage(JSON.parse(e.data)); } catch (err) { console.error(err); } };
    ws.onclose = () => { onMessage({ t: '_closed' }); if (!closed) setTimeout(open, (retry = Math.min(retry * 2, 8000))); };
  }
  open();
  return api;
}

export function toast(text, ms = 2600) {
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = text;
  document.body.append(el);
  setTimeout(() => el.remove(), ms);
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
