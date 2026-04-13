#!/usr/bin/env node
/**
 * ElevenLabs TTS helper.
 *
 * Usage:
 *   node elevenlabs-tts.mjs "text to speak" [--out /path/out.mp3] [--voice <id>] [--ogg] [--play]
 *
 * Defaults:
 *   voice  = George (JBFqnCBsd6RMkjVDRZzb) — warm, multilingual_v2-friendly
 *   out    = /tmp/mc-tts-<timestamp>.mp3 (or .ogg when --ogg)
 *   model  = eleven_multilingual_v2
 *
 * Flags:
 *   --ogg   convert MP3 → OGG Opus (voice-note compatible for Telegram) via ffmpeg
 *   --play  play via macOS afplay after generating
 *
 * API key is read from ~/mission-control/.secrets/elevenlabs.env or $ELEVENLABS_API_KEY.
 * Prints the output file path to stdout on success; exits non-zero on failure.
 */

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { homedir, tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

const execFileP = promisify(execFile);

const DEFAULT_VOICE = 'JBFqnCBsd6RMkjVDRZzb'; // George
const MODEL = 'eleven_multilingual_v2';

function parseArgs(argv) {
  const args = { text: null, out: null, voice: DEFAULT_VOICE, ogg: false, play: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') args.out = argv[++i];
    else if (a === '--voice') args.voice = argv[++i];
    else if (a === '--ogg') args.ogg = true;
    else if (a === '--play') args.play = true;
    else rest.push(a);
  }
  args.text = rest.join(' ').trim();
  return args;
}

async function loadKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY;
  const envFile = join(homedir(), 'mission-control', '.secrets', 'elevenlabs.env');
  const raw = await readFile(envFile, 'utf-8');
  const m = raw.match(/ELEVENLABS_API_KEY=(.+)/);
  if (!m) throw new Error('ELEVENLABS_API_KEY missing');
  return m[1].trim();
}

async function generate({ text, voice, outMp3 }) {
  const key = await loadKey();
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
    method: 'POST',
    headers: {
      'xi-api-key': key,
      'content-type': 'application/json',
      accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: MODEL,
      voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.2, use_speaker_boost: true },
    }),
  });
  if (!r.ok) {
    const err = await r.text().catch(() => '');
    throw new Error(`ElevenLabs ${r.status}: ${err.slice(0, 300)}`);
  }
  const buf = Buffer.from(await r.arrayBuffer());
  await mkdir(dirname(outMp3), { recursive: true });
  await writeFile(outMp3, buf);
  return outMp3;
}

async function toOgg(mp3) {
  const ogg = mp3.replace(/\.mp3$/i, '') + '.ogg';
  // Telegram voice notes prefer mono 48kHz Opus
  await execFileP('ffmpeg', ['-y', '-i', mp3, '-c:a', 'libopus', '-b:a', '48k', '-ar', '48000', '-ac', '1', ogg], { maxBuffer: 1024 * 1024 * 20 });
  return ogg;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.text) {
    console.error('usage: elevenlabs-tts.mjs "text" [--out path] [--voice id] [--ogg] [--play]');
    process.exit(2);
  }
  const ts = Date.now();
  const outMp3 = args.out && !args.ogg ? args.out : join(tmpdir(), `mc-tts-${ts}.mp3`);
  await generate({ text: args.text, voice: args.voice, outMp3 });
  let finalPath = outMp3;
  if (args.ogg) {
    const generatedOgg = await toOgg(outMp3);
    if (args.out && args.out.endsWith('.ogg') && args.out !== generatedOgg) {
      await execFileP('mv', [generatedOgg, args.out]);
      finalPath = args.out;
    } else {
      finalPath = generatedOgg;
    }
  }
  if (args.play) {
    await execFileP('afplay', [finalPath]).catch((e) => console.error(`afplay: ${e.message}`));
  }
  console.log(finalPath);
}

main().catch((err) => { console.error(err.message || err); process.exit(1); });
