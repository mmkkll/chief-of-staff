#!/usr/bin/env node
/**
 * Sunsama Session Token Auto-Refresh
 *
 * Visits app.sunsama.com with a persistent authenticated Chromium profile,
 * refreshes the rolling session server-side, and writes the current JWT
 * session cookie to ~/mission-control/.secrets/sunsama.env so the Sunsama
 * MCP (robertn702/mcp-sunsama) picks it up on the next Claude Code restart.
 *
 * First-time setup (manual Google SSO login in a visible browser):
 *   node sunsama-refresh-token.mjs --setup
 *
 * Automated refresh (headless, launchd every ~20 days):
 *   node sunsama-refresh-token.mjs
 */

import { chromium } from 'playwright';
import { mkdir, rename, chmod, writeFile, appendFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HOME = homedir();
const PROFILE_DIR = join(HOME, 'mission-control', '.sunsama-chrome-profile');
const SECRET_FILE = join(HOME, 'mission-control', '.secrets', 'sunsama.env');
const LOG_DIR = join(HOME, 'mission-control', 'logs');
const LOG_FILE = join(LOG_DIR, 'sunsama-refresh.log');
const SUNSAMA_URL = 'https://app.sunsama.com';
const SETUP = process.argv.includes('--setup');

async function log(level, msg) {
  const line = `${new Date().toISOString()} [${level}] ${msg}\n`;
  process.stdout.write(line);
  try {
    await mkdir(LOG_DIR, { recursive: true });
    await appendFile(LOG_FILE, line);
  } catch {}
}

async function ensureProfileDir() {
  await mkdir(PROFILE_DIR, { recursive: true });
  await chmod(PROFILE_DIR, 0o700);
}

async function writeSecret(token) {
  const content = `SUNSAMA_SESSION_TOKEN=${token}\n`;
  const tmp = `${SECRET_FILE}.tmp.${process.pid}`;
  await writeFile(tmp, content);
  await chmod(tmp, 0o600);
  await rename(tmp, SECRET_FILE);
}

async function findJwtCookie(context) {
  const cookies = await context.cookies();
  const jwtCookies = cookies.filter(
    (c) => typeof c.value === 'string' && c.value.startsWith('eyJ')
  );
  if (jwtCookies.length === 0) return null;
  const sunsamaCookies = jwtCookies.filter((c) =>
    (c.domain || '').includes('sunsama')
  );
  return sunsamaCookies[0] || jwtCookies[0];
}

async function waitForAuthenticated(page, timeoutMs = 180_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const url = page.url();
    const unauth = url.includes('/login') || url.includes('/auth') || url.includes('accounts.google');
    if (url.startsWith('https://app.sunsama.com/') && !unauth) {
      await page.waitForTimeout(2500);
      return true;
    }
    await page.waitForTimeout(1000);
  }
  return false;
}

async function main() {
  await ensureProfileDir();

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: !SETUP,
    viewport: { width: 1280, height: 800 },
  });

  try {
    const page = await context.newPage();
    await log('INFO', `Opening ${SUNSAMA_URL} (${SETUP ? 'setup/visible' : 'headless'})`);
    await page.goto(SUNSAMA_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});

    if (SETUP) {
      await log('INFO', 'Setup mode — complete Google SSO in the browser. Waiting up to 3 min…');
      const ok = await waitForAuthenticated(page);
      if (!ok) {
        await log('ERROR', 'Timed out waiting for login. Re-run --setup.');
        process.exitCode = 2;
        return;
      }
    } else {
      const url = page.url();
      if (url.includes('/login') || url.includes('/auth') || url.includes('accounts.google')) {
        await log('ERROR', 'Not authenticated. Run with --setup first.');
        process.exitCode = 3;
        return;
      }
      await page.waitForTimeout(3000);
    }

    const jwt = await findJwtCookie(context);
    if (!jwt) {
      await log('ERROR', 'No JWT cookie (eyJ…) found on sunsama.com');
      process.exitCode = 4;
      return;
    }

    await writeSecret(jwt.value);
    await log(
      'INFO',
      `Refreshed token from cookie "${jwt.name}" (domain=${jwt.domain}); wrote ${SECRET_FILE}`
    );
  } finally {
    await context.close();
  }
}

main().catch(async (err) => {
  await log('ERROR', `Uncaught: ${err?.stack || err}`);
  process.exitCode = 1;
});
