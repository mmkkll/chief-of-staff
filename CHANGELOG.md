# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] — 2026-04-11

### Added
- **Mission Control Dashboard** — local web UI on port 3848 with 8 pages (Home / Ops / Agents / Chat / Content / Comms / Knowledge / Travel). Dark neumorphism + neon design, vanilla Node HTTP server, static HTML SPA with Motion One animations — zero build step. Opens in a Chrome app window via `scripts/dashboard-launch.sh open`.
- **Content Engine Daily cron** (5th cron, `0 17 * * *`) — WebSearch across configurable thematic buckets, picks 3 stories forcing bucket diversity, enriches each with additional WebSearch queries (cross-verification + numerical data points + editorial angles), and writes them to a Notion Content Pipeline database as new entries in "Ideas backlog".
- **Notion Content Pipeline database schema** — single database with `Stage` select property (Ideas backlog / Draft / Ready to publish / Published), `Type` select (Article / Long form / Social post / Podcast segment / Keynote / Speech / Lecture), Platform / Priority / Tags multi-selects, Due / Scheduled dates, AI-generated checkbox, URL field, Notes rich text.
- **Dashboard content kanban** — drag-drop cards between stages updates the Notion `Stage` property via `POST /api/content-pipeline/move`. New items created via `POST /api/content-pipeline/create`.
- **Dashboard link click interceptor** — global click handler routes external links through `POST /api/open` → macOS `open -a <App> <url>` for known hosts (Notion / Sunsama / Granola desktop apps), fallback to default browser for everything else. Avoids opening empty Chromium profiles.
- **Dashboard Telegram relay** — Chat page composes messages and sends them via the Telegram bot as a one-way notification to yourself (useful for memos when at the Mac mini).
- **`docs/guide-content-engine.md`** — full guide for setting up the daily content pipeline, including the Notion database schema and the cron prompt.
- **`docs/guide-dashboard.md`** — full guide for installing and extending the Mission Control Dashboard (architecture, API routes, views, design tokens).
- **`scripts/dashboard-launch.sh`** — idempotent launcher (start / stop / status / open) that also opens a Chrome app-mode window with an isolated profile.

### Changed
- **Startup step in `CLAUDE-template.md`** and `mission-control-template.md` — now lists **5 cron jobs** (was 4) and includes a step 5 to launch the Mission Control Dashboard in Chromium on every session start.
- **`docs/guide-mission-control.md`** — template example updated with the 5th cron, the dashboard launch step, new guide cross-links, and the Content Pipeline DB entry in Technical References.
- **README.md** — added Content Engine and Dashboard sections, updated file structure, added new guides to the index, bumped version to 1.2.0.
- **`.gitignore`** — exclude dashboard runtime state (`dashboard/.server.pid`, `dashboard/.chrome-profile/`, cache JSON/JSONL files).

### Notes
- The dashboard's `server.mjs` reads tokens and database IDs from environment variables (`NOTION_TOKEN`, `TELEGRAM_TOKEN`, etc.) with `YOUR_*` placeholders as fallback. Set them via your shell before running or edit the file directly on first setup.
- The content pipeline MUST be a single Notion database, not 4 subpages — the Notion API does not support moving pages between parents, so subpage-based kanban cannot support drag-drop. See `docs/guide-content-engine.md` for the full rationale.
- Views in `dashboard/public/views/` use a `.enter` class that starts at `opacity: 0` and is animated in via `enterStagger('.enter', container)`. New views must call `enterStagger` after setting `innerHTML` or cards stay invisible.

## [1.1.0] — 2026-04-10

### Added
- **EV charging support** in the Fuel Prices skill: same skill now handles both fuel stations and electric vehicle charging points.
- **Open Charge Map integration** as the primary EV data source — rich structured data with operator, connectors, power kW, charge points, operational status.
- **OpenStreetMap Overpass fallback** (no API key required) via the Kumi mirror, queried in parallel with OCM and merged by geographic proximity (< 80 m dedup, OCM wins on overlaps).
- **OCM API key registration guide** in `skills/fuel-prices-template.md` and `docs/guide-fuel-prices.md`: 6-step walkthrough for getting a free key in ~60 seconds.
- **Trigger words** to switch the skill into EV mode: `EV charging`, `charging station`, `charge point`, `colonnina`, `ricarica elettrica`, `punto di ricarica`.
- README and Key Features now list EV charging alongside fuel finder.
- `.gitignore`: `.secrets/` and `*.key` excluded by default to prevent accidental key leaks.

### Changed
- The fuel-prices skill is now titled **Fuel Prices & EV Charging** in `CLAUDE-template.md`, the skill template, and the standalone guide.
- The Python snippet in `docs/guide-fuel-prices.md` has been replaced with a full **OCM + OSM merge** implementation that runs both queries in parallel and dedupes results by Haversine distance.
- `CLAUDE-template.md` now points to `~/mission-control/.secrets/openchargemap.key` for the OCM key and reminds the assistant to never commit it.

### Fixed
- **Open Charge Map now requires an API key** — anonymous access started returning `403 — You must specify an API key` in April 2026. The previous "no key required" guidance was wrong and has been corrected throughout.
- The example query string no longer uses `compact=true&verbose=false` — those flags strip `OperatorInfo.Title`, `ConnectionType.Title`, and `StatusType` and replace them with bare numeric IDs, breaking the Telegram output.

### Security
- Documented that the OCM API key must be stored **outside the repo** (e.g. `~/mission-control/.secrets/openchargemap.key` with `chmod 600`) and read at runtime. Never commit the key.

## [1.0.1] — 2026-04-09

### Added
- **Granola meeting notes integration** in the morning briefing: yesterday's meetings, action items, and decisions are now part of the daily summary.
- New MCP tools documented: `query_granola_meetings`, `list_meetings`, `get_meetings`, `get_meeting_transcript`.

## [1.0.0] — 2026-04-09

### Added
- Initial public release of **Chief of Staff** — an AI executive assistant template built on Claude Code with MCP tools.
- **Mission Control** core: cron jobs for morning briefing, email monitoring, overdue email reminders, and travel organizer.
- **Travel Agent & Organizer**: multi-model trip research via n8n (Gemini + Perplexity + OpenAI), Google Hotels price scraping with Playwright, Notion travel pipeline (Inspirations → Planning → Ready to Travel), automatic booking confirmation parsing.
- **Fuel Price Finder** skill: government open data fuel price lookup with Telegram location support, documented in `docs/guide-fuel-prices.md`.
- **Email management**: Gmail label-based prioritization, calendar conflict detection, draft creation, OpenCLI-based send flow.
- **Templates**: `CLAUDE-template.md`, `mission-control-template.md`, and per-skill templates ready to fork.
- **Architecture diagram** and step-by-step guides for Mission Control, Travel System, and Fuel Prices.
