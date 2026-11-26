"use client";

import { useEffect, useRef, useState } from "react";

interface VideoSource {
  ref: number;
  title: string;
  chunkIndex: number;
  similarity: number;
}

type VideoStatus = "PENDING" | "PROCESSING" | "READY" | "ERROR";

interface TopicVideo {
  id: string;
  topic: string;
  status: VideoStatus;
  summary: string | null;
  script: string | null;
  sources: VideoSource[] | null;
  durationSeconds: number | null;
  errorMessage: string | null;
  videoUrl?: string | null;
}

const POLL_MS = 4000;

function formatDuration(seconds: number | null) {
  if (!seconds) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

const STATUS_COPY: Record<VideoStatus, string> = {
  PENDING: "Queued",
  PROCESSING: "Writing script and recording narration...",
  READY: "Ready",
  ERROR: "Failed",
};

export default function VideoPanel() {
  const [topic, setTopic] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [video, setVideo] = useState<TopicVideo | null>(null);
  const [showScript, setShowScript] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function poll(id: string) {
    try {
      const res = await fetch(`/api/video/${id}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Could not read the video status.");
      const data = await res.json();
      const next = data.video as TopicVideo;
      setVideo(next);

      if (next.status === "PENDING" || next.status === "PROCESSING") {
        timerRef.current = setTimeout(() => void poll(id), POLL_MS);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the video status.");
    }
  }

  async function generate() {
    const trimmed = topic.trim();
    if (trimmed.length < 3 || submitting) return;

    setSubmitting(true);
    setError(null);
    setVideo(null);
    setShowScript(false);
    if (timerRef.current) clearTimeout(timerRef.current);

    try {
      const res = await fetch("/api/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not start the video.");
      setVideo(data.video as TopicVideo);
      void poll(data.video.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the video.");
    } finally {
      setSubmitting(false);
    }
  }

  const busy = video?.status === "PENDING" || video?.status === "PROCESSING";

  return (
    <section className="card rounded-2xl p-5 animate-fade-in">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center bg-gradient-to-br from-blue-600 to-indigo-700">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z"
            />
          </svg>
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">Turn a topic into a narrated video</h2>
          <p className="text-xs mt-0.5 text-slate-500">
            Built from your uploads, with a written script you can read. Free to generate.
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") generate();
          }}
          maxLength={300}
          disabled={submitting || busy}
          placeholder="e.g. How does a hash table work?"
          className="input flex-1"
        />
        <button
          type="button"
          onClick={generate}
          disabled={submitting || busy || topic.trim().length < 3}
          className="btn-primary px-4 py-2.5 text-sm whitespace-nowrap"
        >
          {busy ? "Generating..." : "Create video"}
        </button>
      </div>

      {error && (
        <div className="mt-3 px-3 py-2.5 rounded-xl text-xs bg-rose-50 border border-rose-200 text-rose-700">
          {error}
        </div>
      )}

      {video && (
        <div className="mt-4 space-y-4">
          {busy && (
              <div className="flex items-center gap-3 px-3 py-3 rounded-xl text-xs bg-amber-50 border border-amber-200 text-amber-700">
                <div className="w-4 h-4 shrink-0 rounded-full border-2 animate-spin border-amber-200 border-t-amber-600" />
                <span className="min-w-0">
                  <span className="font-medium">{STATUS_COPY[video.status]}</span>
                  <span className="block mt-0.5 text-slate-500">This usually takes a minute. You can leave this page open.</span>
                </span>
              </div>

          )}

          {video.status === "ERROR" && (
              <div className="px-3 py-3 rounded-xl text-xs bg-rose-50 border border-rose-200 text-rose-700">

              <p className="font-medium">Could not generate this video.</p>
              {video.errorMessage && <p className="mt-1 opacity-80">{video.errorMessage}</p>}
            </div>
          )}

          {video.summary && (
            <div>
               <h3 className="text-xs font-semibold uppercase tracking-wide mb-1.5 text-slate-500">Summary</h3>
               <p className="text-sm leading-relaxed text-slate-700">{video.summary}</p>

            </div>
          )}

          {video.status === "READY" && (
            <div className="space-y-2">
                <video
                  key={video.id}
                  controls
                  preload="metadata"
                  className="w-full rounded-xl border border-slate-200 bg-slate-900"
                >
                  <source src={`/api/video/${video.id}/file`} type="video/mp4" />
                </video>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  {video.durationSeconds && <span>{formatDuration(video.durationSeconds)}</span>}
                  <a href={`/api/video/${video.id}/file?download=1`} className="text-blue-600 hover:text-blue-700">
                    Download MP4
                  </a>
                  <a
                    href={`/api/video/${video.id}/file?stream=audio&download=1`}
                    className="text-blue-600 hover:text-blue-700"
                  >
                    Download audio
                  </a>
                </div>

            </div>
          )}

          {video.sources && video.sources.length > 0 && (
            <div>
               <h3 className="text-xs font-semibold uppercase tracking-wide mb-2 text-slate-500">Grounded in</h3>
               <div className="flex flex-wrap gap-1.5">
                 {video.sources.map((s) => (
                   <span key={`${s.ref}-${s.chunkIndex}`} className="chip text-[11px] bg-blue-50 border-blue-200 text-blue-700">
                     {s.title} · p{s.chunkIndex + 1}
                   </span>
                 ))}
               </div>

            </div>
          )}

          {video.script && (
            <div>
              <button
                type="button"
                onClick={() => setShowScript((v) => !v)}
                 className="text-xs font-medium text-blue-600 hover:text-blue-700"

              >
                {showScript ? "Hide script" : "Read the full script"}
              </button>
              {showScript && (
                 <div className="mt-2 max-h-96 overflow-y-auto card p-4 text-sm leading-relaxed whitespace-pre-wrap text-slate-700">
                   {video.script}
                 </div>

              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
