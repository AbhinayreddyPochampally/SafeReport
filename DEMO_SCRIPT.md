# SafeReport — Monday Demo Script (≈6 minutes)

**Audience:** Abhinay's manager + Team Alpha at IIM Mumbai.
**Goal:** Show that every promise in the v5 design document is a working feature, not a slide.

---

## Pre-demo checklist (Sunday evening)

- [ ] `https://safereport-demo.up.railway.app` (or your actual URL) loads without errors.
- [ ] Supabase project is healthy (check a simple `select count(*) from reports`).
- [ ] Two browser windows open and positioned:
  - **Left:** Laptop browser logged into `/ho/overview`.
  - **Right:** Laptop browser on `/m/PNT-MUM-047/dashboard` (already PIN-unlocked).
- [ ] Phone open with `/r/PNT-MUM-047` as a home-screen icon. Notifications allowed.
- [ ] Audio input/output tested. Speakers not muted.
- [ ] A screen-capture video of the full flow saved as a fallback in case the network dies mid-demo.

---

## Opening (15 seconds)

> "Safety incidents in retail go unreported — not because they don't happen, but because reporting is too slow, too complex, or too scary. We built SafeReport to close that gap. Let me show you."

---

## Act 1: Filing a report (90 seconds)

1. Hold up phone. Tap the **SafeReport** icon on the home screen.
2. Narrate: *"No login. The store identity came from the QR code I scanned. Anyone can report."*
3. Tap **Observation** (green card).
4. Tap **Unsafe condition**.
5. Tap **Continue** on the date/time screen (defaults to now).
6. Tap **Take photo** → photograph a water bottle / anything nearby. Call it out: *"The hazard — a wet patch on the floor."*
7. Hold the microphone button. Say in Hindi (or Tamil):
   > "यहाँ फर्श पर पानी गिरा हुआ है। कोई फिसल सकता है।"
   > *("There is water spilled on the floor here. Someone might slip.")*
8. Release. The waveform appears.
9. Tap **Submit**.
10. Big green checkmark → **"Report submitted. You will be notified when resolved."**

> *"From opening the app to confirmation: about 30 seconds. The voice note was in Hindi. Let me switch to the laptop."*

---

## Act 2: Realtime manager (45 seconds)

1. Point at the manager tab on the laptop — **a toast has already appeared: "New report — Unsafe condition"**.
2. The "New" card counter ticks up.
3. Click the new ticket.
4. The reporter's photo is there.
5. *"Watch the transcript box…"* — after ~15 seconds, the English translation appears automatically. Whisper turned the Hindi voice note into English.
6. Click **Acknowledge** → status becomes "In progress".

> *"The reporter's name is hidden from the manager. This is design decision §12.1 — anonymity encourages reporting."*

---

## Act 3: Resolving (45 seconds)

1. *"The manager walks over, places a wet-floor sign, mops it. Now they document the fix."*
2. Back on the laptop, click **Resolve this issue**.
3. Take a second photo (any object — the dry floor).
4. Type:
   > "Area mopped dry, wet-floor signage placed. Housekeeping briefed."
5. Submit to HO.
6. Blue checkmark — *"Sent for HO review. Not closed yet — HO has to approve."*

---

## Act 4: HO approval (60 seconds)

1. Switch to the HO tab.
2. Click **Approval Queue** in the sidebar. The new ticket is at the top.
3. *"Two-column split view. Click a ticket — full detail loads on the right."*
4. Show the before/after photo pair.
5. Click **Approve**.
6. Ticket disappears. Queue count drops by 1.

7. Switch back to the phone. A push notification should appear: **"Your report was resolved."**
8. *"The loop closes. The reporter who noticed the hazard knows it was fixed. This is why people report again next time."*

---

## Act 5: Bulk Excel (60 seconds)

1. HO sidebar → **Store Management**.
2. *"The whole ABFRL portfolio is 4,420 stores. We don't manage them one click at a time."*
3. Click **Download Template**. Show the xlsx — has columns for SAP Code, Name, Brand, Manager, etc.
4. Open a pre-filled demo xlsx (have one ready in `/public/demo/bulk-stores-demo.xlsx`).
5. Click **Upload Excel**. Pick the file.
6. Toast appears: **"3 stores created, 2 updated. New PINs generated."**
7. Scroll the stores table — the new rows appear.

> *"Managers transfer, stores open and close. This turns a batch operation into two clicks."*

---

## Act 6: Analytics (45 seconds)

1. Click **Overview**.
2. *"Five headline metrics at the top — total reports, open tickets, average resolution time, first-attempt rate, silent stores."*
3. Point at the **Reporting Trend** chart: *"Green line is observations, red is incidents. What you want to see: green rising, red staying flat. That means people are catching hazards before they become injuries."*
4. Point at **Observation vs Incident split** donut: *"The higher the green share, the healthier the safety culture."*
5. Change the time filter from **Quarter** to **Week** — watch the charts reload instantly.

---

## Closing (30 seconds)

> "Ten stores seeded. Sixty reports flowing. Built on Supabase and Railway in about three days. At ABFRL's full 4,420-store scale, this costs roughly ₹7.8 per store per month. Whisper handles voice in every Indian language. Managers get realtime pushes. HO gets one dashboard for the entire network.
>
> *"We're ready to pilot in ten stores."*

---

## Q&A cheat sheet

**"Why not WhatsApp?"** — Structured capture (photo + voice + category) is hard to enforce inside WhatsApp. PWA gives us control over the flow. Also, WhatsApp Business API has per-message costs and a Meta approval process. Design §6.1.

**"How do you handle the language mix?"** — Whisper's *translations* endpoint accepts any input language and always returns English. One model, all of India.

**"What about offline?"** — The service worker caches the app shell and queues submissions when connectivity is poor. Photo capture works 100% offline. Evidence is never lost. Design §14.7.

**"Is it secure?"** — Bcrypt for PINs. Row-level security on Postgres. Supabase Auth for HO. Service-role key only on server. For production we'd layer on Entra ID SSO and rate limiting. Design §12.

**"Can reporters be identified later?"** — Yes — by HO for investigation, never by the manager. Design §8.3.

**"Why 10 stores for pilot?"** — Tight feedback loop. Enough to catch edge cases across two cities and two brands. Small enough that we can visit each one in person during the first two weeks.

---

## If things break mid-demo

1. **Railway is down** → switch to the screen-capture video.
2. **Whisper is slow** → point at the audio playback bar instead ("manager can always listen to the original").
3. **Push doesn't arrive on phone** → point at the in-app toast in the open reporter tab (still realtime, same effect).
4. **Realtime event drops** → refresh once, blame the IIM Wi-Fi, continue.

---

Good luck. You built the thing, now show it.
