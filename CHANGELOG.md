# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
