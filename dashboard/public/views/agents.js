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

function mcpBadge(type) {
  const map = {
    local:     { label: 'LOCAL',     cls: 'ok'    },
    connector: { label: 'CONNECTOR', cls: ''      },
    plugin:    { label: 'PLUGIN',    cls: 'warn'  },
    unknown:   { label: 'UNKNOWN',   cls: 'hot'   },
  };
  const m = map[type] || map.unknown;
  return `<span class="chip ${m.cls}">${m.label}</span>`;
}

function mcpCard(m) {
  const linkAttrs = m.url ? `href="${m.url}" target="_blank"` : `href="#"`;
  return `
    <a ${linkAttrs} class="card p-5 card-hover block group enter">
      <div class="flex items-start justify-between gap-3 mb-3">
        <div class="flex items-center gap-3 min-w-0">
          <div class="h-10 w-10 nm-icon flex items-center justify-center shrink-0">${icon(m.icon, 16)}</div>
          <div class="min-w-0">
            <div class="text-[14px] text-ink-0 truncate font-medium">${m.name}</div>
            <div class="text-[10px] value-mono text-ink-2 mt-0.5">${m.type}</div>
          </div>
        </div>
        ${mcpBadge(m.type)}
      </div>
      <p class="text-[11px] text-ink-2 leading-relaxed">${m.desc}</p>
      ${m.url ? `<div class="text-[10px] value-mono text-ink-3 mt-3 truncate group-hover:text-accent transition">${m.url} →</div>` : ''}
    </a>
  `;
}

function launchAgentRow(a) {
  const ok = a.lastExit === 0;
  return `
    <div class="row">
      <span class="dot ${ok ? 'ok' : 'hot'}"></span>
      <div class="min-w-0">
        <div class="text-[12px] text-ink-0 truncate">${a.label}</div>
        <div class="text-[10px] value-mono text-ink-2">pid ${a.pid ?? '—'} · exit ${a.lastExit}</div>
      </div>
      <span class="chip ${ok ? 'ok' : 'hot'}">${ok ? 'OK' : 'ERR'}</span>
    </div>
  `;
}

function serviceRow(s) {
  return `
    <div class="row">
      <span class="dot ${s.ok ? 'ok' : 'hot'}"></span>
      <div class="min-w-0">
        <div class="text-[13px] text-ink-0">${s.name}</div>
        <div class="text-[10px] value-mono text-ink-2 truncate">${s.desc} · :${s.port}</div>
      </div>
      <span class="chip ${s.ok ? 'ok' : 'hot'}">${s.ok ? 'UP' : 'DOWN'}</span>
    </div>
  `;
}

function cronRow(c) {
  return `
    <div class="row">
      <span class="dot ok"></span>
      <div class="min-w-0">
        <div class="text-[13px] text-ink-0 truncate">${c.name}</div>
        <div class="text-[10px] value-mono text-ink-2 truncate">${c.desc}</div>
      </div>
      <span class="chip">${c.when}</span>
    </div>
  `;
}

function scriptRow(s) {
  return `
    <div class="row">
      <span class="dot"></span>
      <div class="min-w-0">
        <div class="text-[12px] text-ink-0 truncate font-mono">${s.name}</div>
        <div class="text-[10px] value-mono text-ink-2 truncate">${s.desc}</div>
      </div>
    </div>
  `;
}

export default async function agents(root) {
  root.innerHTML = `
    <div class="mb-8">
      <div class="label text-accent mb-2">03 · Agents</div>
      <h1 class="text-3xl font-semibold tracking-tight text-ink-0">Autonomous processes</h1>
      <p class="text-[13px] text-ink-2 mt-1">MCPs, LaunchAgents, servizi locali, cron Mission Control e script disponibili.</p>
    </div>

    <div id="agents-content">
      <div class="card p-10 enter text-center">
        <div class="label text-ink-2">Loading agents&hellip;</div>
      </div>
    </div>
  `;

  enterStagger('.enter', root);

  async function render() {
    const data = await api('/api/agents').catch(() => null);
    if (!data) return;

    const content = document.getElementById('agents-content');
    const mcpGrid = data.mcps.map(mcpCard).join('');
    const launchRows = data.launchd.map(launchAgentRow).join('') || '<div class="text-[11px] text-ink-2 py-3 text-center">No LaunchAgents</div>';
    const svcRows = data.services.map(serviceRow).join('');
    const cronRows = data.cronJobs.map(cronRow).join('');
    const scriptRows = data.scripts.map(scriptRow).join('') || '<div class="text-[11px] text-ink-2 py-3 text-center">No scripts</div>';

    content.innerHTML = `
      ${sectionHeader('a', 'MCPs & Connectors', `${data.mcps.length} integrations · local stdio + Claude.ai connectors + plugins`)}
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-12" id="mcp-grid">${mcpGrid}</div>

      ${sectionHeader('b', 'Local services', 'Always-on processes on this Mac mini')}
      <div class="card p-6 enter mb-12">
        ${cardHeader('Services', 'cpu', 'live')}
        ${svcRows}
      </div>

      ${sectionHeader('c', 'LaunchAgents (macOS)', 'persistent background jobs')}
      <div class="card p-6 enter mb-12">
        ${cardHeader('launchctl list', 'radio', `${data.launchd.length} active`)}
        ${launchRows}
      </div>

      ${sectionHeader('d', 'Mission Control crons', 'Session-only · richiede Claude Code in foreground')}
      <div class="card p-6 enter mb-12">
        ${cardHeader('Schedules', 'clock', `${data.cronJobs.length} jobs`)}
        ${cronRows}
      </div>

      ${sectionHeader('e', 'Local scripts', `${data.scripts.length} files in ~/mission-control/scripts/`)}
      <div class="card p-6 enter">
        ${cardHeader('Scripts', 'folder')}
        ${scriptRows}
      </div>
    `;
    enterStagger('.enter', content);
  }

  function refresh() { invalidate('/api/agents'); render(); }
  await render();
  return { refresh, pollMs: 30000 };
}
