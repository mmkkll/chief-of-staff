# Telegram channel — keeping the persistent session healthy

The framework relies on `claude --channels plugin:telegram@claude-plugins-official`
running as a long-poll Telegram bot. This document covers the operational
reality of keeping that session reliable.

## How it works (short version)

- Telegram → bot via **long-polling** (`getUpdates`). NO `setWebhook` is set, so
  Telegram's 60s webhook timeout doesn't apply.
- The plugin spawns a `bun server.ts` child process that does the polling and
  forwards updates to the Claude REPL via MCP `notifications/claude/channel`.
- Outbound: the model calls `mcp__plugin_telegram_telegram__reply` (or `tg-send.sh`
  for headless contexts) to send messages.

## Known failure modes

### 1. bun child dies silently (claude orphan)

**Symptom**: claude --channels alive, but `pgrep -f "bun.*server.ts"` returns
nothing. Inbound messages stop arriving at the REPL.

**Cause**: bun runtime can crash without taking down its parent. Frequency
varies — observed crashes every 30-90 minutes on some setups.

**Detection**: `channels-watchdog.sh` checks `BUN_PID` every 10 minutes.

**Fix**: watchdog kickstarts the LaunchAgent automatically.

### 2. bun zombie (alive but not polling)

**Symptom**: `pgrep -f "bun.*server.ts"` returns a PID, but `lsof -p $BUN_PID |
grep ESTABLISHED.*149.154.166` returns 0 (no TCP connections to Telegram).

**Cause**: bun's polling socket closes silently and bun doesn't reconnect.
Inbound messages are consumed by Telegram side (offset advances) but never
forwarded to the REPL.

**Detection**: `channels-watchdog.sh` also checks TCP count, restarts on 0.

**Fix**: watchdog kickstart.

### 3. bun alive + TCP alive but routing dead

**Symptom**: bun running, TCP ESTABLISHED, but the Claude debug log
(`/tmp/claude-channels-debug.log`) stops getting fresh
`notifications/claude/channel:` entries despite Telegram inbound activity.

**Cause**: rare race where the MCP notification roundtrip stalls inside
claude, leaving the session unable to dispatch messages even though all
underlying connections are healthy.

**Detection**: not currently caught by the basic watchdog. Add a heartbeat
check that compares the last `notifications/claude/channel` timestamp in the
debug log against a peek of `getUpdates` to see if Telegram-side has activity
the REPL hasn't seen.

**Fix**: same kickstart procedure.

## Why `tail -f FIFO | script -q` to launch claude

Without these tricks, claude detects no TTY and falls into print mode (no
interactive REPL = inbound channel notifications die).

- `tail -f` on a FIFO never sends EOF → claude stays alive
- `script -q` creates a PTY → claude runs the interactive REPL

See `scripts/start-claude-channels-fifo.sh`.

## Why **NO** `--plugin-dir`

```
# WRONG — silently breaks channel notifications:
claude --channels plugin:telegram@claude-plugins-official \
  --plugin-dir ~/.claude/plugins/cache/.../telegram/0.0.6
```

`--plugin-dir` loads the plugin as an "inline" source, which mismatches the
channel arg `plugin:telegram@claude-plugins-official` (which expects a
marketplace-resolved plugin). The mismatch is silent — the plugin loads, but
channel notifications are dropped server-side.

**Fix**: enable the plugin via `~/.claude/settings.json` and let claude resolve
it from the marketplace cache:

```json
{
  "enabledPlugins": {
    "telegram@claude-plugins-official": true
  }
}
```

## Outbound from headless / cron contexts

A headless `claude -p` does NOT have the channels plugin loaded. To send
Telegram from a cron or one-shot script, use `scripts/tg-send.sh`:

```bash
export TELEGRAM_BOT_TOKEN="..."
export TELEGRAM_CHAT_ID="..."
scripts/tg-send.sh "✅ Cron finished"
```

The script has guardrails: it refuses to send if the text looks like a bare
chat_id (8-12 digits only) — this catches argument-swap bugs where an agent
passes the chat_id as the message body.

## Recap notifications

`channels-watchdog-digest.sh` (LaunchAgent every 4h, e.g. 08:00/12:00/16:00/
20:00) summarises the last 4h of restarts. Silent if 0 restarts; useful when
debugging instability spikes.
