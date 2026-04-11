import { icon } from '/lib/ui.js';

export function stub({ idx, title, subtitle, intent, planned, links = [] }) {
  return `
    <div class="mb-8">
      <div class="label text-accent mb-2">${idx} · ${title}</div>
      <h1 class="text-3xl font-semibold tracking-tight text-ink-0">${subtitle}</h1>
    </div>
    <div class="card p-10 max-w-3xl enter">
      <div class="flex items-start gap-5">
        <div class="h-14 w-14 nm-icon-lg flex items-center justify-center shrink-0">${icon('zap', 22)}</div>
        <div class="flex-1">
          <div class="label text-warm mb-2">Under construction</div>
          <p class="text-[14px] text-ink-0 leading-relaxed mb-4">${intent}</p>
          <div class="label mb-2">Planned widgets</div>
          <ul class="space-y-1.5 text-[12px] text-ink-1">
            ${planned.map((p) => `<li class="flex items-start gap-2"><span class="dot mt-1.5"></span><span>${p}</span></li>`).join('')}
          </ul>
          ${links.length ? `
            <div class="flex flex-wrap gap-2 mt-6">
              ${links.map((l) => `<a href="${l.url}" target="_blank" class="btn ghost group">${l.label} ${icon('arrow', 11)}</a>`).join('')}
            </div>` : ''}
        </div>
      </div>
    </div>
  `;
}
