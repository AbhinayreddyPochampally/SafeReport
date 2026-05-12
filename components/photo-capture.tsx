"use client"

/**
 * Photo capture tile for the Evidence screen.
 *
 * Behaviour:
 *   - Two explicit buttons: "Take photo" (camera intent) and "From gallery"
 *     (no capture hint, so the OS shows the photo library). A single input
 *     with no `capture` attribute is supposed to surface both options on
 *     Android, but several OEM browsers (MIUI, Samsung Internet on older
 *     builds, UC Browser) silently jump straight to the camera. Splitting
 *     into two inputs makes the gallery path always reachable.
 *   - Once a file is chosen we decode it, downscale to 1600px longest edge,
 *     and re-encode at JPEG 80 quality. That keeps uploads well under the
 *     10 MB limit enforced by `/api/reports` without sacrificing readability
 *     of signage / shelf damage / spill details.
 *   - The caller owns the compressed Blob; this component just reports it.
 *   - Retake swaps the blob and preview in place — no modal.
 *
 * EXIF: we use `createImageBitmap({ imageOrientation: "from-image" })` where
 * available so portrait photos don't land sideways. Browsers that don't
 * support the option fall back to the naïve Image path; modern iOS/Android
 * browsers are fine either way because they auto-rotate JPEGs.
 */

import { Camera, ImageIcon, RefreshCcw } from "lucide-react"
import { useCallback, useRef, useState } from "react"

const MAX_EDGE = 1600 // pixels
const JPEG_QUALITY = 0.8

type Props = {
  value: Blob | null
  onChange: (blob: Blob | null) => void
  /** Accent tone for the tile border when empty. Slate for observation, amber for incident. */
  tone: "slate" | "amber"
}

export function PhotoCapture({ value, onChange, tone }: Props) {
  const cameraRef = useRef<HTMLInputElement | null>(null)
  const galleryRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const openCamera = useCallback(() => {
    cameraRef.current?.click()
  }, [])
  const openGallery = useCallback(() => {
    galleryRef.current?.click()
  }, [])

  const onFile = useCallback(
    async (file: File) => {
      setBusy(true)
      setError(null)
      try {
        const compressed = await compressImage(file)
        // Release any previous object URL before swapping.
        if (previewUrl) URL.revokeObjectURL(previewUrl)
        const url = URL.createObjectURL(compressed)
        setPreviewUrl(url)
        onChange(compressed)
      } catch (err) {
        console.error("Photo compress failed:", err)
        setError("Couldn't process that photo — please try again.")
        onChange(null)
      } finally {
        setBusy(false)
      }
    },
    [onChange, previewUrl],
  )

  const borderTone =
    tone === "slate"
      ? "border-slate-300 hover:border-slate-500"
      : "border-amber-300 hover:border-amber-500"
  const iconTone = tone === "slate" ? "text-slate-600" : "text-amber-700"
  const bgTone = tone === "slate" ? "bg-slate-100" : "bg-amber-100"

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) void onFile(f)
    // Reset so picking the same file twice still fires onChange.
    e.target.value = ""
  }

  return (
    <div>
      {/* Camera input — `capture` hint forces the camera intent on mobile. */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={onInputChange}
      />
      {/* Gallery input — no `capture` so the OS picker shows the photo library. */}
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={onInputChange}
      />

      {value && previewUrl ? (
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-900">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Captured photo preview"
            className="h-56 w-full object-cover"
          />
          <div className="absolute bottom-3 right-3 flex gap-2">
            <button
              type="button"
              onClick={openGallery}
              className="inline-flex items-center gap-1 rounded-full bg-white/95 px-3 py-1.5 text-[12px] font-medium text-slate-900 shadow-sm transition hover:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/40"
            >
              <ImageIcon className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden />
              Gallery
            </button>
            <button
              type="button"
              onClick={openCamera}
              className="inline-flex items-center gap-1 rounded-full bg-white/95 px-3 py-1.5 text-[12px] font-medium text-slate-900 shadow-sm transition hover:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/40"
            >
              <RefreshCcw className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden />
              Retake
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={openCamera}
            disabled={busy}
            className={`flex h-40 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed ${borderTone} bg-white transition focus:outline-none focus:ring-4 focus:ring-indigo-500/40 disabled:opacity-60`}
            aria-label="Take a photo with the camera"
          >
            <span
              className={`flex h-12 w-12 items-center justify-center rounded-full ${bgTone} ${iconTone}`}
              aria-hidden
            >
              <Camera className="h-6 w-6" strokeWidth={1.8} />
            </span>
            <span className="text-[13px] font-medium text-slate-900">
              {busy ? "Processing…" : "Take photo"}
            </span>
            <span className="text-[11px] text-slate-500">Use camera</span>
          </button>
          <button
            type="button"
            onClick={openGallery}
            disabled={busy}
            className={`flex h-40 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed ${borderTone} bg-white transition focus:outline-none focus:ring-4 focus:ring-indigo-500/40 disabled:opacity-60`}
            aria-label="Choose a photo from the gallery"
          >
            <span
              className={`flex h-12 w-12 items-center justify-center rounded-full ${bgTone} ${iconTone}`}
              aria-hidden
            >
              <ImageIcon className="h-6 w-6" strokeWidth={1.8} />
            </span>
            <span className="text-[13px] font-medium text-slate-900">
              From gallery
            </span>
            <span className="text-[11px] text-slate-500">Pick existing photo</span>
          </button>
        </div>
      )}

      {!value && (
        <p className="mt-2 text-center text-[11px] text-slate-400">
          Photo required · JPEG or PNG · up to 10 MB
        </p>
      )}

      {error && (
        <p className="mt-2 rounded-md bg-orange-100 px-3 py-2 text-[13px] text-orange-700">
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * Decode → scale to 1600px longest edge → re-encode as JPEG 80.
 * Uses `createImageBitmap` where supported to get cheap EXIF handling;
 * otherwise falls back to a naïve `Image` decode.
 */
async function compressImage(file: File): Promise<Blob> {
  // Prefer ImageBitmap — it decodes off the main thread and respects EXIF
  // when the option is supported.
  type BitmapOpts = ImageBitmapOptions & { imageOrientation?: "from-image" | "none" }
  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    } as BitmapOpts)
  } catch {
    bitmap = null
  }

  let width: number, height: number, source: CanvasImageSource
  if (bitmap) {
    width = bitmap.width
    height = bitmap.height
    source = bitmap
  } else {
    const img = await decodeAsImage(file)
    width = img.naturalWidth
    height = img.naturalHeight
    source = img
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(width, height))
  const w = Math.max(1, Math.round(width * scale))
  const h = Math.max(1, Math.round(height * scale))

  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas 2D context unavailable")
  ctx.drawImage(source, 0, 0, w, h)

  // Clean up the bitmap if we created one — it's a GPU-backed handle.
  if (bitmap && "close" in bitmap) bitmap.close()

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
      "image/jpeg",
      JPEG_QUALITY,
    )
  })
  return blob
}

function decodeAsImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Image decode failed"))
    }
    img.src = url
  })
}
