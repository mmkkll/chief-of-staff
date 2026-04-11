import { icon, cardHeader, enterStagger, fmtRel } from '/lib/ui.js';
import { api, invalidate } from '/lib/api.js';

export default async function comms(root) {
  root.innerHTML = `
    <div class="mb-8">
      <div class="label text-accent mb-2">06 · Comms</div>
      <h1 class="text-3xl font-semibold tracking-tight text-ink-0">Communications</h1>
      <p class="text-[13px] text-ink-2 mt-1">Gmail, Telegram, Granola meetings — aggregati nel cache dei cron.</p>
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4" id="comms-grid"></div>
  `;

  async function render() {
    const [gmail, granola] = await Promise.all([
      api('/api/gmail-cache').catch(() => null),
      api('/api/granola-cache').catch(() => null),
    ]);
    const gmailCard = gmail?.ok ? `
      <div class="card p-6 enter">
        ${cardHeader('Gmail — unread', 'mail', fmtRel(gmail.updatedAt))}
        <div class="grid grid-cols-2 gap-3 mb-4">
          ${Object.entries(gmail.data?.byLabel || {}).map(([label, count]) => `
            <div class="row"><span class="dot ${count > 0 ? 'warn' : ''}"></span><div><div class="text-[12px] text-ink-0">${label}</div></div><span class="value-mono text-lg text-ink-0">${count}</span></div>
          `).join('')}
        </div>
        <a href="https://mail.google.com" target="_blank" class="btn ghost w-full justify-center group">Open Gmail ${icon('arrow', 12)}</a>
      </div>
    ` : `
      <div class="card p-6 enter">
        ${cardHeader('Gmail — unread', 'mail', 'no cache')}
        <p class="text-[12px] text-ink-2">Cache vuota. Il cron di monitor email (ogni 2h al :07) scriverà <code class="kbd">cache/gmail.json</code>.</p>
        <a href="https://mail.google.com" target="_blank" class="btn ghost w-full justify-center group mt-4">Open Gmail ${icon('arrow', 12)}</a>
      </div>
    `;

    const granolaCard = granola?.ok ? `
      <div class="card p-6 enter">
        ${cardHeader('Granola — today', 'radio', fmtRel(granola.updatedAt))}
        ${(granola.data?.today || []).map((m) => `
          <div class="row"><span class="dot ok"></span><div><div class="text-[12px] text-ink-0">${m.title || ''}</div><div class="text-[10px] value-mono text-ink-2">${m.time || ''}</div></div></div>
        `).join('') || '<div class="text-[11px] text-ink-2 py-3">No meetings today</div>'}
      </div>
    ` : `
      <div class="card p-6 enter">
        ${cardHeader('Granola — today', 'radio', 'no cache')}
        <p class="text-[12px] text-ink-2">Granola è un'app macOS senza API pubblica. Il briefing mattutino userà l'MCP <code class="kbd">query_granola_meetings</code> per popolare <code class="kbd">cache/granola.json</code>.</p>
      </div>
    `;

    document.getElementById('comms-grid').innerHTML = gmailCard + granolaCard;
    enterStagger('.enter', document.getElementById('comms-grid'));
  }

  function refresh() { ['/api/gmail-cache', '/api/granola-cache'].forEach(invalidate); render(); }
  await render();
  return { refresh, pollMs: 30000 };
}
