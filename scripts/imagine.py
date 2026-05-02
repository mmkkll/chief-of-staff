#!/usr/bin/env python3
"""
imagine — editorial illustration generator.

Usage:
  imagine "subject text"                            # text → image, prints path on stdout
  imagine --url https://example.com/article         # scrape article → derive subject → image
  imagine "..." --telegram                          # also send photo to Telegram (uses TELEGRAM_CHAT_ID)
  imagine "..." --open                              # also open with Preview.app
  imagine "..." --aspect 1:1 | 16:9 | 9:16          # default 16:9
  imagine "..." --out /path/to/file.jpeg            # explicit output path
  imagine "..." --raw                               # SKIP style block (use as-is)
  imagine "..." --plain                             # SKIP Gemini "subject distillation"

Style: contemporary editorial illustration, axonometric, warm cream + navy + teal-cyan, risograph grain.
"""

import sys, os, json, re, base64, time, uuid, argparse, subprocess, urllib.request, urllib.error

GEMINI_KEY = os.environ.get("GEMINI_API_KEY", "")
TELEGRAM_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT = os.environ.get("TELEGRAM_CHAT_ID", "")
WEBHOOK = "http://localhost:5678/webhook/genera-immagine"
TEXT_MODEL = "gemini-2.5-flash-lite"

STYLE_BLOCK = (
    "Contemporary editorial illustration in the visual language of a sophisticated international magazine technology feature "
    "(Wired US explainer, MIT Technology Review, Bloomberg Businessweek). Hand-drawn flat vector aesthetic with confident "
    "slightly-irregular outlines and gentle exaggeration of architectural and mechanical proportions. Visible risograph-style "
    "grain texture across the entire image, slight registration offset between colour layers giving a hand-printed feel. Warm "
    "and intelligent rather than cold or dystopian. Holographic and AR elements rendered as soft translucent shapes with very "
    "subtle inner glow, never neon, never sci-fi cliche. Core palette anchored in three values used in every illustration: "
    "warm cream ivory background (#f5f0e6) carrying the main paper texture, deep midnight navy (#1a2332) for primary outlines "
    "and structural shadow, and a soft muted teal-cyan (#7a9aa8) reserved for water, sky haze, and holographic or AR elements. "
    "Each illustration adds one or two ACCENT COLOURS specific to the chapter, blended into roofs, key objects, and human "
    "figures clothing. No readable text, no logos, no faces in detail, no AI cliche iconography like circuit boards, glowing "
    "brains, or wireframe humanoids. Aspect ratio {ASPECT}, full-bleed scene, axonometric isometric projection at approximately "
    "30 degrees, slightly elevated viewing angle, generous negative space, asymmetric balance."
)

URL_RE = re.compile(r"^https?://", re.IGNORECASE)


def err(msg):
    print(msg, file=sys.stderr)


def extract_url(url, timeout=30):
    """Fetch URL, return (title, text) — text is the visible content stripped of HTML."""
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; mission-control/1.0)"})
    try:
        raw = urllib.request.urlopen(req, timeout=timeout).read()
    except urllib.error.URLError as e:
        raise RuntimeError(f"fetch URL failed: {e}")
    try:
        html = raw.decode("utf-8", errors="ignore")
    except Exception:
        html = raw.decode("latin-1", errors="ignore")
    html = re.sub(r"<script[^>]*>.*?</script>", " ", html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r"<style[^>]*>.*?</style>", " ", html, flags=re.DOTALL | re.IGNORECASE)
    title_m = re.search(r"<title[^>]*>(.*?)</title>", html, re.IGNORECASE | re.DOTALL)
    title = re.sub(r"\s+", " ", (title_m.group(1) if title_m else "")).strip()
    og_m = re.search(r'<meta[^>]+property=["\']og:description["\'][^>]+content=["\']([^"\']+)', html, re.IGNORECASE)
    og_desc = og_m.group(1).strip() if og_m else ""
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text).strip()
    text = (og_desc + " " + text)[:2500]
    return title, text


def distill_subject(seed_text):
    """Ask Gemini text to convert input into a 1-2 sentence visual subject."""
    body = {
        "contents": [{"parts": [{"text":
            "Sei un art director per illustrazioni editoriali (stile axonometric Wired/MIT Tech Review). "
            "Trasforma il seguente input in UN solo soggetto visivo per un'illustrazione editoriale, max 2 frasi. "
            "Il soggetto deve essere CONCRETO: scene con persone, oggetti, luoghi. NO concetti astratti. "
            "NO text overlay. NO facce dettagliate. NO loghi. NO cliché AI (cervelli che brillano, circuit board, wireframe). "
            "Output SOLO il soggetto in inglese, niente preamble, niente markdown.\n\n"
            f"INPUT:\n{seed_text}\n\nSOGGETTO VISIVO:"
        }]}],
        "generationConfig": {"maxOutputTokens": 250, "temperature": 0.6},
    }
    req = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{TEXT_MODEL}:generateContent?key={GEMINI_KEY}",
        data=json.dumps(body).encode(), method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        resp = json.loads(urllib.request.urlopen(req, timeout=60).read())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"gemini text failed: {e.code} {e.read()[:200]}")
    cand = (resp.get("candidates") or [{}])[0]
    parts = cand.get("content", {}).get("parts") or []
    text = "".join(p.get("text", "") for p in parts).strip()
    if not text:
        raise RuntimeError(f"gemini text returned empty (finishReason={cand.get('finishReason')})")
    return text


def gen_image(subject, aspect="16:9", raw=False):
    full = subject if raw else f"{subject}\n\n{STYLE_BLOCK.replace('{ASPECT}', aspect)}"
    body = {
        "api_key": GEMINI_KEY,
        "prompt": full,
        "model": "gemini-2.5-flash-image",
        "aspectRatio": aspect,
    }
    req = urllib.request.Request(
        WEBHOOK, data=json.dumps(body).encode(), method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        resp = json.loads(urllib.request.urlopen(req, timeout=240).read())
    except urllib.error.URLError as e:
        raise RuntimeError(f"image webhook failed: {e}")
    item = resp[0] if isinstance(resp, list) else resp
    if not item.get("base64Image"):
        raise RuntimeError(f"no image in response: {str(item)[:300]}")
    return base64.b64decode(item["base64Image"])


def send_telegram_photo(jpeg, caption):
    boundary = f"----imagine{uuid.uuid4().hex}"
    parts = []
    for k, v in [("chat_id", TELEGRAM_CHAT), ("caption", caption)]:
        parts.append(f"--{boundary}\r\n".encode())
        parts.append(f'Content-Disposition: form-data; name="{k}"\r\n\r\n'.encode())
        parts.append(f"{v}\r\n".encode())
    parts.append(f"--{boundary}\r\n".encode())
    parts.append(b'Content-Disposition: form-data; name="photo"; filename="imagine.jpeg"\r\n')
    parts.append(b"Content-Type: image/jpeg\r\n\r\n")
    parts.append(jpeg)
    parts.append(f"\r\n--{boundary}--\r\n".encode())
    payload = b"".join(parts)
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendPhoto",
        data=payload, method="POST",
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    try:
        resp = json.loads(urllib.request.urlopen(req, timeout=60).read())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"telegram failed: {e.code} {e.read()[:200]}")
    if not resp.get("ok"):
        raise RuntimeError(f"telegram not ok: {resp}")
    return resp["result"]["message_id"]


def main():
    ap = argparse.ArgumentParser(formatter_class=argparse.RawDescriptionHelpFormatter, description=__doc__)
    ap.add_argument("input", nargs="*", help="text subject or URL (positional, joined with spaces)")
    ap.add_argument("--url", help="article URL")
    ap.add_argument("--telegram", action="store_true")
    ap.add_argument("--open", action="store_true")
    ap.add_argument("--aspect", default="16:9", choices=["16:9", "1:1", "9:16", "4:3", "3:4"])
    ap.add_argument("--out", default=None)
    ap.add_argument("--raw", action="store_true", help="skip the fixed STYLE_BLOCK")
    ap.add_argument("--plain", action="store_true", help="skip Gemini subject distillation, use input as-is")
    args = ap.parse_args()

    raw_input = args.url or " ".join(args.input).strip()
    if not raw_input:
        ap.error("provide text or --url")

    # Resolve subject
    if URL_RE.match(raw_input):
        err(f"[fetch] {raw_input}")
        title, text = extract_url(raw_input)
        seed = f"TITLE: {title}\nTEXT: {text}"
        err(f"[distill] from article ({len(text)} chars)")
        subject = distill_subject(seed)
        caption = f"🎨 {title or raw_input}"
    else:
        if args.plain or args.raw:
            subject = raw_input
        else:
            err(f"[distill] from text ({len(raw_input)} chars)")
            subject = distill_subject(raw_input)
        caption = f"🎨 {raw_input[:120]}"

    err(f"[subject] {subject[:300]}")
    err(f"[render] {args.aspect} (~30-90s)")
    jpeg = gen_image(subject, args.aspect, raw=args.raw)
    out = args.out or f"/tmp/imagine-{int(time.time())}.jpeg"
    with open(out, "wb") as f:
        f.write(jpeg)
    print(out)
    err(f"[saved] {len(jpeg)//1024}KB → {out}")

    if args.open:
        subprocess.run(["open", out])

    if args.telegram:
        err(f"[telegram] sending to {TELEGRAM_CHAT}")
        mid = send_telegram_photo(jpeg, caption)
        err(f"[telegram] message_id={mid}")


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as e:
        err(f"FAIL: {e}")
        sys.exit(1)
