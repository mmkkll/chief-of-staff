# Chief of Staff — AI Executive Assistant with Claude Code

> Current version: **1.2.0** — see [CHANGELOG.md](CHANGELOG.md) for the full release history.

Build your own autonomous executive assistant that manages your email, calendar, tasks, travel, and more — all running locally on your machine, communicating via Telegram.

## What is Chief of Staff?

Chief of Staff turns [Claude Code](https://docs.anthropic.com/en/docs/claude-code) into a full-featured Chief of Staff that:

- Sends you a **daily morning briefing** (agenda, tasks, emails to handle)
- **Monitors your email** every 2 hours and flags what needs attention
- **Reminds you** of unanswered emails before end of day
- Manages your **travel**: researches trips, tracks real hotel prices, organizes booking confirmations, and handles the full trip lifecycle on Notion
- Runs a **daily content engine** that researches topics you care about via WebSearch and drops 3 diversified editorial ideas into a Notion kanban every day at 17:00
- Shows you everything in a **Mission Control Dashboard** — a local web UI with dark neumorphism design that opens in Chromium on launch
- Finds the **cheapest fuel stations** near any location using government open data
- Finds the **nearest EV charging stations** with operator, connectors and power via Open Charge Map
- Replies with **voice notes** via ElevenLabs TTS — voice briefings, voice replies to voice messages, presence-aware local playback
- Communicates with you via **Telegram** in real-time (text, voice, photos, location pins)
- Connects to **Notion**, **Google Calendar**, **Gmail**, **n8n**, and more via MCP

Everything runs locally. Your data stays on your machine. No cloud services required beyond the APIs you choose to connect.

## Guides

| Guide | What You'll Build |
|-------|------------------|
| [Mission Control](docs/guide-mission-control.md) | The core system: 5 cron jobs, email monitoring, task management, Telegram integration |
| [Travel Agent & Organizer](docs/guide-travel-system.md) | Multi-model travel research, hotel price scraping, automatic booking organization, trip lifecycle management |
| [Content Engine](docs/guide-content-engine.md) | Daily content ideation: WebSearch → 3 diversified ideas → Notion kanban with drag-drop |
| [Voice Notes](docs/guide-voice.md) | ElevenLabs TTS for briefings, voice replies, and inbound voice transcription via Whisper |
| [Mission Control Dashboard](docs/guide-dashboard.md) | Local web UI — dark neumorphism, vanilla Node + static HTML, 8 pages, live + cache data |
| [Fuel Price Finder & EV Charging](docs/guide-fuel-prices.md) | Real-time fuel prices from government open data + EV charging stations from Open Charge Map, Telegram location support |

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         Claude Code                               │
│                                                                   │
│  Briefing · Email Monitor · Email Reminders · Travel Organizer    │
│                                                                   │
│  MCP Tools: Gmail · Calendar · Notion · Telegram · WebSearch      │
└───────────────────────────┬───────────────────────────────────────┘
                            │
     ┌──────────┬───────────┼───────────┬──────────┬──────────┐
     │          │           │           │          │          │
   n8n      Tools       Telegram    ElevenLabs  OpenCLI   CLI-Anything
  :5678     Server      Bot API     TTS API    Chrome     45+ app CLIs
            :3847
  travel-   Playwright  Real-time   Voice       Gmail     PM2, Mermaid
  agent     Chromium    messaging   briefings   Send      LibreOffice
  hotel-    imapflow    voice msg   OGG Opus    79+       draw.io
  prices    iCloud      location    + Whisper   adapters
  icloud-
  search

Notion: Inspirations → Planning → Ready to Travel
```

## Tech Stack

| Component | Purpose |
|-----------|---------|
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | AI agent runtime with MCP tool access |
| [Telegram Bot](https://core.telegram.org/bots) | Two-way communication (text, voice, photos, location) |
| [Notion](https://www.notion.so/) | Tasks, travel documents, knowledge base (via MCP: search, fetch, create, update, move pages, create databases) |
| [Google Calendar](https://calendar.google.com/) | Event management, conflict detection |
| [Gmail](https://mail.google.com/) | Email monitoring, draft creation |
| [Granola](https://www.granola.so/) | Meeting notes, transcripts, action items |
| [Sunsama](https://sunsama.com/) | Primary task manager (replaces Notion To-dos) |
| [ElevenLabs](https://elevenlabs.io/) | Text-to-speech for voice notes and briefings |
| [n8n](https://n8n.io/) | Workflow automation, multi-model AI queries |
| [Playwright](https://playwright.dev/) | Browser automation for price scraping |
| [OpenCLI](https://github.com/jackwener/OpenCLI) | Browser-based automation via Chrome |
| [CLI-Anything](https://github.com/HKUDS/CLI-Anything) | Convert GUI apps to agent-usable CLIs |

### APIs & Keys

Some features require API keys. Store them in `~/.secrets/` (gitignored).

| API | Key Required | Used By | How to Get |
|-----|:---:|---------|------------|
| Anthropic (Claude) | **Yes** | Core runtime | [console.anthropic.com](https://console.anthropic.com/) |
| Telegram Bot | **Yes** | All notifications, voice notes | [@BotFather](https://t.me/BotFather) on Telegram |
| Notion | **Yes** | Tasks, travel, content pipeline | [Notion Integrations](https://www.notion.so/my-integrations) — or use the claude.ai MCP connector |
| Google (Calendar + Gmail) | **Yes** | Briefing, email monitor | Claude.ai MCP connectors (no manual key needed) |
| ElevenLabs | Optional | Voice briefings, voice replies | [elevenlabs.io/api](https://elevenlabs.io/) — free tier available |
| Open Charge Map | Optional | EV charging stations | [openchargemap.org/site/develop/api](https://openchargemap.org/site/develop/api) — free |
| Granola | Optional | Meeting recap in briefing | Claude.ai MCP connector |
| Sunsama | Optional | Task manager (replaces Notion To-dos) | [robertn702/mcp-sunsama](https://github.com/robertn702/mcp-sunsama) — session token in `.secrets/sunsama.env` |
| n8n (self-hosted) | Optional | Multi-model travel research | [n8n.io](https://n8n.io/) — runs locally, no key needed |

## Quick Start

```bash
# 1. Install Claude Code
npm install -g @anthropic-ai/claude-code

# 2. Create project directory
mkdir -p ~/mission-control/scripts ~/mission-control/skills
cd ~/mission-control

# 3. Install Telegram plugin
claude plugin install telegram@claude-plugins-official

# 4. Create CLAUDE.md and mission-control.md
#    (see guides for templates)

# 5. Launch
claude --channels plugin:telegram@claude-plugins-official
```

Claude reads your `CLAUDE.md` on startup, configures all cron jobs automatically, and starts monitoring. Send "briefing" on Telegram to test.

> **Important**: Add all Notion MCP tools to your `.claude/settings.local.json` permissions so cron jobs can run without manual approval. See the [Mission Control guide](docs/guide-mission-control.md#4-set-up-notion) for the full list.

## File Structure

```
~/mission-control/
├── CLAUDE.md                    # Core config (read by Claude on every session)
├── mission-control.md           # Cron job definitions (5 jobs)
├── skills/
│   └── fuel-prices.md           # Fuel price lookup skill
├── scripts/
│   ├── google-hotels-scraper.mjs    # Playwright hotel price scraper
│   ├── hotel-scraper-server.mjs     # Tools HTTP server (port 3847)
│   ├── icloud-mail-search.mjs       # IMAP email search
│   ├── elevenlabs-tts.mjs           # ElevenLabs TTS (MP3/OGG output, --play for local)
│   ├── mac-presence.sh              # Detect if user is at the Mac (idle time check)
│   ├── sunsama-refresh-token.mjs    # Sunsama session token auto-refresh (Playwright)
│   ├── hotel-prices-workflow.json   # n8n workflow import for hotel price webhook
│   ├── package.json                 # npm dependencies (imapflow, playwright)
│   └── dashboard-launch.sh          # Dashboard launcher (open/start/stop)
├── dashboard/
│   ├── server.mjs               # Vanilla Node HTTP server (port 3848)
│   ├── public/                  # Static SPA (HTML + CSS + vanilla JS)
│   │   ├── index.html
│   │   ├── styles.css           # Dark neumorphism theme
│   │   ├── app.js               # Router + click interceptor
│   │   ├── views/               # 8 view modules
│   │   └── lib/                 # api.js + ui.js (icons, motion, helpers)
│   └── cache/                   # Cron-written JSON snapshots
└── docs/
    ├── guide-mission-control.md     # Core system guide
    ├── guide-travel-system.md       # Travel system guide
    ├── guide-content-engine.md      # Daily content engine guide
    ├── guide-dashboard.md           # Mission Control Dashboard guide
    └── guide-fuel-prices.md         # Fuel prices guide
```

## Key Features

### Daily Briefing (07:28)
Notion tasks + Google Calendar events + Granola meeting recap + Gmail scan → formatted Telegram message with priorities, conflicts, yesterday's action items, and recommended actions.

### Email Monitoring (every 2h)
Scans Gmail across multiple labels, classifies by priority (HIGH/MEDIUM/IGNORE), checks calendar for mentioned dates, recommends actions. Zero noise — only notifies when there's something to handle.

### Travel Agent
Multi-model research (Gemini + Perplexity via n8n), real hotel prices from Google Hotels (Playwright scraper), complete trip saved to Notion with flights, hotels, restaurants, and practical notes.

### Travel Organizer (every 2h)
Automatically finds booking confirmations in email, matches to existing trips, organizes on Notion. 48h before departure: completeness checklist + weather. Day of departure: auto-moves to "Ready to Travel".

### Content Engine Daily (17:00)
WebSearch queries across your thematic buckets → forced bucket diversification → 3 stories cross-verified via additional WebSearch → 3 new pages in a Notion Content Pipeline database with editorial angles (LinkedIn / keynote / podcast). Review next morning in the Dashboard kanban.

### Mission Control Dashboard (localhost:3848)
Local web UI with dark neumorphism + neon design. 8 pages (Home / Ops / Agents / Chat / Content / Comms / Knowledge / Travel), drag-drop kanbans synced with Notion, Telegram composer, live system health. Vanilla Node + static HTML + Motion One — zero build step. Opens in a Chrome app window on launch.

### Fuel Price Finder & EV Charging
Government open data (no API key), Haversine distance calculation, top 3 cheapest fuel stations. Plus EV charging via Open Charge Map (free API key required, guide inside): top 5 stations with operator, connectors, power and number of charge points. Works with Telegram location pins (requires plugin patch included in the guide).

### Voice Notes (ElevenLabs TTS)
Converts text responses into natural voice notes using ElevenLabs. Three automatic triggers:

- **Morning briefing** — an abridged voice summary (800–1200 chars) is generated alongside the full text briefing. If a presence script detects you're at your Mac, it also plays locally via `afplay`; otherwise it's sent as an OGG voice note on Telegram only.
- **"Reply with voice"** — say "rispondi a voce" (or equivalent) in any message and the response is spoken back on the same channel it came from.
- **Inbound voice messages** — when you send a Telegram voice message, it's transcribed locally with Whisper, processed, and the reply is sent back as a voice note on Telegram.

Requires: an ElevenLabs API key (free tier works), `ffmpeg` for OGG Opus encoding, and optionally a local Whisper install for transcription.

### Email Sending via OpenCLI
Gmail MCP can only create drafts. OpenCLI opens Gmail in your Chrome and clicks Send — fully automated, no manual intervention.

## Contributing

Found a bug or have an idea? Open an issue or submit a PR.

## License

MIT

## Credits

Built with [Claude Code](https://claude.ai/code) by Anthropic.
