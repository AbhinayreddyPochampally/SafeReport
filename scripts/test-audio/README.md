# Translation pipeline test fixtures

Drop voice recordings here to smoke-test the transcription + translation
pipeline before pushing changes to production.

## Naming convention

`<lang2>_<short-description>.<ext>`

The two-letter prefix is informational only — the pipeline always
auto-detects the actual language. Use it to label what you *think* the
recording is in so you can compare against what was detected.

Suggested filenames for the 5 priority languages:

```
en_first-aid.webm        — "Cashier cut her finger on the cardboard cutter."
hi_wet-floor.m4a         — "टॉयलेट के पास फर्श गीला है, कोई गिर सकता है।"
kn_loose-tile.webm       — "ಪ್ರವೇಶದ ಬಳಿ ಟೈಲ್ ಸಡಿಲವಾಗಿದೆ, ಯಾರೋ ಬೀಳಬಹುದು."
ta_fire-extinguisher.mp3 — "தீயணைப்பான் பாதுகாப்பு வளையம் சிவப்பாக உள்ளது."
te_emergency-exit.webm   — "అత్యవసర నిష్క్రమణ గేట్ తాళం వేయబడింది."
```

## Recording your own samples

The fastest path is to use the reporter app itself in dev:

1. `npm run dev` and open `http://localhost:3000/r/PNT-MUM-047` (or any
   active store SAP code).
2. Walk through the flow up to the voice screen.
3. Record a short clip (≤30s) in the language you're testing.
4. Right-click the audio preview, "Save audio as…", and drop the file
   here with the right naming.

Or record on your phone (Voice Memos / Recorder app) and AirDrop / copy
the file in.

Supported extensions: `.webm`, `.mp3`, `.m4a`, `.ogg`, `.wav`, `.mp4`

## Running the smoke test

From the project root:

```
npx tsx scripts/smoke-translate.ts
```

Or test a single file:

```
npx tsx scripts/smoke-translate.ts scripts/test-audio/kn_loose-tile.webm
```

Requires `OPENAI_API_KEY` in `.env.local`. Each call costs roughly
$0.005–$0.01 depending on clip length.

## What "passing" means

The script exits 0 when every file produces a non-empty English
translation. Beyond that, you should manually review the markdown
summary at `_results.md`:

- Did the **detected language** match the prefix?
- Does the **source transcript** read like what was actually said?
- Does the **English translation** preserve safety-critical details
  (location, equipment names, severity)?

If a translation drops a detail, edit the system prompt in
`app/api/transcribe/route.ts` (the `TRANSLATION_SYSTEM_PROMPT` constant)
and re-run the smoke test.

## What's NOT covered

- Real-time transcription (we don't use streaming)
- Speaker diarisation (single-speaker reports only)
- Background-noise stress testing — the audio quality from a phone in a
  retail store is what we'd see in production. If you want to stress-
  test, record near a working AC unit or with retail floor music in the
  background.

## Files in this folder are .gitignored

Sample audio is not checked in. Re-record locally as needed.
