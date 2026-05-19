# SafeReport — AI Classification Research & Roadmap

**Author:** Team Alpha, IIM Mumbai · **Date:** 2026-05-19 (post-pilot launch)
**Scope:** Better methods for the AI category classifier that converts a
reporter's voice note into one of 8 SafeReport categories.

This document is the answer to "research on better methods for this". It
surveys what's available in 2026, compares against the pilot's current
single-shot prompt classifier, and lays out a phased upgrade path tied
to dataset milestones rather than calendar dates — so we don't ship
infra before we have the data to justify it.

---

## 1. What we have today (May 2026 — pilot baseline)

Single-shot **prompt classifier**:

- Model: `gpt-4o-mini` chat completion.
- Output enforcement: OpenAI `response_format: { type: "json_schema",
  strict: true }` — model literally cannot emit an out-of-enum category
  or out-of-range confidence.
- Prompt: static system message (8-category taxonomy + decision rules +
  6 hand-written few-shot examples covering the highest-error
  boundaries) + per-report user message (English transcript + raw
  source-language transcript + typed description + store brand/name
  for retail-floor grounding).
- Cost: ~₹0.006 per classified report. ~₹4,540/year at full retail
  (4,200 stores × 15 reports/store/month).
- Latency: live (fire-and-forget from `/api/transcribe` on Stage B
  success). HO sees the AI's pick within seconds.
- Coverage: voice-only. Photo-only / text-only reports skip the
  classifier and go straight to HO dropdown.

Not RAG. Not an agent. Just structured prompting with grounded context.

**What works well:** the structured-outputs schema gives us zero
malformed responses; few-shot examples handle the four
hardest-to-distinguish boundaries; transcript grounding plus the
severity-floor server-side rule means we can't downgrade fatalities.

**What's load-bearing for accuracy:** the *transcript*. Garbage in →
garbage out. The classifier sees no audio. If Whisper / gpt-4o-transcribe
mis-hears "she fell" as "she ran" we mis-classify a first_aid_case as
a near_miss. **Transcription quality is the single largest accuracy
lever we haven't pulled.**

---

## 2. The seven upgrade paths, ranked by expected leverage

Order is roughly highest-impact / lowest-cost first.

### 2.1 Indian-accent + code-mixed STT (Sarvam / AI4Bharat) — **highest leverage**

OpenAI's `gpt-4o-transcribe` is excellent on global English. Indian
retail-floor audio is a different beast: thick regional accents,
Hindi/Kannada/Tamil nouns mid-sentence in an English frame, background
mall PA / HVAC noise. The **Voice of India** benchmark (Josh Talks +
AI4Bharat at IIT Madras, 2026) explicitly shows global multilingual
ASR claims break down here.

- **Sarvam Audio** ranks #1 or #2 across every Indian language and
  dialect tested in Voice of India, including all five our pilot
  reporters might speak (Hindi, Kannada, Telugu, Tamil, plus Marathi
  via Devanagari).
- **AI4Bharat IndicWhisper** is open-source — Whisper variants
  fine-tuned on Indian-language speech. Self-hostable, no per-minute
  fee, which matters at 4,200-store scale.

**Recommendation — drop-in replacement for Stage A.** The
`/api/transcribe` route already supports a primary + fallback model. We
add `sarvam:saaras-2.0` (or IndicWhisper running on an Azure GPU) as
the primary and keep `gpt-4o-transcribe` as the fallback for the
~5% of audio that's already clean English.

**Risk:** vendor sustainability + SLA. Mitigate with the
gpt-4o-transcribe fallback already in place.

**Expected impact:** +5–15 percentage points WER reduction on Indian-
accented and code-mixed audio. Since classifier accuracy is a near-
linear function of transcript fidelity for ambiguous boundary cases,
that translates roughly 1:1 into classification accuracy on those
boundary cases — which are the ones HO has to correct anyway.

### 2.2 Logprobs-based confidence calibration

The model's *self-rated* confidence (the 0–100 number it returns) is a
**guess about its own guess**. Research consistently shows it's
poorly calibrated — the model says 85% on questions it gets right 60%
of the time, and vice versa.

OpenAI's chat completions API can return **token-level logprobs** alongside the
structured output. Combining base logprobs with self-consistency
ratios and feeding them into a lightweight calibrator generates
*calibrated* uncertainty scores you can actually threshold on.

**Recommendation — second classifier-pass calibration.** No model
change, no fine-tune. Enable `logprobs: true, top_logprobs: 5` on the
classify call, store the per-token distribution on the chosen
category, and compute a *calibrated* confidence as a weighted blend:

```
calibrated_confidence = 0.6 * normalised_logprob_of_chosen_category
                      + 0.4 * model_self_rated_confidence_0_100
```

The weights are tuned against the HO-confirmed corpus once we have
~500 confirmed/corrected examples. Until then, use logprob-only.

**Why this matters:** HO's queue prioritisation can then be driven by
*calibrated* confidence — low-confidence reports surface to the top,
high-confidence ones can be approved with a single click. Currently
HO can't trust the 85% number on the screen.

**Cost:** zero — same model call, logprobs flag adds < 200 bytes of
response payload.

### 2.3 Self-consistency on low-confidence rows only

Self-consistency (Wang et al. 2023, extended in 2025–26 by ranked-
voting + confidence-informed variants) samples N answers and takes the
majority vote. Reported accuracy gains: +3.4% on GPT-3.5, +0.5% on
GPT-4 baseline. Confidence-informed self-consistency hits +27pp on
hard reasoning benchmarks.

For our 8-way classification it's overkill on the 80–90% of reports
where the model is confident. But for the boundary cases (logprob-based
confidence < 0.65), a 3-sample majority vote at slight temperature
(0.3) is cheap insurance.

**Recommendation — gated self-consistency.** First-pass classify at
temp=0 as today. If the calibrated confidence is below threshold, fire
2 more samples at temp=0.3 and take the majority. Costs ~2× on the
boundary tail (≈ 15% of reports), so roughly +30% total inference
cost — still trivial at ₹6,000/year at full scale.

**When to ship this:** after §2.2 (calibration) lands, so we have a
reliable confidence number to gate on. Without calibration the threshold
is meaningless.

### 2.4 Fine-tuning gpt-4o-mini on HO confirm/correct labels

OpenAI's fine-tuning platform showed fine-tuned `gpt-4o-mini` beats the
base model on classification with as few as a few dozen training
examples. Recent production studies report comparable F1 between an
LLM-trained classifier (25,974 GPT-5.2 labels, ~$43) and a human-
labeled one (3,800 labels, ~$316) — but with over-prediction biases the
human set avoids.

**For SafeReport** this means: every time HO confirms or corrects an
AI suggestion, we generate a perfect labeled example. HO's
confirm-vs-correct ratio is itself a measurement of model accuracy.
After ~6 months of pilot operation we'd have **3,000–5,000 labeled
examples** at HO's confirmation rate — enough to fine-tune
materially.

**Constraint — critical:** OpenAI is winding down the fine-tuning
platform; new fine-tuning customers cut off after March 31, 2026 (Azure
keeps it open longer). Two implications:

1. If we want fine-tuning, **provision the Azure OpenAI tenant
   before the cutoff** — ABFRL's Phase Azure plan already does this,
   but the fine-tuning entitlement specifically needs to be requested
   pre-cutoff.
2. Fine-tuning is a "do once we have data" play, not "do now".

**Recommendation — defer to dataset milestone.** Trigger a fine-tune
when we have:
- ≥ 2,000 HO-confirmed examples (1,500 confirmed + 500 corrected at
  minimum)
- A disagreement rate by category that suggests systematic miss
  (e.g. AI consistently undercalls MTC vs. RWC by > 10pp)

Until then, the cost-effective path is to keep iterating on the
prompt + few-shot examples using HO-corrected examples as the source
of truth (cheap, no infra work).

### 2.5 Encoder-based classifier (BERT / IndicBERT family) at scale

The most under-rated finding in the literature: for **fixed taxonomy**
classification at high volume, fine-tuned encoder models (BERT,
RoBERTa, IndicBERT) hit "competitive and often superior" accuracy
versus LLM prompting **at 1–2 orders of magnitude lower cost and
latency**.

This is the Phase Azure end-state. At 4,200 stores generating ~63,000
reports/month, the gpt-4o-mini bill is ~₹4,500/year — already trivial.
But latency, vendor lock-in, and data-residency become significant
considerations:

- **Latency:** an in-region IndicBERT classifier on Azure ML
  responds in 30–80 ms. The current OpenAI call is 1.5–3s. HO's
  inbox feels snappier.
- **Data residency:** ABFRL's data-protection conversation gets
  simpler if every classification happens inside their Azure tenant
  rather than transiting through OpenAI's US endpoints.
- **Cost at full scale:** GPU-hours instead of per-token. Crosses
  over to cheaper than gpt-4o-mini somewhere around 3,000 reports/day
  — about the 4,200-store steady state.

**Recommendation — Phase Azure end-state.** Once we have the
fine-tuning dataset (§2.4) the same dataset trains an encoder model.
Path: keep gpt-4o-mini as the primary, deploy IndicBERT in parallel as
a shadow classifier, compare for 3 months, switch primaries when
encoder F1 ≥ LLM F1 on the eval set.

### 2.6 Cascading routing (LLM-as-Judge for low confidence)

A two-model cascade: a small, cheap model handles the easy reports; a
larger model handles only the hard ones. Once we have an encoder
(§2.5), the natural arrangement is:

```
report → IndicBERT (fast, cheap) → if confidence ≥ 0.8 → done
                                 → else → gpt-4o or gpt-5-mini → done
```

At pilot scale (~300 reports/month), this is over-engineered. At
Phase Azure scale (~63,000/month) the cost dynamics favour it.

**Recommendation — Phase Azure post-encoder.** Tied to §2.5; only
worth doing once IndicBERT is in production.

### 2.7 RAG over past confirmed incidents

A vector store of HO-confirmed reports, retrieve top-k similar past
incidents at classify-time and feed them to the model alongside the
new transcript: *"these are the closest 5 past reports, all classified
as RWC by HO — does this one fit the same pattern?"*

**Why this is interesting** — it makes the classifier consistent
with HO's actual labeling history per-store, per-brand, per-time-of-
year. A "ladder injury" might trend MTC at one brand and FAC at
another based on local manager judgement.

**Why we shouldn't ship it now** — at pilot scale we'd be retrieving
from a corpus of ~50 confirmed reports, which the model handles fine
without retrieval. RAG has a per-call latency + cost surcharge that
only justifies itself when the corpus is large enough to disambiguate
edge cases.

**Recommendation — defer until ~5,000 confirmed reports.** Coincides
with the encoder-training milestone in §2.5.

---

## 3. What we should NOT do

Three plausible-looking ideas that don't pay back at this stage:

1. **Multi-model ensemble (gpt-4o-mini + claude-haiku + gemini-flash
   votes).** Triples the cost, marginal accuracy gain in the
   structured-output regime, adds three vendor dependencies. Maybe at
   Phase Omega billion-report scale.

2. **Reasoning models (o-series) for classification.** o-models are
   built for multi-step reasoning, but 8-way classification is a
   *single-step* judgement. The chain-of-thought tokens add cost and
   latency without measurable accuracy gain on simple classification.
   They're the right tool for the *severity-floor judgement* HO is
   making (verify the AI's pick across multiple evidence streams) —
   but that's HO's job, not the model's.

3. **Prompt engineering ad infinitum.** Diminishing returns past
   ~10–15 few-shot examples. The structured-outputs + 6-example
   baseline is already very close to the few-shot ceiling for this
   taxonomy. Energy is better spent on §2.1 (STT) and §2.4 (fine-tune)
   than tuning the prompt to chase the last 2% of accuracy.

---

## 4. Recommended phasing

Tied to **dataset milestones**, not calendar dates. The pilot just
launched — the next month or two will reveal which of the assumed-easy
boundaries are actually hard for the model, which will inform priorities.

### Phase 0 — Pilot operating (May 2026 → first 500 confirmed reports)

What's running today. The goal of this phase is **collect data**:
every HO confirm/correct is a labeled example. Log enough metadata
(transcript chars, source language, model self-confidence,
HO decision, time-to-decide) that the eval set is queryable later.

### Phase 1 — STT upgrade (500 → 1,500 confirmed reports)

Drop in Sarvam or AI4Bharat IndicWhisper as the primary Stage A model.
Keep gpt-4o-transcribe as fallback. **Single biggest expected accuracy
win.** Compare HO correction rate before / after on the same store
cohort.

Concurrent: enable logprobs + ship the calibrated-confidence rollup
(§2.2). HO queue can now sort by calibrated confidence.

### Phase 2 — Gated self-consistency (1,500 → 3,000 confirmed reports)

Add 3-sample majority vote for reports below the calibrated-confidence
threshold (initially 0.65, tune from data). +30% inference cost on
boundary cases, ~0% on the rest. Expected accuracy gain: +1–3pp
overall, +5–8pp on the boundary tail.

### Phase 3 — Fine-tune `gpt-4o-mini` (3,000 → 5,000 confirmed reports)

Now we have enough labels to fine-tune meaningfully. **Must be set up
on Azure OpenAI tenant before March 31 2026 cutoff** (if not already).
Train on a deduplicated, balanced sample (over-sample LTI/Fatality
cases because they're rare but high-stakes).

Expected accuracy gain: +3–7pp F1, plus a measurable bias correction
for any category the base model systematically over- or under-calls.

### Phase 4 — Encoder + cascade (5,000+ confirmed reports, Phase Azure)

Train IndicBERT on the same dataset. Deploy as shadow classifier
alongside the fine-tuned gpt-4o-mini. Once F1 reaches parity, switch
primaries: IndicBERT for the confident 80–90%, gpt-4o-mini cascades
for the boundary cases. Latency drops to ~50ms median; cost decouples
from OpenAI pricing.

### Phase 5 — RAG over past incidents (post-Phase-Azure, 10,000+ confirmed)

Per-store consistency boost — retrieve top-k historically similar
incidents from this store / brand / season and ground the classifier
in the local labeling history.

---

## 5. The "do this today" checklist

Things that don't need a dataset milestone and we can ship in the next
sprint without disrupting the live pilot:

1. **Add `logprobs: true` to the classify call** + persist the top-5
   token distribution to `reports.classify_logprobs` (JSONB column,
   new migration). No behaviour change yet — just collecting the
   signal so we can build the calibrator once data lands.
2. **Add structured logging of the HO confirm/correct decision** with
   the AI's pick + the final category + a timestamp, in a new
   `classification_audit` table. Already half-built in `/api/ho-actions`
   — extend the audit insert. Source of truth for Phase 3 fine-tune.
3. **Benchmark Sarvam / IndicWhisper on a small set of pilot voice
   notes.** Side-by-side WER against gpt-4o-transcribe on the same 50
   audio clips. Lowest-risk way to validate §2.1 before committing to
   the swap.
4. **Document HO's per-store-cohort confirmation rate** as the
   primary accuracy KPI. We can't improve what we don't measure;
   right now the confirmation rate doesn't surface on any dashboard.

These four items add ~3 days of work, cost essentially nothing in
inference fees, and pave the way for every later phase.

---

## 6. What this means for the IIM presentation

Three slides' worth of strategy here:

- **"We didn't over-build."** Current state is the simplest thing that
  could work for a 20-store pilot. RAG, agents, ensembles deferred
  until the data justifies them.
- **"We picked the right next investment."** Indian-accent STT is the
  highest-leverage upgrade and the literature backs it
  (Voice of India benchmark, AI4Bharat IndicWhisper, Sarvam #1–2 across
  every Indian language tested).
- **"We have a calibrated upgrade path."** Each phase is gated by a
  dataset milestone, not a calendar date — so we can't ship infra
  before we have the data to justify it. That's the defensible answer
  to "why don't you just fine-tune now?"

---

## 7. Sources

- [Fine-tune GPT-4o-mini — Medium](https://medium.com/@rjnclarke/fine-tune-gpt-4o-mini-68a5fe298a34)
- [Fine-tuning GPT-4o Mini step-by-step — DataCamp](https://www.datacamp.com/tutorial/fine-tuning-gpt-4o-mini)
- [Fine-tuning available for GPT-4o — OpenAI](https://openai.com/index/gpt-4o-fine-tuning/)
- [Extended fine-tuning support — Microsoft Azure](https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/announcing-extended-support-for-fine-tuning-gpt-4o-and-gpt-4o-mini/4488525)
- [Cost-Aware Model Selection for Text Classification — arXiv 2602.06370](https://arxiv.org/pdf/2602.06370)
- [Voice of India ASR benchmark — Newspatrolling](https://newspatrolling.com/global-speech-ai-struggles-to-understand-india-new-national-benchmark-voice-of-india-reveals/)
- [Open-Source Voice AI India 2026 — Caller Digital](https://www.caller.digital/blog/open-source-voice-ai-india-sarvam-ai4bharat-bhasini-2026)
- [Sarvam Speech-to-Text API](https://www.sarvam.ai/apis/speech-to-text)
- [Ranked Voting Self-Consistency of LLMs — arXiv 2505.10772](https://arxiv.org/html/2505.10772v1)
- [Certified Self-Consistency — arXiv 2510.17472](https://arxiv.org/pdf/2510.17472)
- [Confidence Improves Self-Consistency in LLMs — arXiv 2502.06233](https://arxiv.org/pdf/2502.06233)
- [Scalable Best-of-N via Self-Certainty — arXiv 2502.18581](https://arxiv.org/pdf/2502.18581)
- [Mirror-Consistency — arXiv 2410.10857](https://arxiv.org/pdf/2410.10857)
- [Active Learning + Human Feedback for LLMs — IntuitionLabs](https://intuitionlabs.ai/articles/active-learning-hitl-llms)
- [Human vs LLM Annotation in Active Learning — arXiv 2604.13899](https://arxiv.org/abs/2604.13899)
- [Next-Gen Active Learning: Mixture of LLMs — arXiv 2601.15773](https://arxiv.org/pdf/2601.15773)
- [Best Human-in-the-Loop LLM Evaluation Platforms 2026 — Braintrust](https://www.braintrust.dev/articles/best-human-in-the-loop-llm-evaluation-platforms-2026)
- [Human-in-the-Loop / LLM-as-Judge — Kili Technology](https://kili-technology.com/blog/human-in-the-loop-human-on-the-loop-and-llm-as-a-judge-for-validating-ai-outputs)
