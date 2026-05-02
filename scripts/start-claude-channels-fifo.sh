#!/bin/bash
# start-claude-channels-fifo.sh — start claude --channels with a FIFO to keep stdin
# open + `script` for a pseudo-TTY. Without these tricks, claude detects no TTY and
# falls into print mode (no interactive REPL = inbound channel notifications die).
#
# - tail -f on FIFO never sends EOF → claude stays alive
# - script -q creates a PTY → claude runs the interactive REPL
#
# Setup: this script is invoked by your channels-session LaunchAgent. It expects:
#   - claude CLI on PATH (default: $HOME/.local/bin/claude)
#   - The official Telegram channel plugin enabled in your settings.json:
#       { "enabledPlugins": { "telegram@claude-plugins-official": true } }
#   - The marketplace claude-plugins-official already added:
#       claude plugin marketplace add anthropics/claude-plugins-official
#
# IMPORTANT: do NOT pass --plugin-dir. Doing so loads the plugin as an "inline"
# source which mismatches the channel arg "plugin:telegram@claude-plugins-official"
# (which requires source = marketplace "claude-plugins-official"). The mismatch
# silently drops channel notifications. Let claude resolve the plugin via the
# user-level enabledPlugins + marketplace cache.

# Adjust PATH to include where bun/claude live in your environment.
export PATH="$HOME/.bun/bin:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

CLAUDE_BIN="${CLAUDE_BIN:-$HOME/.local/bin/claude}"
FIFO="/tmp/claude-stdin"

rm -f "$FIFO"
mkfifo "$FIFO"

exec tail -f "$FIFO" | script -q /dev/null \
  "$CLAUDE_BIN" \
  --channels "plugin:telegram@claude-plugins-official" \
  --dangerously-skip-permissions \
  --debug-file /tmp/claude-channels-debug.log \
  --debug api,channels,mcp,plugin
