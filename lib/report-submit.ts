/**
 * Client-side helper that packages a completed draft into the multipart body
 * expected by `POST /api/reports` and returns the created report id.
 *
 * Kept deliberately thin: no React, no state, no side effects beyond the
 * fetch. The Review page owns loading state and error rendering. Throwing an
 * Error with the server's human-readable message makes it trivial for the
 * UI to surface "Photo upload failed." or similar verbatim.
 */

export type SubmitInput = {
  sap_code: string
  category: string
  event_at: string // ISO 8601
  reporter_name: string
  reporter_phone: string
  photo: Blob
  audio?: Blob | null
  description?: string | null
}

export type SubmitResult = {
  id: string
  status: string
}

function pickExt(mime: string, fallback: string): string {
  const m = (mime || "").toLowerCase()
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg"
  if (m.includes("png")) return "png"
  if (m.includes("webp")) return "webp"
  if (m.includes("webm")) return "webm"
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3"
  if (m.includes("mp4") || m.includes("m4a")) return "m4a"
  if (m.includes("ogg")) return "ogg"
  if (m.includes("wav")) return "wav"
  return fallback
}

export async function submitReport(input: SubmitInput): Promise<SubmitResult> {
  const form = new FormData()
  form.append("sap_code", input.sap_code)
  form.append("category", input.category)
  form.append("event_at", input.event_at)
  form.append("reporter_name", input.reporter_name)
  form.append("reporter_phone", input.reporter_phone)
  if (input.description && input.description.trim().length > 0) {
    form.append("description", input.description.trim())
  }

  // Files. FormData won't infer a filename from a Blob, and our API derives
  // the storage extension from the MIME anyway — but a sensible filename
  // shows up cleaner in dev-tool network logs.
  const photoName = `photo.${pickExt(input.photo.type, "jpg")}`
  form.append("photo", input.photo, photoName)

  if (input.audio && input.audio.size > 0) {
    const audioName = `voice.${pickExt(input.audio.type, "webm")}`
    form.append("audio", input.audio, audioName)
  }

  const res = await fetch("/api/reports", {
    method: "POST",
    body: form,
  })

  // Try to parse the JSON error body so the UI can show the server's reason
  // ("Event time must be within the last 7 days.") rather than a generic
  // "Something went wrong."
  let parsed: unknown = null
  try {
    parsed = await res.json()
  } catch {
    /* ignore — non-JSON body */
  }

  if (!res.ok) {
    const reason =
      parsed && typeof parsed === "object" && parsed !== null && "error" in parsed
        ? String((parsed as { error?: unknown }).error ?? "")
        : ""
    throw new Error(reason || `Submit failed (HTTP ${res.status}).`)
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("id" in parsed) ||
    !("status" in parsed)
  ) {
    throw new Error("Unexpected response from server.")
  }

  const obj = parsed as { id: unknown; status: unknown }
  if (typeof obj.id !== "string" || typeof obj.status !== "string") {
    throw new Error("Unexpected response from server.")
  }
  return { id: obj.id, status: obj.status }
}
