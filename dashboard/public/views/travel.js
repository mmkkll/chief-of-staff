import { icon, cardHeader, enterStagger } from '/lib/ui.js';
import { api, invalidate } from '/lib/api.js';

function column(title, items, tint, subtitle) {
  const rows = items.map((p) => `
    <a href="${p.url}" target="_blank" class="card p-5 card-hover block group enter">
      <div class="flex items-start gap-3">
        <div class="h-9 w-9 nm-icon flex items-center justify-center">
          ${icon('plane', 14)}
        </div>
        <div class="min-w-0 flex-1">
          <div class="text-[13px] text-ink-0 truncate">${p.title}</div>
          <div class="text-[10px] value-mono text-ink-2 mt-0.5">view in Notion →</div>
        </div>
      </div>
    </a>
  `).join('') || `<div class="text-[11px] text-ink-2 text-center py-8">—</div>`;

  return `
    <div>
      <div class="flex items-center justify-between mb-4">
        <div>
          <div class="label text-${tint}">${title}</div>
          <div class="text-[10px] value-mono text-ink-3 mt-0.5">${subtitle}</div>
        </div>
        <span class="chip">${items.length}</span>
      </div>
      <div class="space-y-2">${rows}</div>
    </div>
  `;
}

export default async function travel(root) {
  root.innerHTML = `
    <div class="mb-8">
      <div class="label text-accent mb-2">08 · Travel</div>
      <h1 class="text-3xl font-semibold tracking-tight text-ink-0">Travel pipeline</h1>
      <p class="text-[13px] text-ink-2 mt-1">Inspirations → Planning → Ready to Travel. Sorgente: Notion.</p>
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8" id="board"></div>
  `;

  async function render() {
    const data = await api('/api/travel').catch(() => null);
    if (!data) return;
    document.getElementById('board').innerHTML =
      column('Inspirations', data.inspirations || [], 'ink-1', 'early research') +
      column('Planning', data.planning || [], 'accent', 'bookings confirmed') +
      column('Ready to Travel', data.ready || [], 'warm', 'departure imminent');
    enterStagger('.enter', document.getElementById('board'));
  }

  function refresh() { invalidate('/api/travel'); render(); }
  await render();
  return { refresh, pollMs: 30000 };
}
