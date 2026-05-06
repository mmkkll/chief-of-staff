#!/usr/bin/env node
/**
 * Weather forecast helper for Travel Agent + Travel Organizer.
 *
 * Backend: Open-Meteo (https://open-meteo.com) — free, no API key.
 *
 * Tiered behavior based on date range:
 *   - <= 16 days from now → daily forecast (high accuracy)
 *   - >  16 days          → climatology fallback (historical mean for the
 *                            same calendar dates over the last 10 years)
 *
 * Usage:
 *   node weather-forecast.mjs --city "Madrid" --start 2026-05-10 --end 2026-05-15
 *   node weather-forecast.mjs --city "Tokyo" --start 2026-09-01 --end 2026-09-07 --json
 *   node weather-forecast.mjs --lat 40.4 --lon -3.7 --start 2026-05-10 --end 2026-05-15
 */

const OPEN_METEO_GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';
const OPEN_METEO_FORECAST = 'https://api.open-meteo.com/v1/forecast';
const OPEN_METEO_ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';

const DAILY_VARS = [
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_sum',
  'precipitation_probability_max',
  'wind_speed_10m_max',
  'weather_code',
];

const ARCHIVE_VARS = [
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_sum',
];

function parseArgs(argv) {
  const args = { json: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a.startsWith('--')) args[a.slice(2)] = argv[++i];
  }
  return args;
}

async function geocode(city) {
  const url = `${OPEN_METEO_GEOCODE}?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`geocode HTTP ${r.status}`);
  const data = await r.json();
  if (!data.results || data.results.length === 0) {
    throw new Error(`no geocoding match for "${city}"`);
  }
  const top = data.results[0];
  return {
    name: top.name,
    country: top.country,
    admin1: top.admin1,
    lat: top.latitude,
    lon: top.longitude,
    timezone: top.timezone,
  };
}

function isoDateOnly(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function daysFromNow(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const now = new Date();
  return Math.ceil((d - now) / 86400000);
}

async function fetchForecast(lat, lon, start, end) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    daily: DAILY_VARS.join(','),
    timezone: 'auto',
    start_date: start,
    end_date: end,
  });
  const r = await fetch(`${OPEN_METEO_FORECAST}?${params}`);
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`forecast HTTP ${r.status}: ${txt.slice(0, 200)}`);
  }
  return r.json();
}

async function fetchHistoricalYear(lat, lon, mmddStart, mmddEnd, year) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    start_date: `${year}-${mmddStart}`,
    end_date: `${year}-${mmddEnd}`,
    daily: ARCHIVE_VARS.join(','),
    timezone: 'auto',
  });
  const r = await fetch(`${OPEN_METEO_ARCHIVE}?${params}`);
  if (!r.ok) return null;
  return r.json();
}

async function fetchClimatology(lat, lon, start, end) {
  // Average the last 10 years for the same calendar window
  const startMMDD = start.slice(5);
  const endMMDD = end.slice(5);
  const currentYear = new Date().getUTCFullYear();
  const years = [];
  for (let y = currentYear - 11; y < currentYear - 1; y++) years.push(y);

  const all = await Promise.all(
    years.map((y) => fetchHistoricalYear(lat, lon, startMMDD, endMMDD, y).catch(() => null))
  );
  const valid = all.filter(Boolean);
  if (valid.length === 0) throw new Error('no historical data available');

  // Average per-day index across years
  const numDays = valid[0]?.daily?.time?.length ?? 0;
  const out = {
    time: valid[0].daily.time.map((t) => `${start.slice(0, 4)}-${t.slice(5)}`),
    temperature_2m_max: [],
    temperature_2m_min: [],
    precipitation_sum: [],
    precipitation_probability_max: [],
    rainy_days_pct: [],
  };
  for (let i = 0; i < numDays; i++) {
    const maxTemps = valid.map((d) => d.daily.temperature_2m_max[i]).filter((v) => v != null);
    const minTemps = valid.map((d) => d.daily.temperature_2m_min[i]).filter((v) => v != null);
    const precip = valid.map((d) => d.daily.precipitation_sum[i]).filter((v) => v != null);
    out.temperature_2m_max.push(round1(avg(maxTemps)));
    out.temperature_2m_min.push(round1(avg(minTemps)));
    out.precipitation_sum.push(round1(avg(precip)));
    const rainyShare = precip.filter((p) => p > 1).length / Math.max(precip.length, 1);
    out.rainy_days_pct.push(Math.round(rainyShare * 100));
    out.precipitation_probability_max.push(null); // not computable from archive
  }
  return { mode: 'climatology', years_used: valid.length, daily: out };
}

function avg(arr) {
  if (arr.length === 0) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function round1(v) {
  return v == null ? null : Math.round(v * 10) / 10;
}

const WEATHER_CODE_LABEL = {
  0: 'sereno',
  1: 'prevalentemente sereno',
  2: 'parz. nuvoloso',
  3: 'coperto',
  45: 'nebbia',
  48: 'nebbia gelata',
  51: 'pioviggine leggera',
  53: 'pioviggine',
  55: 'pioviggine forte',
  61: 'pioggia leggera',
  63: 'pioggia',
  65: 'pioggia forte',
  71: 'neve leggera',
  73: 'neve',
  75: 'neve forte',
  80: 'rovesci leggeri',
  81: 'rovesci',
  82: 'rovesci forti',
  95: 'temporale',
  96: 'temporale + grandine',
  99: 'temporale forte + grandine',
};

function summarize(loc, payload) {
  const lines = [];
  lines.push(`📍 ${loc.name}${loc.admin1 ? ', ' + loc.admin1 : ''}${loc.country ? ' (' + loc.country + ')' : ''} — lat ${loc.lat.toFixed(2)}, lon ${loc.lon.toFixed(2)}`);
  if (payload.mode === 'climatology') {
    lines.push(`📊 Climatologia (media ${payload.years_used} anni — disclaimer: previsione esatta T-7gg)`);
  } else {
    lines.push(`🌤️ Forecast (Open-Meteo, aggiornato ora)`);
  }
  const d = payload.daily;
  for (let i = 0; i < d.time.length; i++) {
    const date = d.time[i];
    const tmax = d.temperature_2m_max[i];
    const tmin = d.temperature_2m_min[i];
    const precip = d.precipitation_sum[i];
    const probRain = d.precipitation_probability_max?.[i];
    const code = d.weather_code?.[i];
    const label = code != null ? (WEATHER_CODE_LABEL[code] || `code ${code}`) : null;
    let line = `  ${date} — ${tmax != null ? tmax + '°' : '?'} / ${tmin != null ? tmin + '°' : '?'}`;
    if (label) line += ` · ${label}`;
    if (precip != null && precip > 0) line += ` · ${precip}mm`;
    if (probRain != null) line += ` · ${probRain}% pioggia`;
    if (payload.mode === 'climatology' && d.rainy_days_pct?.[i] != null) {
      line += ` · ${d.rainy_days_pct[i]}% giorni storicamente piovosi`;
    }
    lines.push(line);
  }
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.start || !args.end) {
    console.error('Usage: weather-forecast.mjs --city <name>|--lat <n> --lon <n> --start YYYY-MM-DD --end YYYY-MM-DD [--json]');
    process.exit(1);
  }

  let loc;
  if (args.lat && args.lon) {
    loc = {
      name: args.city || `${args.lat},${args.lon}`,
      country: '',
      admin1: '',
      lat: parseFloat(args.lat),
      lon: parseFloat(args.lon),
      timezone: 'auto',
    };
  } else if (args.city) {
    loc = await geocode(args.city);
  } else {
    console.error('Need --city or --lat+--lon');
    process.exit(1);
  }

  const startISO = isoDateOnly(args.start);
  const endISO = isoDateOnly(args.end);
  const horizonStart = daysFromNow(startISO);
  const horizonEnd = daysFromNow(endISO);

  let payload;
  if (horizonStart <= 16 && horizonEnd <= 16) {
    const data = await fetchForecast(loc.lat, loc.lon, startISO, endISO);
    payload = { mode: 'forecast', daily: data.daily };
  } else {
    payload = await fetchClimatology(loc.lat, loc.lon, startISO, endISO);
  }

  if (args.json) {
    console.log(JSON.stringify({ location: loc, ...payload }, null, 2));
  } else {
    console.log(summarize(loc, payload));
  }
}

main().catch((err) => {
  console.error(`ERR: ${err.message}`);
  process.exit(2);
});
