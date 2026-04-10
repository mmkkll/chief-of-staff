# Build a Real-Time Fuel Price & EV Charging Finder with Claude Code

A step-by-step guide to building a fuel price lookup system that finds the cheapest gas stations — and the nearest EV charging stations — near any location, using government open data, Open Charge Map, and Telegram for on-the-go queries.

## What You'll Build

A system that:
- Finds the **3 cheapest fuel stations** near any location
- Finds the **5 nearest EV charging stations** with operator, connectors and power
- Uses **government open data** (updated daily) — no API keys needed for fuel
- Uses **Open Charge Map API** (free, no API key needed for basic use) for EV charging
- Works via **Telegram**: send a location pin or type a place name
- Supports **multiple fuel types**: diesel, gasoline, LPG, CNG
- Calculates **real distances** using the Haversine formula
- Returns station name, price per liter, address, and distance

## Tech Stack

| Component | Purpose | Required |
|-----------|---------|----------|
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | AI agent runtime | Yes |
| [Telegram Bot](https://core.telegram.org/bots) | Location input + results delivery | Yes |
| Python 3 | CSV processing + distance calculation | Yes |
| Government fuel data | Station registry + daily prices | Yes (free, no API key) |

## Data Sources by Country

| Country | Registry | Prices | Format | Update |
|---------|----------|--------|--------|--------|
| **Italy** | [MIMIT anagrafica](https://www.mimit.gov.it/images/exportCSV/anagrafica_impianti_attivi.csv) | [MIMIT prezzi](https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv) | CSV, `\|` separator | Daily 08:00 |
| **France** | [data.gouv.fr](https://www.data.gouv.fr/fr/datasets/prix-des-carburants-en-france-flux-instantane/) | Same file | XML/CSV | Real-time |
| **Germany** | [Tankerkönig](https://creativecommons.tankerkoenig.de/) | API endpoint | JSON | Real-time |
| **Spain** | [geoportalgasolineras.es](https://geoportalgasolineras.es/opendata) | Same endpoint | JSON | Daily |
| **UK** | [data.gov.uk](https://www.gov.uk/guidance/access-fuel-price-data) | CMA dataset | CSV | Weekly |
| **USA** | State-level or [GasBuddy](https://www.gasbuddy.com/) | Varies | Varies | Varies |

This guide uses Italy's MIMIT data as the reference implementation. Adapt the CSV parsing for your country's format.

## Prerequisites

- Claude Code installed and running
- Telegram bot configured (see [Mission Control guide](guide-mission-control.md))
- Python 3 available on your system
- Your home coordinates (latitude, longitude)

## Step-by-Step Build

### Step 1: Understand the Data Format

Italy's MIMIT publishes two CSV files:

**Station Registry** (`anagrafica_impianti_attivi.csv`):
```
Separator: | (pipe)
Line 1: "Estrazione del YYYY-MM-DD" (date header — SKIP)
Line 2: Column names (actual header)
Line 3+: Data

Columns:
idImpianto|Gestore|Bandiera|Tipo Impianto|Nome Impianto|Indirizzo|Comune|Provincia|Latitudine|Longitudine
```

**Daily Prices** (`prezzo_alle_8.csv`):
```
Same format: pipe separator, skip first line

Columns:
idImpianto|descCarburante|prezzo|isSelf|dtComu

- idImpianto: links to station registry
- descCarburante: fuel type (e.g., "Gasolio", "Benzina", "GPL", "Metano")
- prezzo: price per liter (e.g., "1.999")
- isSelf: 1 = self-service, 0 = attended
- dtComu: date of price report
```

### Step 2: Create the Skill File

Create `~/mission-control/skills/fuel-prices.md`:

```markdown
# Fuel Prices — Skill

## Trigger
- "cheapest gas station nearby?"
- "diesel/gasoline price"
- "fuel near me"
- Telegram location pin (sends coordinates as text)
- Any request about fuel prices

## Data Source
- Station registry: YOUR_REGISTRY_URL
- Daily prices: YOUR_PRICES_URL

## Geolocation
- Home base: YOUR_CITY
- Coordinates: YOUR_LAT, YOUR_LON
- Default search radius: 10 km

## Logic
1. Download both CSVs from government source
2. Filter by requested fuel type (default: Diesel)
3. Filter self-service only (isSelf = 1)
4. Calculate distance from reference point using Haversine formula
5. Sort by price ascending
6. Return top 3 cheapest stations within radius

## Output Format (Telegram)
⛽ CHEAPEST STATIONS — Diesel (self)

1. [Station Name]
   💰 €X.XXX/L
   📍 [Address], [City]
   📏 X.X km

2. ...
3. ...

Prices updated [date] — Source: YOUR_SOURCE

## Parameters
- Fuel type: Diesel (default), Gasoline, LPG, CNG
- Radius: 10 km default, customizable
- Mode: Self-service (default), Attended
- Position: from Telegram location, or home base if not specified
```

### Step 3: Add to CLAUDE.md

Add this section to your `CLAUDE.md`:

```markdown
## Fuel Prices
When asked about fuel prices or cheapest gas station:
- Follow the skill in `skills/fuel-prices.md`
- Source: government open data CSV (downloaded fresh each query)
- Default: Diesel, self-service, 10 km radius from YOUR_HOME_COORDINATES
- Return top 3 cheapest stations: name, price, address, distance
- If user sends a Telegram location, use those coordinates
- If user names a place, geocode it first
- If no location specified, use home base
```

### Step 4: The Python Script

Claude Code runs this inline when you ask for fuel prices. Here's the complete logic:

```python
import csv, io, math, urllib.request

# User's location (from Telegram location or default)
LAT0, LON0 = YOUR_LAT, YOUR_LON  # e.g., 43.4726, 11.7772
RADIUS_KM = 10
FUEL_TYPE = 'gasolio'  # or 'benzina', 'gpl', 'metano'

def haversine(lat1, lon1, lat2, lon2):
    """Calculate distance in km between two coordinates."""
    R = 6371  # Earth radius in km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat/2)**2 +
         math.cos(math.radians(lat1)) *
         math.cos(math.radians(lat2)) *
         math.sin(dlon/2)**2)
    return R * 2 * math.asin(math.sqrt(a))

# --- Step 1: Download and parse station registry ---
req = urllib.request.Request(
    "https://www.mimit.gov.it/images/exportCSV/anagrafica_impianti_attivi.csv",
    headers={"User-Agent": "Mozilla/5.0"})
raw = urllib.request.urlopen(req, timeout=30).read().decode('utf-8', errors='replace')
lines = raw.strip().split('\n')
# Skip line 0 (date header), use line 1 as column names
reader = csv.DictReader(
    io.StringIO('\n'.join([lines[1]] + lines[2:])),
    delimiter='|')

stations = {}
for row in reader:
    try:
        lat = float(row.get('Latitudine', '0').replace(',', '.'))
        lon = float(row.get('Longitudine', '0').replace(',', '.'))
        station_type = row.get('Tipo Impianto', '').strip().lower()
        # Skip highway stations, filter by distance
        if lat > 0 and lon > 0 and 'autostra' not in station_type:
            dist = haversine(LAT0, LON0, lat, lon)
            if dist <= RADIUS_KM:
                stations[row.get('idImpianto', '')] = {
                    'name': row.get('Bandiera', '?'),
                    'address': row.get('Indirizzo', '?').strip(),
                    'city': row.get('Comune', '?').strip(),
                    'dist': dist
                }
    except:
        pass

# --- Step 2: Download and parse prices ---
req2 = urllib.request.Request(
    "https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv",
    headers={"User-Agent": "Mozilla/5.0"})
raw2 = urllib.request.urlopen(req2, timeout=30).read().decode('utf-8', errors='replace')
lines2 = raw2.strip().split('\n')
reader2 = csv.DictReader(
    io.StringIO('\n'.join([lines2[1]] + lines2[2:])),
    delimiter='|')

results = []
for row in reader2:
    station_id = row.get('idImpianto', '')
    if station_id in stations:
        fuel = row.get('descCarburante', '').strip().lower()
        is_self = row.get('isSelf', '0').strip()
        price = row.get('prezzo', '0').replace(',', '.')
        if FUEL_TYPE in fuel and is_self == '1':
            try:
                p = float(price)
                if 0.5 < p < 3.0:  # sanity check
                    s = stations[station_id]
                    results.append({
                        'name': s['name'],
                        'price': p,
                        'address': s['address'],
                        'city': s['city'],
                        'dist': s['dist']
                    })
            except:
                pass

# --- Step 3: Sort by price and return top 3 ---
results.sort(key=lambda x: x['price'])
for i, r in enumerate(results[:3]):
    print(f"{i+1}. {r['name']} — €{r['price']:.3f}/L")
    print(f"   📍 {r['address']}, {r['city']}")
    print(f"   📏 {r['dist']:.1f} km")
```

### Step 5: Enable Telegram Location Support

The default Telegram plugin for Claude Code does **not** receive location pins. Add these handlers to the plugin source:

**File**: `~/.claude/plugins/cache/claude-plugins-official/telegram/<version>/server.ts`

**Add before** `bot.on('message:sticker')`:

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

Then run `/reload-plugins` in the Claude Code terminal.

After this modification:
- **Location pin** → arrives as `📍 Location: 43.466382, 11.685525`
- **Venue/place** → arrives as `📍 Venue: Ristorante XYZ — Via Roma 1 (43.466382, 11.685525)`

Claude parses the coordinates and uses them for the fuel search.

## Usage Examples

### Via Telegram text:
```
"cheapest diesel near me"          → uses home coordinates
"gasoline near Arezzo"             → geocodes "Arezzo" first
"diesel within 20 km"              → adjusts search radius
"LPG stations near highway exit"   → searches for GPL
```

### Via Telegram location:
1. Tap the 📎 attachment icon in Telegram
2. Select "Location"
3. Send your current position (or search for a place)
4. Claude responds with the 3 cheapest stations

### Query variations:
```
"3 closest stations to Levane"     → sorted by distance, not price
"all fuel types at nearest station" → shows diesel + gasoline + LPG
```

## How It Works

```
┌─────────────────┐     ┌──────────────────┐
│   Telegram       │     │   Claude Code     │
│                  │     │                   │
│  📍 Location pin ├────►│  Parse lat/lon    │
│  or text query   │     │       │           │
│                  │     │       ▼           │
│  ⛽ Top 3 results│◄────│  Download CSVs    │
│                  │     │  (government data)│
└─────────────────┘     │       │           │
                        │       ▼           │
                        │  Filter by:       │
                        │  - radius (10km)  │
                        │  - fuel type      │
                        │  - self-service   │
                        │       │           │
                        │       ▼           │
                        │  Haversine dist   │
                        │  Sort by price    │
                        │  Return top 3     │
                        └──────────────────┘

Data flow:
  Government CSV ──→ Station registry (lat/lon, address)
                 ──→ Price list (fuel type, price, self/attended)
                 ──→ Join on idImpianto
                 ──→ Filter + sort
                 ──→ Telegram response
```

## Adapting for Your Country

To use this system outside Italy:

1. **Find your data source** — check the table above or search for "[your country] fuel prices open data"

2. **Adapt the CSV parser** — change:
   - URL endpoints
   - Separator character (`,` or `;` or `|` or `\t`)
   - Column names (latitude, longitude, price, fuel type)
   - Fuel type keywords (e.g., "diesel" vs "gasolio" vs "gazole")
   - Header handling (some files have metadata rows to skip)

3. **Adjust fuel types** — map to your country's naming:
   ```
   Diesel:    gasolio (IT), gazole (FR), diesel (DE/ES/UK/US)
   Gasoline:  benzina (IT), SP95/SP98 (FR), Super E10 (DE), unleaded (UK), regular (US)
   LPG:       GPL (IT/FR), autogas (DE/UK), propane (US)
   CNG:       metano (IT), GNV (FR), erdgas (DE), CNG (UK/US)
   ```

4. **Update coordinates** — set your home location and default search radius

5. **Test** — run the Python script manually first to verify parsing works

## Limitations

- **Prices update daily** — not real-time. The CSV reflects prices reported by 08:00
- **Not all stations report** — some independent stations may not be in the registry
- **Highway stations excluded** — by default (they're always more expensive). Remove the `'autostra' not in station_type` filter to include them
- **Distance is straight-line** — Haversine gives "as the crow flies" distance, not driving distance. A station 5 km away by Haversine might be 8 km by road
- **Telegram location patch** — the plugin modification may be overwritten on plugin updates. Re-apply after `claude plugin update`

## Tips

- **Cache the CSVs** — if you query frequently, consider caching the downloaded files for 1 hour instead of re-downloading each time
- **Exclude highway stations** — they're typically 20-30% more expensive
- **Self-service vs attended** — self-service is almost always cheaper. Default to self-service unless asked otherwise
- **Combine with travel** — when the Travel Agent plans a road trip, automatically include fuel stops along the route
- **Night hours** — some stations are self-service only at night, which may affect availability

---

## Extension: EV Charging Stations

Government fuel data **does not cover EV charging points**. For that, use [Open Charge Map](https://openchargemap.org/site/develop/api) — a free, global, community-maintained registry that exposes a public REST API. **No API key is required for basic use** (rate-limited but generous).

### Coverage

| Region | Coverage |
|--------|----------|
| Europe | Excellent (Italy, France, Germany, Spain, UK, Nordics, NL, BE, etc.) |
| North America | Excellent |
| Asia/Oceania | Good (varies by country) |
| South America/Africa | Limited but growing |

### API Endpoint

```
https://api.openchargemap.io/v3/poi/?output=json&latitude=43.4833&longitude=11.7833&distance=10&distanceunit=KM&maxresults=5&compact=true&verbose=false
```

### Useful Parameters

| Parameter | Description |
|-----------|-------------|
| `latitude` / `longitude` | Reference position (decimal) |
| `distance` | Search radius |
| `distanceunit` | `KM` or `MI` |
| `maxresults` | Number of results to return |
| `connectiontypeid` | Filter by connector: `25` = Type 2, `33` = CCS, `2` = CHAdeMO, `27` = Tesla Supercharger |
| `levelid` | `2` = AC slow, `3` = DC fast |
| `operatorid` | Filter by operator (Ionity, Tesla, Enel X, BeCharge, EVgo, etc.) |
| `compact=true` | Reduces response size |
| `verbose=false` | Removes extra metadata |

### Returned Fields

Each Point of Interest (`POI`) includes:

```json
{
  "ID": 12345,
  "OperatorInfo": { "Title": "Enel X" },
  "AddressInfo": {
    "Title": "Stazione di ricarica",
    "AddressLine1": "Via Roma 1",
    "Town": "Levane",
    "Latitude": 43.518,
    "Longitude": 11.628,
    "Distance": 0.4
  },
  "Connections": [
    {
      "ConnectionType": { "Title": "CCS (Type 2)" },
      "PowerKW": 150,
      "Quantity": 2
    }
  ],
  "StatusType": { "IsOperational": true },
  "NumberOfPoints": 4
}
```

### Important: Pricing Is Not in the API

Charging prices are **not** available via Open Charge Map — they vary by operator, contract, and time of day. Show the operator name and connector power, and direct the user to the operator's app (Enel X, BeCharge, Ionity, Tesla, EVgo, etc.) to check the current rate.

### Python Snippet

```python
import json
import urllib.request

LAT, LON = 43.4833, 11.7833
RADIUS_KM = 10
MAX_RESULTS = 5

url = (
    "https://api.openchargemap.io/v3/poi/"
    f"?output=json&latitude={LAT}&longitude={LON}"
    f"&distance={RADIUS_KM}&distanceunit=KM"
    f"&maxresults={MAX_RESULTS}&compact=true&verbose=false"
)

req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
data = json.load(urllib.request.urlopen(req, timeout=30))

# Filter operational stations and sort by distance
stations = [
    p for p in data
    if p.get("StatusType", {}).get("IsOperational")
]
stations.sort(key=lambda p: p.get("AddressInfo", {}).get("Distance", 9999))

for i, p in enumerate(stations[:MAX_RESULTS], 1):
    addr = p.get("AddressInfo", {})
    op = p.get("OperatorInfo", {}).get("Title", "Unknown")
    conns = p.get("Connections", []) or []
    conn_str = ", ".join(
        f"{c.get('ConnectionType', {}).get('Title', '?')} {c.get('PowerKW', '?')} kW"
        for c in conns
    )
    print(f"{i}. {op} — {addr.get('Title', '?')}")
    print(f"   📍 {addr.get('AddressLine1', '')}, {addr.get('Town', '')}")
    print(f"   📏 {addr.get('Distance', '?'):.1f} km")
    print(f"   ⚡ {conn_str}")
    print(f"   🔢 {p.get('NumberOfPoints', '?')} charge points")
```

### Telegram Output Format

```
🔌 EV CHARGING — within 10 km

1. Enel X — Stazione di ricarica
   📍 Via Roma 1, Levane
   📏 0.4 km
   ⚡ CCS 150 kW, Type 2 22 kW
   🔢 4 charge points

2. ...

Source: Open Charge Map · Check prices in the operator's app
```

### Trigger Words

Add these to your skill's trigger list to route requests to EV mode:
- "EV charging", "charging station", "charge point"
- "colonnina", "ricarica elettrica" (Italian)
- "borne de recharge" (French)
- "Ladestation" (German)

When a Telegram location pin arrives without text, default to fuel mode. Switch to EV mode only if the text mentions one of the trigger words above.

### Rate Limits & API Key

Open Charge Map's basic endpoint works without authentication, but rate limits apply (a few hundred requests per hour per IP). For higher volumes:
1. Register at https://openchargemap.org/site/loginprovider/beginlogin
2. Request an API key from your account page
3. Pass it as `key=YOUR_KEY` in the query string

For a personal Chief of Staff use case, anonymous access is more than enough.
