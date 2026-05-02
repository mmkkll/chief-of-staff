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
const CONTENT_PREFS_LOG   = join(CACHE_DIR, 'content-preferences.jsonl');
const CONTENT_FEED_URL    = process.env.CONTENT_FEED_URL    || '';  // e.g. https://your-feed.example.com/api/feed
const CONTENT_FEED_KEY    = process.env.CONTENT_FEED_KEY    || '';  // API key for the feed (if required)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
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

async function logContentPreference(entry) {
  await mkdir(CACHE_DIR, { recursive: true });
  const record = { ts: new Date().toISOString(), ...entry };
  await appendFile(CONTENT_PREFS_LOG, JSON.stringify(record) + '\n');
}

// ————————————————————————————————————————————————————————
// Content feed scoring engine (IT↔EN bilingual)
// ————————————————————————————————————————————————————————

const STOPWORDS = new Set(['the','and','for','with','from','that','this','have','are','was','will','not','but','all','any','can','his','her','our','your','they','their','them','about','into','what','when','where','which','also','more','most','some','such','than','then','these','those','tutti','tutte','degli','delle','della','dello','dei','del','dal','dalla','dalle','che','con','per','una','uno','un','sui','sul','sulla','sulle','nel','nella','nelle','nei','non','piu','sono','come','quando','sotto','dopo','prima','fra','tra']);

const IT_EN_SYNONYMS = {
  ai: ['ai','artificial','intelligence'], ia: ['ai','artificial','intelligence'],
  intelligenza: ['intelligence','intelligent','ai'], artificiale: ['artificial','ai'],
  destinazione: ['destination'], destinazioni: ['destination','destinations','dmo'],
  turistica: ['tourism','tourist','travel'], turistiche: ['tourism','tourist','travel'],
  turismo: ['tourism','travel'], viaggio: ['travel','trip','journey'], viaggi: ['travel','trips','journeys'],
  hotel: ['hotel','hotels','hospitality','lodging'], albergo: ['hotel','hospitality'],
  prenotazione: ['booking','reservation'], prenotazioni: ['booking','reservations'],
  ristorante: ['restaurant','dining','food'], ristoranti: ['restaurant','dining','food'],
  voli: ['flight','flights','aviation','airline'], volo: ['flight','aviation','airline'],
  aereo: ['aviation','airline','airplane'], compagnia: ['airline','carrier'],
  treno: ['train','rail'], treni: ['train','rail'], crociera: ['cruise'], crociere: ['cruise'],
  sostenibilita: ['sustainability','sustainable'], sostenibile: ['sustainable','sustainability'],
  marketing: ['marketing','advertising'], ricerca: ['search','research','seo'],
  llm: ['llm','gpt','model','chatgpt'], chatgpt: ['chatgpt','llm','openai'],
  generativa: ['generative','ai'], agente: ['agent','agentic'], agenti: ['agent','agentic','agents'],
  dati: ['data'], esperienza: ['experience','experiential'], esperienze: ['experience','experiential'],
  cliente: ['customer','guest','traveler'], clienti: ['customer','guest','traveler'],
  citta: ['city','urban'], regione: ['region','regional'], europa: ['europe','european','eu'],
  italia: ['italy','italian'],
};

function normalizeText(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ');
}

function tokenize(s) {
  return normalizeText(s).split(/\s+/).filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

function expandPromptTokens(tokens) {
  const out = new Set();
  for (const t of tokens) {
    out.add(t);
    if (IT_EN_SYNONYMS[t]) for (const syn of IT_EN_SYNONYMS[t]) out.add(syn);
  }
  return [...out];
}

function scoreArticle(art, expandedTokens) {
  if (!expandedTokens.length) return 0;
  const title = normalizeText(art.title);
  const summary = normalizeText(art.summary);
  const topics = normalizeText((art.extractedTopics || []).join(' '));
  const category = normalizeText(art.category);
  let score = 0;
  for (const tok of expandedTokens) {
    if (!tok) continue;
    const re = new RegExp(`\\b${tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
    score += (title.match(re) || []).length * 3
           + (topics.match(re) || []).length * 2
           + (category.match(re) || []).length * 2
           + (summary.match(re) || []).length * 1;
  }
  return score;
}

async function fetchContentFeed(limit = 50) {
  if (!CONTENT_FEED_URL) throw new Error('CONTENT_FEED_URL not configured');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const headers = {};
    if (CONTENT_FEED_KEY) headers['X-API-Key'] = CONTENT_FEED_KEY;
    const r = await fetch(`${CONTENT_FEED_URL}?page=1&limit=${limit}`, { headers, signal: ctrl.signal });
    if (!r.ok) throw new Error(`feed ${r.status}`);
    const data = await r.json();
    return data.articles || [];
  } finally { clearTimeout(t); }
}

async function fetchExistingContentDedup() {
  const urls = new Set();
  const titles = new Set();
  let cursor = undefined;
  for (let i = 0; i < 10; i++) {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const data = await notionRequest(`/databases/${NOTION_CONTENT_DB}/query`, body);
    for (const p of data.results || []) {
      const props = p.properties || {};
      const u = props['userDefined:URL']?.url;
      if (u) urls.add(u.toLowerCase().trim());
      const t = (props.Title?.title || []).map((x) => x.plain_text).join('').trim().toLowerCase();
      if (t) titles.add(t);
    }
    if (!data.has_more) break;
    cursor = data.next_cursor;
  }
  return { urls, titles };
}

async function createContentPageFromArticle(art, contextPrompt) {
  const summary = (art.summary || '').slice(0, 1900);
  const sourceLine = `${art.source || 'Feed'} · ${art.category || ''} · ${art.publishedAt || ''}`;
  const children = [
    { object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: summary } }] } },
    { object: 'block', type: 'paragraph', paragraph: { rich_text: [
      { type: 'text', text: { content: 'Source: ' } },
      { type: 'text', text: { content: art.source || art.originalUrl, link: { url: art.originalUrl } } },
    ] } },
    { object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: sourceLine } }] } },
  ];
  if (contextPrompt) {
    children.push({ object: 'block', type: 'callout', callout: {
      icon: { type: 'emoji', emoji: '🎯' },
      rich_text: [{ type: 'text', text: { content: `Retrieved via manual prompt: "${contextPrompt}"` } }],
    } });
  }
  const props = {
    Title: { title: [{ text: { content: art.title || 'Untitled' } }] },
    Stage: { select: { name: 'Ideas backlog' } },
    Type: { select: { name: 'Article' } },
  };
  if (art.originalUrl) props['userDefined:URL'] = { url: art.originalUrl };
  const r = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${NOTION_TOKEN}`,
      'notion-version': '2022-06-28',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ parent: { database_id: NOTION_CONTENT_DB }, properties: props, children }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.message || `notion ${r.status}`);
  return { id: data.id, url: data.url, title: art.title, source: art.source, originalUrl: art.originalUrl };
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
    // and launchctl list entries in the com.missioncontrol.* namespace
    let durable = null;
    try {
      const raw = await readFile(join(HOME, '.claude', 'scheduled_tasks.json'), 'utf8');
      durable = JSON.parse(raw);
    } catch {}
    const launchd = await shell('launchctl', ['list']);
    const mcAgents = (launchd.stdout || '')
      .split('\n')
      .filter((l) => l.includes('com.missioncontrol.') || l.includes('com.claude.missioncontrol'))
      .map((l) => {
        const [pid, exit, label] = l.trim().split(/\s+/);
        return { pid: pid === '-' ? null : Number(pid), lastExit: Number(exit) || 0, label };
      });
    return { durable, launchd: mcAgents };
  },

  '/api/session-crons': async () => {
    try {
      const raw = await readFile(join(CACHE_DIR, 'session-crons.json'), 'utf8');
      return JSON.parse(raw);
    } catch { return { crons: [] }; }
  },

  '/api/weather': async () => {
    // Open-Meteo (no API key required). Configure via env vars:
    //   WEATHER_LAT, WEATHER_LON, WEATHER_LOCATION
    const lat = process.env.WEATHER_LAT || '40.4168';
    const lon = process.env.WEATHER_LON || '-3.7038';
    const location = process.env.WEATHER_LOCATION || 'Madrid';
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
      + `&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m,apparent_temperature`
      + `&daily=temperature_2m_max,temperature_2m_min,weather_code,sunrise,sunset`
      + `&timezone=auto&forecast_days=1`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    try {
      const r = await fetch(url, { signal: ctrl.signal });
      if (!r.ok) throw new Error(`open-meteo ${r.status}`);
      const d = await r.json();
      const cur = d.current || {};
      const daily = d.daily || {};
      return {
        location,
        current: {
          temp: cur.temperature_2m,
          apparent: cur.apparent_temperature,
          humidity: cur.relative_humidity_2m,
          wind: cur.wind_speed_10m,
          code: cur.weather_code,
          time: cur.time,
        },
        today: {
          max: daily.temperature_2m_max?.[0],
          min: daily.temperature_2m_min?.[0],
          code: daily.weather_code?.[0],
          sunrise: daily.sunrise?.[0],
          sunset: daily.sunset?.[0],
        },
      };
    } finally { clearTimeout(t); }
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

  // WhatsApp scheduler status — server health + queue + recent history.
  // Reads .state/wa-queue.json + .state/wa-history.json + pings the local Baileys server (default port 3850).
  '/api/whatsapp-status': async () => {
    const stateDir = join(HOME, 'chief-of-staff', '.state');
    const waPort = process.env.WA_PORT || 3850;
    let queue = [];
    let history = [];
    try { queue = JSON.parse(await readFile(join(stateDir, 'wa-queue.json'), 'utf8')); } catch {}
    try { history = JSON.parse(await readFile(join(stateDir, 'wa-history.json'), 'utf8')); } catch {}
    let serverHealth = null;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 1500);
      const r = await fetch(`http://localhost:${waPort}/health`, { signal: ctrl.signal });
      clearTimeout(t);
      if (r.ok) serverHealth = await r.json();
    } catch {}
    const pending = queue.filter(j => j.status === 'pending').sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
    const sent = history.filter(j => j.status === 'sent').slice(0, 20);
    const errors = history.filter(j => j.status === 'error').slice(0, 10);
    return {
      server: serverHealth || { status: 'down' },
      pending,
      sent,
      errors,
      counts: { pending: pending.length, sent_recent: sent.length, errors_recent: errors.length },
    };
  },

  '/api/agents': async () => {
    // 1. LaunchAgents from launchctl
    const launchd = await shell('launchctl', ['list']);
    const agentLines = (launchd.stdout || '').split('\n')
      .filter((l) => l.includes('com.missioncontrol.') || l.includes('com.claude.missioncontrol') || l.includes('com.n8n.'))
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
      'dashboard-launch.sh':       'Launch dashboard + Chrome app mode',
      'sunsama-refresh-token.mjs': 'Refresh Sunsama session token (Playwright headless)',
      'hotel-scraper-server.mjs':  'HTTP server port 3847 (Google Hotels + iCloud)',
      'google-hotels-scraper.mjs': 'Google Hotels Playwright scraper (CLI)',
      'icloud-mail-search.mjs':    'iCloud IMAP search (CLI)',
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
      { name: 'Morning briefing',    cron: '28 7 * * *',     desc: 'Tasks + Calendar + Gmail + Meetings → Telegram',          when: 'Daily 07:28' },
      { name: 'Email monitor',       cron: '7 */2 * * *',    desc: 'Unread email scan, label-based priority',                  when: 'Every 2h :07' },
      { name: 'Email reminder',      cron: '57 16 * * 1-5',  desc: 'Important emails unanswered for 48h+',                     when: 'Mon-Fri 16:57' },
      { name: 'Travel organizer',    cron: '37 */2 * * *',   desc: 'Booking confirmations → Notion Travel pipeline',           when: 'Every 2h :37' },
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
      const url = props['userDefined:URL']?.url || props.URL?.url || null;
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

  // POST /api/content-pipeline/move — update a content page's Stage property.
  // Optional: { reason, fromStage, title, type, tags } → logged to content-preferences.jsonl
  // when transitioning Ideas backlog → Draft (promotion signal).
  if (pathname === '/api/content-pipeline/move' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const { pageId, stage, reason, fromStage, title, type, tags } = JSON.parse(body || '{}');
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
      if (fromStage === 'Ideas backlog' && stage === 'Draft' && reason && reason.trim()) {
        await logContentPreference({ action: 'promote', pageId, title, type, tags, reason: reason.trim() });
      }
      return json(res, 200, { ok: true, pageId, stage });
    } catch (err) {
      return json(res, 500, { error: String(err.message || err) });
    }
  }

  // POST /api/content-pipeline/retrieve — manual content feed retriever.
  // Body: { prompt? } — if prompt provided, articles are token-scored against it;
  // else sorted by publishedAt desc. Top 3 are created as Notion pages in Ideas backlog.
  if (pathname === '/api/content-pipeline/retrieve' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const { prompt } = JSON.parse(body || '{}');
      const trimmedPrompt = (prompt || '').trim();
      let articles;
      try { articles = await fetchContentFeed(50); }
      catch (err) { return json(res, 502, { error: `feed: ${err.message || err}` }); }
      if (!articles.length) return json(res, 200, { ok: true, created: [], note: 'empty feed' });

      let existing;
      try { existing = await fetchExistingContentDedup(); }
      catch (err) { return json(res, 500, { error: `dedup: ${err.message || err}` }); }

      const isDuplicate = (art) => {
        const u = (art.originalUrl || '').toLowerCase().trim();
        if (u && existing.urls.has(u)) return true;
        const t = (art.title || '').trim().toLowerCase();
        if (t && existing.titles.has(t)) return true;
        return false;
      };
      const fresh = articles.filter((a) => !isDuplicate(a));
      const skippedDup = articles.length - fresh.length;
      if (!fresh.length) return json(res, 200, { ok: true, created: [], note: `all ${articles.length} feed articles already in Content DB`, skippedDup });

      let ranked;
      if (trimmedPrompt) {
        const tokens = expandPromptTokens(tokenize(trimmedPrompt));
        ranked = fresh
          .map((a) => ({ a, score: scoreArticle(a, tokens) }))
          .filter((x) => x.score > 0)
          .sort((x, y) => y.score - x.score || new Date(y.a.publishedAt) - new Date(x.a.publishedAt))
          .map((x) => x.a);
        if (!ranked.length) return json(res, 200, { ok: true, created: [], note: 'no new articles matching the prompt', skippedDup });
      } else {
        ranked = [...fresh].sort((x, y) => new Date(y.publishedAt) - new Date(x.publishedAt));
      }

      const top = [];
      const batchUrls = new Set();
      const batchTitles = new Set();
      for (const art of ranked) {
        if (top.length >= 3) break;
        const u = (art.originalUrl || '').toLowerCase().trim();
        const t = (art.title || '').trim().toLowerCase();
        if (u && batchUrls.has(u)) continue;
        if (t && batchTitles.has(t)) continue;
        top.push(art);
        if (u) batchUrls.add(u);
        if (t) batchTitles.add(t);
      }

      const created = [];
      for (const art of top) {
        try { created.push(await createContentPageFromArticle(art, trimmedPrompt || null)); }
        catch (err) { created.push({ error: String(err.message || err), title: art.title }); }
      }
      return json(res, 200, { ok: true, created, prompt: trimmedPrompt || null, totalCandidates: articles.length, skippedDup });
    } catch (err) {
      return json(res, 500, { error: String(err.message || err) });
    }
  }

  // POST /api/content-pipeline/archive — soft-delete a content page in Notion.
  // Body: { pageId, reason, title?, type?, tags? }. Reason is required and logged to
  // content-preferences.jsonl so future feed selection can learn what to skip.
  if (pathname === '/api/content-pipeline/archive' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const { pageId, reason, title, type, tags } = JSON.parse(body || '{}');
      if (!pageId) return json(res, 400, { error: 'pageId required' });
      if (!reason || !reason.trim()) return json(res, 400, { error: 'reason required' });
      const r = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
        method: 'PATCH',
        headers: {
          authorization: `Bearer ${NOTION_TOKEN}`,
          'notion-version': '2022-06-28',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ archived: true }),
      });
      const data = await r.json();
      if (!r.ok) return json(res, 500, { error: data.message || `notion ${r.status}` });
      await logContentPreference({ action: 'archive', pageId, title, type, tags, reason: reason.trim() });
      return json(res, 200, { ok: true, pageId });
    } catch (err) {
      return json(res, 500, { error: String(err.message || err) });
    }
  }

  // POST /api/refresh-brief — spawn a headless `claude -p` session that runs the morning
  // brief prompt (refreshes cache + sends Telegram). Fire-and-forget: returns 202 immediately.
  if (pathname === '/api/refresh-brief' && req.method === 'POST') {
    try {
      const { spawn } = await import('node:child_process');
      const { existsSync } = await import('node:fs');
      const candidates = [
        join(HOME, '.local', 'bin', 'claude'),
        '/opt/homebrew/bin/claude',
        '/usr/local/bin/claude',
      ];
      const claudeBin = candidates.find((p) => existsSync(p)) || 'claude';
      const extendedPath = [
        join(HOME, '.local', 'bin'),
        '/opt/homebrew/bin',
        '/opt/homebrew/sbin',
        '/usr/local/bin',
        '/usr/bin',
        '/bin',
        '/usr/sbin',
        '/sbin',
        process.env.PATH || '',
      ].filter(Boolean).join(':');

      const prompt = [
        'Regenerate the morning briefing on-demand, as if it were 07:28.',
        '1) Open tasks from Sunsama (primary) and Notion To-dos (overdue only).',
        '2) Today\'s events from both Google Calendars (flag conflicts).',
        '3) Yesterday\'s meeting recap from Granola (action items, decisions).',
        'Also write dashboard cache files to ~/mission-control/dashboard/cache/ (calendar.json, gmail.json, granola.json, sunsama.json).',
        'Send everything on Telegram (text + voice OGG as per briefing rules).',
        'Note: this is a manual regeneration triggered by the dashboard Refresh button.',
      ].join(' ');
      const child = spawn(claudeBin, ['-p', '--dangerously-skip-permissions', prompt], {
        detached: true,
        stdio: 'ignore',
        cwd: join(HOME, 'mission-control'),
        env: { ...process.env, HOME, PATH: extendedPath },
      });
      child.unref();
      return json(res, 202, { ok: true, message: 'brief regeneration spawned', pid: child.pid, bin: claudeBin });
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
