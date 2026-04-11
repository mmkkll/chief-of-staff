# Mission Control Dashboard — Visual Command Center

A local web dashboard that visualizes the state of your Chief of Staff system at a glance: services, cron schedules, tasks, travel pipeline, knowledge base, content kanban, and a Telegram relay — all in a dark neumorphism UI that opens in a Chromium app window with a single command.

## What You'll Build

A self-contained `~/mission-control/dashboard/` directory that runs a **vanilla Node HTTP server** (no framework, no bundler, no build step) on port 3848, serving a static HTML SPA that polls local API routes every 15–30 seconds to render 8 pages:

| # | Page | What it shows |
|---|---|---|
| 01 | **Home** | System health, cron/launchd status, Notion to-dos, travel pipeline summary, quick stats |
| 02 | **Ops** | Calendar week view + tasks grouped by urgency + services/launchagents list |
| 03 | **Agents** | MCPs & connectors grid, local services, launchd agents, mission control crons, local scripts |
| 04 | **Chat** | One-way composer that sends messages to your Telegram bot (useful for memos when you're at the Mac mini) |
| 05 | **Content** | Kanban synced with Notion Content Pipeline database — drag-drop between stages |
| 06 | **Comms** | Gmail unread counts + Granola meetings summary (read from cron-written cache files) |
| 07 | **Knowledge** | Skills library + memory index |
| 08 | **Travel** | Inspirations → Planning → Ready to Travel kanban from Notion |

Designed for the Mac mini at home — it's a local URL, never exposed to the network.

## Design System — Dark Neumorphism + Neon

- Single canvas color `#1a1c22`, depth expressed through **dual shadows** (top-left highlight + bottom-right shadow)
- Neon accents: mint `#7ef3d6` (primary), warm `#ffd166`, hot `#ff6b81`, cool `#8ab4ff`
- No glassmorphism, no blur, no grain overlays
- 24px border radius on cards, 14px on chips/buttons
- Inter for body, JetBrains Mono for labels/values
- Motion One for stagger animations (via ESM import, no React required)

See `dashboard/public/styles.css` for the full token set.

## Stack (Zero Dependencies Beyond Node)

- **Server**: Node 18+ vanilla HTTP (`node:http`)
- **UI**: static HTML + Tailwind v3 via CDN + Motion One via ESM (`https://esm.sh/motion@10.17.0`)
- **Fonts**: Inter + JetBrains Mono from Google Fonts
- **Icons**: inline SVG (Lucide-style, ~20 icons in `dashboard/public/lib/ui.js`)

No npm install, no package.json required for the dashboard itself. The server runs on the system Node.

## Installation

### 1. Copy the dashboard directory

```bash
cp -r dashboard ~/mission-control/dashboard
cp scripts/dashboard-launch.sh ~/mission-control/scripts/
chmod +x ~/mission-control/scripts/dashboard-launch.sh
```

### 2. Configure tokens and IDs

Edit `~/mission-control/dashboard/server.mjs` and replace the placeholders at the top:

```js
const NOTION_TOKEN     = 'YOUR_NOTION_TOKEN';
const NOTION_TODOS_DB  = 'YOUR_TODOS_DATABASE_ID';
const NOTION_INSPIRATIONS = 'YOUR_INSPIRATIONS_PAGE_ID';
const NOTION_PLANNING  = 'YOUR_PLANNING_PAGE_ID';
const NOTION_READY     = 'YOUR_READY_PAGE_ID';
const NOTION_CONTENT_DB = 'YOUR_CONTENT_PIPELINE_DB_ID';
const TELEGRAM_TOKEN   = 'YOUR_BOT_TOKEN';
const TELEGRAM_CHAT    = 'YOUR_CHAT_ID';
```

> **Important**: `dashboard/server.mjs` contains credentials in clear. Do not commit this file to a public repo. Add `dashboard/server.mjs` to your `.gitignore` or, better, move secrets to a `.secrets/dashboard.env` and read them at runtime.

### 3. Launch

```bash
~/mission-control/scripts/dashboard-launch.sh open
```

This starts the server (if not already up) and opens a Chrome app window at `http://localhost:3848`. The launcher accepts:

- `open` (default) — start server + open Chrome
- `start` — start server only
- `stop` — stop server
- `status` — show pid and health

### 4. (Optional) Launch on every session start

Add to your `CLAUDE.md` Startup section so the dashboard opens automatically when you type "launch Mission Control":

```markdown
## Startup — execute on every session start
1. Configure cron jobs from mission-control.md
2. Verify tools server (3847) + n8n (5678) + Telegram
3. Launch the Mission Control Dashboard in Chromium:
   `~/mission-control/scripts/dashboard-launch.sh open`
```

## Architecture

```
~/mission-control/dashboard/
├── server.mjs                  # Node HTTP server, port 3848, API + static
├── public/
│   ├── index.html              # Shell + top nav
│   ├── styles.css              # Theme tokens (neumorphism)
│   ├── app.js                  # Hash-based router + view loader + click interceptor
│   ├── views/
│   │   ├── home.js             # Overview grid
│   │   ├── ops.js              # Calendar + tasks + services
│   │   ├── agents.js           # MCPs, launchagents, crons, scripts
│   │   ├── chat.js             # Telegram composer
│   │   ├── content.js          # Content Pipeline kanban with drag-drop
│   │   ├── comms.js            # Gmail + Granola cache view
│   │   ├── knowledge.js        # Skills + memory
│   │   └── travel.js           # Travel pipeline kanban
│   └── lib/
│       ├── api.js              # fetch wrapper with TTL cache
│       └── ui.js               # h() factory, icons, Motion One animations, cardHeader
└── cache/                      # Cron-written JSON: gmail.json, calendar.json, granola.json
```

### Live vs cached data

- **Live** (direct API call from the server): Notion to-dos, Notion travel pipeline, Notion content pipeline, `launchctl list`, `curl localhost:3847` + `5678`
- **Cache** (files written by cron jobs): Gmail unread counts, Calendar events, Granola meetings. Written by the morning briefing cron — they go stale until the next briefing.

This split exists because Gmail/Calendar/Granola MCPs only work inside a Claude Code session; they can't be called from a long-running HTTP server. The cron writes a JSON snapshot, the dashboard reads it.

### Cron writes to cache files

Update your morning briefing cron prompt to include this final step:

```
Additionally, write fresh snapshots to dashboard/cache:
- calendar.json: { events: [{ summary, start, calendar, url }], today: [], weekRange: "..." }
- gmail.json: { total: N, byLabel: { "label1": count, ... } }
- granola.json: { today: [{title, time, id}], lastWeek: [...] }
```

## API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/health` | GET | Server uptime, memory, pid |
| `/api/system-state` | GET | Tools server + n8n + Notion ping + launchd sunsama status |
| `/api/cron-health` | GET | LaunchAgents + durable crons |
| `/api/notion-todos` | GET | Open to-dos from Notion database |
| `/api/travel` | GET | Inspirations + Planning + Ready pages |
| `/api/content-pipeline` | GET | Content Pipeline DB grouped by Stage |
| `/api/content-pipeline/move` | POST | Update a page's Stage property |
| `/api/content-pipeline/create` | POST | Create new content item |
| `/api/agents` | GET | MCPs + launchd + services + scripts + crons (agents page) |
| `/api/knowledge` | GET | Skills directory listing + memory index |
| `/api/chat-send` | POST | Relay text to Telegram bot |
| `/api/chat-history` | GET | Read `cache/dashboard-chat.jsonl` |
| `/api/open` | POST | Open a URL via macOS `open` (desktop app for Notion/Sunsama/Granola, default browser otherwise) |
| `/api/gmail-cache` | GET | Read `cache/gmail.json` |
| `/api/calendar-cache` | GET | Read `cache/calendar.json` |
| `/api/granola-cache` | GET | Read `cache/granola.json` |

## The Link Click Interceptor

When you click an external link in the dashboard, the SPA intercepts the click globally and routes it to `/api/open`, which calls macOS `open -a <App> <url>` for known hosts (Notion → Notion desktop app, Sunsama → Sunsama app, Granola → Granola app) and falls back to `open <url>` (your default browser, already authenticated) for everything else.

Why: if you open the dashboard in a Chrome instance with an isolated `--user-data-dir` (so it doesn't conflict with your main Chrome session), links inside that instance would open in unauthenticated empty-profile windows. The interceptor bypasses Chromium entirely and lets macOS pick the best target.

## Key Design Decisions

### Vanilla Node + static HTML, not Next.js

The original inspiration (a viral post proposing Next.js 15 + Convex + ShadCN + Framer Motion for a similar dashboard) is overkill for a local Mac mini tool. Vanilla stack = zero install, zero build, zero hosted dependencies, instant debugging, no recurring costs. The JARVIS-HUD design vision is achievable with pure CSS + Motion One — React adds nothing here.

### Chrome `--app` mode

The launcher uses `open -na "Google Chrome" --args --app=http://localhost:3848 --user-data-dir=...` which creates a borderless, chrome-free window that feels like a native app. The `--user-data-dir` prevents conflicts with your main Chrome session.

### `.enter` class gotcha

Views use `class="enter"` with `opacity: 0` by default, animated in via `enterStagger(".enter", container)` after `innerHTML` is set. If you add a new view, remember to call `enterStagger` or the cards stay invisible.

## Troubleshooting

- **Blank page after refresh** — Chrome cached the old version. Hard reload (⌘⇧R), or kill the launcher profile: `rm -rf ~/mission-control/dashboard/.chrome-profile/Default/Cache` and relaunch.
- **Links open empty Chromium windows** — the click interceptor failed to POST `/api/open`. Check the browser console for errors.
- **Dashboard won't start** — check port 3848 is free: `lsof -i :3848`
- **Content kanban shows nothing** — verify your Notion Content Pipeline database ID in `server.mjs` and that your API token has access.

## Extending

- Add a new page: create `dashboard/public/views/<name>.js` exporting a default async function, add the nav entry to `app.js`'s `NAV` array
- Add a new API route: add an entry to the `ROUTES` object in `server.mjs` (GET) or a special-case handler above the route dispatcher (POST)
- Add a new icon: extend the `paths` object in `dashboard/public/lib/ui.js`
