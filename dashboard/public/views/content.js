import { icon, cardHeader, enterStagger, fmtRel } from '/lib/ui.js';
import { api, invalidate } from '/lib/api.js';

const TYPES = ['Article', 'Long form', 'Social post', 'Podcast segment', 'Keynote', 'Speech', 'Lecture'];
const STAGES = ['Ideas backlog', 'Draft', 'Ready to publish', 'Published'];
const STAGE_TINT = {
  'Ideas backlog': 'ink-1',
  'Draft': 'warm',
  'Ready to publish': 'cool',
  'Published': 'ok',
};
const TYPE_COLOR = {
  'Article': '#8ab4ff',
  'Long form': '#c792ea',
  'Social post': '#ff79c6',
  'Podcast segment': '#ffb86c',
  'Keynote': '#ff6b81',
  'Speech': '#f1fa8c',
  'Lecture': '#50fa7b',
};
const PRIORITY_TINT = { 'High': 'hot', 'Medium': 'warn', 'Low': 'ok' };

function contentCard(item) {
  const typeColor = item.type ? TYPE_COLOR[item.type] || '#9aa3b2' : '#6b7484';
  const platforms = (item.platform || []).slice(0, 3).map((p) => `<span class="chip">${p}</span>`).join('');
  const tags = (item.tags || []).slice(0, 3).map((t) => `<span class="chip">${t}</span>`).join('');
  const due = item.due ? new Date(item.due).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' }) : null;
  const priorityChip = item.priority ? `<span class="chip ${PRIORITY_TINT[item.priority] || ''}">${item.priority}</span>` : '';

  return `
    <div class="content-card card p-4 card-hover enter" draggable="true" data-id="${item.id}" data-notion="${item.notionUrl}">
      <div class="flex items-start justify-between gap-2 mb-2">
        ${item.type ? `<span class="chip" style="color:${typeColor};box-shadow:var(--nm-shadow-inset-sm),inset 0 0 0 1px ${typeColor}30">${item.type}</span>` : '<span></span>'}
        ${item.aiGen ? `<span class="chip" title="AI-generated">${icon('zap', 9)}</span>` : ''}
      </div>
      <div class="text-[13px] text-ink-0 font-medium mb-2 leading-snug">${escapeHtml(item.title)}</div>
      ${(platforms + tags) ? `<div class="flex flex-wrap gap-1 mb-2">${platforms}${tags}</div>` : ''}
      <div class="flex items-center justify-between text-[10px] value-mono text-ink-3 mt-3 pt-3 border-t border-ink-3/15">
        <div class="flex gap-2 items-center">
          ${priorityChip}
          ${due ? `<span>${due}</span>` : ''}
        </div>
        <span class="text-ink-3">${fmtRel(item.lastEdited)}</span>
      </div>
    </div>
  `;
}

function column(stage, items) {
  const tint = STAGE_TINT[stage] || 'ink-1';
  return `
    <div class="content-col" data-stage="${stage}">
      <div class="flex items-center justify-between mb-4 px-2">
        <div>
          <div class="label text-${tint}">${stage}</div>
          <div class="text-[10px] value-mono text-ink-3 mt-0.5">${items.length} items</div>
        </div>
        <button class="btn ghost" data-add="${stage}" title="Add to ${stage}">
          ${icon('zap', 11)}
        </button>
      </div>
      <div class="content-drop space-y-3 min-h-[200px]" data-drop="${stage}">
        ${items.map(contentCard).join('') || `<div class="text-[11px] text-ink-3 text-center py-10 opacity-60">—</div>`}
      </div>
    </div>
  `;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export default async function content(root) {
  root.innerHTML = `
    <div class="mb-8 flex items-end justify-between gap-4 flex-wrap">
      <div>
        <div class="label text-accent mb-2">05 · Content</div>
        <h1 class="text-3xl font-semibold tracking-tight text-ink-0">Content pipeline</h1>
        <p class="text-[13px] text-ink-2 mt-1">Kanban sincronizzato con Notion. Drag-drop per cambiare stadio. Click card → apre in Notion.</p>
      </div>
      <div class="flex items-center gap-2">
        <a href="https://www.notion.so/2e0c93b9555e80ae93c3fd964756acb8" target="_blank" class="btn ghost group">
          Open in Notion ${icon('arrow', 11)}
        </a>
        <button id="content-new" class="btn">
          ${icon('zap', 11)}
          New item
        </button>
      </div>
    </div>

    <div id="content-kanban" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5"></div>
    <div id="content-toast" class="fixed bottom-6 right-6 hidden"></div>
  `;

  enterStagger('.enter', root);

  const kanbanEl = root.querySelector('#content-kanban');
  const toastEl = root.querySelector('#content-toast');

  function toast(msg, level = 'ok') {
    const color = level === 'err' ? 'var(--hot)' : level === 'warn' ? 'var(--warm)' : 'var(--neon)';
    toastEl.innerHTML = `<div class="card px-5 py-3 value-mono text-[11px]" style="color:${color}">${msg}</div>`;
    toastEl.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toastEl.classList.add('hidden'), 2500);
  }

  let dragItem = null;

  function wireDragAndDrop() {
    root.querySelectorAll('.content-card').forEach((el) => {
      el.addEventListener('dragstart', (e) => {
        dragItem = { id: el.dataset.id, el };
        el.classList.add('opacity-40');
        e.dataTransfer.effectAllowed = 'move';
      });
      el.addEventListener('dragend', () => {
        el.classList.remove('opacity-40');
        dragItem = null;
      });
      // Double-click opens Notion page (single click would conflict with drag init)
      el.addEventListener('dblclick', () => {
        const notionUrl = el.dataset.notion;
        if (notionUrl) fetch('/api/open', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: notionUrl }) });
      });
    });

    root.querySelectorAll('.content-drop').forEach((zone) => {
      zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drop-active'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('drop-active'));
      zone.addEventListener('drop', async (e) => {
        e.preventDefault();
        zone.classList.remove('drop-active');
        if (!dragItem) return;
        const newStage = zone.dataset.drop;
        try {
          const r = await fetch('/api/content-pipeline/move', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ pageId: dragItem.id, stage: newStage }),
          });
          const data = await r.json();
          if (!data.ok) throw new Error(data.error || 'move failed');
          toast(`Moved to ${newStage}`);
          invalidate('/api/content-pipeline');
          await render();
        } catch (err) {
          toast(String(err.message || err), 'err');
        }
      });
    });
  }

  function wireNewItem() {
    const newBtn = root.querySelector('#content-new');
    newBtn.addEventListener('click', async () => {
      const title = prompt('Title');
      if (!title) return;
      const type = prompt(`Type (${TYPES.join(' / ')})`, 'Article');
      try {
        const r = await fetch('/api/content-pipeline/create', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ title, type: type || null }),
        });
        const data = await r.json();
        if (!data.ok) throw new Error(data.error || 'create failed');
        toast('Created');
        invalidate('/api/content-pipeline');
        await render();
      } catch (err) {
        toast(String(err.message || err), 'err');
      }
    });

    root.querySelectorAll('[data-add]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const stage = btn.dataset.add;
        const title = prompt(`New item in "${stage}"`);
        if (!title) return;
        try {
          const r = await fetch('/api/content-pipeline/create', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ title, stage }),
          });
          const data = await r.json();
          if (!data.ok) throw new Error(data.error || 'create failed');
          toast('Created');
          invalidate('/api/content-pipeline');
          await render();
        } catch (err) {
          toast(String(err.message || err), 'err');
        }
      });
    });
  }

  async function render() {
    const data = await api('/api/content-pipeline').catch((err) => ({ error: String(err.message || err) }));
    if (data.error) {
      kanbanEl.innerHTML = `<div class="card p-10 text-center enter col-span-full"><div class="label text-hot mb-2">Error</div><div class="text-[12px] text-ink-2 font-mono">${data.error}</div></div>`;
      enterStagger('.enter', kanbanEl);
      return;
    }
    kanbanEl.innerHTML = STAGES.map((s) => column(s, data.grouped[s] || [])).join('');
    enterStagger('.enter', kanbanEl);
    wireDragAndDrop();
    wireNewItem();
  }

  await render();

  function refresh() { invalidate('/api/content-pipeline'); render(); }
  return { refresh, pollMs: 30000 };
}
