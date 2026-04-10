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

# EV Charging Stations — Open Charge Map

## API
Open Charge Map (free, no API key required for basic use):

```
https://api.openchargemap.io/v3/poi/?output=json&latitude=43.4833&longitude=11.7833&distance=10&distanceunit=KM&maxresults=5&compact=true&verbose=false
```

## Useful Parameters
- `latitude`/`longitude`: reference position
- `distance`: radius in km
- `maxresults`: number of results
- `connectiontypeid`: connector type (25 = Type 2, 33 = CCS, 2 = CHAdeMO)
- `levelid`: 2 = AC slow, 3 = DC fast
- `operatorid`: filter by operator

## Returned Data
Each station includes: operator name, address, coordinates, connector types, power in kW, number of charge points, status (operational / out of service).

## Pricing Note
Charging prices are **NOT** in the API — they vary by operator and contract. Show operator and power, and suggest checking the price in the operator's app (Enel X, BeCharge, Ionity, Tesla, Ionity, EVgo, etc.).

## Output Format (Telegram)
```
🔌 EV CHARGING STATIONS — within 10 km

1. [Operator] — [Station name]
   📍 [Address]
   📏 X.X km
   ⚡ [Connectors and power, e.g. "CCS 150 kW, Type 2 22 kW"]
   🔢 N charge points

2. ...

Source: Open Charge Map · Check prices in the operator's app
```

## EV Parameters
- **Radius**: 10 km default, customizable
- **Number of results**: 5 default
- **Position**: from Telegram location or place name (geocoded)
- **Connector type**: all by default; filter only on explicit request
