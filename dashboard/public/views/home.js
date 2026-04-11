import { h, icon, cardHeader, enterStagger, fmtRel, fmtTime } from '/lib/ui.js';
import { api, invalidate } from '/lib/api.js';

function servicesCard(system) {
  const services = system?.services || [];
  const rows = services.map((s) => `
    <div class="row">
      <span class="dot ${s.ok ? 'ok' : 'hot'}"></span>
      <div>
        <div class="text-[13px] font-medium text-ink-0">${s.name}</div>
        <div class="text-[10px] value-mono text-ink-2">${s.port ? `localhost:${s.port}` : 'remote'}</div>
      </div>
      <span class="chip ${s.ok ? 'ok' : 'hot'}">${s.ok ? 'UP' : 'DOWN'}</span>
    </div>
  `).join('');
  const sunsamaRef = system?.launchd?.sunsamaRefresh;
  const refreshStatus = sunsamaRef?.present
    ? `<div class="row"><span class="dot ok"></span><div><div class="text-[13px] text-ink-0">Sunsama token auto-refresh</div><div class="text-[10px] value-mono text-ink-2">launchd · every 20d</div></div><span class="chip ok">ON</span></div>`
    : `<div class="row"><span class="dot warn"></span><div><div class="text-[13px] text-ink-0">Sunsama token auto-refresh</div><div class="text-[10px] value-mono text-ink-2">launchd agent missing</div></div><span class="chip warn">OFF</span></div>`;
  return `
    <div class="card p-6 enter">
      ${cardHeader('System Health', 'cpu', 'live')}
      ${rows}${refreshStatus}
    </div>
  `;
}

function cronCard(cronData) {
  const durable = cronData?.durable;
  const launchd = cronData?.launchd || [];
  const sessionCount = durable?.tasks?.length ?? '—';
  const launchdCount = launchd.length;
  const items = launchd.slice(0, 6).map((a) => `
    <div class="row">
      <span class="dot ${a.lastExit === 0 ? 'ok' : 'hot'}"></span>
      <div>
        <div class="text-[12px] text-ink-0 truncate">${a.label.replace(/^com\./, '')}</div>
        <div class="text-[10px] value-mono text-ink-2">pid ${a.pid ?? '—'} · exit ${a.lastExit}</div>
      </div>
    </div>
  `).join('') || '<div class="text-[11px] text-ink-2 mt-2">No LaunchAgents</div>';
  return `
    <div class="card p-6 enter">
      ${cardHeader('Schedules', 'clock')}
      <div class="grid grid-cols-2 gap-4 mb-4">
        <div>
          <div class="label mb-1">Session crons</div>
          <div class="value-mono text-2xl text-ink-0">${sessionCount}</div>
        </div>
        <div>
          <div class="label mb-1">LaunchAgents</div>
          <div class="value-mono text-2xl text-accent">${launchdCount}</div>
        </div>
      </div>
      <div class="border-t border-ink-3/20 pt-3">${items}</div>
    </div>
  `;
}

function tasksCard(todos) {
  const items = (todos?.items || []).slice(0, 8);
  if (!items.length) {
    return `<div class="card p-6 enter">${cardHeader('Notion To-dos', 'check')}<div class="text-[11px] text-ink-2 mt-6">No open tasks.</div></div>`;
  }
  const rows = items.map((t) => {
    const due = t.due ? new Date(t.due) : null;
    const overdue = due && due < new Date(new Date().setHours(0, 0, 0, 0));
    const dueLabel = due ? due.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' }) : '';
    return `
      <a href="${t.url}" target="_blank" class="row group">
        <span class="dot ${overdue ? 'hot' : t.status === 'In Progress' ? 'ok' : ''}"></span>
        <div class="min-w-0">
          <div class="text-[12px] text-ink-0 truncate">${t.title}</div>
          <div class="text-[10px] value-mono text-ink-2">${t.status || '—'}${dueLabel ? ' · ' + dueLabel : ''}</div>
        </div>
        <span class="text-ink-3 arrow">${icon('external', 12)}</span>
      </a>
    `;
  }).join('');
  return `
    <div class="card p-6 enter">
      ${cardHeader('Notion To-dos', 'check', `${todos.items.length} open`)}
      ${rows}
      <a href="https://www.notion.so/2fbc93b9555e82fa8f0581138014f364" target="_blank" class="btn ghost mt-4 w-full justify-center group">
        Open in Notion ${icon('arrow', 12)}
      </a>
    </div>
  `;
}

function travelCard(travel) {
  const count = (travel?.planning?.length || 0) + (travel?.ready?.length || 0);
  const current = (travel?.ready || [])[0] || (travel?.planning || [])[0];
  return `
    <div class="card p-6 enter">
      ${cardHeader('Travel Pipeline', 'plane', `${count} active`)}
      <div class="grid grid-cols-3 gap-2 mb-4">
        <div class="text-center">
          <div class="value-mono text-xl text-ink-1">${travel?.inspirations?.length || 0}</div>
          <div class="label">Inspir.</div>
        </div>
        <div class="text-center border-x border-ink-3/20">
          <div class="value-mono text-xl text-accent">${travel?.planning?.length || 0}</div>
          <div class="label">Planning</div>
        </div>
        <div class="text-center">
          <div class="value-mono text-xl text-warm">${travel?.ready?.length || 0}</div>
          <div class="label">Ready</div>
        </div>
      </div>
      ${current ? `
        <div class="border-t border-ink-3/20 pt-4">
          <div class="label mb-1.5">Next departure</div>
          <a href="${current.url}" target="_blank" class="block text-[13px] text-ink-0 hover:text-accent transition-colors">
            ${current.title} →
          </a>
        </div>
      ` : '<div class="text-[11px] text-ink-2">No active trips</div>'}
    </div>
  `;
}

function inboxCard(gmail, granola) {
  const gmailOk = gmail?.ok;
  const granolaOk = granola?.ok;
  return `
    <div class="card p-6 enter">
      ${cardHeader('Inbox · Meetings', 'mail', 'cache')}
      <div class="grid grid-cols-2 gap-4 mb-4">
        <div>
          <div class="label mb-1">Gmail unread</div>
          <div class="value-mono text-2xl text-ink-0">${gmailOk ? (gmail.data?.total ?? '—') : '—'}</div>
          <div class="text-[10px] value-mono text-ink-3 mt-1">${gmailOk ? fmtRel(gmail.updatedAt) : 'no cache yet'}</div>
        </div>
        <div>
          <div class="label mb-1">Meetings today</div>
          <div class="value-mono text-2xl text-accent">${granolaOk ? (granola.data?.today?.length ?? 0) : '—'}</div>
          <div class="text-[10px] value-mono text-ink-3 mt-1">${granolaOk ? fmtRel(granola.updatedAt) : 'no cache yet'}</div>
        </div>
      </div>
      <div class="flex gap-2">
        <a href="https://mail.google.com" target="_blank" class="btn ghost flex-1 justify-center group">Gmail ${icon('arrow', 11)}</a>
        <a href="https://app.sunsama.com" target="_blank" class="btn ghost flex-1 justify-center group">Sunsama ${icon('arrow', 11)}</a>
      </div>
    </div>
  `;
}

function statsCard(health) {
  const uptime = health?.uptime ?? 0;
  const h = Math.floor(uptime / 3600);
  const m = Math.floor((uptime % 3600) / 60);
  const mem = health?.memory ? (health.memory / 1024 / 1024).toFixed(1) : '—';
  return `
    <div class="card p-6 enter col-span-full lg:col-span-2">
      ${cardHeader('Dashboard', 'activity')}
      <div class="grid grid-cols-4 gap-4">
        <div>
          <div class="label mb-1">Uptime</div>
          <div class="value-mono text-lg text-ink-0">${h}h ${m}m</div>
        </div>
        <div>
          <div class="label mb-1">RAM</div>
          <div class="value-mono text-lg text-ink-0">${mem} MB</div>
        </div>
        <div>
          <div class="label mb-1">PID</div>
          <div class="value-mono text-lg text-ink-0">${health?.pid ?? '—'}</div>
        </div>
        <div>
          <div class="label mb-1">Host</div>
          <div class="value-mono text-lg text-accent">MAC·MINI</div>
        </div>
      </div>
    </div>
  `;
}

export default async function home(root) {
  root.innerHTML = `
    <div class="mb-8">
      <div class="label text-accent mb-2">01 · Overview</div>
      <h1 class="text-3xl font-semibold tracking-tight text-ink-0">Situational awareness</h1>
      <p class="text-[13px] text-ink-2 mt-1">Sistemi, task, viaggi e servizi — aggiornamento ogni 15 secondi.</p>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" id="grid"></div>
  `;

  async function render() {
    const [system, cron, todos, travel, gmail, granola, health] = await Promise.all([
      api('/api/system-state').catch(() => null),
      api('/api/cron-health').catch(() => null),
      api('/api/notion-todos').catch(() => null),
      api('/api/travel').catch(() => null),
      api('/api/gmail-cache').catch(() => null),
      api('/api/granola-cache').catch(() => null),
      api('/api/health').catch(() => null),
    ]);
    const grid = document.getElementById('grid');
    if (!grid) return;
    grid.innerHTML =
      servicesCard(system) +
      tasksCard(todos) +
      cronCard(cron) +
      travelCard(travel) +
      inboxCard(gmail, granola) +
      statsCard(health);
    enterStagger('.enter', grid);
  }

  function refresh() {
    ['/api/system-state', '/api/cron-health', '/api/notion-todos', '/api/travel', '/api/gmail-cache', '/api/granola-cache', '/api/health'].forEach(invalidate);
    render();
  }

  await render();
  return { refresh, pollMs: 15000 };
}
