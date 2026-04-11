// Mission Control — SPA router + view loader
import { $, icon } from '/lib/ui.js';

const NAV = [
  { slug: 'home',      label: 'Home',      icon: 'home',     idx: '01' },
  { slug: 'ops',       label: 'Ops',       icon: 'cpu',      idx: '02' },
  { slug: 'agents',    label: 'Agents',    icon: 'radio',    idx: '03' },
  { slug: 'chat',      label: 'Chat',      icon: 'message',  idx: '04' },
  { slug: 'content',   label: 'Content',   icon: 'layers',   idx: '05' },
  { slug: 'comms',     label: 'Comms',     icon: 'mail',     idx: '06' },
  { slug: 'knowledge', label: 'Knowledge', icon: 'book',     idx: '07' },
  { slug: 'travel',    label: 'Travel',    icon: 'plane',    idx: '08' },
];

function renderNav(activeSlug) {
  const nav = $('#topnav');
  nav.innerHTML = '';
  for (const item of NAV) {
    const link = document.createElement('a');
    link.href = `#/${item.slug}`;
    link.className = 'navitem' + (item.slug === activeSlug ? ' active' : '');
    link.innerHTML = `
      <span class="idx">${item.idx}</span>
      <span>${icon(item.icon, 13)}</span>
      <span class="hidden sm:inline">${item.label}</span>
    `;
    nav.appendChild(link);
  }
}

function tickClock() {
  const el = $('#clock');
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
setInterval(tickClock, 1000);
tickClock();

let currentCleanup = null;
let pollInterval = null;

async function load(slug) {
  if (currentCleanup) { try { currentCleanup(); } catch {} currentCleanup = null; }
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }

  renderNav(slug);
  const view = $('#view');
  view.innerHTML = '';
  try {
    const mod = await import(`/views/${slug}.js`);
    const result = await mod.default(view);
    if (typeof result === 'function') currentCleanup = result;
    else if (result && typeof result === 'object') {
      currentCleanup = result.cleanup || null;
      if (typeof result.refresh === 'function') {
        pollInterval = setInterval(result.refresh, result.pollMs || 15000);
      }
    }
  } catch (err) {
    view.innerHTML = `
      <div class="card p-10 max-w-xl mx-auto mt-20 text-center">
        <div class="label text-hot mb-3">View error</div>
        <div class="text-sm text-ink-1 font-mono">${String(err.message || err)}</div>
      </div>`;
    console.error(err);
  }
}

function routeFromHash() {
  const h = location.hash.replace(/^#\/?/, '').split('?')[0] || 'home';
  const slug = NAV.find((n) => n.slug === h) ? h : 'home';
  load(slug);
}

window.addEventListener('hashchange', routeFromHash);
routeFromHash();

// Intercept external link clicks → route through /api/open so macOS picks
// the desktop app (Notion, Sunsama, Granola…) or falls back to the default
// browser (already authenticated). Avoids the empty Chromium app profile.
document.addEventListener('click', async (e) => {
  const a = e.target.closest('a[href^="http"]');
  if (!a) return;
  // Internal links to the dashboard itself stay native
  if (a.href.startsWith(`http://localhost:${location.port || 3848}`)) return;
  e.preventDefault();
  try {
    await fetch('/api/open', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: a.href, app: a.dataset.app || null }),
    });
  } catch (err) { console.warn('open failed', err); }
});
