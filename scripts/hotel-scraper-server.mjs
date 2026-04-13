#!/usr/bin/env node
/**
 * Mission Control Tools Server
 * Runs on port 3847. Called by n8n via HTTP Request node.
 *
 * POST /scrape          { city, checkin, checkout, hotels }  → Google Hotels prices
 * POST /icloud-search   { query, from, since, limit }       → iCloud IMAP email search
 * GET  /health                                               → status check
 *
 * Start: node hotel-scraper-server.mjs
 * Stop: kill $(lsof -t -i:3847)
 */

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
        if (input.mailbox) args.push(`--mailbox "${input.mailbox.replace(/"/g, '')}"`);

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
  console.log(`Mission Control Tools Server on http://localhost:${PORT}`);
  console.log(`GET  /health         → status`);
  console.log(`POST /scrape         → Google Hotels prices`);
  console.log(`POST /icloud-search  → iCloud email search`);
});
