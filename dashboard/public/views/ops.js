import { icon, cardHeader, enterStagger, fmtRel } from '/lib/ui.js';
import { api, invalidate } from '/lib/api.js';

function sectionHeader(idx, title, sub) {
  return `
    <div class="flex items-end justify-between mb-5 mt-2">
      <div>
        <div class="label text-accent">${idx} · ${title}</div>
        <div class="text-[11px] value-mono text-ink-3 mt-1">${sub}</div>
      </div>
      <div class="flex-1 ml-6 mb-1 h-px bg-gradient-to-r from-ink-3/20 via-ink-3/10 to-transparent"></div>
    </div>
  `;
}

async function renderOperations(container) {
  const [system, cron] = await Promise.all([
    api('/api/system-state').catch(() => null),
    api('/api/cron-health').catch(() => null),
  ]);
  const svcRows = (system?.services || []).map((s) => `
    <div class="row">
      <span class="dot ${s.ok ? 'ok' : 'hot'}"></span>
      <div><div class="text-[13px] text-ink-0">${s.name}</div><div class="text-[10px] value-mono text-ink-2">${s.port ? `localhost:${s.port}` : 'remote'}</div></div>
      <span class="chip ${s.ok ? 'ok' : 'hot'}">${s.ok ? 'ONLINE' : 'OFFLINE'}</span>
    </div>
  `).join('');

  const sunsamaRef = system?.launchd?.sunsamaRefresh;
  const refreshRow = sunsamaRef
    ? `<div class="row"><span class="dot ${sunsamaRef.present ? 'ok' : 'warn'}"></span><div><div class="text-[13px] text-ink-0">Sunsama token refresh</div><div class="text-[10px] value-mono text-ink-2">launchd · every 20d</div></div><span class="chip ${sunsamaRef.present ? 'ok' : 'warn'}">${sunsamaRef.present ? 'ON' : 'OFF'}</span></div>`
    : '';

  const agentRows = (cron?.launchd || []).map((a) => `
    <div class="row">
      <span class="dot ${a.lastExit === 0 ? 'ok' : 'hot'}"></span>
      <div><div class="text-[12px] text-ink-0 truncate">${a.label}</div><div class="text-[10px] value-mono text-ink-2">pid ${a.pid ?? '—'}</div></div>
      <span class="chip">exit ${a.lastExit}</span>
    </div>
  `).join('') || '<div class="text-[11px] text-ink-2 py-4 text-center">No LaunchAgents</div>';

  container.innerHTML = `
    <div class="card p-6 enter">${cardHeader('Services', 'cpu', 'live')}${svcRows}${refreshRow}</div>
    <div class="card p-6 enter">${cardHeader('LaunchAgents', 'radio')}${agentRows}</div>
  `;
}

async function renderTasks(container) {
  const todos = await api('/api/notion-todos').catch(() => null);
  const items = (todos?.items || []);
  const today0 = new Date(); today0.setHours(0, 0, 0, 0);
  const grouped = {
    overdue:  items.filter((t) => t.due && new Date(t.due) <  today0),
    today:    items.filter((t) => t.due && new Date(t.due).toDateString() === new Date().toDateString()),
    upcoming: items.filter((t) => !t.due || new Date(t.due) > new Date()),
  };
  const col = (title, list, tint, iconName) => `
    <div class="card p-6 enter">
      ${cardHeader(title, iconName, `${list.length}`)}
      ${list.slice(0, 10).map((t) => {
        const due = t.due ? new Date(t.due) : null;
        const dueLabel = due ? due.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' }) : '';
        return `
          <a href="${t.url}" target="_blank" class="row group">
            <span class="dot ${tint === 'hot' ? 'hot' : tint === 'warm' ? 'warn' : ''}"></span>
            <div class="min-w-0"><div class="text-[12px] text-ink-0 truncate">${t.title}</div><div class="text-[10px] value-mono text-ink-2">${t.status || '—'}${dueLabel ? ' · ' + dueLabel : ''}</div></div>
            <span class="arrow text-ink-3">${icon('external', 11)}</span>
          </a>
        `;
      }).join('') || '<div class="text-[11px] text-ink-2 py-4 text-center">—</div>'}
    </div>
  `;
  container.innerHTML =
    col('Overdue',  grouped.overdue,  'hot',  'bell') +
    col('Today',    grouped.today,    'warm', 'clock') +
    col('Upcoming', grouped.upcoming, 'ok',   'check');
}

async function renderCalendar(container) {
  const cal = await api('/api/calendar-cache').catch(() => null);
  if (!cal?.ok) {
    container.innerHTML = `
      <div class="card p-10 text-center enter">
        <div class="h-14 w-14 nm-icon-lg flex items-center justify-center mx-auto mb-4">${icon('calendar', 22)}</div>
        <div class="label mb-2">Calendar cache empty</div>
        <p class="text-[12px] text-ink-2 max-w-sm mx-auto">Gli eventi di Google Calendar sono scritti dal cron briefing mattutino in <code class="kbd">dashboard/cache/calendar.json</code>. Il prossimo briefing è alle 07:28.</p>
      </div>
    `;
    return;
  }
  const events = cal.data?.events || [];
  container.innerHTML = `
    <div class="card p-6 enter">
      ${cardHeader('Calendar — current week', 'calendar', fmtRel(cal.updatedAt))}
      ${events.length ? events.map((e) => `
        <div class="row">
          <span class="dot ok"></span>
          <div><div class="text-[13px] text-ink-0">${e.summary || '(no title)'}</div><div class="text-[10px] value-mono text-ink-2">${e.start || ''}</div></div>
          <span class="chip">${e.calendar || ''}</span>
        </div>
      `).join('') : '<div class="text-[11px] text-ink-2 py-6 text-center">No events</div>'}
    </div>
  `;
}

export default async function ops(root) {
  root.innerHTML = `
    <div class="mb-8">
      <div class="label text-accent mb-2">02 · Ops Center</div>
      <h1 class="text-3xl font-semibold tracking-tight text-ink-0">Operations, Tasks &amp; Calendar</h1>
      <p class="text-[13px] text-ink-2 mt-1">Vista unica live. Servizi e schedules in alto, task aperti al centro, calendario in fondo.</p>
    </div>

    ${sectionHeader('a', 'Calendar', 'Google Calendar · current week')}
    <div id="ops-calendar" class="mb-10"></div>

    ${sectionHeader('b', 'Tasks', 'Notion To-dos · grouped by urgency')}
    <div id="ops-tasks" class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-10"></div>

    ${sectionHeader('c', 'Operations', 'localhost services + launchd agents')}
    <div id="ops-operations" class="grid grid-cols-1 lg:grid-cols-2 gap-4"></div>
  `;

  async function renderAll() {
    await Promise.all([
      renderOperations(document.getElementById('ops-operations')),
      renderTasks(document.getElementById('ops-tasks')),
      renderCalendar(document.getElementById('ops-calendar')),
    ]);
    enterStagger('.enter', root);
  }

  await renderAll();

  function refresh() {
    ['/api/system-state', '/api/cron-health', '/api/notion-todos', '/api/calendar-cache'].forEach(invalidate);
    renderAll();
  }
  return { refresh, pollMs: 20000 };
}
