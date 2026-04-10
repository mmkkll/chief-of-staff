# Fuel Prices & EV Charging — Skill Template

Rename this file to `fuel-prices.md` and fill in your details.

## Trigger
- "cheapest gas station nearby?"
- "diesel/gasoline price"
- "fuel near me"
- Telegram location pin → defaults to fuel mode
- "EV charging", "charging station", "charge point", "colonnina" → switches to EV mode
- Any request about fuel prices or EV charging

## Data Source
- Station registry: YOUR_REGISTRY_URL
- Daily prices: YOUR_PRICES_URL
- EV charging stations: Open Charge Map API (free, no API key required for basic use)

## Geolocation
- Home base: YOUR_CITY
- Coordinates: YOUR_LAT, YOUR_LON
- Default search radius: 10 km

## Logic — Fuel
1. Download both CSVs from government source
2. Filter by requested fuel type (default: Diesel)
3. Filter self-service only (isSelf = 1)
4. Calculate distance from reference point using Haversine formula
5. Sort by price ascending
6. Return top 3 cheapest stations within radius

## Logic — EV Charging
1. Determine reference position (Telegram location, coordinates, or geocode a place name)
2. Call Open Charge Map API with latitude/longitude and radius (default 10 km)
3. Filter for operational stations only (StatusType.IsOperational == true)
4. Sort by distance ascending
5. Return top 5 stations with operator, address, connectors, power, charge points

## Parameters
- Fuel type: Diesel (default), Gasoline, LPG, CNG
- Radius: 10 km default, customizable
- Mode: Self-service (default), Attended
- Position: from Telegram location, or home base if not specified

---

# EV Charging Stations — Open Charge Map + OpenStreetMap

## Strategy: query both sources in parallel, then merge

⚠️ **Open Charge Map requires an API key** (anonymous access → 403 since April 2026). See "How to get your own OCM API key" below — free registration in ~60 seconds. Store the key **outside the repo** (e.g. `~/mission-control/.secrets/openchargemap.key`, `chmod 600`) and **never commit it**.

Query both sources in parallel, then merge and dedup by geographic proximity (< 80 m apart):
1. **Open Charge Map** (primary — rich, structured data)
2. **OpenStreetMap Overpass** via the Kumi mirror (fallback / supplement, no key)

If OCM fails or returns few results, fall back to OSM. When both respond, OCM wins on conflicts because its data is more complete.

## Source 1 — Open Charge Map (with key)

```
https://api.openchargemap.io/v3/poi/?output=json&latitude=LAT&longitude=LON&distance=10&distanceunit=KM&maxresults=10&key=$(cat ~/mission-control/.secrets/openchargemap.key)
```

⚠️ **Do NOT use** `compact=true&verbose=false`: it strips `OperatorInfo.Title`, `ConnectionType.Title`, and `StatusType` and replaces them with raw IDs. Use the default response to get human-readable fields.

Useful parameters:
- `latitude`/`longitude`: reference position
- `distance`: radius in km (default: 10)
- `maxresults`: 10 (we then show top 5)
- `connectiontypeid`: connector type (25 = Type 2, 33 = CCS, 2 = CHAdeMO, 27 = Tesla Supercharger)
- `levelid`: 2 = AC slow, 3 = DC fast
- `operatorid`: filter by operator

POI fields used: `OperatorInfo.Title`, `AddressInfo` (Title, AddressLine1, Town, Distance), `Connections[].ConnectionType.Title + PowerKW + Quantity`, `StatusType.IsOperational`, `NumberOfPoints`. Filter `IsOperational==true`.

## Source 2 — OpenStreetMap Overpass (no key, fallback)

**Use the Kumi mirror**, not `overpass-api.de` which often returns 504:
```
POST https://overpass.kumi.systems/api/interpreter
data=[out:json][timeout:25];nwr["amenity"="charging_station"](around:RADIUS_M,LAT,LON);out center tags;
```
RADIUS_M is in meters (10 km → 10000).

Relevant tags: `operator` / `network` / `brand`, `name`, `addr:street`+`addr:housenumber`, `addr:city`/`addr:hamlet`/`addr:village`, `capacity`, `socket:type2`, `socket:type2_combo`, `socket:chademo`, `socket:tesla_supercharger`, `socket:*:output` (power kW). Often incomplete, especially for smaller operators.

## Merge logic

1. Resolve the position (Telegram location, coordinates, or geocode a place name)
2. Run OCM query and Overpass query in parallel
3. Compute Haversine distance from the reference point for each POI
4. Dedup: two stations within 80 m of each other are the same — prefer the OCM version
5. Filter OCM results on `IsOperational==true`
6. Sort by distance ascending
7. Return top 5

## Pricing Note
Charging prices are **NOT** in either source — they vary by operator and contract. Show operator and power, and suggest checking the price in the operator's app (Enel X, BeCharge, Ionity, Tesla, EVgo, etc.).

## Output Format (Telegram)
```
🔌 EV CHARGING STATIONS — within 10 km

1. [Operator] — [Station name]
   📍 [Address, City]
   📏 X.X km
   ⚡ [Connectors and power, e.g. "CCS 150 kW, Type 2 22 kW"]
   🔢 N charge points

2. ...

Source: Open Charge Map + OpenStreetMap · Check prices in the operator's app
```

## EV Parameters
- **Radius**: 10 km default, customizable
- **Number of results**: 5 default
- **Position**: from Telegram location or place name (geocoded)
- **Connector type**: all by default; filter only on explicit request

## How to get your own OCM API key (free)

Anonymous access to Open Charge Map **no longer works** (since April 2026 it returns `403 — You must specify an API key`). Registration is free, takes about 60 seconds, and only requires an email (or any OpenID provider).

1. Sign in at https://openchargemap.org/site/loginprovider/beginlogin (Google, Microsoft, GitHub, Apple, etc.).
2. Open your profile → **My Apps** (direct link: https://openchargemap.org/site/profile/applications).
3. Click **Register an Application**:
   - **App name**: anything descriptive (e.g. "chief-of-staff")
   - **Description**: short purpose (e.g. "Personal Telegram bot for EV charging stations")
   - **Website**: your repo URL or `https://github.com/<your-user>`
4. Submit. The page now shows your **API key** — a UUID (e.g. `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`). Copy it.
5. Store it **outside the repo**, with restrictive permissions:
   ```bash
   mkdir -p ~/mission-control/.secrets
   echo 'YOUR_KEY_HERE' > ~/mission-control/.secrets/openchargemap.key
   chmod 600 ~/mission-control/.secrets/openchargemap.key
   ```
   Add `.secrets/` to your `.gitignore`. **Never commit this file.**
6. The skill reads it at query time with `$(cat ~/mission-control/.secrets/openchargemap.key)`.

**Free tier limits**: a few hundred requests per hour per key — more than enough for a personal assistant. Need more? Request a higher tier from the same My Apps page.

**Without a key**: the skill falls back to OpenStreetMap Overpass (no key), but data is less complete (addresses, capacities, and connector details are often missing for smaller operators).
