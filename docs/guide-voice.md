# Voice Notes — ElevenLabs TTS Integration

This guide adds voice note capabilities to Mission Control. Claude can speak briefings, reply to voice messages, and respond to "reply with voice" requests.

## Prerequisites

- **ElevenLabs API key** — free tier works ([elevenlabs.io](https://elevenlabs.io/))
- **ffmpeg** — for MP3 → OGG Opus conversion (Telegram-compatible voice notes)
- **Whisper** (optional) — for transcribing inbound Telegram voice messages locally

## 1. Install Dependencies

```bash
# ffmpeg (required for OGG conversion)
brew install ffmpeg

# Whisper (optional, for voice message transcription)
pip3 install openai-whisper
```

## 2. Store API Key

```bash
mkdir -p ~/mission-control/.secrets
echo "ELEVENLABS_API_KEY=your_key_here" > ~/mission-control/.secrets/elevenlabs.env
chmod 600 ~/mission-control/.secrets/elevenlabs.env
```

## 3. Test the TTS Script

The script is at `scripts/elevenlabs-tts.mjs`. Basic usage:

```bash
# Generate MP3
node ~/mission-control/scripts/elevenlabs-tts.mjs "Hello, this is a test"

# Generate OGG (Telegram voice note format)
node ~/mission-control/scripts/elevenlabs-tts.mjs --ogg "Hello, this is a test"

# Generate OGG and play locally
node ~/mission-control/scripts/elevenlabs-tts.mjs --ogg --play "Hello, this is a test"

# Custom output path
node ~/mission-control/scripts/elevenlabs-tts.mjs --ogg --out /tmp/my-note.ogg "Hello"
```

### Flags

| Flag | Effect |
|------|--------|
| `--ogg` | Convert output to OGG Opus mono 48kHz (Telegram voice note compatible) |
| `--play` | Play the result locally via macOS `afplay` |
| `--out <path>` | Write output to a specific file path |
| `--voice <id>` | Use a different ElevenLabs voice ID |

### Default Voice

George (`JBFqnCBsd6RMkjVDRZzb`) — warm, clear, works well with both English and Italian via the `eleven_multilingual_v2` model. Browse more voices at [elevenlabs.io/voice-library](https://elevenlabs.io/voice-library).

## 4. Presence Detection

The `scripts/mac-presence.sh` script detects whether you're at your Mac:
- Checks if the screensaver is running
- Reads HID idle time (threshold: 10 minutes)
- Returns `"present"` or `"absent"`

Used by the morning briefing to decide whether to also play the audio locally (`--play`) or just send it on Telegram.

```bash
bash ~/mission-control/scripts/mac-presence.sh
# → "present" or "absent"
```

## 5. Add to CLAUDE.md

Add the Voice section to your `CLAUDE.md` (see `CLAUDE-template.md` for the full section). The key elements:

### Three Automatic Triggers

1. **"Reply with voice"** — user says "reply with voice" (or equivalent). Generate voice and deliver on the same channel:
   - CLI message → `--play` (local playback), text reply in terminal
   - Telegram message → `--ogg --out /tmp/mc-reply-<ts>.ogg`, reply on Telegram with the OGG file

2. **Inbound Telegram voice message** — user sends a voice note on Telegram. Flow:
   - Download the `.oga` file via `download_attachment`
   - Transcribe with Whisper: `whisper --model small --language <lang> <file>`
   - Generate a short text response
   - Convert to OGG and reply on Telegram with the file

3. **Morning briefing** — always generate an abridged voice summary (800–1200 chars):
   - Run `mac-presence.sh` to check if user is at the Mac
   - If present: play locally AND send on Telegram
   - If absent: send on Telegram only

### Same-Channel Rule

Critical: voice replies go to the same channel as the incoming message. CLI→CLI (local playback), Telegram→Telegram (OGG file). Never cross channels.

### Telegram Voice Note Limitation

The Telegram bot plugin sends `.ogg` files as documents, not as native voice notes. The user sees a tap-to-play attachment — it works, but doesn't show the inline waveform UI.

### Text Length

Keep voice text under ~2000 characters to avoid ElevenLabs timeouts. For the morning briefing, generate an abridged version (800–1200 chars) rather than reading the entire text.

## 6. Whisper Setup (Optional)

For transcribing inbound voice messages:

```bash
# Install
pip3 install openai-whisper

# Usage (Claude runs this automatically when a voice message arrives)
whisper --model small --language Italian /path/to/voice.oga
```

The `small` model balances speed and accuracy. Use `medium` for better results on noisy audio.

## Architecture

```
Inbound voice message (Telegram)
  → download_attachment → .oga file
  → whisper transcription → text
  → Claude processes text
  → elevenlabs-tts.mjs --ogg → .ogg file
  → Telegram reply with OGG attachment

Morning briefing
  → Claude generates abridged text (800-1200 chars)
  → elevenlabs-tts.mjs --ogg [--play] → .ogg file
  → mac-presence.sh → present? also afplay
  → Telegram reply with OGG attachment + full text

"Reply with voice" (CLI)
  → elevenlabs-tts.mjs --play → local playback via afplay

"Reply with voice" (Telegram)
  → elevenlabs-tts.mjs --ogg → .ogg file
  → Telegram reply with OGG attachment
```
