# Content Engine — Daily Content Ideation Pipeline

A recurring pipeline that turns your topical interests into 3 diversified content ideas every day, ready for you to edit and publish. Runs as a `0 17 * * *` cron inside Mission Control and writes results to a Notion database that doubles as a kanban board.

## What You'll Build

Every day at 17:00 local time, a Claude Code cron:

1. Searches the web for recent news in your topic areas using `WebSearch`
2. Categorizes results into **thematic buckets** you define
3. Picks **3 stories**, forcing them to come from **different buckets** — no topic monoculture
4. For each pick, runs additional `WebSearch` queries to cross-verify and extract data points
5. Writes 3 new pages to a Notion **Content Pipeline** database, stage = "Ideas backlog"
6. Sends a Telegram notification with 3 editorial angles and direct Notion links

You review in the morning, drag promising ideas to "Draft" in the Mission Control Dashboard (or in Notion directly), and develop them into articles, social posts, podcast segments, keynotes, or whatever format fits.

## Why a Single Database (Not 4 Subpages)

The Notion API **cannot move a page between different parents**. `pages.update` allows changing properties and archiving, but not `parent`. If you model the pipeline as "4 stage subpages, each containing content items", you cannot move items between stages via API without creating a new page, copying all blocks, and archiving the old one — which loses the page ID and breaks external references.

**The correct pattern is a single database with a `Stage` select property.** Moving an item between stages is a 1-call `PATCH /v1/pages/{id}` that updates `properties.Stage.select.name`. Fast, reversible, two-way syncable from a dashboard kanban.

## Notion Database Schema

Create a Notion database called **"Content Pipeline"** with the following properties. The Mission Control Dashboard's Content page expects this exact shape.

| Property | Type | Options / Purpose |
|---|---|---|
| `Title` | title | The editorial angle (NOT the article headline) |
| `Stage` | select | Ideas backlog, Draft, Ready to publish, Published |
| `Type` | select | Article, Long form, Social post, Podcast segment, Keynote, Speech, Lecture |
| `Platform` | multi-select | LinkedIn, X, Medium, Substack, Blog, Podcast, YouTube, Conference |
| `Priority` | select | High, Medium, Low |
| `Due` | date | Optional delivery deadline |
| `Scheduled` | date | Optional publish date (distinct from Due) |
| `AI-generated` | checkbox | True when the draft came from the daily cron |
| `Reviewer` | select | Self, Editorial, etc. |
| `Tags` | multi-select | Your topic taxonomy (define the buckets here) |
| `URL` | url | Link to the original source (or to the published piece) |
| `Notes` | rich_text | Summary / verification / angles |

### Create it via the Notion MCP

From inside a Claude Code session:

```
Create a Notion database called "Content Pipeline" with:
- Title (title)
- Stage (select: Ideas backlog, Draft, Ready to publish, Published)
- Type (select: Article, Long form, Social post, Podcast segment, Keynote, Speech, Lecture)
- Platform (multi-select: LinkedIn, X, Medium, Substack, Blog, Podcast, YouTube, Conference)
- Priority (select: High, Medium, Low)
- Due (date)
- Scheduled (date)
- AI-generated (checkbox)
- Reviewer (select: Self, Editorial)
- Tags (multi-select: <your topic buckets>)
- URL (url)
- Notes (rich_text)
```

Save the **database ID** and **data source ID** returned — you'll need both for the cron prompt and the dashboard.

> **Caveat:** The `notion-create-database` MCP tool uses SQL DDL syntax, and the `STATUS` type does NOT accept inline options the way `SELECT` does. Use `SELECT` for the `Stage` column.

## Define Your Thematic Buckets

Before writing the cron, decide the buckets your content will cover. The goal is **breadth** — avoiding the failure mode where the daily cron keeps picking 3 stories from the same hot topic.

Example buckets for a travel-industry focus:

- 🤖 AI & LLM (including AEO, GEO, agents, chatbots)
- 🏨 Hotel tech & distribution (PMS, OTA, direct booking, revenue management)
- ✈️ Aviation (airlines, routes, markets)
- 🌱 Sustainability & impact (overtourism, carbon, responsible travel)
- 📍 DMO & destination management (strategy, territorial marketing, destination data)
- 📊 Marketing & strategy (brand, content, influencer, social)
- 📋 Policy & regulation (EU AI Act, DSA, taxes)
- 🏛️ Travel-tech funding & M&A
- 🌍 Macro trends & consumer behavior

Customize this list to your own field (tech, finance, design, etc.). The list goes into the cron prompt below.

## The Daily Cron Prompt

This cron runs at **17:00 local** (1 hour before end of workday, so your morning review tomorrow has fresh stock). Paste it into `mission-control.md`:

```
## 5. Content Feed Daily (daily at 17:00)

- **Cron**: `0 17 * * *`
- **Prompt**:

Daily content engine. Research topical news, pick 3 diversified stories, enrich with web search, push to Notion.

1. RESEARCH. For each of the following bucket queries, run a WebSearch with a query adapted to today's date:
   - 🤖 "AI LLM travel industry news [current week]"
   - 🏨 "hotel technology distribution direct booking news [current week]"
   - ✈️ "airline industry news strategy [current week]"
   - 🌱 "sustainable tourism overtourism news [current week]"
   - 📍 "destination management DMO news [current week]"
   - 📊 "travel marketing strategy news [current week]"
   - 📋 "travel regulation EU AI Act news [current week]"
   - 🏛️ "travel tech funding acquisition [current week]"
   (Adapt buckets to your topic taxonomy.)

2. SELECT 3 stories, MAXIMIZING bucket diversity:
   - Never 3 stories from the same bucket
   - Prefer 3 different buckets when possible, 2 minimum
   - Bias against the dominant-topic bucket — if one bucket produces 4 great results and another produces 1 mediocre one, take 2 from the dominant and 1 from the weaker to force diversification
   - De-duplicate against recent Content Pipeline entries (query the Notion database, filter last 7 days, reject near-duplicate titles)

3. ENRICH each pick with 1-2 additional WebSearch queries:
   - Find 2 third-party sources for cross-verification
   - Extract 2-3 numerical data points (revenue, percentages, market size)
   - Propose 3 editorial angles for each story: "could become: LinkedIn analytical post on X / keynote slide on Y / podcast segment on Z"

4. CREATE 3 new pages in Notion Content Pipeline database (data_source_id: YOUR_CONTENT_DATA_SOURCE_ID) via MCP notion-create-pages with:
   - parent: { type: "data_source_id", data_source_id: "YOUR_CONTENT_DATA_SOURCE_ID" }
   - Title: the editorial angle (NOT the article headline)
   - Stage: "Ideas backlog"
   - Type: the most suitable (Article / Long form / Social post / Podcast segment / Keynote / Speech / Lecture)
   - Tags: category + keywords (must match your multi-select options)
   - Platform: 1-2 suggested platforms
   - AI-generated: __YES__
   - URL: link to the primary source
   - Content body (markdown): structured as
     ## 📰 Primary source
     [Source name](url) — published date
     ## 🎯 Summary
     <3-4 line synthesis>
     ## 🔍 Verification & context
     - [Source 2](url) — data point
     - [Source 3](url) — data point
     ## ✍️ Editorial angles
     1. **<angle 1>** — 1-line rationale
     2. **<angle 2>** — 1-line rationale
     3. **<angle 3>** — 1-line rationale

5. NOTIFY Telegram (chat_id: YOUR_CHAT_ID):
   📰 CONTENT FEED — [today]
   3 new ideas in Ideas backlog:
   1. 🔸 <bucket emoji> <short angle> → <Notion link>
   2. 🔸 <bucket emoji> <short angle> → <Notion link>
   3. 🔸 <bucket emoji> <short angle> → <Notion link>

6. If WebSearch fails, no recent results, or Notion creation fails: notify the error on Telegram instead of failing silently.
```

Replace `YOUR_CONTENT_DATA_SOURCE_ID` and `YOUR_CHAT_ID` with your values.

## Review Workflow

Every morning:

1. Open the **Mission Control Dashboard** → Content tab (see `guide-dashboard.md`)
2. Review the 3 new cards in **Ideas backlog**
3. Drag promising ones to **Draft** — the kanban updates Notion live via the dashboard's `/api/content-pipeline/move` endpoint
4. Double-click a card to open the full page in Notion for editing
5. Discard (or leave in backlog) the ones that don't fit your voice

The Mission Control Dashboard Content page auto-refreshes every 30 seconds, so your kanban state is always current even if you're editing directly in Notion on another device.

## Customization Ideas

- **Weekly roll-up** — a second cron on Friday that summarizes which ideas were accepted/rejected this week and flags your topic bias
- **Cross-channel distribution** — once an item hits "Published", auto-populate a URL back to the source and move to "Archive" after 30 days
- **Language detection** — route Italian/English sources to different Tags automatically
- **Domain filter** — only search trusted domains with WebSearch `allowed_domains`
- **Manual seed** — a companion cron or Telegram command to add a user-chosen topic alongside the AI-generated ones

## Troubleshooting

- **Cron didn't fire**: Claude Code only fires crons while the REPL is idle. If you were mid-conversation at 17:00, the cron waits. Check with `CronList`.
- **Bucket monoculture**: if you notice 3 days in a row with AI topics, the diversification clause isn't strict enough — edit the prompt to explicitly penalize the dominant bucket.
- **Duplicate detection misses**: increase the dedup window or compare on `originalUrl` domain + keywords instead of title only.
