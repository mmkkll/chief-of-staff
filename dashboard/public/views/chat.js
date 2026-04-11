import { icon, cardHeader, enterStagger, fmtTime, fmtRel } from '/lib/ui.js';
import { api, invalidate } from '/lib/api.js';

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

function messageBubble(m) {
  const time = fmtTime(m.ts);
  return `
    <div class="flex justify-end enter">
      <div class="max-w-[80%]">
        <div class="card-inset px-4 py-3 rounded-2xl">
          <div class="text-[13px] text-ink-0 whitespace-pre-wrap">${escapeHtml(m.text)}</div>
        </div>
        <div class="text-[10px] value-mono text-ink-3 mt-1.5 text-right">${time} · #${m.message_id || '—'}</div>
      </div>
    </div>
  `;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export default async function chat(root) {
  root.innerHTML = `
    <div class="mb-6">
      <div class="label text-accent mb-2">04 · Chat</div>
      <h1 class="text-3xl font-semibold tracking-tight text-ink-0">Command channel</h1>
      <p class="text-[13px] text-ink-2 mt-1">One-way relay verso il tuo Telegram. Quello che scrivi qui ti arriva come notifica del bot — utile per memo veloci, comandi futuri, link da non perdere.</p>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-[1fr,400px] gap-4">
      <div class="card p-6 enter min-h-[480px] flex flex-col">
        ${cardHeader('Recent messages', 'message', 'live · 10s')}
        <div id="thread" class="flex-1 overflow-y-auto space-y-3 pr-2"></div>
      </div>

      <div class="card p-6 enter">
        ${cardHeader('Compose', 'zap')}
        <textarea id="composer" rows="6" placeholder="Scrivi un messaggio, una nota, un comando&hellip;" class="w-full bg-transparent rounded-2xl card-inset p-4 text-[13px] text-ink-0 resize-none outline-none focus:outline-none placeholder:text-ink-3"></textarea>
        <div class="flex items-center gap-2 mt-4">
          <button id="send" class="btn flex-1">
            ${icon('arrow', 13)}
            <span>Send to Telegram</span>
          </button>
          <button id="mic" class="btn ghost" title="Voice input (it-IT)">
            ${icon('radio', 13)}
          </button>
        </div>
        <div id="status" class="text-[10px] value-mono text-ink-3 mt-3 text-center">Ready</div>
      </div>
    </div>
  `;

  enterStagger('.enter', root);

  const thread = root.querySelector('#thread');
  const composer = root.querySelector('#composer');
  const sendBtn = root.querySelector('#send');
  const micBtn = root.querySelector('#mic');
  const statusEl = root.querySelector('#status');

  function setStatus(msg, level = 'idle') {
    statusEl.textContent = msg;
    statusEl.className = 'text-[10px] value-mono mt-3 text-center ' + (
      level === 'ok' ? 'text-accent' : level === 'err' ? 'text-accent-hot' : 'text-ink-3'
    );
  }

  async function renderThread() {
    const data = await api('/api/chat-history').catch(() => null);
    if (!data) return;
    if (!data.messages.length) {
      thread.innerHTML = `<div class="text-[12px] text-ink-3 text-center py-12">Nessun messaggio ancora. Scrivi qualcosa nel composer.</div>`;
      return;
    }
    thread.innerHTML = data.messages.map(messageBubble).join('');
    enterStagger('.enter', thread);
    thread.scrollTop = thread.scrollHeight;
  }

  async function send() {
    const text = composer.value.trim();
    if (!text) return;
    sendBtn.disabled = true;
    setStatus('Sending…');
    try {
      const r = await fetch('/api/chat-send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await r.json();
      if (!data.ok) throw new Error(data.error || 'send failed');
      composer.value = '';
      setStatus(`Delivered · #${data.entry.message_id}`, 'ok');
      invalidate('/api/chat-history');
      await renderThread();
    } catch (err) {
      setStatus(String(err.message || err), 'err');
    } finally {
      sendBtn.disabled = false;
    }
  }

  sendBtn.addEventListener('click', send);
  composer.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); send(); }
  });

  if (Recognition) {
    let recognizing = false;
    let recog;
    micBtn.addEventListener('click', () => {
      if (!recognizing) {
        recog = new Recognition();
        recog.lang = 'it-IT';
        recog.continuous = false;
        recog.interimResults = false;
        recog.onresult = (e) => {
          const text = Array.from(e.results).map((r) => r[0].transcript).join(' ');
          composer.value = composer.value ? composer.value + ' ' + text : text;
        };
        recog.onend = () => { recognizing = false; setStatus('Ready'); micBtn.classList.remove('animate-pulse'); };
        recog.onerror = (e) => { setStatus('Voice: ' + e.error, 'err'); };
        recog.start();
        recognizing = true;
        setStatus('Listening… (it-IT)');
        micBtn.classList.add('animate-pulse');
      } else {
        recog?.stop();
      }
    });
  } else {
    micBtn.disabled = true;
    micBtn.title = 'Web Speech API non disponibile';
    micBtn.style.opacity = '0.4';
  }

  await renderThread();
  composer.focus();

  function refresh() { invalidate('/api/chat-history'); renderThread(); }
  return { refresh, pollMs: 10000 };
}
