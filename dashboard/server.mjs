#!/usr/bin/env node
/**
 * Mission Control Dashboard — local HTTP server
 * Port 3848. Serves public/ statically + JSON API routes.
 *
 * Live sources: Notion API, localhost services, launchctl, shell.
 * Cache sources: ~/mission-control/dashboard/cache/*.json (written by Claude Code crons).
 *
 * SETUP: before running, either:
 *   (A) set env vars NOTION_TOKEN, NOTION_TODOS_DB, NOTION_INSPIRATIONS,
 *       NOTION_PLANNING, NOTION_READY, NOTION_CONTENT_DB, TELEGRAM_TOKEN,
 *       TELEGRAM_CHAT before launching the server, OR
 *   (B) replace the YOUR_* placeholder strings below with your actual values.
 *
 * Run: `node server.mjs` (or via scripts/dashboard-launch.sh)
 */

import { createServer } from 'node:http';
import { readFile, stat, mkdir, appendFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { homedir } from 'node:os';
import { join, extname, normalize } from 'node:path';

const execFileP = promisify(execFile);
const HOME = homedir();
const ROOT = join(HOME, 'mission-control', 'dashboard');
const PUBLIC_DIR = join(ROOT, 'public');
const CACHE_DIR = join(ROOT, 'cache');
const PORT = Number(process.env.DASHBOARD_PORT || 3848);

const NOTION_TOKEN        = process.env.NOTION_TOKEN        || 'YOUR_NOTION_TOKEN';
const NOTION_TODOS_DB     = process.env.NOTION_TODOS_DB     || 'YOUR_NOTION_TODOS_DATABASE_ID';
const NOTION_INSPIRATIONS = process.env.NOTION_INSPIRATIONS || 'YOUR_NOTION_INSPIRATIONS_PAGE_ID';
const NOTION_PLANNING     = process.env.NOTION_PLANNING     || 'YOUR_NOTION_PLANNING_PAGE_ID';
const NOTION_READY        = process.env.NOTION_READY        || 'YOUR_NOTION_READY_PAGE_ID';
const NOTION_CONTENT_DB   = process.env.NOTION_CONTENT_DB   || 'YOUR_NOTION_CONTENT_PIPELINE_DB_ID';
const CONTENT_STAGES      = ['Ideas backlog', 'Draft', 'Ready to publish', 'Published'];
const TELEGRAM_TOKEN      = process.env.TELEGRAM_TOKEN      || 'YOUR_TELEGRAM_BOT_TOKEN';
const TELEGRAM_CHAT       = process.env.TELEGRAM_CHAT       || 'YOUR_TELEGRAM_CHAT_ID';
const CHAT_LOG            = join(CACHE_DIR, 'dashboard-chat.jsonl');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

const START_TIME = Date.now();

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function text(res, status, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'content-type': contentType, 'cache-control': 'no-store' });
  res.end(body);
}

async function serveStatic(res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  const resolved = normalize(join(PUBLIC_DIR, rel));
  if (!resolved.startsWith(PUBLIC_DIR)) return text(res, 403, 'Forbidden');
  try {
    const st = await stat(resolved);
    if (st.isDirectory()) return serveStatic(res, rel + '/index.html');
    const buf = await readFile(resolved);
    const ext = extname(resolved).toLowerCase();
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': 'no-store, no-cache, must-revalidate',
      'pragma': 'no-cache',
      'content-length': buf.length,
    });
    res.end(buf);
  } catch {
    text(res, 404, 'Not found');
  }
}

async function readCache(name) {
  try {
    const data = await readFile(join(CACHE_DIR, `${name}.json`), 'utf8');
    const parsed = JSON.parse(data);
    const st = await stat(join(CACHE_DIR, `${name}.json`));
    return { ok: true, updatedAt: st.mtime.toISOString(), data: parsed };
  } catch {
    return { ok: false, updatedAt: null, data: null };
  }
}

async function curl(url, timeoutMs = 2000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    const body = await r.text().catch(() => '');
    return { ok: r.ok, status: r.status, body: body.slice(0, 500) };
  } catch (err) {
    return { ok: false, status: 0, error: String(err.message || err) };
  } finally {
    clearTimeout(t);
  }
}

async function shell(cmd, args, timeoutMs = 5000) {
  try {
    const { stdout, stderr } = await execFileP(cmd, args, { timeout: timeoutMs, maxBuffer: 1_000_000 });
    return { ok: true, stdout, stderr };
  } catch (err) {
    return { ok: false, error: String(err.message || err), stdout: err.stdout || '', stderr: err.stderr || '' };
  }
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

const APP_HOST_MAP = {
  'notion.so':            'Notion',
  'www.notion.so':        'Notion',
  'app.sunsama.com':      'Sunsama',
  'sunsama.com':          'Sunsama',
  'app.granola.ai':       'Granola',
  'granola.ai':           'Granola',
  'calendar.notion.so':   'Notion Calendar',
  'cal.notion.so':        'Notion Calendar',
};

function pickAppForUrl(target) {
  try {
    const u = new URL(target);
    return APP_HOST_MAP[u.hostname] || null;
  } catch { return null; }
}

async function appendChatLog(entry) {
  await mkdir(CACHE_DIR, { recursive: true });
  await appendFile(CHAT_LOG, JSON.stringify(entry) + '\n');
}

async function readChatLog(limit = 100) {
  try {
    const raw = await readFile(CHAT_LOG, 'utf8');
    const lines = raw.trim().split('\n');
    return lines
      .slice(-limit)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
}

async function telegramSend(text, parseMode = null) {
  const payload = { chat_id: TELEGRAM_CHAT, text, disable_web_page_preview: true };
  if (parseMode) payload.parse_mode = parseMode;
  const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await r.json();
  if (!data.ok) throw new Error(`telegram: ${data.description || r.status}`);
  return data.result;
}

async function notionRequest(path, body) {
  const r = await fetch(`https://api.notion.com/v1${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      authorization: `Bearer ${NOTION_TOKEN}`,
      'notion-version': '2022-06-28',
      'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Notion ${r.status}: ${data.message || r.statusText}`);
  return data;
}

function extractTitle(page) {
  const props = page.properties || {};
  for (const key of Object.keys(props)) {
    const p = props[key];
    if (p?.type === 'title' && Array.isArray(p.title)) {
      return p.title.map((t) => t.plain_text).join('') || 'Untitled';
    }
  }
  return 'Untitled';
}

function extractProp(page, name) {
  const p = page.properties?.[name];
  if (!p) return null;
  if (p.type === 'status') return p.status?.name || null;
  if (p.type === 'select') return p.select?.name || null;
  if (p.type === 'date') return p.date?.start || null;
  if (p.type === 'rich_text') return p.rich_text?.map((t) => t.plain_text).join('') || null;
  if (p.type === 'multi_select') return (p.multi_select || []).map((s) => s.name);
  return null;
}

// ————————————————————————————————————————————————————————
// API handlers
// ————————————————————————————————————————————————————————

const ROUTES = {
  '/api/health': async () => ({
    ok: true,
    uptime: Math.round((Date.now() - START_TIME) / 1000),
    memory: process.memoryUsage().rss,
    pid: process.pid,
    startedAt: new Date(START_TIME).toISOString(),
  }),

  '/api/system-state': async () => {
    const [toolsServer, n8n, notionPing] = await Promise.all([
      curl('http://localhost:3847/health'),
      curl('http://localhost:5678/healthz'),
      notionRequest(`/users/me`, null).then(() => ({ ok: true })).catch((e) => ({ ok: false, error: e.message })),
    ]);
    const launchd = await shell('launchctl', ['list']);
    const sunsamaLine = (launchd.stdout || '').split('\n').find((l) => l.includes('sunsama-token-refresh'));
    return {
      services: [
        { name: 'Tools Server', port: 3847, ok: toolsServer.ok, status: toolsServer.status },
        { name: 'n8n', port: 5678, ok: n8n.ok, status: n8n.status },
        { name: 'Notion API', port: null, ok: notionPing.ok },
      ],
      launchd: {
        sunsamaRefresh: sunsamaLine
          ? { present: true, raw: sunsamaLine.trim() }
          : { present: false },
      },
    };
  },

  '/api/cron-health': async () => {
    // Read ~/.claude/scheduled_tasks.json if it exists (durable cron),
    // and launchctl list entries in the com.mirko.* namespace
    let durable = null;
    try {
      const raw = await readFile(join(HOME, '.claude', 'scheduled_tasks.json'), 'utf8');
      durable = JSON.parse(raw);
    } catch {}
    const launchd = await shell('launchctl', ['list']);
    const mirkoAgents = (launchd.stdout || '')
      .split('\n')
      .filter((l) => l.includes('com.mirko.') || l.includes('com.claude.missioncontrol'))
      .map((l) => {
        const [pid, exit, label] = l.trim().split(/\s+/);
        return { pid: pid === '-' ? null : Number(pid), lastExit: Number(exit) || 0, label };
      });
    return { durable, launchd: mirkoAgents };
  },

  '/api/notion-todos': async () => {
    const data = await notionRequest(`/databases/${NOTION_TODOS_DB}/query`, {
      filter: { property: 'Status', status: { does_not_equal: 'Done' } },
      sorts: [{ property: 'Due', direction: 'ascending' }],
      page_size: 50,
    });
    return {
      items: (data.results || []).map((p) => ({
        id: p.id,
        title: extractTitle(p),
        status: extractProp(p, 'Status'),
        due: extractProp(p, 'Due'),
        priority: extractProp(p, 'Priority'),
        url: p.url,
      })),
    };
  },

  '/api/travel': async () => {
    const [inspirations, planning, ready] = await Promise.all([
      notionRequest(`/blocks/${NOTION_INSPIRATIONS}/children?page_size=100`, null).catch(() => ({ results: [] })),
      notionRequest(`/blocks/${NOTION_PLANNING}/children?page_size=100`, null).catch(() => ({ results: [] })),
      notionRequest(`/blocks/${NOTION_READY}/children?page_size=100`, null).catch(() => ({ results: [] })),
    ]);
    const pickPages = (res) =>
      (res.results || [])
        .filter((b) => b.type === 'child_page')
        .map((b) => ({ id: b.id, title: b.child_page?.title || 'Untitled', url: `https://www.notion.so/${b.id.replace(/-/g, '')}` }));
    return {
      inspirations: pickPages(inspirations),
      planning: pickPages(planning),
      ready: pickPages(ready),
    };
  },

  '/api/gmail-cache': async () => readCache('gmail'),
  '/api/calendar-cache': async () => readCache('calendar'),
  '/api/granola-cache': async () => readCache('granola'),
  '/api/sunsama-cache': async () => readCache('sunsama'),

  '/api/agents': async () => {
    // 1. LaunchAgents from launchctl
    const launchd = await shell('launchctl', ['list']);
    const agentLines = (launchd.stdout || '').split('\n')
      .filter((l) => l.includes('com.mirko.') || l.includes('com.claude.missioncontrol') || l.includes('com.n8n.'))
      .map((l) => {
        const [pid, exit, label] = l.trim().split(/\s+/);
        return { pid: pid === '-' ? null : Number(pid), lastExit: Number(exit) || 0, label };
      });

    // 2. MCP servers — combine local config + claude.ai connectors
    let claudeJson = {};
    try { claudeJson = JSON.parse(await readFile(join(HOME, '.claude.json'), 'utf8')); } catch {}
    const localMcps = Object.keys(claudeJson.mcpServers || {});
    const projectKey = join(HOME, 'mission-control');
    const projectMcps = claudeJson.projects?.[projectKey]?.enabledMcpServers || [];
    const aiConnectors = (claudeJson.claudeAiMcpEverConnected || []).map((s) => s.replace(/^claude\.ai /, ''));

    const MCP_META = {
      sunsama:        { type: 'local',     icon: 'check',    desc: 'Task planner via session token (auto-refresh 20d)', url: 'https://app.sunsama.com' },
      'computer-use': { type: 'local',     icon: 'cpu',      desc: 'macOS desktop automation', url: null },
      'plugin-telegram': { type: 'plugin', icon: 'message',  desc: 'Inbound Telegram channel + outbound bot reply', url: null },
      Notion:         { type: 'connector', icon: 'book',     desc: 'Notion API connector — pages, databases, search', url: 'https://www.notion.so' },
      Gmail:          { type: 'connector', icon: 'mail',     desc: 'Gmail messages, drafts, search', url: 'https://mail.google.com' },
      'Google Calendar': { type: 'connector', icon: 'calendar', desc: 'Google Calendar events, free/busy', url: 'https://calendar.google.com' },
      Granola:        { type: 'connector', icon: 'radio',    desc: 'Meeting notes & transcripts query', url: 'https://app.granola.ai' },
      Canva:          { type: 'connector', icon: 'layers',   desc: 'Designs, exports, brand kits', url: 'https://www.canva.com' },
      'Cloudflare Developer Platform': { type: 'connector', icon: 'cpu', desc: 'Workers, KV, R2, D1, Hyperdrive', url: 'https://dash.cloudflare.com' },
      Netlify:        { type: 'connector', icon: 'zap',      desc: 'Deploy services, projects, extensions', url: 'https://app.netlify.com' },
      n8n:            { type: 'connector', icon: 'activity', desc: 'Workflow automation hub', url: 'http://localhost:5678' },
    };

    const allNames = new Set([...localMcps, ...projectMcps, ...aiConnectors, 'plugin-telegram']);
    const mcps = [...allNames].map((name) => ({
      name,
      ...MCP_META[name] || { type: 'unknown', icon: 'cpu', desc: '—', url: null },
    })).sort((a, b) => a.name.localeCompare(b.name));

    // 3. Local services
    const [tools, n8nHealth] = await Promise.all([
      curl('http://localhost:3847/health'),
      curl('http://localhost:5678/healthz'),
    ]);
    const services = [
      { name: 'Tools Server', port: 3847, ok: tools.ok, desc: 'Playwright + iCloud IMAP HTTP server', cmd: 'node ~/mission-control/scripts/hotel-scraper-server.mjs' },
      { name: 'n8n', port: 5678, ok: n8nHealth.ok, desc: 'Workflow automation', cmd: 'launchctl com.n8n.worker' },
      { name: 'Dashboard', port: PORT, ok: true, desc: 'Mission Control dashboard server', cmd: 'dashboard-launch.sh' },
    ];

    // 4. Local scripts in mission-control/scripts/
    const SCRIPT_META = {
      'dashboard-launch.sh':       'Avvia dashboard + Chrome app mode',
      'sunsama-refresh-token.mjs': 'Refresh session token Sunsama (Playwright headless)',
      'hotel-scraper-server.mjs':  'HTTP server porta 3847 (Google Hotels + iCloud)',
      'google-hotels-scraper.mjs': 'Scraper Playwright Google Hotels (CLI)',
      'icloud-mail-search.mjs':    'Ricerca IMAP iCloud standalone (CLI)',
    };
    let scriptFiles = [];
    try {
      const dir = await shell('ls', ['-1', join(HOME, 'mission-control', 'scripts')]);
      scriptFiles = (dir.stdout || '')
        .split('\n')
        .filter((n) => n && /\.(sh|mjs)$/.test(n))
        .map((n) => ({ name: n, desc: SCRIPT_META[n] || '—' }));
    } catch {}

    // 5. Cron schedule (Mission Control session crons — defined in mission-control.md)
    const cronJobs = [
      { name: 'Briefing mattutino',  cron: '28 7 * * *',     desc: 'Notion to-dos + Calendar + Gmail + Granola → Telegram',    when: 'Daily 07:28' },
      { name: 'Email monitor',       cron: '7 */2 * * *',    desc: 'Unread email scan, priorità label-based',                  when: 'Every 2h :07' },
      { name: 'Email reminder',      cron: '57 16 * * 1-5',  desc: 'Email importanti non risposte da 48h+',                    when: 'Mon-Fri 16:57' },
      { name: 'Travel organizer',    cron: '37 */2 * * *',   desc: 'Conferme prenotazione → Notion Travel pipeline',           when: 'Every 2h :37' },
      { name: 'Content feed daily',  cron: '0 17 * * *',     desc: 'WebSearch bucket diversification → 3 ideas in Content DB',  when: 'Daily 17:00' },
    ];

    return { launchd: agentLines, mcps, services, scripts: scriptFiles, cronJobs };
  },

  '/api/content-pipeline': async () => {
    const data = await notionRequest(`/databases/${NOTION_CONTENT_DB}/query`, {
      page_size: 100,
      sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
    });
    const items = (data.results || []).map((p) => {
      const props = p.properties || {};
      const stage = props.Stage?.select?.name || CONTENT_STAGES[0];
      const type = props.Type?.select?.name || null;
      const platform = (props.Platform?.multi_select || []).map((s) => s.name);
      const priority = props.Priority?.select?.name || null;
      const tags = (props.Tags?.multi_select || []).map((s) => s.name);
      const due = props.Due?.date?.start || null;
      const scheduled = props.Scheduled?.date?.start || null;
      const aiGen = props['AI-generated']?.checkbox || false;
      const reviewer = props.Reviewer?.select?.name || null;
      const url = props.URL?.url || null;
      const titleProp = props.Title?.title || [];
      const title = titleProp.map((t) => t.plain_text).join('') || 'Untitled';
      return {
        id: p.id,
        title,
        stage,
        type,
        platform,
        priority,
        tags,
        due,
        scheduled,
        aiGen,
        reviewer,
        url,
        notionUrl: p.url,
        lastEdited: p.last_edited_time,
      };
    });
    const grouped = Object.fromEntries(CONTENT_STAGES.map((s) => [s, []]));
    items.forEach((it) => {
      if (grouped[it.stage]) grouped[it.stage].push(it);
    });
    return { stages: CONTENT_STAGES, grouped, total: items.length };
  },

  '/api/chat-history': async () => {
    const messages = await readChatLog(100);
    return { messages, chatId: TELEGRAM_CHAT };
  },

  '/api/knowledge': async () => {
    const skillsDir = join(HOME, 'mission-control', 'skills');
    // Claude Code stores memory under a normalized project path; derive it from HOME
    const username = HOME.split('/').pop();
    const projectSlug = `-Users-${username}-mission-control`;
    const memoryIndex = join(HOME, '.claude', 'projects', projectSlug, 'memory', 'MEMORY.md');
    const skills = await shell('ls', ['-1', skillsDir]);
    const skillList = (skills.stdout || '')
      .split('\n')
      .filter(Boolean)
      .filter((name) => !name.startsWith('.'));
    let memoryLines = [];
    try {
      const raw = await readFile(memoryIndex, 'utf8');
      memoryLines = raw.split('\n').filter((l) => l.startsWith('- ['));
    } catch {}
    return { skills: skillList, memory: memoryLines };
  },
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // POST /api/content-pipeline/move — update a content page's Stage property
  if (pathname === '/api/content-pipeline/move' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const { pageId, stage } = JSON.parse(body || '{}');
      if (!pageId || !stage) return json(res, 400, { error: 'pageId and stage required' });
      if (!CONTENT_STAGES.includes(stage)) return json(res, 400, { error: 'invalid stage' });
      const r = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
        method: 'PATCH',
        headers: {
          authorization: `Bearer ${NOTION_TOKEN}`,
          'notion-version': '2022-06-28',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ properties: { Stage: { select: { name: stage } } } }),
      });
      const data = await r.json();
      if (!r.ok) return json(res, 500, { error: data.message || `notion ${r.status}` });
      return json(res, 200, { ok: true, pageId, stage });
    } catch (err) {
      return json(res, 500, { error: String(err.message || err) });
    }
  }

  // POST /api/content-pipeline/create — create a new content item in the database
  if (pathname === '/api/content-pipeline/create' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const { title, stage, type } = JSON.parse(body || '{}');
      if (!title || !title.trim()) return json(res, 400, { error: 'title required' });
      const props = {
        Title: { title: [{ text: { content: title.trim() } }] },
        Stage: { select: { name: stage || 'Ideas backlog' } },
      };
      if (type) props.Type = { select: { name: type } };
      const r = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${NOTION_TOKEN}`,
          'notion-version': '2022-06-28',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ parent: { database_id: NOTION_CONTENT_DB }, properties: props }),
      });
      const data = await r.json();
      if (!r.ok) return json(res, 500, { error: data.message || `notion ${r.status}` });
      return json(res, 200, { ok: true, id: data.id, url: data.url });
    } catch (err) {
      return json(res, 500, { error: String(err.message || err) });
    }
  }

  // POST /api/chat-send — relay text to Telegram bot (one-way dashboard → user)
  if (pathname === '/api/chat-send' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const { text } = JSON.parse(body || '{}');
      if (!text || !text.trim()) return json(res, 400, { error: 'empty' });
      const trimmed = text.trim().slice(0, 3500);
      const result = await telegramSend(`🎯 from dashboard\n\n${trimmed}`);
      const entry = {
        ts: new Date().toISOString(),
        direction: 'out',
        target: 'telegram',
        text: trimmed,
        message_id: result.message_id,
      };
      await appendChatLog(entry);
      return json(res, 200, { ok: true, entry });
    } catch (err) {
      return json(res, 500, { error: String(err.message || err) });
    }
  }

  // POST /api/open — receive a URL and open it via macOS `open`
  if (pathname === '/api/open' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const { url: target, app: appHint } = JSON.parse(body || '{}');
      if (!target || !/^https?:\/\//i.test(target)) {
        return json(res, 400, { error: 'invalid url' });
      }
      const app = appHint || pickAppForUrl(target);
      let result;
      if (app) {
        result = await shell('open', ['-a', app, target]);
        if (!result.ok) result = await shell('open', [target]); // fallback to default browser
      } else {
        result = await shell('open', [target]);
      }
      return json(res, 200, { ok: result.ok, app: app || 'default-browser', url: target });
    } catch (err) {
      return json(res, 500, { error: String(err.message || err) });
    }
  }

  if (ROUTES[pathname]) {
    try {
      const data = await ROUTES[pathname](req, url);
      return json(res, 200, data);
    } catch (err) {
      return json(res, 500, { error: String(err.message || err) });
    }
  }
  return serveStatic(res, pathname);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[dashboard] listening on http://localhost:${PORT}`);
});
