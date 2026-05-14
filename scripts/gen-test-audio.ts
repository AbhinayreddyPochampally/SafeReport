/**
 * scripts/gen-test-audio.ts
 *
 * Generates 5 short voice-note fixtures using OpenAI TTS — one per pilot
 * priority language (English, Hindi, Kannada, Telugu, Marathi). Each
 * sample is a representative workplace-safety incident description that
 * a reporter would plausibly speak into the SafeReport voice recorder.
 *
 * Why this exists: the existing smoke script (smoke-translate.ts) requires
 * audio files in scripts/test-audio/ but the folder is .gitignored and
 * empty on a fresh checkout. Rather than ask a human to record five
 * voice memos every time the pipeline is touched, this script produces
 * the fixtures deterministically.
 *
 * Caveat: OpenAI's TTS voices (`tts-1`, `tts-1-hd`) are English-trained.
 * They can pronounce Devanagari/Kannada/Telugu/Marathi scripts but with
 * a noticeable English accent. That's actually a useful stress test —
 * it's the same kind of mid-quality audio Whisper/gpt-4o-transcribe
 * would see if a non-native speaker is reading a script. If the pipeline
 * still recovers the right language and meaning under that pressure,
 * it'll be more robust on real native-speaker audio.
 *
 * Each generated mp3 is named `<lang2>_<slug>.mp3` so smoke-translate.ts
 * picks them up via its prefix convention.
 *
 * Run:
 *   npx tsx scripts/gen-test-audio.ts
 */
// Load .env.local first (where the live key lives), then fall back to .env.
// `dotenv/config` loads .env only — fine for CI, wrong for local dev where
// Next.js conventions put secrets in .env.local.
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })
loadEnv()

import fs from "node:fs"
import path from "node:path"
import OpenAI from "openai"

type Sample = {
  /** ISO 639-1 prefix for the output filename. */
  lang: string
  /** Short slug used in the filename for human readability. */
  slug: string
  /** TTS voice — alloy/echo/onyx/nova/shimmer/fable. Native script reads
   * marginally better on `onyx`/`nova` in informal A/B with TTS-1. */
  voice: "alloy" | "echo" | "onyx" | "nova" | "shimmer" | "fable"
  /** Spoken text — keep < 30s when read at TTS-1 default speed. */
  text: string
}

type SampleExt = Sample & {
  /** TTS speed multiplier — 1.0 default. < 1 simulates a slow/mumbled
   * speaker, > 1 simulates a rushed reporter who's stressed about the
   * incident. */
  speed?: number
}

const SAMPLES: SampleExt[] = [
  // ---- Five clean baselines (one per priority language) ----
  {
    lang: "en",
    slug: "first-aid",
    voice: "nova",
    text:
      "The cashier at billing counter 3 cut her index finger on the cardboard cutter. There is mild bleeding. I used the first aid kit and applied a bandage. She is fine but the cutter handle is broken and needs replacement.",
  },
  {
    lang: "hi",
    slug: "wet-floor",
    voice: "onyx",
    // Hindi: water leak / wet floor / slip risk near trial room.
    text:
      "ट्रायल रूम के पास एसी से पानी टपक रहा है। फर्श गीला है, कोई फिसल सकता है। कृपया साफ करने और चेतावनी का बोर्ड लगाने के लिए किसी को भेजें।",
  },
  {
    lang: "kn",
    slug: "loose-tile",
    voice: "alloy",
    // Kannada: loose tile near entrance, fall risk, repair urgent.
    text:
      "ಮಳಿಗೆಯ ಪ್ರವೇಶದ ಬಳಿ ಒಂದು ಟೈಲ್ ಸಡಿಲವಾಗಿದೆ. ಗ್ರಾಹಕರು ನಡೆಯುವಾಗ ಅದು ಚಲಿಸುತ್ತದೆ. ಯಾರಾದರೂ ಬೀಳಬಹುದು. ತಕ್ಷಣ ರಿಪೇರಿ ಮಾಡಬೇಕು.",
  },
  {
    lang: "te",
    slug: "emergency-exit",
    voice: "echo",
    // Telugu: emergency exit locked behind stockroom, fire-escape risk.
    text:
      "స్టాక్ రూమ్ వెనుక ఉన్న అత్యవసర నిష్క్రమణ గేటు తాళం వేయబడింది. మంటలు వస్తే మనం బయటకు రాలేము. దయచేసి వెంటనే తాళం తీయండి.",
  },
  {
    lang: "mr",
    slug: "exposed-wiring",
    voice: "shimmer",
    // Marathi: exposed electrical wiring behind mannequin, shock risk.
    text:
      "मेन्स सेक्शनमधील पुतळ्याच्या मागे विद्युत वायरिंग उघडी आहे. ग्राहक किंवा कर्मचारी यांना विजेचा धक्का बसू शकतो. उद्या दुकान उघडण्यापूर्वी ती झाकून घ्या.",
  },
  // ---- Stress variants — "different degrees of noise, accents, etc." ----
  // Code-mixed Hinglish — by far the most common pattern on an actual
  // Indian retail floor. Devanagari verbs + English nouns. Trips
  // looksLikeEnglish() because of Hindi script, but the meaning is
  // accessible to a translator that handles code-mixing.
  {
    lang: "hi",
    slug: "hinglish-codemix",
    voice: "fable",
    text:
      "Billing counter ke paas customer ne complaint ki ki AC unit se water drip ho raha hai. Floor wet hai aur slip ka risk hai. Maine bola maintenance team ko ticket raise karne ke liye.",
  },
  // Fast-spoken Hindi — simulates a stressed reporter rushing through
  // an incident description. Pronounced consonant softening at speed > 1.1.
  {
    lang: "hi",
    slug: "rushed",
    voice: "echo",
    speed: 1.2,
    text:
      "लिफ्ट के पास एक ग्राहक गिर गया। उसके सिर पर चोट लगी है। पहली सहायता दी जा रही है। अस्पताल ले जाने की जरूरत है।",
  },
  // Slow / mumbled Telugu — slower TTS rate softens consonant edges,
  // mimicking a less-fluent or older reporter. This was the variant
  // that flushed out the NO_INTELLIGIBLE_SPEECH false-positive in the
  // first run, so retain it as a regression.
  {
    lang: "te",
    slug: "slow",
    voice: "onyx",
    speed: 0.85,
    text:
      "మూడవ అంతస్తులో అగ్నిమాపక యంత్రం ఖాళీగా ఉంది. వెంటనే నింపాలి. మంటలు వస్తే ఏమి చేయలేము.",
  },
  // Short fragment — a reporter who only manages a few words before
  // stopping. Tests the "no speech / NO_INTELLIGIBLE_SPEECH" branch
  // boundary on legitimately short clips.
  {
    lang: "en",
    slug: "fragment",
    voice: "nova",
    text: "Wet floor near trial room three. Slip hazard.",
  },
  // Different voice for Kannada — alloy in the baseline, shimmer here
  // — covers a different accent profile on the same language.
  {
    lang: "kn",
    slug: "alt-voice",
    voice: "echo",
    text:
      "ಬಿಲ್ಲಿಂಗ್ ಕೌಂಟರ್ ಬಳಿ ತಂತಿ ಉಬ್ಬಿಕೊಂಡಿದೆ. ವಿದ್ಯುತ್ ಶಾಕ್ ಸಾಧ್ಯತೆ ಇದೆ. ಗ್ರಾಹಕರಿಗೆ ಅಪಾಯ.",
  },
]

const OUT_DIR = path.join("scripts", "test-audio")

async function main() {
  const key = process.env.OPENAI_API_KEY
  if (!key) {
    console.error("OPENAI_API_KEY missing — set it in .env.local")
    process.exit(1)
  }

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

  const openai = new OpenAI({ apiKey: key })

  for (const s of SAMPLES) {
    const filename = `${s.lang}_${s.slug}.mp3`
    const filepath = path.join(OUT_DIR, filename)
    process.stdout.write(`• generating ${filename} (${s.voice}, ${s.text.length} chars) … `)
    const started = Date.now()
    const resp = await openai.audio.speech.create({
      model: "tts-1",
      voice: s.voice,
      input: s.text,
      // mp3 is universally accepted by the transcription endpoint and easy
      // to inspect in any media player if a generation looks suspicious.
      response_format: "mp3",
      // Pass speed when defined — TTS-1 accepts 0.25..4.0. Used to simulate
      // mumbled (slow) and rushed (fast) reporters.
      ...(s.speed ? { speed: s.speed } : {}),
    })
    const arrayBuf = await resp.arrayBuffer()
    fs.writeFileSync(filepath, Buffer.from(arrayBuf))
    console.log(`${(arrayBuf.byteLength / 1024).toFixed(0)}KB in ${Date.now() - started}ms`)
  }

  console.log(`\nDone. Run:`)
  console.log(`  npx tsx scripts/smoke-translate.ts`)
}

main().catch((e) => {
  console.error("audio gen failed:", e)
  process.exit(1)
})
