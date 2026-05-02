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
    const [gmail, granola, whatsapp] = await Promise.all([
      api('/api/gmail-cache').catch(() => null),
      api('/api/granola-cache').catch(() => null),
      api('/api/whatsapp-status').catch(() => null),
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
        <p class="text-[12px] text-ink-2">Granola is a macOS app with no public API. The morning briefing cron uses the <code class="kbd">query_granola_meetings</code> MCP tool to populate <code class="kbd">cache/granola.json</code>.</p>
      </div>
    `;

    const wa = whatsapp?.ok ? whatsapp.data : null;
    const waConn = wa?.server?.wa_connection || 'down';
    const waConnAccent = waConn === 'connected' ? 'ok' : (waConn === 'disconnected' ? 'warn' : '');
    const waContacts = wa?.server?.contacts_count ?? 0;
    const waQrPending = wa?.server?.qr_pending;
    const pendingList = wa?.pending || [];
    const sentList = wa?.sent || [];
    const errorList = wa?.errors || [];
    const waCard = `
      <div class="card p-6 enter">
        ${cardHeader('WhatsApp — scheduler & inbound', 'message-circle', `conn: ${waConn}`)}
        <div class="grid grid-cols-3 gap-3 mb-4">
          <div class="row"><span class="dot ${waConnAccent}"></span><div><div class="text-[10px] text-ink-2 uppercase tracking-wider">Server</div><div class="text-[12px] text-ink-0">${waConn}${waQrPending ? ' (scan QR)' : ''}</div></div></div>
          <div class="row"><span class="dot ok"></span><div><div class="text-[10px] text-ink-2 uppercase tracking-wider">Pending</div><div class="text-[12px] text-ink-0">${pendingList.length}</div></div></div>
          <div class="row"><span class="dot ${errorList.length ? 'warn' : ''}"></span><div><div class="text-[10px] text-ink-2 uppercase tracking-wider">Errors</div><div class="text-[12px] text-ink-0">${errorList.length}</div></div></div>
        </div>
        ${pendingList.length ? `
          <div class="mb-3">
            <div class="text-[10px] uppercase tracking-wider text-ink-2 mb-2">📅 Pending</div>
            ${pendingList.slice(0, 8).map((j) => `
              <div class="row"><span class="dot warn"></span><div class="flex-1 min-w-0"><div class="text-[12px] text-ink-0 truncate">${(j.name || j.to)} · ${new Date(j.scheduled_at).toLocaleString(undefined, {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</div><div class="text-[10px] text-ink-2 truncate">${(j.text || '').slice(0, 80)}</div></div></div>
            `).join('')}
          </div>
        ` : '<div class="text-[11px] text-ink-2 mb-3">No messages queued.</div>'}
        ${sentList.length ? `
          <div class="mb-3">
            <div class="text-[10px] uppercase tracking-wider text-ink-2 mb-2">✅ Sent (recent)</div>
            ${sentList.slice(0, 5).map((j) => `
              <div class="row"><span class="dot ok"></span><div class="flex-1 min-w-0"><div class="text-[12px] text-ink-0 truncate">${(j.name || j.to)} · ${new Date(j.sent_at || j.scheduled_at).toLocaleString(undefined, {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</div><div class="text-[10px] text-ink-2 truncate">${(j.text || '').slice(0, 80)}</div></div></div>
            `).join('')}
          </div>
        ` : ''}
        ${errorList.length ? `
          <div>
            <div class="text-[10px] uppercase tracking-wider text-ink-2 mb-2">❌ Errors</div>
            ${errorList.slice(0, 5).map((j) => `
              <div class="row"><span class="dot warn"></span><div class="flex-1 min-w-0"><div class="text-[12px] text-ink-0 truncate">${(j.name || j.to)}</div><div class="text-[10px] text-ink-2 truncate">${j.error || ''}</div></div></div>
            `).join('')}
          </div>
        ` : ''}
        <div class="mt-4 pt-3 border-t border-ink-3/10 text-[11px] text-ink-2">
          <div>📊 Contacts: ${waContacts}</div>
          <div>🔧 Server localhost:3850 · Scheduler 60s · Digest 18:30</div>
        </div>
      </div>
    `;

    document.getElementById('comms-grid').innerHTML = gmailCard + granolaCard + waCard;
    enterStagger('.enter', document.getElementById('comms-grid'));
  }

  function refresh() { ['/api/gmail-cache', '/api/granola-cache', '/api/whatsapp-status'].forEach(invalidate); render(); }
  await render();
  return { refresh, pollMs: 30000 };
}
