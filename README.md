# Chief of Staff — AI Executive Assistant with Claude Code

Build your own autonomous executive assistant that manages your email, calendar, tasks, travel, and more — all running locally on your machine, communicating via Telegram.

## What is Chief of Staff?

Chief of Staff turns [Claude Code](https://docs.anthropic.com/en/docs/claude-code) into a full-featured Chief of Staff that:

- Sends you a **daily morning briefing** (agenda, tasks, emails to handle)
- **Monitors your email** every 2 hours and flags what needs attention
- **Reminds you** of unanswered emails before end of day
- Manages your **travel**: researches trips, tracks real hotel prices, organizes booking confirmations, and handles the full trip lifecycle on Notion
- Finds the **cheapest fuel stations** near any location using government open data
- Communicates with you via **Telegram** in real-time (text, voice, photos, location pins)
- Connects to **Notion**, **Google Calendar**, **Gmail**, **n8n**, and more via MCP

Everything runs locally. Your data stays on your machine. No cloud services required beyond the APIs you choose to connect.

## Guides

| Guide | What You'll Build |
|-------|------------------|
| [Mission Control](docs/guide-mission-control.md) | The core system: cron jobs, email monitoring, task management, Telegram integration |
| [Travel Agent & Organizer](docs/guide-travel-system.md) | Multi-model travel research, hotel price scraping, automatic booking organization, trip lifecycle management |
| [Fuel Price Finder](docs/guide-fuel-prices.md) | Real-time fuel prices from government open data, Telegram location support |

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
     ┌──────────┬───────────┼───────────┬───────────────┐
     │          │           │           │               │
   n8n      Tools       Telegram    OpenCLI         CLI-Anything
  :5678     Server      Bot API    Chrome Bridge    45+ app CLIs
            :3847
  travel-   Playwright  Real-time   Gmail Send      PM2, Mermaid
  agent     Chromium    messaging   Gemini Hotels   LibreOffice
  hotel-    imapflow    voice msg   79+ adapters    draw.io
  prices    iCloud      location
  icloud-
  search

Notion: Inspirations → Planning → Ready to Travel
```

## Tech Stack

| Component | Purpose |
|-----------|---------|
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | AI agent runtime with MCP tool access |
| [Telegram Bot](https://core.telegram.org/bots) | Two-way communication (text, voice, photos, location) |
| [Notion](https://www.notion.so/) | Tasks, travel documents, knowledge base |
| [Google Calendar](https://calendar.google.com/) | Event management, conflict detection |
| [Gmail](https://mail.google.com/) | Email monitoring, draft creation |
| [Granola](https://www.granola.so/) | Meeting notes, transcripts, action items |
| [n8n](https://n8n.io/) | Workflow automation, multi-model AI queries |
| [Playwright](https://playwright.dev/) | Browser automation for price scraping |
| [OpenCLI](https://github.com/jackwener/OpenCLI) | Browser-based automation via Chrome |
| [CLI-Anything](https://github.com/HKUDS/CLI-Anything) | Convert GUI apps to agent-usable CLIs |

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

## File Structure

```
~/mission-control/
├── CLAUDE.md                    # Core config (read by Claude on every session)
├── mission-control.md           # Cron job definitions
├── skills/
│   └── fuel-prices.md           # Fuel price lookup skill
├── scripts/
│   ├── google-hotels-scraper.mjs    # Playwright hotel price scraper
│   ├── hotel-scraper-server.mjs     # Tools HTTP server (port 3847)
│   └── icloud-mail-search.mjs      # IMAP email search
└── docs/
    ├── guide-mission-control.md     # Core system guide
    ├── guide-travel-system.md       # Travel system guide
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

### Fuel Price Finder
Government open data (no API key), Haversine distance calculation, top 3 cheapest stations. Works with Telegram location pins (requires plugin patch included in the guide).

### Email Sending via OpenCLI
Gmail MCP can only create drafts. OpenCLI opens Gmail in your Chrome and clicks Send — fully automated, no manual intervention.

## Contributing

Found a bug or have an idea? Open an issue or submit a PR.

## License

MIT

## Credits

Built with [Claude Code](https://claude.ai/code) by Anthropic.
