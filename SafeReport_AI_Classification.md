# SafeReport — AI Classification Cost Analysis

**Decision document — ABFRL Phase Azure rollout · May 2026**

> **Pilot decision update — 19 May 2026:** the original recommendation was
> "skip for pilot, build for Azure." That was overridden — the pilot launches
> tomorrow (20 May 2026) **with** AI classification turned on. Three pilot-
> shaping deltas from the Azure spec below are worth flagging up-front; the
> rest of this document is unchanged.
>
> 1. **Voice-only in the pilot.** The Azure spec proposed photo + transcript
>    as combined inputs (low-detail vision). The pilot strips this to text-
>    only — `gpt-4o-mini` reads the English transcript and skips the image
>    call. Reports without a voice note (photo-only / text-only) are NOT
>    auto-classified; HO picks the category manually via the dropdown.
>    Rationale: keep the model surface minimal and cheap; the transcript
>    alone carries ~all the classification signal for the common pilot
>    categories.
>
> 2. **Live, not batched.** The Azure spec assumed OpenAI's 24h Batch API
>    for the 50% discount. The pilot runs live — fired fire-and-forget
>    from `/api/transcribe` on Stage B success — so HO sees the AI's pick
>    within seconds of the transcript completing. Switching to the Batch
>    API is a one-line change in `/api/classify` when Azure scale demands
>    the discount.
>
> 3. **Severity floor applied in the pilot.** Per the "Open architectural
>    decisions" section below, Fatality and Lost-Time Injury force an
>    explicit HO dropdown selection — the single-button "Confirm AI
>    suggestion" is disabled for those two regardless of AI confidence.
>    The rule is cheap to build now and avoids retrofit on the Azure rollout.
>
> The cost numbers below are unchanged. The pilot is voice-only (≈ all 20
> stores' reports will have voice), so the per-report figure of ~₹0.006
> still holds.

---

## Summary

Skip the reporter's category-pick screen entirely. After submission, an AI classifier (gpt-4o-mini with vision) suggests one of the 8 SafeReport categories based on the photo and the English-translated voice transcript. HO sees the AI suggestion on the same report-approval screen they already use, with a single-button approve on the happy path (~90% of reports) and a dropdown override on the rest (~10%).

- **Per store: ~₹1.08 per year (~9 paise per month)**
- **Full retail (4,200 stores): ~₹4,540 per year**
- **Per report: ~₹0.006 (0.6 paise), batched via OpenAI Batch API**

Not recommended for the 20-store pilot. Recommended for the Azure-phase production rollout. **(Pilot decision flipped on 19 May 2026 — see banner above.)**

---

## The flow change

| | Today (pilot) | Phase Azure (proposed) |
|---|---|---|
| Reporter | Picks category from 8 options (Triage + Sub-category screens) | Skips both screens entirely |
| Manager | Sees report, fixes hazard, submits resolution | Unchanged |
| HO | Approves / returns / voids resolution | Approves resolution **and** confirms AI's category — one click on the happy path |

Two screens removed from the reporter flow. Manager workflow unchanged. HO gains a single UI block on a page they were already opening.

---

## What AI is doing

After every report submission, an async batch job sends to OpenAI:

- The photo (low-detail vision, ~85 image tokens)
- The English-translated voice transcript (already produced by the existing pipeline)
- A strict JSON-schema prompt: pick one of the 8 SafeReport categories + return a confidence score 0–100

Result is written to three new columns on the `reports` row:

- `suggested_category` — AI's pick
- `confidence` — AI's confidence 0–100
- `category_source` — `'ai' | 'ho-confirmed' | 'ho-corrected'`

Uses OpenAI's **Batch API** (24-hour processing window, 50% discount). HO reviews the category whenever they next open the report for resolution-approval; no real-time SLA on AI classification.

---

## Per-report AI inference cost

Pure inference on the gpt-4o-mini classification call, with the Batch API 50% discount applied:

| Stage | Per-report cost |
|---|---|
| **Classification (batched)** | **~₹0.006 (= 0.6 paise)** |

Transcription + translation costs (~₹0.45/report combined) are unchanged from today's pipeline — they're not part of the categorization decision.

---

## Cost at scale — retail stores only

Volume assumption: **15 reports per store per month** (planning estimate; pilot data will refine).

| Scale | Annual reports | AI classification / year |
|---|---|---|
| Pilot (20 stores) | 3,600 | ~₹22 |
| Phase Azure (200 stores) | 36,000 | ~₹220 |
| Half rollout (2,000 stores) | 360,000 | ~₹2,160 |
| **Full retail (4,200 stores)** | **756,000** | **~₹4,540** |

---

## Per-store cost

| Period | Per store |
|---|---|
| Per year | **~₹1.08** |
| Per month | **~₹0.09** (9 paise) |
| Per report | ~₹0.006 (0.6 paise) |

Adding AI classification costs each store about **9 paise per month** — less than the price of a single matchstick.

---

## Sensitivity to volume assumption

If actual reports per store run higher than the 15/month planning estimate, the AI bill scales linearly with volume:

| Reports / store / month | Full-retail annual AI cost |
|---|---|
| 15 (planning assumption) | ~₹4,540 |
| 25 | ~₹7,560 |
| 40 (mature reporting culture) | ~₹12,100 |

Even at 40 reports/store/month (which would indicate an unusually engaged safety-reporting culture), annual AI spend across all 4,200 stores is ~₹12,100 — about the cost of one mid-grade business lunch.

---

## What the spend buys

The AI cost is trivial. The case for switching isn't cost-savings — it's a quality and UX upgrade:

1. **Reporter UX.** Two fewer screens. The taxonomy-pick step (cognitively expensive for low-literacy off-roll workers) disappears entirely. Reporter flow shrinks 22% in screen count.

2. **Category accuracy.** Lifts from ~70–75% (reporter picks, often miscategorized due to literacy + 8-option taxonomy) to **~95%** (AI 85–92% raw + HO catches the rest at confirm time).

3. **Audit trail.** Every report carries explicit HO sign-off on the category. Today's silent miscategorizations disappear from the dataset.

4. **Compliance defensibility.** HO becomes the single calibrating layer across all 4,200 stores. DGFASLI reporting, Factories Act compliance, insurance-claim documentation, and internal safety KPIs all sit on consistent data.

5. **Training signal.** Every HO override is a labeled data point. After ~6 months at Phase Azure scale, ABFRL has ~200k human-validated classifications — enough to fine-tune a self-hosted model and drop the OpenAI bill further if desired.

---

## Where it does not apply

- **Pilot (20 stores).** Annual AI cost would be ~₹22, but the architectural investment doesn't pay back against the small accuracy lift at this volume. Keep the current reporter-picks flow in the pilot.

- **High-severity categories (Fatality, LTI).** Hard rule: these two categories always require explicit HO dropdown selection, regardless of AI confidence. The audit downside of misclassifying a fatality "down" to a lower severity is too high to accept any UX shortcut on those cases.

---

## Open architectural decisions

Two decisions to lock before the Azure build kicks off:

### 1. Severity-floor rule

Confirm: **Fatality and Lost-Time Injury always force explicit HO dropdown selection**, no single-button approve, regardless of AI confidence. AI suggestion is still shown for those cases; HO simply can't approve without an explicit category click.

### 2. Cost ownership

Confirm: **AI inference bill runs through ABFRL's own Azure OpenAI subscription** (their tenant, their billing), not invoiced through the SafeReport platform. Affects API key management and Azure OpenAI provisioning timing. ABFRL IT to provision Azure OpenAI in parallel with the SafeReport Azure migration.

---

## Bottom line

> Per-store AI classification spend at full retail (4,200 stores) is **~₹1.08 per year, ~9 paise per month**. Annual total is **~₹4,540**. The cost is trivial. The case for switching is the **~25 percentage point accuracy lift** plus the cleaner audit trail and reporter UX improvement.
>
> **For Phase Azure: build it. For the pilot: skip it.**
