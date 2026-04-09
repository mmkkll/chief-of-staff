# Build an AI Travel Agent & Travel Organizer with Claude Code

A step-by-step guide to building an automated travel management system that researches trips, tracks real hotel prices, organizes booking confirmations from email, and manages the full lifecycle of your trips on Notion.

## What You'll Build

Two complementary systems:

1. **Travel Agent** — an AI assistant that researches flights, hotels, restaurants, and experiences on demand, using multiple AI models in parallel and real price scraping
2. **Travel Organizer** — an automated system that monitors your email for booking confirmations, organizes them on Notion, sends you a completeness checklist 48h before departure, and manages the trip lifecycle

### The Trip Lifecycle on Notion

```
Inspirations  →  Planning  →  Ready to Travel
   (idea)       (booked)      (departing!)
```

## Tech Stack

| Component | Purpose | Required |
|-----------|---------|----------|
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | AI agent runtime | Yes |
| [Notion](https://www.notion.so/) | Trip pages and document storage | Yes |
| [Gmail MCP](https://claude.ai/code) | Email monitoring for booking confirmations | Yes |
| [Telegram Bot](https://core.telegram.org/bots) | Notifications and commands | Yes |
| [n8n](https://n8n.io/) | Workflow automation for multi-model search | Yes (for Travel Agent) |
| [Node.js](https://nodejs.org/) | Runtime for Playwright scraper | Yes (for price scraping) |
| [Playwright](https://playwright.dev/) | Browser automation for Google Hotels | Yes (for price scraping) |
| LLM API keys (Gemini, Perplexity, OpenAI) | Multi-model travel research | Optional |
| [OpenCLI](https://github.com/jackwener/OpenCLI) | Browser automation — send booking emails, query Gemini with Google Hotels | Optional |
| [CLI-Anything](https://github.com/HKUDS/CLI-Anything) | Convert apps to CLIs — PM2 for persistent services | Optional |

## Prerequisites & Installation

### 1. Core Setup

If you haven't already, follow the [Mission Control guide](guide-mission-control.md) to set up:
- Claude Code
- Telegram bot + plugin
- Notion workspace + integration
- Gmail and Google Calendar MCP connections

### 2. Set Up the Notion Travel Structure

Create this page hierarchy in Notion:

```
📁 Travel
  ├── 🌟 Inspirations    (trip ideas and research)
  ├── 📋 Planning         (confirmed trips with bookings)
  └── 🧳 Ready to Travel  (departing soon / today)
```

Note the **page IDs** for each (from the URL):
```
Travel:           YOUR_TRAVEL_PAGE_ID
Inspirations:     YOUR_INSPIRATIONS_PAGE_ID
Planning:         YOUR_PLANNING_PAGE_ID
Ready to Travel:  YOUR_READY_PAGE_ID
```

### 3. Install n8n (for Travel Agent)

```bash
# Install globally
npm install -g n8n

# Or via Homebrew (macOS)
brew install n8n

# Start n8n
n8n start
```

n8n runs on `http://localhost:5678` by default.

### 4. Install Playwright (for Hotel Price Scraping)

```bash
# Create a scripts directory
mkdir -p ~/mission-control/scripts
cd ~/mission-control/scripts

# Initialize and install Playwright + imapflow
npm init -y
npm install playwright imapflow

# Install Chromium browser
npx playwright install chromium
```

### 5. Set Up iCloud IMAP (Optional — for historical email access)

If you use iCloud Mail and want to search historical booking confirmations (not just new ones via Gmail):

1. Go to [appleid.apple.com](https://appleid.apple.com) → Sign-In & Security → App-Specific Passwords
2. Generate a password, name it "Mission Control"
3. Save the password (format: `xxxx-xxxx-xxxx-xxxx`)
4. Note your iCloud email address (e.g., `yourname@icloud.com` or `@me.com`)

IMAP settings:
```
Host: imap.mail.me.com
Port: 993 (SSL)
User: YOUR_ICLOUD_EMAIL
Pass: YOUR_APP_SPECIFIC_PASSWORD
```

> **Tip**: Set up email forwarding from iCloud to Gmail so new emails are caught by the Gmail monitoring cron. Use IMAP only for searching the historical archive.

---

## Part 1: Travel Agent

### How It Works

When you request a trip, the Travel Agent:
1. Calls an n8n webhook that queries multiple AI models in parallel
2. Scrapes Google Hotels for real prices via Playwright
3. Synthesizes the best results into a comprehensive travel document
4. Saves the full result to Notion > Inspirations
5. Sends a concise summary to Telegram

### Step 1: Create the n8n Travel Agent Workflow

In n8n (`http://localhost:5678`), create a new workflow:

**Nodes:**
1. **Webhook** (trigger) — `POST /webhook/travel-agent`
2. **HTTP Request** (to Gemini API) — sends the travel query
3. **HTTP Request** (to Perplexity API) — same query in parallel
4. **Merge** — combines both responses
5. **Respond to Webhook** — returns combined results

Configure each HTTP Request node with your API keys:

**Gemini:**
```
POST https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=YOUR_GEMINI_KEY
Body: { "contents": [{ "parts": [{ "text": "YOUR_TRAVEL_PROMPT" }] }] }
```

**Perplexity:**
```
POST https://api.perplexity.ai/chat/completions
Headers: Authorization: Bearer YOUR_PERPLEXITY_KEY
Body: { "model": "sonar", "messages": [{ "role": "user", "content": "YOUR_TRAVEL_PROMPT" }] }
```

Activate the workflow.

### Step 2: Create the Google Hotels Scraper

Create `~/mission-control/scripts/google-hotels-scraper.mjs`:

```javascript
import { chromium } from 'playwright';

function parseArgs() {
  const args = process.argv.slice(2);
  const params = {};
  for (let i = 0; i < args.length; i += 2) {
    params[args[i].replace('--', '')] = args[i + 1];
  }
  return params;
}

function parseHotelsFromText(text) {
  const hotels = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  for (let i = 0; i < lines.length; i++) {
    const priceMatch = lines[i].match(/^[€$£]([\d,.]+)/);
    if (priceMatch && i > 0) {
      let name = lines[i - 1];
      if (/^\d+\.\d+\/\d+|^\d+-star/i.test(name) && i > 1) name = lines[i - 2];
      const price = lines[i].match(/^[€$£][\d,.]+/)[0];
      if (name && !/^(Sort|Filter|Under|All|Sign|Skip|Sponsored)/i.test(name)) {
        hotels.push({ name, price, currency: price[0] });
      }
    }
  }
  const seen = new Set();
  return hotels.filter(h => {
    const k = h.name.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function acceptConsent(page) {
  for (const label of ['Accept all', 'Accetta tutto', 'Tout accepter', 'Alle akzeptieren']) {
    const btn = page.locator(`button:has-text("${label}")`).first();
    if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await btn.click();
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      return;
    }
  }
}

async function scrapeGoogleHotels(city, checkin, checkout, hotelFilter) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const context = await browser.newContext({
    locale: 'en-US',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  const page = await context.newPage();
  const filterTerms = hotelFilter
    ? hotelFilter.split(',').map(h => h.trim().toLowerCase()) : [];
  let allResults = [];

  try {
    // Accept Google consent
    await page.goto('https://www.google.com/', {
      waitUntil: 'networkidle', timeout: 15000
    });
    await acceptConsent(page);
    await page.waitForTimeout(1000);

    // Search for each hotel individually
    const searchTerms = filterTerms.length > 0 ? filterTerms : [city];

    for (const term of searchTerms) {
      const url = `https://www.google.com/travel/hotels/${
        encodeURIComponent(city)
      }?q=${encodeURIComponent(term + ' hotel ' + city)}&hl=en&curr=EUR`;

      await page.goto(url, {
        waitUntil: 'domcontentloaded', timeout: 30000
      });
      await acceptConsent(page);
      await page.waitForTimeout(4000);

      const pageText = await page.evaluate(() => document.body.innerText);
      const found = parseHotelsFromText(pageText);
      allResults.push(...found);
    }

    // Filter to requested hotels
    if (filterTerms.length > 0) {
      allResults = allResults.filter(h =>
        filterTerms.some(t => h.name.toLowerCase().includes(t))
      );
    }

    // Deduplicate
    const seen = new Map();
    for (const r of allResults) {
      const k = r.name.toLowerCase();
      if (!seen.has(k)) seen.set(k, r);
    }

    await browser.close();
    return { success: true, checkin, checkout, results: [...seen.values()] };
  } catch (error) {
    await browser.close();
    return { success: false, error: error.message };
  }
}

const params = parseArgs();
const result = await scrapeGoogleHotels(
  params.city || 'Milan',
  params.checkin || '2025-05-04',
  params.checkout || '2025-05-05',
  params.hotels || ''
);
console.log(JSON.stringify(result, null, 2));
```

Test it:
```bash
node google-hotels-scraper.mjs \
  --city "Milan" \
  --checkin "2025-05-04" \
  --checkout "2025-05-05" \
  --hotels "Marriott,Sheraton"
```

### Step 3: Create the Tools Server

The scraper and IMAP search need a wrapper HTTP server because n8n's Code node blocks `child_process` for security. This server handles both hotel scraping and iCloud email search.

Create `~/mission-control/scripts/hotel-scraper-server.mjs`:

```javascript
import http from 'http';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 3847;

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Use POST /scrape or POST /icloud-search' }));
    return;
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    try {
      const input = JSON.parse(body);

      if (req.url === '/scrape') {
        const city = (input.city || 'Milan').replace(/"/g, '');
        const checkin = (input.checkin || '').replace(/"/g, '');
        const checkout = (input.checkout || '').replace(/"/g, '');
        const hotels = (input.hotels || '').replace(/"/g, '');

        const cmd = `node google-hotels-scraper.mjs --city "${city}" --checkin "${checkin}" --checkout "${checkout}" --hotels "${hotels}"`;
        const result = execSync(cmd, { cwd: __dirname, timeout: 180000, encoding: 'utf8' });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(result);

      } else if (req.url === '/icloud-search') {
        const args = [];
        if (input.query) args.push(`--query "${input.query.replace(/"/g, '')}"`);
        if (input.from) args.push(`--from "${input.from.replace(/"/g, '')}"`);
        if (input.since) args.push(`--since "${input.since.replace(/"/g, '')}"`);
        if (input.limit) args.push(`--limit ${parseInt(input.limit) || 20}`);

        const cmd = `node icloud-mail-search.mjs ${args.join(' ')}`;
        const result = execSync(cmd, { cwd: __dirname, timeout: 60000, encoding: 'utf8' });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(result);

      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Use POST /scrape or POST /icloud-search' }));
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`Tools server on http://localhost:${PORT}`);
  console.log(`POST /scrape         → Google Hotels prices`);
  console.log(`POST /icloud-search  → iCloud email search`);
});
```

Start it:
```bash
node ~/mission-control/scripts/hotel-scraper-server.mjs
```

### Step 4: Create the iCloud Mail Search Script (Optional)

If you set up iCloud IMAP in the prerequisites, create `~/mission-control/scripts/icloud-mail-search.mjs`:

```javascript
import { ImapFlow } from 'imapflow';

const ICLOUD_CONFIG = {
  host: 'imap.mail.me.com',
  port: 993,
  secure: true,
  auth: { user: 'YOUR_ICLOUD_EMAIL', pass: 'YOUR_APP_SPECIFIC_PASSWORD' },
  logger: false
};

function parseArgs() {
  const args = process.argv.slice(2);
  const params = {};
  for (let i = 0; i < args.length; i += 2)
    params[args[i].replace('--', '')] = args[i + 1];
  return params;
}

async function searchMail({ query, from, since, limit = 20 }) {
  const client = new ImapFlow(ICLOUD_CONFIG);
  await client.connect();
  const lock = await client.getMailboxLock('INBOX');
  const results = [];

  try {
    const criteria = { or: [] };
    if (query) {
      for (const kw of query.split(','))
        criteria.or.push({ subject: kw.trim() });
    }
    if (from) criteria.from = from;

    let search = criteria.or.length > 0
      ? (from ? { and: [{ from }, { or: criteria.or }] } : { or: criteria.or })
      : (from ? { from } : { since: new Date(Date.now() - 30*24*60*60*1000) });

    if (since) {
      const sinceDate = new Date(since);
      search = search.and ? { and: [...search.and, { since: sinceDate }] }
        : { and: [search, { since: sinceDate }] };
    }

    const messages = await client.search(search);
    for (const uid of messages.slice(-parseInt(limit))) {
      const msg = await client.fetchOne(uid, { envelope: true });
      results.push({
        uid,
        date: msg.envelope.date?.toISOString() || null,
        from: msg.envelope.from?.[0]?.address || null,
        subject: msg.envelope.subject || null
      });
    }
  } finally { lock.release(); }

  await client.logout();
  return { success: true, count: results.length, messages: results };
}

const p = parseArgs();
const r = await searchMail({ query: p.query, from: p.from, since: p.since, limit: p.limit });
console.log(JSON.stringify(r, null, 2));
```

Test it:
```bash
node icloud-mail-search.mjs --query "booking,confirmation" --limit 10
```

### Step 5: Create n8n Workflows

Create two n8n workflows:

**Workflow 1: Hotel Price Scraper**
1. **Webhook** — `POST /webhook/hotel-prices`, response mode: "Response Node"
2. **HTTP Request** — `POST http://localhost:3847/scrape`, body: `{{ $json.body }}`
3. **Respond to Webhook** — returns the scraper response

**Workflow 2: iCloud Mail Search** (optional)
1. **Webhook** — `POST /webhook/icloud-search`, response mode: "Response Node"
2. **HTTP Request** — `POST http://localhost:3847/icloud-search`, body: `{{ $json.body }}`
3. **Respond to Webhook** — returns search results

Activate both workflows.

Test them:
```bash
# Hotel prices
curl -X POST http://localhost:5678/webhook/hotel-prices \
  -H 'Content-Type: application/json' \
  -d '{"city":"Milan","checkin":"2025-05-04","checkout":"2025-05-05","hotels":"Marriott,Sheraton"}'

# iCloud search
curl -X POST http://localhost:5678/webhook/icloud-search \
  -H 'Content-Type: application/json' \
  -d '{"query":"booking,confirmation","limit":10}'
```

### Step 6: Configure Travel Agent Rules in CLAUDE.md

Add this to your `CLAUDE.md`:

```markdown
## Travel Agent
When I send a travel request, act as my personal Travel Agent:
- Departure airports: YOUR_AIRPORTS (e.g., JFK, EWR, LGA)
- Airline alliance: YOUR_ALLIANCE (e.g., Star Alliance, OneWorld, SkyTeam)
- Flights under 4h: Economy. Over 4h: show Economy + Business with prices
- Hotels: YOUR_PREFERRED_CHAIN (e.g., Marriott Bonvoy, Hilton Honors, IHG)
- Include: flights with links, hotels with booking links, 2-3 restaurants
  with Google Maps, practical notes, packing essentials
- Save the FULL result to Notion in "Inspirations"
- Send me a CONCISE summary on Telegram (max 3500 characters)

## Travel Pipeline (Notion)
Structure: Travel > Inspirations > Planning > Ready to Travel

### Flow
1. **Inspirations** — trip ideas generated by Travel Agent
2. **Planning** — first booking confirmation → move/create page here
3. **Ready to Travel** — 48h before: completeness checklist + ask to move. Departure day: auto-move

### Notion IDs
- Inspirations: YOUR_INSPIRATIONS_PAGE_ID
- Planning: YOUR_PLANNING_PAGE_ID
- Ready to Travel: YOUR_READY_PAGE_ID

### iCloud Email (historical archive)
To retrieve confirmations from iCloud history, use the icloud-search webhook
or standalone script. New emails also arrive on Gmail via forwarding.

## Local Tools

### Tools Server (port 3847)
- Start: `node ~/mission-control/scripts/hotel-scraper-server.mjs &`
- `POST /scrape` — Google Hotels prices
- `POST /icloud-search` — iCloud IMAP email search

### n8n Webhooks (localhost:5678)
- `POST /webhook/travel-agent` — multi-model research (Gemini + Perplexity)
- `POST /webhook/hotel-prices` — real hotel prices (requires tools server)
- `POST /webhook/icloud-search` — iCloud email search (requires tools server)

### Scripts (~/mission-control/scripts/)
- `google-hotels-scraper.mjs` — Playwright Google Hotels scraper
- `hotel-scraper-server.mjs` — tools server (port 3847)
- `icloud-mail-search.mjs` — standalone iCloud IMAP search

### OpenCLI (Browser Automation)
[OpenCLI](https://github.com/jackwener/OpenCLI) reuses your Chrome sessions to automate web interactions.

Install: `npm install -g @jackwener/opencli` + Chrome Browser Bridge extension.

Travel-specific uses:
- **Send booking emails**: Gmail MCP can only draft — OpenCLI clicks Send in your browser
- **Query Gemini with Google Hotels**: `opencli gemini` has access to Google's hotel pricing extension, bypassing the Playwright scraper's date encoding limitation
- **Browser control**: `opencli operate open/click/type` for any travel booking site

### CLI-Anything (GUI → CLI)
[CLI-Anything](https://github.com/HKUDS/CLI-Anything) converts desktop apps into agent-usable CLIs.

Install: `claude plugin marketplace add HKUDS/CLI-Anything && claude plugin install cli-anything`

Travel-specific uses:
- **PM2 harness**: Keep the tools server (port 3847) running persistently across reboots
- **Mermaid harness**: Generate trip itinerary diagrams
```

---

## Part 2: Travel Organizer

### How It Works

A cron job runs every 2 hours and:
1. Scans Gmail for booking confirmation emails
2. Extracts booking details (type, destination, dates, PNR)
3. Matches to existing trips on Notion (by destination + dates)
4. Organizes bookings into structured trip pages
5. 48h before departure: sends a completeness checklist
6. Day of departure: auto-moves the trip to "Ready to Travel"

### Step 1: Add the Travel Organizer Cron to mission-control.md

Add this section to your `mission-control.md`:

```markdown
## 4. Travel Document Organizer (every 2h)

- **Cron**: `37 */2 * * *` (every 2 hours at :37)
- **Prompt**:

Organize travel documents. Search for booking confirmations in email
and save them to Notion.

1. SEARCH FOR TRAVEL EMAILS (last 3h) using MCP Gmail tools:
   - is:unread subject:(confirmation OR booking OR reservation
     OR itinerary OR e-ticket OR receipt) newer_than:3h
   - is:unread from:(YOUR_AIRLINE_1 OR YOUR_AIRLINE_2 OR YOUR_HOTEL_CHAIN
     OR booking.com OR expedia OR hotels.com OR YOUR_CAR_RENTAL
     OR YOUR_RESTAURANT_APP) newer_than:3h

2. FOR EACH EMAIL FOUND, read full content (gmail_read_message) and extract:
   - Type: flight / train / hotel / car / restaurant / experience / other
   - Destination / city
   - Dates (check-in/out, departure/arrival)
   - Booking details: PNR, company, times, seat, address
   - Download PDF attachments if present

3. MATCH WITH EXISTING TRIPS — Use MCP Notion tools (notion-fetch):
   a. Check Inspirations (YOUR_INSPIRATIONS_PAGE_ID)
   b. Check Planning (YOUR_PLANNING_PAGE_ID)

   Logic:
   - Found in Inspirations → MOVE page to Planning + add booking details
   - Found in Planning → ADD booking details to existing page
   - Not found → CREATE new page in Planning

4. TRIP PAGE STRUCTURE on Notion:

   ## ✈️ Flights
   | Route | Flight | Date | Time | Seat | Booking |

   ## 🚆 Trains
   | Route | Train | Date | Time | Seat | PNR |

   ## 🏨 Hotels
   Name, Address, Check-in/out, Booking code, Price

   ## 🚗 Car Rental
   Company, Pickup/Return, Dates, Booking code

   ## 🍽️ Restaurants
   Name, Address, Date/Time, Guests, Booking code

   ## 🎫 Experiences
   Name, Date/Time, Location, Booking code

   ## 📎 Attached Documents
   Uploaded PDFs (boarding passes, confirmations, receipts)

5. NOTIFY on Telegram ONLY if at least one email was processed.
   If NO travel emails found, do NOT send anything.

6. Do NOT mark emails as read.

7. PRE-DEPARTURE CHECKLIST (48h before):
   a. Read all trips in Planning
   b. For each trip, find departure date (first flight/train chronologically)
   c. If departure is 46-50 hours from now:
      - Check completeness: outbound transport? hotel? return transport?
      - Verify PNR/booking codes are present
      - Check for boarding passes in attachments
      - Check destination weather (use WebSearch)
      - Send to Telegram:
        ⏰ PRE-DEPARTURE CHECKLIST — [Destination] (departing in 48h)
        ✅ Present items
        ❌ MISSING items
        🌤️ Weather forecast

        Then ask: "Should I move this trip to Ready to Travel?"
        Wait for confirmation before moving.

8. AUTO-MOVE ON DEPARTURE DAY:
   a. If departure date is TODAY:
      - Automatically move page to Ready to Travel
        (YOUR_READY_PAGE_ID)
      - Notify on Telegram — no confirmation needed
```

### Step 2: Customize Email Senders

Update the `from:` filter with your actual travel providers:

```
# Airlines
lufthansa OR swiss OR united OR delta OR american OR
british-airways OR ryanair OR easyjet OR vueling

# Trains
amtrak OR eurostar OR trenitalia OR sncf OR deutschebahn

# Hotels
marriott OR hilton OR hyatt OR ihg OR booking.com OR
airbnb OR expedia OR hotels.com

# Car Rental
hertz OR avis OR europcar OR enterprise OR sixt

# Restaurants
opentable OR resy OR thefork OR yelp

# Experiences
getyourguide OR viator OR klook OR airbnb
```

### Step 3: Launch Everything

```bash
# Terminal 1: Start the tools server (hotel scraping + iCloud search)
node ~/mission-control/scripts/hotel-scraper-server.mjs

# Terminal 2: Start n8n (workflow automation)
n8n start

# Terminal 3: Start Claude Code with Telegram
cd ~/mission-control
claude --channels plugin:telegram@claude-plugins-official
```

Claude will automatically:
1. Read `CLAUDE.md` and `mission-control.md`
2. Create all 4 cron jobs (briefing, email monitoring, email reminders, travel organizer)
3. Verify the tools server (port 3847) and n8n (port 5678) are running
4. Send a test message on Telegram
5. Start monitoring — email checks, travel document organization, and Telegram in real-time

## Full Flow: From Idea to Departure

```
1. You on Telegram: "trip to Barcelona June 16-17"

2. Travel Agent:
   → Calls n8n travel-agent (Gemini + Perplexity)
   → Scrapes hotel prices (Playwright → Google Hotels)
   → Saves full research to Notion > Inspirations
   → Sends summary to Telegram

3. You book flights and hotel

4. Travel Organizer (automatic, every 2h):
   → Finds airline confirmation email
   → Matches "Barcelona" in Inspirations
   → Moves page to Planning
   → Adds flight table with details
   → Finds hotel confirmation email
   → Adds hotel section to same page
   → Telegram: "2 bookings saved — [Notion link]"

5. 48h before (automatic):
   → Checklist: flight ✅, hotel ✅, return ✅, boarding pass ❌
   → Telegram: "Missing boarding pass. Move to Ready to Travel?"
   → You: "yes"
   → Moves to Ready to Travel

6. Departure day (automatic):
   → If still in Planning, auto-moves to Ready to Travel
   → Telegram: "🧳 Barcelona — departing today"
```

## Bonus: Fuel Price Finder via Telegram

When you're on the road, you can ask your Chief of Staff for the cheapest gas stations nearby — directly from Telegram.

### How It Works

The system downloads open data from the government's fuel price registry (updated daily), filters by your location and fuel type, calculates distances, and returns the top 3 cheapest stations.

### Data Source

Many countries publish fuel prices as open data. For Italy, the Ministry of Enterprises (MIMIT) publishes two CSV files updated daily at 08:00:

- **Station registry**: `https://www.mimit.gov.it/images/exportCSV/anagrafica_impianti_attivi.csv`
- **Current prices**: `https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv`

For other countries, look for equivalent open data sources:
- **France**: data.gouv.fr → Prix des carburants
- **Germany**: Tankerkönig API
- **Spain**: geoportalgasolineras.es
- **UK**: data.gov.uk fuel prices
- **USA**: GasBuddy API or state-level open data

### CSV Format (Italy — adapt for your country)

```
Separator: | (pipe)
First line: date header ("Estrazione del YYYY-MM-DD") — skip it
Second line: actual column names

Station registry columns:
idImpianto|Gestore|Bandiera|Tipo Impianto|Nome Impianto|Indirizzo|Comune|Provincia|Latitudine|Longitudine

Price columns:
idImpianto|descCarburante|prezzo|isSelf|dtComu
```

### Setup

Create a skill file at `~/mission-control/skills/fuel-prices.md`:

```markdown
# Fuel Prices — Skill

## Trigger
- "cheapest gas station nearby?"
- "diesel/gasoline price"
- "fuel near me"
- Telegram location pin (if location support is enabled)

## Data Source
- Station registry: YOUR_COUNTRY_FUEL_REGISTRY_URL
- Prices: YOUR_COUNTRY_FUEL_PRICES_URL

## Defaults
- Fuel type: Diesel (or your preference)
- Mode: Self-service
- Radius: 10-15 km
- Home location: YOUR_LAT, YOUR_LON

## Output (Telegram)
Top 3 stations by price: name, price/L, address, distance
```

Add to your `CLAUDE.md`:

```markdown
## Fuel Prices
When asked about fuel prices or cheapest gas station:
- Follow the skill in `skills/fuel-prices.md`
- Source: government open data CSV (downloaded fresh each query)
- Default: Diesel, self-service, 10 km radius from YOUR_HOME_LOCATION
- Return top 3 cheapest stations: name, price, address, distance
```

### Telegram Location Support

By default, the Telegram plugin for Claude Code does NOT handle location messages. To enable it, add these handlers to the plugin source at `~/.claude/plugins/cache/claude-plugins-official/telegram/<version>/server.ts`:

```typescript
bot.on('message:location', async ctx => {
  const loc = ctx.message.location
  const text = `📍 Location: ${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(6)}`
  await handleInbound(ctx, text, undefined)
})

bot.on('message:venue', async ctx => {
  const venue = ctx.message.venue
  const loc = venue.location
  const title = venue.title ?? ''
  const address = venue.address ?? ''
  const text = `📍 Venue: ${title} — ${address} (${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(6)})`
  await handleInbound(ctx, text, undefined)
})
```

Add these before the `bot.on('message:sticker')` handler. Then run `/reload-plugins` in Claude Code.

After this, when you send a location pin on Telegram, Claude receives it as text with coordinates and can automatically look up nearby fuel prices.

### Example Flow

```
1. You send a location pin on Telegram (or type "diesel near Arezzo")

2. Claude:
   → Downloads station registry + prices CSV
   → Filters stations within 10km radius of your coordinates
   → Filters by fuel type (diesel) and self-service
   → Sorts by price ascending
   → Returns top 3

3. Response on Telegram:
   ⛽ CHEAPEST STATIONS — Diesel (self)
   📍 From your location

   1. Agip Eni — €1.999/L — SS69 Km 38, Montevarchi — 5.6 km
   2. Agip Eni — €1.999/L — SR540, Bucine — 8.8 km
   3. Agip Eni — €2.079/L — SS679, Arezzo — 8.4 km
```

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                         Claude Code                               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────┐      │
│  │ Briefing │ │Email Mon.│ │Email Rem.│ │ Travel Org.    │      │
│  │ 07:28    │ │every 2h  │ │16:57 M-F │ │ every 2h       │      │
│  │          │ │          │ │          │ │ +48h checklist  │      │
│  │          │ │          │ │          │ │ +auto-move      │      │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └───────┬────────┘      │
│       │            │             │               │               │
│  ┌────┴────────────┴─────────────┴───────────────┴────────────┐  │
│  │                     MCP Tools                               │  │
│  │  Gmail · Google Calendar · Notion · Telegram · WebSearch    │  │
│  └──────────────────────┬──────────────────────────────────────┘  │
└─────────────────────────┼────────────────────────────────────────┘
                          │
     ┌────────────────────┼────────────────────┐
     │            │               │             │
┌────┴─────┐ ┌───┴────────┐ ┌────┴──────┐ ┌────┴──────────┐
│  n8n     │ │  Tools     │ │ Telegram  │ │   OpenCLI     │
│  :5678   │ │  Server    │ │ Bot API   │ │               │
│          │ │  :3847     │ │           │ │ Chrome Bridge │
│ travel-  │ │            │ │ Real-time │ │ (:19825)      │
│  agent   │ │ /scrape    │ │ via plugin│ │               │
│ hotel-   │◄┤ Playwright │ │ channel   │ │ Gmail Send    │
│  prices  │ │ Chromium   │ │           │ │ Gemini Hotels │
│ icloud-  │◄┤            │ │           │ │ Any website   │
│  search  │ │ /icloud-   │ │           │ │               │
│          │ │  search    │ │           │ │ CLI-Anything  │
└──────────┘ │ imapflow   │ └───────────┘ │ 45+ app CLIs  │
             │ iCloud IMAP│               │ PM2, Mermaid  │
             └────────────┘               └───────────────┘

Notion Travel Pipeline:
  Inspirations ──→ Planning ──→ Ready to Travel
    (research)    (bookings)    (departing!)
       ▲              ▲  48h: checklist    ▲
       │              │  departure: auto   │
  Travel Agent    Travel Organizer    Travel Organizer
  (on request)    (cron every 2h)    (cron every 2h)
```

## Known Limitations

1. **Google Hotels date encoding** — Google Travel uses protobuf encoding in the `ts` URL parameter. The scraper currently shows prices for Google's default dates (close to today), not your exact requested dates. Prices are indicative for the period.

2. **n8n Code node** — `child_process`, `fs`, and other Node.js built-ins are blocked in n8n's sandboxed Code node. That's why the scraper uses a separate HTTP server.

3. **Cron auto-expiry** — Claude Code crons auto-expire after 7 days. Use `durable: true` when creating them, or define them in `mission-control.md` so they're recreated on each session start.

4. **Email matching** — The Travel Organizer matches trips by destination name and date proximity. Unusual destination names or very different date formats in emails may not match correctly. You can always manually organize these on Notion.

5. **Gmail MCP can't send** — The Gmail MCP integration only supports creating drafts, not sending them. Use OpenCLI's browser automation (`opencli operate`) to open Gmail and click Send. This requires Chrome to be running with the Browser Bridge extension.

## Tips

- **Keep the tools server running** — use CLI-Anything's PM2 harness or a macOS LaunchAgent to auto-start it on boot
- **Add providers gradually** — start with your most-used airlines and hotels, then expand the `from:` filter
- **Test with a real booking** — forward yourself a past booking confirmation to verify the flow end-to-end
- **Monitor n8n executions** — check `http://localhost:5678` for failed workflow runs
- **iCloud for historical emails** — if you have booking confirmations in a non-Gmail account, set up IMAP access. The icloud-search webhook works with any IMAP server (adjust host/port in the script)
- **Startup checklist** — add the tools server and n8n health checks to your CLAUDE.md startup section so they're verified on every session start
- **Multiple email accounts** — the Travel Organizer scans Gmail via MCP tools. For other email providers, add them as iCloud-style IMAP scripts and webhook endpoints
- **OpenCLI for email sending** — when you need to send booking confirmations or replies, use `opencli operate` to control Gmail in your browser. Workflow: create draft → open drafts → click send
- **OpenCLI Gemini for hotel prices** — `opencli gemini` can access Google Hotels with real-time pricing for specific dates, bypassing the Playwright scraper's date encoding limitation
- **CLI-Anything for new tools** — if you need to automate a desktop app (e.g., a booking tool, PDF editor), run `/cli-anything <app-path>` to generate a complete CLI harness
