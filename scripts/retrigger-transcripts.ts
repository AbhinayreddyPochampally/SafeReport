/**
 * SafeReport — list & re-trigger failed voice transcriptions.
 *
 * Finds every report where the voice note exists but the two-stage
 * `/api/transcribe` pipeline gave up (`transcript_error IS NOT NULL`
 * AND `transcript IS NULL`). Prints a one-line summary per row, then —
 * unless `--list-only` is passed — POSTs each one back to /api/transcribe
 * to retry. The transcribe route is idempotent on a successful row
 * (it skips when `transcript` is already set) and clears
 * `transcript_error` on success.
 *
 * Run from the repo root:
 *
 *   # See what's stuck, don't retry yet:
 *   tsx scripts/retrigger-transcripts.ts --list-only
 *
 *   # Retry against local dev:
 *   tsx scripts/retrigger-transcripts.ts
 *
 *   # Retry against production:
 *   SR_BASE_URL=https://safereport.up.railway.app \
 *     tsx scripts/retrigger-transcripts.ts
 *
 * Requires env vars:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SR_BASE_URL                (defaults to http://localhost:3000)
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const baseUrl = process.env.SR_BASE_URL ?? "http://localhost:3000";

if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
  );
  process.exit(1);
}

const listOnly = process.argv.includes("--list-only");

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

type Row = {
  id: string;
  store_code: string;
  reported_at: string;
  transcript_error: string;
  transcript_source_lang: string | null;
  has_source_transcript: boolean;
};

async function main() {
  const { data, error } = await admin
    .from("reports")
    .select(
      "id, store_code, reported_at, transcript, transcript_source, transcript_source_lang, transcript_error, audio_url",
    )
    .not("audio_url", "is", null)
    .not("transcript_error", "is", null)
    .is("transcript", null)
    .order("reported_at", { ascending: false });

  if (error) {
    console.error("Query failed:", error.message);
    process.exit(1);
  }

  const rows: Row[] = (data ?? []).map((r) => ({
    id: r.id as string,
    store_code: r.store_code as string,
    reported_at: r.reported_at as string,
    transcript_error: r.transcript_error as string,
    transcript_source_lang: (r.transcript_source_lang as string | null) ?? null,
    has_source_transcript: Boolean(r.transcript_source),
  }));

  if (rows.length === 0) {
    console.log("No reports with failed transcriptions. Nothing to do.");
    return;
  }

  console.log(`Found ${rows.length} report(s) with failed transcription:\n`);
  for (const r of rows) {
    const when = new Date(r.reported_at).toISOString().replace("T", " ").slice(0, 16);
    const stage = r.has_source_transcript
      ? `Stage B (translation) failed; source lang=${r.transcript_source_lang ?? "?"}`
      : "Stage A (transcription) failed";
    console.log(`  ${r.id}  store=${r.store_code}  filed=${when}Z`);
    console.log(`    ${stage}`);
    console.log(`    reason: ${r.transcript_error}`);
  }

  if (listOnly) {
    console.log("\n--list-only set; not retrying. Re-run without the flag to retry.");
    return;
  }

  console.log(`\nRe-triggering /api/transcribe against ${baseUrl}...\n`);

  let ok = 0;
  let fail = 0;
  for (const r of rows) {
    process.stdout.write(`  ${r.id} ... `);
    try {
      const res = await fetch(`${baseUrl}/api/transcribe`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ report_id: r.id }),
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.ok) {
        console.log(`OK (${res.status})`);
        ok += 1;
      } else {
        console.log(`FAILED (${res.status}) ${JSON.stringify(body)}`);
        fail += 1;
      }
    } catch (err) {
      console.log(`ERROR ${err instanceof Error ? err.message : String(err)}`);
      fail += 1;
    }
  }

  console.log(`\nDone. ${ok} retried, ${fail} still failing.`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
