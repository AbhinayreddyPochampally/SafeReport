import "server-only"
import OpenAI from "openai"
import type { ReportCategory } from "@/lib/reporter-state"

/**
 * Text-only safety-report classifier.
 *
 * Pilot iteration (mig 007): given an English transcript of the
 * reporter's voice note — plus whatever supporting context the row
 * carries — pick one of the 8 SafeReport categories and return a
 * 0-100 confidence score. No image input. See CLAUDE.md §"AI category
 * classification" for the scope decision.
 *
 * Reliability hardening (19 May 2026):
 *   - JSON Schema response format (gpt-4o-mini's strict mode). The
 *     model is forced to emit a structurally-valid object with the
 *     correct enum + integer types. Defensive parser is retained as
 *     a belt-and-braces fallback for the rare server-side strict-mode
 *     hiccup.
 *   - Few-shot examples for the boundary calls that are easiest to
 *     misclassify (near-miss vs unsafe-act, first-aid vs medical).
 *   - Multi-field input: English transcript + raw source-language
 *     transcript (if present — surface-language idioms sometimes
 *     change meaning) + typed description fallback + store metadata
 *     (brand, store name) so the model can ground retail vocabulary.
 *   - Temperature 0 + max_tokens scaled to the schema. No room for
 *     prose drift.
 *
 * Caller is responsible for:
 *   - Skipping when there's nothing to classify on (no transcript and
 *     no description — pilot policy is voice-driven but the function
 *     itself will accept a description-only input if the route allows
 *     it)
 *   - Idempotency (look up reports.suggested_category before invoking)
 *   - Persisting the result back to the row
 *
 * Errors propagate. The transcribe route handles them by leaving
 * suggested_category null, which surfaces in HO's report-detail page
 * as "no AI suggestion — please pick from the dropdown."
 */

const MODEL = "gpt-4o-mini"
const MAX_ATTEMPTS = 3
const BASE_BACKOFF_MS = 1000
/** Hard cap on the user message we send to the model. Even a 2-minute
 * voice note typically transcribes to < 400 words. Capping protects
 * against pathological transcripts dragging the per-call cost up. */
const MAX_TRANSCRIPT_CHARS = 4000

/** All 8 SafeReport categories, in increasing severity. The classifier
 * picks one. The ordering matters for the prompt — gpt-4o-mini does
 * better with explicitly-ordered enums than with an unordered set. */
const CATEGORIES = [
  "near_miss",
  "unsafe_act",
  "unsafe_condition",
  "first_aid_case",
  "medical_treatment_case",
  "restricted_work_case",
  "lost_time_injury",
  "fatality",
] as const satisfies readonly ReportCategory[]

const CATEGORY_SET = new Set<string>(CATEGORIES)

/* -------------------------------------------------------------------------- */
/*  Prompt construction                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Few-shot examples covering the four highest-error boundaries seen in
 * pilot-prep dry runs:
 *   1. Near miss vs unsafe act (when does "could have" become "did wrong")
 *   2. Unsafe condition vs unsafe act (environmental vs personal cause)
 *   3. First-aid vs medical-treatment (severity of care)
 *   4. Restricted-work vs lost-time (in-scope-but-modified vs missed day)
 *
 * Kept short — each example is one sentence + the expected JSON. The
 * model picks up the pattern; verbosity here would just inflate cost.
 */
const FEW_SHOT: Array<{ user: string; assistant: string }> = [
  {
    user: "A shelf in the trial room area was wobbling. I noticed it before any customer leaned on it. No one was hurt.",
    assistant: '{"category":"unsafe_condition","confidence":85}',
  },
  {
    user: "The stockroom ladder was lying on the floor unused, so the boy climbed the metal shelf to reach the top stack. He didn't fall but he could have.",
    assistant: '{"category":"unsafe_act","confidence":80}',
  },
  {
    user: "Madam slipped near the entrance — there was water from the AC drip. She was about to fall but caught herself on the mannequin stand. Nothing happened to her.",
    assistant: '{"category":"near_miss","confidence":80}',
  },
  {
    user: "The cashier cut her finger on a price-tag staple at the billing counter. We put a band-aid from the first aid kit. She is fine and continued working.",
    assistant: '{"category":"first_aid_case","confidence":92}',
  },
  {
    user: "Stockroom boy got an electric shock from a damaged wire — we took him to the clinic, the doctor checked him and gave medicine. He is back at the store today but the supervisor told him only to do front-of-store tasks for a few days.",
    assistant: '{"category":"restricted_work_case","confidence":75}',
  },
  {
    user: "Cleaner stepped on a broken display peg and badly cut his foot. Hospital stitched it and put him on bedrest for the week. He's not back yet.",
    assistant: '{"category":"lost_time_injury","confidence":94}',
  },
]

const SYSTEM_PROMPT_BASE = `You classify workplace safety incident reports from Indian retail clothing stores into one of 8 categories.

You will be given:
  - The reporter's English-translated voice note (primary signal).
  - Optionally, the raw source-language transcript (Hindi / Kannada / Telugu / Tamil / Marathi) in case nuance was lost in translation.
  - Optionally, a typed description if the reporter typed instead of (or as well as) recording.
  - The store identity (brand + city) to ground retail-floor vocabulary.

Pick the single best category and a 0-100 confidence.

Categories (in increasing severity):
- near_miss: Something almost caused an injury but did not. No contact, no injury. ("She slipped but caught herself.")
- unsafe_act: A person acted against safety procedure (climbed shelving, removed PPE, blocked an emergency exit). No injury occurred.
- unsafe_condition: An environmental hazard exists (wet floor, exposed wire, broken fitting, blocked fire exit). No injury occurred.
- first_aid_case: A minor injury treated on-site (small cut, scrape, bruise) — no professional medical care needed.
- medical_treatment_case: An injury requiring professional medical care (stitches, prescription medication, X-ray) — but the person was NOT off work.
- restricted_work_case: An injury that limits what work duties the person can do, but they continue working in some capacity.
- lost_time_injury: An injury causing the person to miss at least one full scheduled work day.
- fatality: The injury resulted in death.

Decision rules (apply in order):
1. If anyone died, the category is fatality. No other rule overrides this.
2. If an injury occurred, classify by severity of the OUTCOME (where the person is now), not the mechanism. A nasty-sounding mechanism + a band-aid outcome is first_aid_case, not lost_time_injury.
3. If multiple things happened in one report (e.g. "the floor was wet AND she fell AND broke her wrist"), classify by the injury severity. The unsafe condition is the cause, not the category.
4. "Near miss" requires that NO injury occurred AND someone could plausibly have been hurt. Pure observation of a hazard (no person nearby) is unsafe_condition. Pure observation of someone acting unsafely (with no near-incident) is unsafe_act.
5. If unsure between two adjacent severities, pick the LOWER one and reflect uncertainty in a lower confidence score. HO can escalate via the dropdown. Picking too HIGH for an ambiguous case wastes HO attention; picking too LOW is recoverable.
6. "Fatality" is reserved for actual death. Severe injuries the person survived go in lost_time_injury or restricted_work_case.

Confidence scoring guide:
  - 90-100: the report names the injury severity / mechanism unambiguously ("she slipped, broke her wrist, hospital admitted her overnight" → 95 lost_time_injury).
  - 70-89: the category is clearly inferable but a few details are missing.
  - 40-69: the report is short or ambiguous; the pick is best-guess.
  - 0-39: the report barely makes sense or is contradictory. Pick the lowest-stakes plausible category and let HO sort it out.

Indian retail floor vocabulary you should recognise:
  - "Trial room", "billing counter", "mezzanine", "stockroom", "mannequin" — locations.
  - "Off-roll" — contract worker; off-roll injuries are reported the same as any other.
  - Code-mixing is common — "she fell" mixed with Hindi/Kannada nouns is normal; treat the English semantics as the source of truth.
  - "FAC", "MTC", "RWC", "LTI" — internal acronyms; if the reporter or transcript uses them, treat them as strong signals.`

const FEW_SHOT_PREAMBLE =
  "Examples (input is the user message, output is the assistant message exactly as shown):"

function buildSystemPrompt(): string {
  return (
    SYSTEM_PROMPT_BASE +
    "\n\n" +
    FEW_SHOT_PREAMBLE +
    "\n" +
    FEW_SHOT.map(
      (ex, i) =>
        `Example ${i + 1}:\nUser: ${ex.user}\nAssistant: ${ex.assistant}`,
    ).join("\n\n")
  )
}

function buildUserMessage(input: ClassifyInput): string {
  const lines: string[] = []
  if (input.brand || input.store_name) {
    const where = [input.brand, input.store_name].filter(Boolean).join(" · ")
    lines.push(`Store context: ${where}.`)
  }
  if (input.transcript && input.transcript.trim().length > 0) {
    lines.push(`English transcript:\n${input.transcript.trim()}`)
  }
  if (
    input.source_transcript &&
    input.source_transcript.trim().length > 0 &&
    input.source_transcript.trim() !== input.transcript?.trim()
  ) {
    const langTag = input.source_lang ? ` [${input.source_lang}]` : ""
    lines.push(`Raw source transcript${langTag}:\n${input.source_transcript.trim()}`)
  }
  if (input.description && input.description.trim().length > 0) {
    lines.push(`Typed description from reporter:\n${input.description.trim()}`)
  }
  // Hard cap the assembled message so a pathological transcript doesn't
  // blow up the per-call cost. Truncation at the END is fine here — the
  // store-context and transcript lead the message, the description is a
  // fallback, so any trim hits the lowest-value content first.
  const joined = lines.join("\n\n")
  return joined.length > MAX_TRANSCRIPT_CHARS
    ? joined.slice(0, MAX_TRANSCRIPT_CHARS) + "\n\n[…truncated…]"
    : joined
}

/* -------------------------------------------------------------------------- */
/*  Schema                                                                    */
/* -------------------------------------------------------------------------- */

/** JSON Schema enforced via gpt-4o-mini's structured-outputs feature.
 * strict:true makes the model server-side guarantee a valid response.
 * We KEEP the defensive parser below as a belt-and-braces fallback —
 * structured outputs have been observed to slip on rare load conditions
 * (token-limit truncation, server-side schema-rejection retries) so
 * trusting nothing is the cheap-and-safe path. */
const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    category: {
      type: "string",
      enum: [...CATEGORIES],
      description: "One of the 8 SafeReport categories.",
    },
    confidence: {
      type: "integer",
      minimum: 0,
      maximum: 100,
      description: "Self-rated confidence 0..100.",
    },
  },
  required: ["category", "confidence"],
} as const

export type ClassifyInput = {
  /** English transcript — primary signal. May be empty if absent. */
  transcript: string
  /** Raw source-language transcript. Optional fallback / nuance signal. */
  source_transcript?: string | null
  /** ISO-639-1 code for the source language. Optional, just labels the
   * source transcript when it's present. */
  source_lang?: string | null
  /** Reporter-typed description (when they typed instead of speaking). */
  description?: string | null
  /** Store brand — gives the model the retail-floor framing. */
  brand?: string | null
  /** Store name — adds locational specificity. */
  store_name?: string | null
}

export type ClassifyResult = {
  category: ReportCategory
  /** Integer 0..100. */
  confidence: number
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryable(err: unknown): boolean {
  if (!err || typeof err !== "object") return true
  const e = err as { status?: number }
  if (typeof e.status === "number") {
    if (e.status === 429) return true
    if (e.status >= 500 && e.status < 600) return true
    return false
  }
  return true
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

/**
 * Strip ```json fences, leading/trailing prose, or stray quotes that
 * non-strict models occasionally wrap around the JSON. We ask for "no
 * markdown fences" in the system prompt but a defensive parse is
 * cheaper than a retry on the rare miss.
 */
function extractJsonObject(raw: string): string | null {
  const s = raw.trim()
  // Fenced code: ```json ... ```
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (fence) return fence[1].trim()
  // Otherwise look for the first {…} balanced span.
  const start = s.indexOf("{")
  const end = s.lastIndexOf("}")
  if (start >= 0 && end > start) return s.slice(start, end + 1)
  return null
}

function parseClassification(raw: string): ClassifyResult | null {
  const json = extractJsonObject(raw)
  if (!json) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== "object") return null
  const obj = parsed as { category?: unknown; confidence?: unknown }
  const cat = obj.category
  const conf = obj.confidence
  if (typeof cat !== "string" || !CATEGORY_SET.has(cat)) return null
  let confidence: number
  if (typeof conf === "number" && Number.isFinite(conf)) {
    confidence = Math.round(conf)
  } else if (typeof conf === "string" && /^\d+$/.test(conf.trim())) {
    confidence = Math.round(Number(conf))
  } else {
    // Missing confidence — assume mid-range. Better than failing the
    // whole classification on a single missing field.
    confidence = 50
  }
  if (confidence < 0) confidence = 0
  if (confidence > 100) confidence = 100
  return { category: cat as ReportCategory, confidence }
}

/**
 * Classify a report. Throws on failure (caller decides whether to leave
 * suggested_category null or surface a banner).
 *
 * Accepts a multi-field input — transcript is the primary signal, but
 * we ground the model with whatever supporting context the row carries.
 * See ClassifyInput.
 */
export async function classify(
  openai: OpenAI,
  input: ClassifyInput,
): Promise<ClassifyResult> {
  let lastError: unknown = null

  const systemPrompt = buildSystemPrompt()
  const userMessage = buildUserMessage(input)

  if (!userMessage.trim()) {
    throw new Error("classify: empty input — nothing to classify.")
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const completion = await openai.chat.completions.create({
        model: MODEL,
        temperature: 0,
        // 60 tokens easily fits {"category":"...","confidence":NN}; the
        // schema constraint stops the model writing anything else.
        max_tokens: 80,
        // Structured outputs (json_schema, strict=true) — gpt-4o-mini
        // server-side enforces the schema. The model cannot return a
        // category outside the enum or a confidence outside [0,100].
        // See OpenAI structured-outputs docs.
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "safety_report_classification",
            strict: true,
            schema: RESPONSE_SCHEMA,
          },
        },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      })
      const raw = completion.choices[0]?.message?.content ?? ""
      const refusal = completion.choices[0]?.message?.refusal
      if (refusal) {
        // Refusal is structured-outputs' way of saying "I can't comply
        // with the schema for safety reasons". Vanishingly rare for a
        // safety-incident classification but record + retry once.
        lastError = new Error(`Classifier refused: ${refusal.slice(0, 120)}`)
        console.warn("[classify] refusal", {
          attempt,
          refusal: refusal.slice(0, 120),
        })
      } else {
        const parsed = parseClassification(raw)
        if (parsed) {
          if (attempt > 1) {
            // Useful operational signal — were we recovering from earlier
            // failures? Doesn't surface to the user but helps with offline
            // calibration / triage.
            console.info("[classify] succeeded after retry", { attempt })
          }
          return parsed
        }
        // Structured-outputs is supposed to make this branch unreachable.
        // Logging it loud so a future regression in the OpenAI side
        // surfaces fast.
        lastError = new Error(
          `Classifier returned an unparseable payload despite json_schema: ${raw.slice(0, 120)}`,
        )
        console.warn("[classify] unparseable response", {
          attempt,
          rawPreview: raw.slice(0, 120),
        })
      }
    } catch (e) {
      lastError = e
      const retryable = isRetryable(e)
      console.warn("[classify] attempt failed", {
        attempt,
        retryable,
        message: errMessage(e),
      })
      if (!retryable || attempt === MAX_ATTEMPTS) break
    }
    if (attempt < MAX_ATTEMPTS) {
      await sleep(BASE_BACKOFF_MS * Math.pow(2, attempt - 1))
    }
  }

  throw lastError ?? new Error("All classification attempts failed")
}

/**
 * Legacy single-string entry point. Retained for backwards compatibility
 * with any caller that hasn't migrated to the structured input shape
 * yet — wraps the new `classify(...)` so behaviour is identical.
 * @deprecated prefer `classify({ transcript, ... })` so the model can
 * use the additional grounding signals.
 */
export async function classifyTranscript(
  openai: OpenAI,
  transcript: string,
): Promise<ClassifyResult> {
  return classify(openai, { transcript })
}

/** Canonical list of categories, exported for use in HO UI dropdowns +
 * downstream type derivation. The runtime guard is the source of truth;
 * downstream code should not duplicate it. */
export { CATEGORIES }
