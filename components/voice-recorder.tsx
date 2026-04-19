"use client"

/**
 * Voice-note recorder for the Evidence screen.
 *
 * States (explicit, because MediaRecorder's own state names are fine but
 * don't cover the "recording is done but we haven't finalised the blob"
 * gap, nor the post-record playback state):
 *   idle        → nothing recorded yet, tap the mic to start
 *   requesting  → waiting on getUserMedia permission
 *   recording   → actively capturing; live waveform + timer
 *   ready       → recording finished, blob available; play to preview
 *   playing     → previewing the saved blob
 *
 * Constraints (per CLAUDE.md):
 *   - 3 s minimum, 120 s maximum
 *   - MIME audio/webm; we'll fall back to whatever `isTypeSupported` lands on
 *   - Live waveform driven by an AnalyserNode on the mic input
 *
 * The caller owns the resulting Blob (via `onChange`) so the parent page
 * can stash it on the per-tab blobStore under the draftId.
 */

import { Mic, Play, Square, Trash2 } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

const MIN_SECONDS = 3
const MAX_SECONDS = 120
const BAR_COUNT = 40
const TARGET_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4", // Safari on iOS ≥ 14.5
  "audio/ogg;codecs=opus",
]

type Props = {
  value: Blob | null
  onChange: (blob: Blob | null) => void
}

type Status = "idle" | "requesting" | "recording" | "ready" | "playing"

export function VoiceRecorder({ value, onChange }: Props) {
  const [status, setStatus] = useState<Status>(value ? "ready" : "idle")
  const [elapsed, setElapsed] = useState(0) // seconds
  const [bars, setBars] = useState<number[]>(() => new Array(BAR_COUNT).fill(3))
  const [error, setError] = useState<string | null>(null)

  const mediaRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const rafRef = useRef<number | null>(null)
  const startTsRef = useRef<number>(0)
  const timerRef = useRef<number | null>(null)
  const playerRef = useRef<HTMLAudioElement | null>(null)
  const playerUrlRef = useRef<string | null>(null)

  // ---- Cleanup ------------------------------------------------------------

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const teardownAudioGraph = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (timerRef.current !== null) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }
    analyserRef.current = null
  }, [])

  useEffect(() => {
    return () => {
      teardownAudioGraph()
      stopStream()
      if (playerUrlRef.current) URL.revokeObjectURL(playerUrlRef.current)
    }
  }, [teardownAudioGraph, stopStream])

  // Keep an <audio> element pointed at the current blob for playback.
  useEffect(() => {
    if (playerUrlRef.current) {
      URL.revokeObjectURL(playerUrlRef.current)
      playerUrlRef.current = null
    }
    if (value) {
      const url = URL.createObjectURL(value)
      playerUrlRef.current = url
      if (!playerRef.current) playerRef.current = new Audio()
      playerRef.current.src = url
      playerRef.current.onended = () => setStatus("ready")
    } else {
      playerRef.current?.pause()
      playerRef.current = null
    }
  }, [value])

  // ---- Recording ----------------------------------------------------------

  function pickMimeType(): string | undefined {
    if (typeof MediaRecorder === "undefined") return undefined
    for (const m of TARGET_MIME_TYPES) {
      if (MediaRecorder.isTypeSupported(m)) return m
    }
    return undefined
  }

  async function startRecording() {
    setError(null)
    setStatus("requesting")
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Build the analyser graph for the waveform.
      type ACCtor = typeof AudioContext
      const Ctor: ACCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: ACCtor }).webkitAudioContext
      const ctx = new Ctor()
      audioCtxRef.current = ctx
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      analyserRef.current = analyser
      const src = ctx.createMediaStreamSource(stream)
      src.connect(analyser)

      // MediaRecorder
      const mimeType = pickMimeType()
      const mr = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)
      mediaRef.current = mr
      chunksRef.current = []
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }
      mr.onstop = () => {
        const type = mr.mimeType || "audio/webm"
        const blob = new Blob(chunksRef.current, { type })
        onChange(blob)
        teardownAudioGraph()
        stopStream()
        setStatus("ready")
      }
      mr.start()

      startTsRef.current = Date.now()
      setElapsed(0)
      timerRef.current = window.setInterval(() => {
        const s = Math.floor((Date.now() - startTsRef.current) / 1000)
        setElapsed(s)
        if (s >= MAX_SECONDS) {
          stopRecording()
        }
      }, 250)

      // Waveform loop.
      const buf = new Uint8Array(analyser.frequencyBinCount)
      const tick = () => {
        if (!analyserRef.current) return
        analyserRef.current.getByteFrequencyData(buf)
        const next: number[] = new Array(BAR_COUNT)
        const step = Math.max(1, Math.floor(buf.length / BAR_COUNT))
        for (let i = 0; i < BAR_COUNT; i++) {
          const v = buf[i * step] ?? 0
          // Map 0-255 → 3-24 px bar height.
          next[i] = 3 + Math.round((v / 255) * 21)
        }
        setBars(next)
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)

      setStatus("recording")
    } catch (err) {
      console.error("Mic permission / record failed:", err)
      setError(
        "Couldn't access the microphone. Check your browser permissions and try again.",
      )
      teardownAudioGraph()
      stopStream()
      setStatus("idle")
    }
  }

  function stopRecording() {
    if (!mediaRef.current) return
    if (mediaRef.current.state === "recording") {
      mediaRef.current.stop() // triggers onstop → finalises blob
    }
  }

  function discard() {
    playerRef.current?.pause()
    onChange(null)
    setStatus("idle")
    setElapsed(0)
    setBars(new Array(BAR_COUNT).fill(3))
  }

  function togglePlay() {
    if (!playerRef.current) return
    if (status === "playing") {
      playerRef.current.pause()
      setStatus("ready")
    } else {
      void playerRef.current.play()
      setStatus("playing")
    }
  }

  // ---- Render -------------------------------------------------------------

  const tooShort = elapsed < MIN_SECONDS

  // Idle — show the big "Tap to record" tile.
  if (status === "idle" || status === "requesting") {
    return (
      <div>
        <button
          type="button"
          onClick={startRecording}
          disabled={status === "requesting"}
          className="flex h-24 w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white px-4 text-left transition hover:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/40 disabled:opacity-60"
        >
          <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700" aria-hidden>
            <Mic className="h-6 w-6" strokeWidth={1.8} />
          </span>
          <span className="flex flex-col">
            <span className="text-[14px] font-medium text-slate-900">
              {status === "requesting"
                ? "Requesting microphone…"
                : "Tap to record a voice note"}
            </span>
            <span className="text-[12px] text-slate-500">
              Up to {MAX_SECONDS}s · optional
            </span>
          </span>
        </button>
        {error && (
          <p className="mt-2 rounded-md bg-orange-100 px-3 py-2 text-[13px] text-orange-700">
            {error}
          </p>
        )}
      </div>
    )
  }

  // Recording / ready / playing — always show the waveform + controls row.
  const showStopButton = status === "recording"
  const showPlayButton = status === "ready" || status === "playing"

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-3">
        {showStopButton && (
          <button
            type="button"
            onClick={stopRecording}
            disabled={tooShort}
            aria-label="Stop recording"
            title={tooShort ? `Keep recording (min ${MIN_SECONDS}s)` : "Stop"}
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-indigo-700 text-white transition hover:bg-indigo-900 focus:outline-none focus:ring-4 focus:ring-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Square className="h-4 w-4" strokeWidth={2} fill="currentColor" />
          </button>
        )}
        {showPlayButton && (
          <button
            type="button"
            onClick={togglePlay}
            aria-label={status === "playing" ? "Pause" : "Play"}
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-indigo-700 text-white transition hover:bg-indigo-900 focus:outline-none focus:ring-4 focus:ring-indigo-500/40"
          >
            {status === "playing" ? (
              <Square className="h-4 w-4" strokeWidth={2} fill="currentColor" />
            ) : (
              <Play className="ml-0.5 h-4 w-4" strokeWidth={2} fill="currentColor" />
            )}
          </button>
        )}

        {/* Waveform — animates during recording, sits static otherwise. */}
        <div className="flex h-8 flex-1 items-center gap-[3px]" aria-hidden>
          {bars.map((h, i) => (
            <span
              key={i}
              className={`w-[3px] rounded-full ${
                status === "recording" ? "bg-indigo-500" : "bg-slate-400"
              }`}
              style={{ height: `${h}px` }}
            />
          ))}
        </div>

        <div className="flex w-14 flex-shrink-0 flex-col items-end">
          <span className="text-[13px] font-mono font-medium text-slate-900">
            {formatSeconds(elapsed)}
          </span>
          {status === "recording" && tooShort && (
            <span className="text-[10px] text-slate-500">
              min {MIN_SECONDS}s
            </span>
          )}
        </div>
      </div>

      {status !== "recording" && value && (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={discard}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium text-slate-600 hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden />
            Discard & re-record
          </button>
        </div>
      )}

      {error && (
        <p className="mt-2 rounded-md bg-orange-100 px-3 py-2 text-[13px] text-orange-700">
          {error}
        </p>
      )}
    </div>
  )
}

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, "0")}`
}
