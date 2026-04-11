import { icon, cardHeader, enterStagger } from '/lib/ui.js';
import { api, invalidate } from '/lib/api.js';

export default async function knowledge(root) {
  root.innerHTML = `
    <div class="mb-8">
      <div class="label text-accent mb-2">07 · Knowledge</div>
      <h1 class="text-3xl font-semibold tracking-tight text-ink-0">Knowledge base</h1>
      <p class="text-[13px] text-ink-2 mt-1">Skills library + memoria persistente + Notion.</p>
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4" id="k-grid"></div>
  `;

  async function render() {
    const data = await api('/api/knowledge').catch(() => null);
    if (!data) return;

    const skillCards = (data.skills || []).map((name) => `
      <div class="card p-4 card-hover enter">
        <div class="flex items-center gap-3">
          <div class="h-9 w-9 nm-icon flex items-center justify-center">${icon('folder', 13)}</div>
          <div class="min-w-0"><div class="text-[12px] text-ink-0 truncate">${name}</div><div class="text-[10px] value-mono text-ink-2">skill</div></div>
        </div>
      </div>
    `).join('');

    const memItems = (data.memory || []).slice(0, 20).map((line) => {
      const match = line.match(/^- \[(.+?)\]\((.+?)\)\s*—\s*(.*)$/);
      if (!match) return '';
      const [, title, , desc] = match;
      return `<div class="row"><span class="dot"></span><div class="min-w-0"><div class="text-[12px] text-ink-0 truncate">${title}</div><div class="text-[10px] value-mono text-ink-2 truncate">${desc}</div></div></div>`;
    }).join('');

    document.getElementById('k-grid').innerHTML = `
      <div class="card p-6 enter col-span-full">
        ${cardHeader('Skills library', 'zap', `${data.skills?.length || 0} installed`)}
        <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2 mt-2">${skillCards}</div>
      </div>
      <div class="card p-6 enter col-span-full">
        ${cardHeader('Memory index', 'book', `${data.memory?.length || 0} entries`)}
        ${memItems}
      </div>
    `;
    enterStagger('.enter', document.getElementById('k-grid'));
  }

  function refresh() { invalidate('/api/knowledge'); render(); }
  await render();
  return { refresh, pollMs: 60000 };
}
