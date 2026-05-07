#!/usr/bin/env node
/**
 * Add an extra IMAP account to an existing jgalea/mailbox-mcp installation
 * without rewriting the previously-configured aliases.
 *
 * Usage:
 *   node add-mailbox-account.mjs <alias> <env_file>
 *
 * The env file must define:
 *   GMAIL_<ALIAS>_EMAIL=user@example.com
 *   GMAIL_<ALIAS>_APP_PASSWORD=xxxx xxxx xxxx xxxx
 *
 * Reuses the existing MAILBOX_MCP_PASSPHRASE (saved by the original
 * mailbox-mcp-bootstrap.mjs) so the new account is encrypted with the same
 * key and the running mailbox MCP can decrypt it on next reload.
 *
 * After running this, restart the channels session (kickstart -k) so
 * mailbox MCP reloads accounts.json from disk.
 *
 * Defaults to Gmail IMAP host. For other providers, edit the host/port block
 * below or extend the script to read host/port from the env file.
 */

import { randomBytes, createCipheriv, pbkdf2Sync } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CONFIG_DIR = join(homedir(), ".mailbox-mcp");
const ACCOUNTS_PATH = join(CONFIG_DIR, "accounts.json");
const PASSPHRASE_FILE = join(homedir(), "mission-control", ".secrets", "mailbox-mcp.env");

if (process.argv.length < 4) {
  console.error("Usage: add-mailbox-account.mjs <alias> <env_file>");
  console.error("  env file must define GMAIL_<ALIAS>_EMAIL and GMAIL_<ALIAS>_APP_PASSWORD");
  process.exit(1);
}

const ALIAS = process.argv[2];
const ENV_FILE = process.argv[3];

function readEnvFile(path) {
  const lines = readFileSync(path, "utf-8").split("\n");
  const env = {};
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const [k, ...rest] = t.split("=");
    env[k.trim()] = rest.join("=").trim();
  }
  return env;
}

function ensureDir(p) { if (!existsSync(p)) mkdirSync(p, { recursive: true, mode: 0o700 }); }
function secureWrite(p, content) { writeFileSync(p, content, { mode: 0o600 }); }
function deriveKey(passphrase, salt) { return pbkdf2Sync(passphrase, salt, 100_000, 32, "sha256"); }

function encryptCredentials(alias, creds, passphrase) {
  const salt = randomBytes(32);
  const key = deriveKey(passphrase, salt);
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = JSON.stringify(creds);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const stored = {
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    data: encrypted.toString("base64"),
  };
  const accountDir = join(CONFIG_DIR, "accounts", alias);
  ensureDir(accountDir);
  secureWrite(join(accountDir, "credentials.json"), JSON.stringify(stored, null, 2));
}

const passphrase = readEnvFile(PASSPHRASE_FILE).MAILBOX_MCP_PASSPHRASE;
if (!passphrase) {
  console.error(`missing MAILBOX_MCP_PASSPHRASE in ${PASSPHRASE_FILE}`);
  process.exit(1);
}

const aliasUpper = ALIAS.toUpperCase();
const envVars = readEnvFile(ENV_FILE);
const email = envVars[`GMAIL_${aliasUpper}_EMAIL`];
const password = envVars[`GMAIL_${aliasUpper}_APP_PASSWORD`];
if (!email || !password) {
  console.error(`missing GMAIL_${aliasUpper}_EMAIL or GMAIL_${aliasUpper}_APP_PASSWORD in ${ENV_FILE}`);
  process.exit(1);
}

// Read existing accounts.json (preserves previously-configured aliases)
const current = JSON.parse(readFileSync(ACCOUNTS_PATH, "utf-8"));
current.accounts[ALIAS] = {
  provider: "imap",
  email,
  host: "imap.gmail.com",
  port: 993,
  smtpHost: "smtp.gmail.com",
  smtpPort: 587,
};
secureWrite(ACCOUNTS_PATH, JSON.stringify(current, null, 2));
console.log(`Added "${ALIAS}" to ${ACCOUNTS_PATH}`);

encryptCredentials(ALIAS, { username: email, password }, passphrase);
console.log(`Wrote encrypted credentials for alias "${ALIAS}" (${email})`);

console.log("\nNext step: restart channels session so mailbox MCP reloads:");
console.log("  launchctl kickstart -k gui/$(id -u)/com.YOUR_USER.missioncontrol");
