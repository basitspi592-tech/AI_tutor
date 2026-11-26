"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

interface NotebookRow {
  id: string;
  title: string;
  _count?: { sources: number; artifacts: number };
}

interface SourceRow {
  id: string;
  title: string | null;
  kind: string;
  url: string | null;
  status: string;
}

interface ArtifactRow {
  id: string;
  kind: string;
  title: string | null;
  status: string;
  content: string | null;
  error: string | null;
}

const PENDING_STATUSES = new Set(["pending", "in_progress", "unknown"]);

type ArtifactKind =
  | "video"
  | "quiz"
  | "report"
  | "flashcards"
  | "audio"
  | "mind_map";

const ARTIFACT_OPTIONS: {
  kind: ArtifactKind;
  emoji: string;
  labelKey: string;
}[] = [
  { kind: "video", emoji: "🎬", labelKey: "kindVideo" },
  { kind: "quiz", emoji: "❓", labelKey: "kindQuiz" },
  { kind: "report", emoji: "📄", labelKey: "kindReport" },
  { kind: "flashcards", emoji: "🃏", labelKey: "kindFlashcards" },
  { kind: "audio", emoji: "🎧", labelKey: "kindAudio" },
  { kind: "mind_map", emoji: "🧭", labelKey: "kindMindMap" },
];

const INTERACTIVE_KINDS = new Set<ArtifactKind>(["quiz", "flashcards"]);

const STORAGE_PREFIX = "ai-tutor.notebooks.";
const SELECTED_KEY = `${STORAGE_PREFIX}selected`;
const TOPIC_KEY = `${STORAGE_PREFIX}topic`;
const KIND_KEY = `${STORAGE_PREFIX}kind`;

const ARTIFACT_EMOJI: Record<string, string> = {
  video: "🎬",
  quiz: "❓",
  report: "📄",
  flashcards: "🃏",
  audio: "🎧",
  mind_map: "🧭",
  infographic: "📊",
  slide_deck: "🖼️",
  data_table: "📋",
};

export default function NotebooksPage() {
  const t = useTranslations("notebook");

  const [notebooks, setNotebooks] = useState<NotebookRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactRow[]>([]);

  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [addingSource, setAddingSource] = useState(false);
  const [topic, setTopic] = useState("");
  const [kind, setKind] = useState<ArtifactKind>("video");
  const [format, setFormat] = useState("explainer");
  const [reportFormat, setReportFormat] = useState("study_guide");
  const [difficulty, setDifficulty] = useState("medium");
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const openNotebook = useCallback(
    async (id: string) => {
      setSelectedId(id);
      setError(null);
      try {
        const [sRes, aRes] = await Promise.all([
          fetch(`/api/notebooks/${id}/sources`, { cache: "no-store" }),
          fetch(`/api/notebooks/${id}/artifacts`, { cache: "no-store" }),
        ]);
        const sData = await sRes.json();
        const aData = await aRes.json();
        if (!sRes.ok) throw new Error(sData?.error || t("loadError"));
        if (!aRes.ok) throw new Error(aData?.error || t("loadError"));
        setSources(sData.sources as SourceRow[]);
        setArtifacts(aData.artifacts as ArtifactRow[]);
      } catch (e) {
        setSources([]);
        setArtifacts([]);
        setError(e instanceof Error ? e.message : t("loadError"));
      }
    },
    [t]
  );

  useEffect(() => {
    let restoredId: string | null = null;
    let savedTopic: string | null = null;
    let savedKind: string | null = null;
    try {
      restoredId = localStorage.getItem(SELECTED_KEY);
      savedTopic = localStorage.getItem(TOPIC_KEY);
      savedKind = localStorage.getItem(KIND_KEY);
    } catch {
      /* storage unavailable */
    }

    fetch("/api/notebooks", { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || t("loadError"));
        const rows = data.notebooks as NotebookRow[];
        setNotebooks(rows);

        if (savedTopic) setTopic(savedTopic);
        if (savedKind && ARTIFACT_OPTIONS.some((o) => o.kind === savedKind)) {
          setKind(savedKind as ArtifactKind);
        }

        if (
          restoredId &&
          Boolean(data.connected) &&
          rows.some((n) => n.id === restoredId)
        ) {
          await openNotebook(restoredId);
        }
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : t("loadError"))
      )
      .finally(() => setLoading(false));
  }, [t, openNotebook]);

  useEffect(() => {
    try {
      if (selectedId) localStorage.setItem(SELECTED_KEY, selectedId);
    } catch {
      /* storage unavailable */
    }
  }, [selectedId]);

  useEffect(() => {
    try {
      localStorage.setItem(TOPIC_KEY, topic);
    } catch {
      /* storage unavailable */
    }
  }, [topic]);

  useEffect(() => {
    try {
      localStorage.setItem(KIND_KEY, kind);
    } catch {
      /* storage unavailable */
    }
  }, [kind]);

  const refreshArtifact = useCallback(
    async (artifactId: string) => {
      if (!selectedId) return;
      try {
        const res = await fetch(
          `/api/notebooks/${selectedId}/artifacts/${artifactId}`,
          { method: "POST" }
        );
        const data = await res.json();
        if (!res.ok) return;
        setArtifacts((prev) =>
          prev.map((a) => (a.id === artifactId ? (data.artifact as ArtifactRow) : a))
        );
      } catch {
        /* the next poll retries */
      }
    },
    [selectedId]
  );

  useEffect(() => {
    const busy = artifacts.filter((a) => PENDING_STATUSES.has(a.status));
    if (busy.length === 0) return;
    const timer = setInterval(() => {
      void Promise.all(busy.map((a) => refreshArtifact(a.id)));
    }, 5000);
    return () => clearInterval(timer);
  }, [artifacts, refreshArtifact]);

  function bumpCount(id: string, key: "sources" | "artifacts", delta: number) {
    setNotebooks((prev) =>
      prev.map((n) => {
        if (n.id !== id) return n;
        const counts = {
          sources: n._count?.sources ?? 0,
          artifacts: n._count?.artifacts ?? 0,
        };
        counts[key] += delta;
        return { ...n, _count: counts };
      })
    );
  }

  async function createNotebook() {
    const title = newTitle.trim();
    if (!title || creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/notebooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || t("actionError"));
      setNotebooks((prev) => [data.notebook as NotebookRow, ...prev]);
      setNewTitle("");
      await openNotebook(data.notebook.id as string);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("actionError"));
    } finally {
      setCreating(false);
    }
  }

  async function addSource(input: { url?: string; text?: string }) {
    if (!selectedId || addingSource) return;
    setAddingSource(true);
    setError(null);
    try {
      const res = await fetch(`/api/notebooks/${selectedId}/sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || t("actionError"));
      setSources((prev) => [data.source as SourceRow, ...prev]);
      bumpCount(selectedId, "sources", 1);
      setSourceUrl("");
      setSourceText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("actionError"));
    } finally {
      setAddingSource(false);
    }
  }

  async function generateArtifact() {
    const trimmed = topic.trim();
    if (!trimmed || generating || !selectedId) return;
    setGenerating(true);
    setError(null);
    try {
      if (sources.length === 0) {
        const sRes = await fetch(`/api/notebooks/${selectedId}/sources`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: trimmed, title: trimmed }),
        });
        const sData = await sRes.json();
        if (!sRes.ok) throw new Error(sData?.error || t("actionError"));
        setSources([sData.source as SourceRow]);
        bumpCount(selectedId, "sources", 1);
      }

      const body: Record<string, unknown> = { kind, instructions: trimmed };
      if (kind === "video") body.videoFormat = format;
      if (kind === "report") body.reportFormat = reportFormat;
      if (kind === "quiz" || kind === "flashcards") body.difficulty = difficulty;

      const res = await fetch(`/api/notebooks/${selectedId}/artifacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || t("actionError"));
      setArtifacts((prev) => [data.artifact as ArtifactRow, ...prev]);
      bumpCount(selectedId, "artifacts", 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("actionError"));
    } finally {
      setGenerating(false);
    }
  }

  async function removeArtifact(artifactId: string) {
    if (!selectedId) return;
    try {
      const res = await fetch(
        `/api/notebooks/${selectedId}/artifacts/${artifactId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error || t("actionError"));
      }
      setArtifacts((prev) => prev.filter((a) => a.id !== artifactId));
      bumpCount(selectedId, "artifacts", -1);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("actionError"));
    }
  }

  function statusLabel(status: string) {
    if (status === "completed") return t("statusCompleted");
    if (status === "failed") return t("statusFailed");
    return t("statusPending");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 rounded-full border-2 animate-spin border-blue-200 border-t-blue-600" />
      </div>
    );
  }

  const selected = notebooks.find((n) => n.id === selectedId) ?? null;

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="animate-fade-in">
        <h1 className="text-2xl font-bold text-slate-900">{t("title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("subtitle")}</p>
      </div>

      {error && (
        <div className="mt-4 px-4 py-3 rounded-xl text-sm animate-fade-in bg-rose-50 border border-rose-200 text-rose-600">
          {error}
        </div>
      )}

      <div className="mt-6 flex flex-col lg:flex-row gap-6 items-start">
        {/* Left column: notebook list */}
        <aside className="w-full lg:w-72 shrink-0 lg:sticky lg:top-0 space-y-4">
          <div className="bg-white border border-slate-200 rounded-3xl p-4 shadow-sm animate-fade-in space-y-3">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void createNotebook();
              }}
              placeholder={t("notebookTitle")}
              maxLength={200}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 placeholder:text-slate-400 outline-none focus:border-blue-500"
            />
            <button
              type="button"
              onClick={() => void createNotebook()}
              disabled={creating || !newTitle.trim()}
              className="btn-primary w-full px-4 py-2.5 text-sm disabled:opacity-50"
            >
              {creating ? t("creating") : t("create")}
            </button>
            {notebooks.length === 0 && (
              <p className="text-xs text-slate-500">{t("noNotebooks")}</p>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-3xl p-2 shadow-sm animate-fade-in">
            {notebooks.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => void openNotebook(n.id)}
                className={`w-full text-start px-4 py-3 rounded-2xl border-e-[3px] transition-all ${
                  selectedId === n.id
                    ? "bg-blue-50 border-blue-600"
                    : "border-transparent hover:bg-slate-50"
                }`}
              >
                <span className="block text-sm font-semibold text-slate-800 truncate">
                  {n.title}
                </span>
                <span className="block text-[11px] text-slate-400 mt-0.5">
                  {n._count?.sources ?? 0} {t("sources")} · {n._count?.artifacts ?? 0}{" "}
                  {t("results")}
                </span>
              </button>
            ))}
          </div>
        </aside>

        {/* Right column: selected notebook */}
        <section className="flex-1 min-w-0 w-full space-y-6">
          {!selected && (
            <div className="bg-white border border-slate-200 rounded-3xl p-10 shadow-sm text-center animate-fade-in">
              <span className="text-3xl block mb-3">📓</span>
              <p className="text-sm font-medium text-slate-700">
                {notebooks.length === 0 ? t("noNotebooks") : t("selectNotebook")}
              </p>
            </div>
          )}

          {selected && (
            <>
              {/* Generate artifact */}
              <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm animate-fade-in">
                <div className="flex items-center gap-2 mb-4">
                  <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center text-base">
                    ✨
                  </span>
                  <h2 className="font-bold text-slate-900">{t("generate")}</h2>
                </div>

                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  {t("artifactType")}
                </label>
                <div className="flex flex-wrap gap-2 mt-2 mb-4">
                  {ARTIFACT_OPTIONS.map((opt) => (
                    <button
                      key={opt.kind}
                      type="button"
                      onClick={() => setKind(opt.kind)}
                      aria-pressed={kind === opt.kind}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold border transition-colors duration-200 ${
                        kind === opt.kind
                          ? "bg-blue-50 border-blue-300 text-blue-700"
                          : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300"
                      }`}
                    >
                      <span className="text-base leading-none">{opt.emoji}</span>
                      {t(opt.labelKey)}
                    </button>
                  ))}
                </div>

                <textarea
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  rows={2}
                  maxLength={2000}
                  placeholder={t("topicPlaceholder")}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl px-4 py-3 text-sm font-medium text-slate-800 placeholder:text-slate-400 outline-none transition-all resize-none"
                />
                <div className="flex flex-wrap items-center gap-3 mt-3">
                  {kind === "video" && (
                    <>
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                        {t("format")}
                      </label>
                      <select
                        value={format}
                        onChange={(e) => setFormat(e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:border-blue-500"
                      >
                        <option value="explainer">{t("formatExplainer")}</option>
                        <option value="brief">{t("formatBrief")}</option>
                        <option value="cinematic">{t("formatCinematic")}</option>
                      </select>
                    </>
                  )}
                  {kind === "report" && (
                    <>
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                        {t("reportFormat")}
                      </label>
                      <select
                        value={reportFormat}
                        onChange={(e) => setReportFormat(e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:border-blue-500"
                      >
                        <option value="study_guide">{t("reportStudyGuide")}</option>
                        <option value="briefing_doc">{t("reportBriefing")}</option>
                        <option value="blog_post">{t("reportBlog")}</option>
                      </select>
                    </>
                  )}
                  {(kind === "quiz" || kind === "flashcards") && (
                    <>
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                        {t("difficulty")}
                      </label>
                      <select
                        value={difficulty}
                        onChange={(e) => setDifficulty(e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:border-blue-500"
                      >
                        <option value="easy">{t("difficultyEasy")}</option>
                        <option value="medium">{t("difficultyMedium")}</option>
                        <option value="hard">{t("difficultyHard")}</option>
                      </select>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => void generateArtifact()}
                    disabled={generating || !topic.trim()}
                    className="btn-primary ms-auto inline-flex items-center gap-2 px-5 py-2.5 text-sm disabled:opacity-50"
                  >
                    {generating && (
                      <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                    )}
                    {generating ? t("generating") : t("generate")}
                  </button>
                </div>
                {generating && (
                  <p className="mt-3 text-xs text-slate-500">{t("generatingHint")}</p>
                )}
              </div>

              {/* Sources */}
              <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm animate-fade-in">
                <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">
                  {t("sources")}
                </h2>
                {sources.length > 0 && (
                  <ul className="space-y-2 mb-4">
                    {sources.map((s) => (
                      <li
                        key={s.id}
                        className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-100"
                      >
                        <span className="text-sm font-medium text-slate-800 truncate flex-1">
                          {s.title || s.url || s.kind}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            s.status === "ready"
                              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                              : s.status === "error"
                                ? "bg-rose-50 border-rose-200 text-rose-600"
                                : "bg-amber-50 border-amber-200 text-amber-700"
                          }`}
                        >
                          {s.status === "ready"
                            ? t("sourceReady")
                            : s.status === "error"
                              ? t("sourceError")
                              : t("sourceProcessing")}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap gap-3">
                  <input
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(e.target.value)}
                    placeholder={t("sourceUrl")}
                    className="flex-1 min-w-52 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => void addSource({ url: sourceUrl.trim() })}
                    disabled={addingSource || !sourceUrl.trim()}
                    className="px-4 py-2.5 text-sm font-medium rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-50"
                  >
                    {t("addLink")}
                  </button>
                </div>
                <div className="flex flex-wrap gap-3 mt-3">
                  <textarea
                    value={sourceText}
                    onChange={(e) => setSourceText(e.target.value)}
                    rows={2}
                    placeholder={t("sourceText")}
                    className="flex-1 min-w-52 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:border-blue-500 resize-none"
                  />
                  <button
                    type="button"
                    onClick={() => void addSource({ text: sourceText.trim() })}
                    disabled={addingSource || !sourceText.trim()}
                    className="self-start px-4 py-2.5 text-sm font-medium rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-50"
                  >
                    {t("addText")}
                  </button>
                </div>
              </div>

              {/* Results */}
              <div className="space-y-4">
                <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest">
                  {t("results")}
                </h2>
                {artifacts.length === 0 && (
                  <p className="text-sm text-slate-500">{t("emptyResults")}</p>
                )}
                {artifacts.map((a) => (
                  <div
                    key={a.id}
                    className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm animate-fade-in"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-lg">
                        {ARTIFACT_EMOJI[a.kind] ?? "📄"}
                      </span>
                      <span className="font-semibold text-slate-900 truncate flex-1">
                        {a.title || t("results")}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-wider ${
                          a.status === "completed"
                            ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                            : a.status === "failed"
                              ? "bg-rose-50 border-rose-200 text-rose-600"
                              : "bg-blue-50 border-blue-200 text-blue-700"
                        }`}
                      >
                        {statusLabel(a.status)}
                      </span>
                      <button
                        type="button"
                        onClick={() => void refreshArtifact(a.id)}
                        className="text-xs font-medium text-slate-400 hover:text-blue-600 transition-colors"
                      >
                        {t("refresh")}
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeArtifact(a.id)}
                        className="text-xs font-medium text-slate-400 hover:text-rose-600 transition-colors"
                      >
                        {t("delete")}
                      </button>
                    </div>

                    {PENDING_STATUSES.has(a.status) && (
                      <div className="flex items-center gap-3 py-4">
                        <div className="w-5 h-5 rounded-full border-2 animate-spin border-blue-200 border-t-blue-600" />
                        <span className="text-sm text-slate-500">
                          {t("artifactPending")}
                        </span>
                      </div>
                    )}

                    {a.status === "failed" && (
                      <p className="text-sm text-rose-600">
                        {a.error || t("statusFailed")}
                      </p>
                    )}

                    {a.status === "completed" && a.kind === "video" && (
                      <video
                        controls
                        preload="metadata"
                        className="w-full rounded-2xl bg-black"
                        src={`/api/notebooks/${selectedId}/artifacts/${a.id}`}
                      />
                    )}

                    {a.status === "completed" && a.kind === "audio" && (
                      <audio
                        controls
                        preload="metadata"
                        className="w-full"
                        src={`/api/notebooks/${selectedId}/artifacts/${a.id}`}
                      />
                    )}

                    {a.status === "completed" &&
                      INTERACTIVE_KINDS.has(a.kind as ArtifactKind) && (
                        <iframe
                          title={a.title || a.kind}
                          src={`/api/notebooks/${selectedId}/artifacts/${a.id}/html`}
                          sandbox="allow-scripts allow-same-origin"
                          className="w-full h-[520px] rounded-2xl border border-slate-200 bg-white"
                        />
                      )}

                    {a.status === "completed" &&
                      a.content &&
                      (a.kind === "report" || a.kind === "mind_map") && (
                        <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm leading-relaxed text-slate-700">
                          {a.content}
                        </pre>
                      )}
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
