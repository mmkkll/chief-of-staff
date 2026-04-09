# Fuel Prices — Skill Template

Rename this file to `fuel-prices.md` and fill in your details.

## Trigger
- "cheapest gas station nearby?"
- "diesel/gasoline price"
- "fuel near me"
- Telegram location pin

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

## Parameters
- Fuel type: Diesel (default), Gasoline, LPG, CNG
- Radius: 10 km default, customizable
- Mode: Self-service (default), Attended
- Position: from Telegram location, or home base if not specified
