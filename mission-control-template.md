# Mission Control — Cron Configuration

When starting a session, create these cron jobs:

## 1. Morning Briefing
- Cron: `28 7 * * *` (daily at 07:28)
- See `docs/guide-mission-control.md` for the full prompt

## 2. Email Monitoring (every 2h)
- Cron: `7 */2 * * *` (every 2 hours at :07)
- See `docs/guide-mission-control.md` for the full prompt

## 3. Overdue Email Reminder (weekdays ~17:00)
- Cron: `57 16 * * 1-5` (Mon-Fri at 16:57)
- See `docs/guide-mission-control.md` for the full prompt

## 4. Travel Document Organizer (every 2h)
- Cron: `37 */2 * * *` (every 2 hours at :37)
- See `docs/guide-travel-system.md` for the full prompt

## 5. Content Feed Daily
- Cron: `0 17 * * *` (daily at 17:00)
- See `docs/guide-content-engine.md` for the full prompt. Researches topics of interest via WebSearch, picks 3 diversified content ideas, writes them to the Notion Content Pipeline database as new entries in "Ideas backlog".

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
- Tools server: localhost:3847
- n8n: localhost:5678
- Dashboard: http://localhost:3848 (launch with `~/mission-control/scripts/dashboard-launch.sh open`)
- Launch: `cd ~/mission-control && claude --channels plugin:telegram@claude-plugins-official`
- Timezone: YOUR_TIMEZONE
