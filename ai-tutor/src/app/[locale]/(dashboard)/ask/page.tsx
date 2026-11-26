"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import VideoPanel from "@/components/video/video-panel";

interface RagSource {
  ref: number;
  id: string;
  documentId: string;
  title: string;
  chunkIndex: number;
  similarity: number;
  snippet: string;
}

interface GroundedAnswer {
  answer: string;
  sources: RagSource[];
  grounded: boolean;
  usedDocuments: number;
}

function InlineText({
  text,
  keyPrefix,
  onCite,
}: {
  text: string;
  keyPrefix: string;
  onCite?: (n: number) => void;
}) {
  const nodes: React.ReactNode[] = [];
  const pattern = new RegExp(
    "`([^`\\n]+)`|\\*\\*([^*]+)\\*\\*|\\*([^*]+)\\*|\\[S(\\d+)\\]",
    "g"
  );
  let last = 0;
  let n = 0;
  let m: RegExpExecArray | null;

  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const key = `${keyPrefix}-${n++}`;

    if (m[1]) {
      nodes.push(
        <code
          key={key}
          className="px-1.5 py-0.5 rounded-md font-mono text-[13px] bg-blue-50 border border-blue-200 text-blue-700"
        >
          {m[1]}
        </code>
      );
    } else if (m[2]) {
      nodes.push(
        <strong key={key} className="text-slate-900 font-bold">
          {m[2]}
        </strong>
      );
    } else if (m[3]) {
      nodes.push(<em key={key}>{m[3]}</em>);
    } else if (m[4]) {
      const num = Number(m[4]);
      nodes.push(
        <button
          key={key}
          type="button"
          onClick={() => onCite?.(num)}
          title={`Jump to source ${num}`}
          className="mx-0.5 px-1.5 py-0.5 rounded-md text-[11px] font-bold align-middle transition-all hover:scale-110 bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100"
        >
          S{num}
        </button>
      );
    }
    last = pattern.lastIndex;
  }

  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function AnswerBody({
  answer,
  onCite,
}: {
  answer: string;
  onCite: (n: number) => void;
}) {
  const lines = answer.split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trimStart().startsWith("```")) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        body.push(lines[i]);
        i++;
      }
      i++;
      blocks.push(
          <pre
            key={`code-${i}`}
            className="my-3 p-4 rounded-xl overflow-x-auto bg-slate-50 border border-slate-200"
          >
            <code className="text-sm font-mono leading-relaxed text-slate-800">{body.join("\n")}</code>
          </pre>

      );
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={`ul-${i}`} className="my-3 space-y-1.5 pl-1">
          {items.map((item, idx) => (
            <li key={idx} className="flex gap-2">
              <span className="text-blue-600">•</span>
              <span>{InlineText({ text: item, keyPrefix: `li-${i}-${idx}`, onCite })}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    if (line.trim() === "") {
      i++;
      continue;
    }

    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !/^\s*[-*]\s+/.test(lines[i]) && !lines[i].trimStart().startsWith("```")) {
      paragraph.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={`p-${i}`} className="my-3 leading-relaxed">
        {InlineText({ text: paragraph.join(" "), keyPrefix: `p-${i}`, onCite })}
      </p>
    );
  }

  return <>{blocks}</>;
}

export default function AskDocumentsPage() {
  const t = useTranslations("documents");
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GroundedAnswer | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const sourceRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    if (active === null) return;
    const timer = setTimeout(() => setActive(null), 2200);
    return () => clearTimeout(timer);
  }, [active]);

  async function ask() {
    const trimmed = question.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setActive(null);

    try {
      const res = await fetch("/api/rag/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to get an answer.");
      setResult(data as GroundedAnswer);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to get an answer.");
    } finally {
      setLoading(false);
    }
  }

  function jumpTo(n: number) {
    setActive(n);
    sourceRefs.current[n]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      <div className="animate-fade-in">
        <h1 className="text-2xl font-bold text-slate-900">Ask your documents</h1>
        <p className="mt-1 text-sm text-slate-500">
          Answers are grounded in your uploaded files, with every claim cited
        </p>
      </div>

      <div className="animate-fade-in" style={{ animationDelay: "60ms" }}>
        <VideoPanel />
      </div>

      <div className="animate-fade-in" style={{ animationDelay: "120ms" }}>
        <div className="relative group">
          <span className="pointer-events-none absolute start-5 top-5 text-slate-400 group-focus-within:text-blue-600">🔍</span>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) ask();
            }}
            rows={3}
            maxLength={2000}
            placeholder="Ask a question about your uploaded documents..."
            className="w-full bg-white border-2 border-slate-200 focus:border-blue-600 focus:ring-4 focus:ring-blue-50 rounded-2xl ps-12 pe-6 py-5 text-lg font-medium shadow-sm transition-all outline-none resize-none"
          />
        </div>
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-slate-500">Ctrl + Enter to ask</span>
          <button type="button" onClick={ask} disabled={loading || !question.trim()} className="btn-primary px-5 py-2.5 text-sm">
            {loading ? "Thinking..." : "Ask"}
          </button>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl text-sm animate-fade-in bg-rose-50 border border-rose-200 text-rose-600">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-4">
            <div className="w-8 h-8 rounded-full border-2 animate-spin border-blue-200 border-t-blue-600" />
            <p className="text-sm text-slate-500">Searching your documents...</p>
          </div>
        </div>
      )}

      {result && !loading && (
        <>
          <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm hover:shadow-md transition-shadow animate-fade-in">
            <div className="flex items-center gap-2 mb-4">
              <span
                className={`chip text-xs uppercase tracking-wider ${
                  result.grounded
                     ? "bg-emerald-50 border-emerald-200 text-emerald-600"
                     : "bg-amber-50 border-amber-200 text-amber-600"

                }`}
              >
                {result.grounded ? "Grounded" : "Not in your documents"}
              </span>
              <span className="text-xs text-slate-500">
                {result.grounded
                  ? `${result.sources.length} source${result.sources.length === 1 ? "" : "s"} cited`
                  : `${result.usedDocuments} passage${result.usedDocuments === 1 ? "" : "s"} reviewed`}
              </span>
            </div>

            <div className="text-sm text-slate-700">
              <AnswerBody answer={result.answer} onCite={jumpTo} />
            </div>
          </div>

          {result.sources.length > 0 && (
            <div className="space-y-3">
               <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest">Sources</h2>

              {result.sources.map((source) => {
                const label = source.ref;
                const isActive = active === label;
                return (
                  <div
                    key={source.id}
                    ref={(el) => {
                      sourceRefs.current[label] = el;
                    }}
                    className={`bg-white border border-slate-200 rounded-xl p-4 hover:border-blue-200 transition-all duration-300 ${
                       isActive ? "bg-blue-50 border-blue-200 shadow-sm" : ""

                    }`}
                  >
                    <div className="flex items-start gap-3">
                       <span className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 bg-gradient-to-br from-blue-600 to-indigo-700 text-white">

                        S{label}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                           <span className="text-sm font-medium truncate text-slate-900">{source.title}</span>
                           <span className="text-xs text-slate-500">part {source.chunkIndex + 1}</span>

                          <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2.5 py-1 rounded-full border border-emerald-100">
                            {Math.round(source.similarity * 100)}% match
                          </span>
                        </div>
                         <p className="text-xs mt-2 leading-relaxed line-clamp-4 text-slate-500">{source.snippet}</p>

                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

       {!result && !loading && !error && (
        <div className="text-center py-16">
           <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center bg-blue-50 border border-blue-200">
             <svg className="w-7 h-7 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">

              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25"
              />
            </svg>
          </div>
           <p className="text-sm font-medium text-slate-700">No question yet.</p>
           <p className="text-xs mt-1 text-slate-500">

            {t("title")} — ask anything and every answer will cite its sources.
          </p>
        </div>
      )}
    </div>
  );
}