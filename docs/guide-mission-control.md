# Build Your Own AI Chief of Staff with Claude Code

A step-by-step guide to building an autonomous executive assistant that monitors your email, manages your calendar, organizes your tasks, and communicates with you via Telegram — all running locally on your machine.

## What You'll Build

An AI-powered Chief of Staff that:
- Sends you a **daily morning briefing** with your agenda, open tasks, and emails to handle
- **Monitors your email** every 2 hours and flags what needs your attention
- **Reminds you** of unanswered emails before the end of the workday
- Communicates with you via **Telegram** in real-time
- Connects to **Notion** for task management and **Google Calendar** for scheduling

## Tech Stack

| Component | Purpose | Required |
|-----------|---------|----------|
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | AI agent runtime (CLI) | Yes |
| [Telegram Bot](https://core.telegram.org/bots) | Two-way communication channel | Yes |
| [Notion](https://www.notion.so/) | Task database and document storage | Yes |
| [Google Calendar](https://calendar.google.com/) | Calendar management | Yes |
| [Gmail](https://mail.google.com/) | Email monitoring | Yes |
| [Granola](https://www.granola.so/) | Meeting notes, transcripts, AI summaries | Optional |
| [n8n](https://n8n.io/) | Workflow automation (optional, for webhooks) | Optional |
| [OpenCLI](https://github.com/jackwener/OpenCLI) | Browser automation via Chrome — send emails, control web apps | Optional |
| [CLI-Anything](https://github.com/HKUDS/CLI-Anything) | Convert GUI apps to agent-usable CLIs | Optional |

### Claude Code Integrations

Claude Code connects to external services via **MCP (Model Context Protocol)** servers. The following MCP integrations are used:

- **Gmail** — search and read emails
- **Google Calendar** — list events, check conflicts
- **Notion** — fetch, create, update, and move pages
- **Granola** — list meetings, get transcripts, query meeting notes with natural language

These are available as built-in connectors when you run Claude Code on [claude.ai/code](https://claude.ai/code) or via the CLI with the appropriate MCP server configuration.

### Granola Setup (Optional)

[Granola](https://www.granola.so/) is an AI meeting notes app that records, transcribes, and summarizes your meetings. The MCP integration lets Claude access your meeting history.

1. Install Granola from [granola.so](https://www.granola.so/) and use it for your meetings
2. The Granola MCP server connects automatically via Claude Code — no manual configuration needed
3. Once connected, Claude can query your meetings with natural language

Available tools:
- `query_granola_meetings` — "what action items came from yesterday's standup?"
- `list_meetings` — list meetings by time range
- `get_meetings` — detailed meeting info (notes, summary, attendees)
- `get_meeting_transcript` — full verbatim transcript

## Prerequisites & Installation

### 1. Install Claude Code

```bash
# Install via npm
npm install -g @anthropic-ai/claude-code

# Or via Homebrew (macOS)
brew install claude-code
```

Verify the installation:
```bash
claude --version
```

### 2. Create a Telegram Bot

1. Open Telegram and search for **@BotFather**
2. Send `/newbot` and follow the prompts
3. Save the **bot token** (format: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)
4. Send a message to your bot, then get your **chat_id**:
   ```bash
   curl https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates
   ```
   Look for `"chat":{"id": YOUR_CHAT_ID}` in the response.

### 3. Install the Telegram Plugin for Claude Code

```bash
claude plugin install telegram@claude-plugins-official
```

Then configure it:
```bash
claude /telegram:configure
```

Paste your bot token when prompted. Then pair your Telegram account:
```bash
claude /telegram:access
```

### 4. Set Up Notion

1. Create a Notion workspace (or use an existing one)
2. Create a **To-dos database** with properties:
   - `Task` (title)
   - `Status` (status: Not started, In progress, Done)
   - `Due` (date)
3. Note the **database ID** from the URL: `https://notion.so/workspace/DATABASE_ID`
4. Create a Notion integration at [notion.so/my-integrations](https://www.notion.so/my-integrations) and save the **API token**
5. Share your database with the integration

### 5. Set Up Google Calendar & Gmail

These connect via the MCP servers built into Claude Code. When you first use a Calendar or Gmail tool, Claude Code will prompt you to authorize access via OAuth.

No manual setup required — just approve the permissions when prompted.

## Step-by-Step Build

### Step 1: Create the Project Directory

```bash
mkdir -p ~/mission-control
cd ~/mission-control
```

### Step 2: Create CLAUDE.md

This is the core configuration file. Claude Code reads it automatically at the start of every session.

Create `~/mission-control/CLAUDE.md`:

```markdown
# Mission Control — AI Chief of Staff

## Who I Assist
[Describe yourself: role, responsibilities, preferences, timezone]

## Startup — execute on every session start
When starting a new session:
1. Configure all recurring tasks from mission-control.md — do not ask for confirmation
2. Verify the tools server (port 3847) is running: `curl -s http://localhost:3847/health`. If down, start it: `node ~/mission-control/scripts/hotel-scraper-server.mjs &`
3. Verify n8n is running: `curl -s http://localhost:5678/healthz`. If down, alert me
4. Verify Telegram connection by sending a test message to chat_id YOUR_CHAT_ID

## Behavior
- You are my Chief of Staff and executive assistant
- Concise, actionable responses — no fluff
- If an action requires confirmation, ask before proceeding
- When saving to Notion, always confirm with title and link

## Calendar
- Calendar: YOUR_EMAIL (primary)
- Timezone: YOUR_TIMEZONE
- Always check for conflicts before creating events

## Tasks & Notes
- Tasks go in the Notion database "To-dos"
- Notes go in "Quick Notes"

## Email Management
Monitor Gmail every 2 hours.
For each new email that requires a response:
1. Summarize in 3 lines: who, what they want, deadline
2. Check calendar for mentioned dates — flag conflicts
3. Recommend action: accept, decline, postpone, ask for info
4. Wait for my feedback on Telegram before doing anything

### Email Priority
- HIGH: [your high-priority senders/topics]
- MEDIUM: [your medium-priority senders/topics]
- LOW: newsletters, automated notifications, vendors — ignore these

### Email Style
- Signature: "Best regards, YOUR_NAME"
- Tone: warm and professional, never bureaucratic

## Local Tools

### Tools Server (port 3847)
Local HTTP server for Playwright scrapers and IMAP search.
- Start: `node ~/mission-control/scripts/hotel-scraper-server.mjs &`
- Health: `GET http://localhost:3847/health`
- Endpoints: `POST /scrape` (Google Hotels) and `POST /icloud-search` (IMAP email search)

### n8n (localhost:5678)
Available webhooks:
- `POST /webhook/travel-agent` — multi-model travel research (Gemini + Perplexity)
- `POST /webhook/hotel-prices` — real hotel prices from Google Hotels (requires tools server)
- `POST /webhook/icloud-search` — IMAP email search (requires tools server)

### Local Scripts (~/mission-control/scripts/)
- `google-hotels-scraper.mjs` — Playwright scraper for Google Hotels
- `hotel-scraper-server.mjs` — HTTP server (port 3847) for scraper + IMAP
- `icloud-mail-search.mjs` — standalone IMAP email search

### OpenCLI (Browser Automation)
[OpenCLI](https://github.com/jackwener/OpenCLI) turns websites into CLI commands by reusing your logged-in Chrome sessions.

Install:
```bash
npm install -g @jackwener/opencli
```
Then install the Browser Bridge Chrome extension from the [releases page](https://github.com/jackwener/opencli/releases).

Key use cases for the Chief of Staff:
- **Send emails**: Gmail MCP can only create drafts — OpenCLI opens Gmail in Chrome and clicks Send
- **Browser automation**: `opencli operate open/click/type/screenshot` for any web interaction
- **79+ built-in adapters**: Spotify, Twitter/X, Reddit, Amazon, Notion, Discord, Gemini, etc.
- **Adapter generation**: `opencli generate <url>` creates CLI adapters for any website

Email sending workflow:
```markdown
### Sending Emails
When the user says "send" / "mail it":
1. Create draft with Gmail MCP (gmail_create_draft)
2. Open Gmail: `opencli operate open "https://mail.google.com/mail/u/0/#drafts"`
3. Wait: `sleep 3 && opencli operate state`
4. Click the draft row, then click "Send"
5. Confirm on Telegram
6. Close: `opencli operate close`
```

### CLI-Anything (GUI → CLI Converter)
[CLI-Anything](https://github.com/HKUDS/CLI-Anything) converts any GUI application into an AI-agent-usable CLI.

Install as Claude Code plugin:
```bash
claude plugin marketplace add HKUDS/CLI-Anything
claude plugin install cli-anything
```

Commands:
- `/cli-anything <path-or-repo>` — generate full CLI harness for any software
- `/cli-anything:list` — show available tools
- `/cli-anything:refine` — improve existing CLI

45+ pre-built harnesses: Blender, GIMP, InkScape, LibreOffice, Audacity, OBS Studio, draw.io, Mermaid, Godot, PM2, Ollama, Zotero, iTerm2, and more.

Useful for the Chief of Staff:
- **PM2**: Make the tools server persistent (auto-restart on crash/reboot)
- **Mermaid / draw.io**: Generate diagrams from natural language
- **LibreOffice**: Create/edit Office documents programmatically
- **Ollama**: Control local LLM models

## General Rules
- Full URLs, never shortened
- Never invent data or links
- Respond in the language I write in
```

### Step 3: Create mission-control.md

This file defines your recurring cron jobs. Create `~/mission-control/mission-control.md`:

```markdown
# Mission Control — Cron Configuration

When starting a session, create these cron jobs:

---

## 1. Morning Briefing

- **Cron**: `28 7 * * *` (daily at 07:28)
- **Prompt**:

Morning briefing. Execute these steps:

1. Read open tasks from Notion (database To-dos) using curl:
curl -s -X POST 'https://api.notion.com/v1/databases/YOUR_DATABASE_ID/query' \
  -H 'Authorization: Bearer YOUR_NOTION_TOKEN' \
  -H 'Notion-Version: 2022-06-28' \
  -H 'Content-Type: application/json' \
  -d '{"filter":{"property":"Status","status":{"does_not_equal":"Done"}},"sorts":[{"property":"Due","direction":"ascending"}]}'
Extract task name, status, and due date.

2. Read today's events from Google Calendar (use MCP tools gcal_list_events):
- Calendar "primary" (YOUR_EMAIL)
- Timezone: YOUR_TIMEZONE
- Flag scheduling conflicts

3. Check Gmail for unread emails (use MCP tools gmail_search_messages):
- is:unread -category:promotions -category:social -category:updates
Filter by your priority rules.
For each relevant email: who writes, what they want, recommended action.

4. Recap yesterday's meetings from Granola (use MCP tools):
- Use query_granola_meetings with query "action items and decisions from yesterday's meetings"
- For each meeting: title, attendees, key decisions, action items
- If no meetings yesterday, skip this section

5. Send the briefing to Telegram (chat_id: YOUR_CHAT_ID) with format:
☀️ MORNING BRIEFING — [date]
📅 TODAY'S AGENDA (events + conflicts)
📋 OPEN TASKS (🔴 overdue, ⏰ urgent, 🔵 in progress, ⚪ not started)
🎙️ YESTERDAY'S MEETINGS (title, action items, decisions — if any)
📧 EMAILS TO HANDLE (summary + action)
Have a great day! 🚀

---

## 2. Email Monitoring (every 2h)

- **Cron**: `7 */2 * * *` (every 2 hours at :07)
- **Prompt**:

Email monitoring. Check Gmail for new unread emails that require a response.

1. Search unread emails using MCP Gmail tools:
   - is:unread newer_than:3h -category:promotions -category:social -category:updates

2. Apply your priority rules (HIGH / MEDIUM / IGNORE).

3. For each relevant email:
   - Summarize in 3 lines: who, what, deadline
   - Check Google Calendar for mentioned dates — flag conflicts and free slots
   - Recommend: accept, decline, postpone, ask for info.

4. If there are relevant emails, send summary to Telegram (chat_id: YOUR_CHAT_ID).
   If there are NO new relevant emails, do NOT send anything.

5. Do NOT reply to emails. Wait for feedback on Telegram.

---

## 3. Overdue Email Reminder (weekdays ~17:00)

- **Cron**: `57 16 * * 1-5` (weekdays at 16:57)
- **Prompt**:

Check for unanswered emails. Look for important unread emails older than 48 hours.

1. Search unread emails older than 48h:
   - is:unread in:inbox -category:promotions -category:social -category:updates older_than:2d newer_than:30d

2. Filter only emails that require a response (ignore newsletters, automated, vendors).

3. If there are relevant unanswered emails, send a reminder to Telegram:
   - Who wrote
   - Subject
   - How many days waiting
   - Recommended action

4. If NO overdue emails, do NOT send anything.

---

## 4. Travel Document Organizer (every 2h)

- **Cron**: `37 */2 * * *` (every 2 hours at :37)
- **Prompt**:

See the [Travel System guide](guide-travel-system.md) for the full
cron prompt. In summary, this cron:
1. Scans Gmail for booking confirmations (flights, hotels, trains, etc.)
2. Extracts booking details and matches to existing trips on Notion
3. Organizes bookings into structured trip pages (Inspirations → Planning)
4. 48h before departure: sends completeness checklist + asks to move to Ready to Travel
5. Day of departure: auto-moves trip to Ready to Travel

---

## Technical References

- **Telegram chat_id**: YOUR_CHAT_ID
- **Telegram bot token**: YOUR_BOT_TOKEN
- **Notion database To-dos**: YOUR_DATABASE_ID
- **Notion API token**: YOUR_NOTION_TOKEN
- **Notion Travel > Inspirations**: YOUR_INSPIRATIONS_PAGE_ID
- **Notion Travel > Planning**: YOUR_PLANNING_PAGE_ID
- **Notion Travel > Ready to Travel**: YOUR_READY_PAGE_ID
- **Google Calendar**: YOUR_EMAIL
- **Gmail label priority**: YOUR_LABEL_1 > YOUR_LABEL_2 > rest of inbox
- **iCloud IMAP** (optional): YOUR_ICLOUD_EMAIL / imap.mail.me.com:993 / YOUR_APP_PASSWORD
- **Tools server**: localhost:3847 (POST /scrape, POST /icloud-search)
- **n8n webhooks**: travel-agent, hotel-prices, icloud-search on localhost:5678
- **Scripts**: ~/mission-control/scripts/
- **Launch command**: `cd ~/mission-control && claude --channels plugin:telegram@claude-plugins-official`
- **Timezone**: YOUR_TIMEZONE
```

### Step 4: Launch Mission Control

```bash
cd ~/mission-control
claude --channels plugin:telegram@claude-plugins-official
```

Claude Code will:
1. Read `CLAUDE.md` and understand its role
2. Read `mission-control.md` and create the cron jobs
3. Send a test message on Telegram
4. Start monitoring

### Step 5: Test It

Send a message to your bot on Telegram:
```
briefing
```

Claude should respond with a morning briefing.

## How It Works Under the Hood

### Cron Jobs

Claude Code supports recurring tasks via `CronCreate`. Each cron job:
- Fires at the specified schedule (standard 5-field cron syntax, local timezone)
- Executes the prompt as if a user had typed it
- Only fires when Claude is idle (not mid-query)
- Auto-expires after 7 days (session-only by default, `durable: true` persists across restarts)

### MCP Tools

Claude Code accesses external services via MCP (Model Context Protocol):
- `gcal_list_events` — read calendar events
- `gcal_create_event` — create events with conflict checking
- `gmail_search_messages` — search emails
- `gmail_read_message` — read full email content
- `gmail_create_draft` — draft email responses
- `notion-fetch` — read Notion pages and databases
- `notion-create-pages` — create new Notion pages
- `notion-update-page` — update existing pages
- `notion-move-pages` — move pages between parents (e.g., Inspirations → Planning)
- `notion-search` — search across Notion workspace
- `query_granola_meetings` — natural language search across meeting notes
- `list_meetings` — list Granola meetings by time range
- `get_meetings` — detailed meeting info (notes, AI summary, attendees)
- `get_meeting_transcript` — full verbatim meeting transcript

### Telegram Channel

The `--channels plugin:telegram@claude-plugins-official` flag enables real-time Telegram messaging. Messages arrive as `<channel>` tags in Claude's context, and responses are sent via the `reply` MCP tool.

## Customization Ideas

- **Add more email labels** — monitor specific email accounts or folders
- **Custom priority rules** — adapt the HIGH/MEDIUM/IGNORE classification to your workflow
- **Weekly review cron** — summarize the week's accomplishments every Friday
- **Meeting prep** — 30 minutes before each meeting, pull relevant emails and notes
- **Expense tracking** — monitor receipt emails and log them to a Notion database
- **Meeting recap in briefing** — add Granola meeting notes to the morning briefing with action items and decisions from yesterday
- **Pre-meeting prep** — before each meeting, pull notes from previous meetings with the same attendees
- **Follow-up tracking** — query Granola for commitments and todos from recent meetings
- **Send emails directly** — use OpenCLI to send Gmail drafts without leaving the terminal
- **Control Spotify** — `opencli spotify play/pause/search` via Telegram commands
- **Social media monitoring** — `opencli twitter trending` / `opencli reddit hot` in a cron
- **Generate diagrams** — use CLI-Anything's Mermaid/draw.io harness to create visuals from descriptions
- **Persistent services** — use CLI-Anything's PM2 harness to keep the tools server running across reboots
- **Turn any app into a CLI** — `/cli-anything <app-path>` to generate agent-usable commands for any software

## Cron Timing Tips

- Avoid `:00` and `:30` minutes — they're overloaded across all users
- Stagger your crons: briefing at `:28`, email at `:07`, reminders at `:57`
- Use `durable: true` if you want crons to survive Claude restarts
- Crons only fire when Claude is idle — they won't interrupt active conversations

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Crons don't fire | Make sure Claude Code is running and idle |
| Telegram bot doesn't respond | Check bot token, verify plugin is installed with `claude plugin list` |
| Gmail returns empty results | Authorize Gmail access — Claude will prompt you on first use |
| Notion API errors | Verify database ID and API token, check that the database is shared with the integration |
| Crons disappeared | They auto-expire after 7 days. Use `durable: true` or re-run the startup prompt |
