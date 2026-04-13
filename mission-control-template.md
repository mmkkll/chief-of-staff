# Mission Control — Cron Configuration

When starting a session, create these cron jobs:

---

## 1. Morning Briefing

- **Cron**: `3 7 * * *` (daily at 07:03 — must fire BEFORE the email monitor at 07:07)
- **Prompt**:

```
Morning briefing. Execute these steps:

1. Read TODAY's tasks from Sunsama (primary source) using MCP tool get-tasks-by-day:
   - day = today's date (YYYY-MM-DD format)
   - timezone = YOUR_TIMEZONE
   Highlight tasks with deadline today and urgent tasks.
   
   In parallel, read open tasks from Notion (To-dos database) to catch unmigrated residuals.
   Show only Notion tasks that are overdue or urgent AND not already on Sunsama.

2. Read TODAY's events from Google Calendar (use MCP tools gcal_list_events):
   - Calendar "primary" (YOUR_EMAIL)
   - Calendar "YOUR_SECONDARY_EMAIL" (if applicable)
   - Timezone: YOUR_TIMEZONE
   - Flag scheduling conflicts

3. Check Gmail for unread emails (use MCP tools gmail_search_messages), in priority order:
   - is:unread label:YOUR_PRIORITY_LABEL
   - is:unread in:inbox -category:promotions -category:social -category:updates
   HIGH priority: [your high-priority senders/topics]
   MEDIUM priority: [your medium-priority senders/topics]
   Ignore: newsletters, automated notifications, vendors.
   For each relevant email: who, what they want, recommended action.

4. Recap YESTERDAY's meetings from Granola (use MCP tools query_granola_meetings and list_meetings):
   - List yesterday's meetings
   - For each: title, attendees, action items and key decisions
   - If no meetings yesterday, omit this section

5. Generate voice briefing (abridged version 800-1200 chars) with ElevenLabs:
   node ~/mission-control/scripts/elevenlabs-tts.mjs --ogg --out /tmp/mc-briefing-$(date +%Y%m%d).ogg "ABRIDGED BRIEFING TEXT"
   Then check presence: bash ~/mission-control/scripts/mac-presence.sh
   - If "present": also play locally with --play
   - If "absent": Telegram only

6. Send the briefing on Telegram (chat_id: YOUR_CHAT_ID) with format:
   ☀️ MORNING BRIEFING — [date]
   📅 TODAY'S AGENDA (events + conflicts)
   📋 SUNSAMA TASKS (today's tasks, highlight deadlines and urgent)
   📋 NOTION TASKS (only overdue/urgent not on Sunsama)
   🎙️ YESTERDAY'S MEETINGS (title, action items, decisions — if any)
   📧 EMAILS TO HANDLE (summary + action)
   Have a great day! 🚀

   Attach the OGG file as voice note in the Telegram reply.
```

---

## 2. Email Monitoring (every 2h)

- **Cron**: `7 */2 * * *` (every 2 hours at :07)
- **Prompt**:

```
Email monitoring. Check Gmail for new unread emails that require a response.

1. Search unread emails in priority order using MCP Gmail tools:
   - is:unread label:YOUR_PRIORITY_LABEL newer_than:3h
   - is:unread in:inbox -category:promotions -category:social -category:updates newer_than:3h

2. HIGH priority: [your high-priority senders/topics]
   MEDIUM priority: [your medium-priority senders/topics]
   Ignore: newsletters, automated notifications, vendors.

3. For each relevant email:
   - Summarize in 3 lines: who, what they want, deadline
   - Check Google Calendar for mentioned dates — flag conflicts and free slots
   - Recommend: accept, decline, postpone, ask for info. Explain why in one line.

4. If there are relevant emails, send the summary on Telegram (chat_id: YOUR_CHAT_ID).
   If there are NO new relevant emails, do NOT send anything on Telegram.

5. Do NOT reply to any emails. Wait for feedback on Telegram before taking any action.
```

---

## 3. Overdue Email Reminder (weekdays ~17:00)

- **Cron**: `57 16 * * 1-5` (Mon-Fri at 16:57)
- **Prompt**:

```
Check for unanswered emails. Search Gmail for important unread emails older than 48 hours.

1. Search unread emails older than 48h, in priority order:
   - is:unread label:YOUR_PRIORITY_LABEL older_than:2d
   - is:unread in:inbox -category:promotions -category:social -category:updates older_than:2d newer_than:30d

2. Filter only emails that require a response (ignore newsletters, automated, vendors).
   HIGH priority: [your high-priority senders/topics]
   MEDIUM priority: [your medium-priority senders/topics]

3. If there are relevant unanswered emails from 48h+, send a reminder on Telegram (chat_id: YOUR_CHAT_ID):
   - Who sent it
   - Subject
   - How many days it's been waiting
   - Recommended action

4. If there are NO overdue emails, do NOT send anything on Telegram.
```

---

## 4. Travel Document Organizer (every 2h)

- **Cron**: `37 */2 * * *` (every 2 hours at :37)
- **Prompt**:

```
Organize travel documents. Search for booking confirmations in email and save to Notion.

1. SEARCH TRAVEL EMAILS using MCP Gmail tools AND iCloud:
   
   a) Gmail (last 3h, or 48h on first run after startup):
   - is:unread subject:(confirmation OR booking OR reservation OR itinerary OR e-ticket OR receipt) newer_than:3h
   - is:unread from:(trenitalia OR lufthansa OR ryanair OR easyjet OR booking.com OR marriott OR expedia OR hotels.com OR hertz OR europcar OR airbnb) newer_than:3h
   
   b) iCloud (optional, if configured):
   node ~/mission-control/scripts/icloud-mail-search.mjs --query "booking,confirmation,reservation,voucher" --since "$(date -v-3H +%Y-%m-%d)" --limit 10

2. FOR EACH EMAIL FOUND, read the full content (gmail_read_message) and extract:
   - Type: flight / train / hotel / car / restaurant / experience / other
   - Destination/city
   - Dates (check-in/out, departure/arrival)
   - Booking details: PNR/booking code, carrier, times, seat, address

3. MATCH WITH EXISTING TRIPS — Use MCP Notion tools (notion-fetch):
   a. Read pages in Inspirations (YOUR_INSPIRATIONS_PAGE_ID)
   b. Read pages in Planning (YOUR_PLANNING_PAGE_ID)
   
   Logic:
   - If trip exists in Inspirations → MOVE to Planning (notion-move-pages) and add booking details
   - If trip exists in Planning → ADD details to existing page
   - If it doesn't exist → CREATE new page in Planning

4. TRIP PAGE STRUCTURE on Notion:
   ## ✈️ Flights — Table: Route | Flight | Date | Time | Seat | Booking
   ## 🚆 Trains — Table: Route | Train | Date | Time | Seat | PNR
   ## 🏨 Hotels — Name, Address, Check-in/out, Code, Price
   ## 🚗 Car Rental — Company, Pickup/Dropoff, Dates, Code
   ## 🍽️ Restaurants — Name, Address, Date/Time, People, Code
   ## 🎫 Experiences — Name, Date/Time, Location, Code
   ## 📎 Attached Documents

5. NOTIFY on Telegram (chat_id: YOUR_CHAT_ID) ONLY if you processed at least one email.
   If NO travel emails found, do NOT send anything on Telegram.

6. Do NOT mark emails as read.

7. PRE-DEPARTURE CHECKLIST (48h before) — For each trip in Planning:
   If departure is 46-50 hours away: verify completeness, check weather, send checklist on Telegram.

8. AUTO-MOVE ON DEPARTURE DAY — If departure is TODAY:
   Move to Ready to Travel (YOUR_READY_PAGE_ID) automatically.
```

---

## 5. Content Feed Daily

- **Cron**: `0 17 * * *` (daily at 17:00)
- **Prompt**:

```
Daily Content Feed. Research topics of interest via WebSearch, select 3 diversified content ideas, and create them as new entries in the Notion Content Pipeline.

1. RUN 3-5 WebSearch queries across your thematic buckets. Example buckets:
   - AI & LLM in your industry
   - Technology & distribution
   - Sustainability & impact
   - Strategy & marketing
   - Policy & regulation
   - Macro trends & consumer behavior
   Adapt these to YOUR domain and topics of interest.

2. SELECT the 3 most important results, MAXIMIZING coverage of different buckets:
   - NEVER select 3 items from the same bucket
   - Prefer 3 different buckets when possible, minimum 2
   - Avoid duplicates with content already in the Content Pipeline (query the database, check for similar titles in the last 7 entries)

3. ENRICH each selection with additional WebSearch:
   - Find 1-2 third-party sources covering the same topic (for verification + context)
   - Extract 2-3 numerical data points (revenue, percentages, dates, market size)
   - Identify 2-3 possible editorial angles: "could become an analytical LinkedIn post on X", "keynote slide material on Y", "podcast segment on Z"

4. CREATE 3 PAGES in the Notion Content Pipeline database (YOUR_CONTENT_DB_ID) via MCP notion-create-pages:
   - Title: a short editorial phrase (the ANGLE, not the literal article headline)
   - Stage: "Ideas backlog"
   - Type: choose the best fit (Article / Long form / Social post / Podcast segment / Keynote / Speech / Lecture)
   - Tags: use your topic taxonomy as multi-select
   - Platform: suggest 1-2 relevant platforms (LinkedIn, Blog, Medium, Podcast, Conference...)
   - AI-generated: __YES__
   - Notes: structured markdown with source, summary, WebSearch verification, editorial angles

5. NOTIFY on Telegram (chat_id: YOUR_CHAT_ID):
   📰 CONTENT FEED — [today's date]
   3 new ideas added to Ideas backlog:
   1. 🔸 [angle] → [Notion link]
   2. 🔸 [angle] → [Notion link]
   3. 🔸 [angle] → [Notion link]

6. If WebSearch fails or returns no results: notify the error on Telegram instead of failing silently.
```

---

## Technical References

- Telegram chat_id: YOUR_CHAT_ID
- Telegram bot token: YOUR_BOT_TOKEN
- Notion database To-dos: YOUR_DATABASE_ID
- Notion database Content Pipeline: YOUR_CONTENT_DB_ID (data source: YOUR_CONTENT_DATA_SOURCE_ID)
- Notion API token: YOUR_NOTION_TOKEN
- Notion Travel > Inspirations: YOUR_INSPIRATIONS_PAGE_ID
- Notion Travel > Planning: YOUR_PLANNING_PAGE_ID
- Notion Travel > Ready to Travel: YOUR_READY_PAGE_ID
- Google Calendar: YOUR_EMAIL
- Gmail label priority: YOUR_LABELS
- iCloud IMAP (optional): YOUR_ICLOUD_EMAIL / imap.mail.me.com:993 / YOUR_APP_PASSWORD
- ElevenLabs: key in `~/mission-control/.secrets/elevenlabs.env`
- Tools server: localhost:3847
- n8n: localhost:5678
- Dashboard: http://localhost:3848 (launch with `~/mission-control/scripts/dashboard-launch.sh open`)
- Launch: `cd ~/mission-control && claude --channels plugin:telegram@claude-plugins-official`
- Timezone: YOUR_TIMEZONE
