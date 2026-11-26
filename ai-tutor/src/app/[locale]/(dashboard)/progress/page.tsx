"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

interface ProgressData {
  overall: {
    averageScore: number;
    quizzesTaken: number;
    totalQuizzes: number;
    conversations: number;
  };
  subjects: { name: string; averageScore: number }[];
  topics: {
    topic: string;
    subject: string;
    score: number;
    totalAttempts: number;
    correctAttempts: number;
  }[];
}

export default function ProgressPage() {
  const t = useTranslations("progress");
  const [data, setData] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/progress")
      .then(async (res) => {
        if (!res.ok) throw new Error();
        setData(await res.json());
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const scoreTone = (pct: number) => {
    if (pct >= 70) return { text: "text-emerald-600", bar: "bg-emerald-500" };
    if (pct >= 40) return { text: "text-amber-600", bar: "bg-amber-500" };
    return { text: "text-rose-600", bar: "bg-rose-500" };
  };

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      <div className="animate-fade-in">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t("title")}</h1>
        <p className="mt-1 text-sm text-slate-400">
          Track your learning journey and academic growth
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="flex flex-col items-center gap-4">
            <div className="w-8 h-8 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin" />
            <p className="text-sm text-slate-500">Loading your progress...</p>
          </div>
        </div>
      ) : error || !data ? (
        <div className="px-4 py-3 rounded-xl text-sm animate-fade-in bg-rose-50 border border-rose-200 text-rose-600">
          Could not load your progress. Please refresh the page.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 stagger-children">
            {[
              {
                label: t("overall"),
                value: `${Math.round(data.overall.averageScore)}%`,
                tone: "text-blue-600",
                iconBg: "bg-blue-50 border-blue-200 text-blue-600",
                icon: (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
                  </svg>
                ),
              },
              {
                label: t("quizzesTaken"),
                value: `${data.overall.quizzesTaken}/${data.overall.totalQuizzes}`,
                tone: "text-violet-600",
                iconBg: "bg-violet-50 border-violet-200 text-violet-600",
                icon: (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
                  </svg>
                ),
              },
              {
                label: "Conversations",
                value: `${data.overall.conversations}`,
                tone: "text-cyan-600",
                iconBg: "bg-cyan-50 border-cyan-200 text-cyan-600",
                icon: (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 0 1 1.037-.443 48.282 48.282 0 0 0 5.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
                  </svg>
                ),
              },
            ].map((stat) => (
              <div key={stat.label} className="card p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider mb-2 text-slate-500">
                      {stat.label}
                    </p>
                    <p className={`text-3xl font-bold tracking-tight animate-fade-in ${stat.tone}`}>
                      {stat.value}
                    </p>
                  </div>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${stat.iconBg}`}>
                    {stat.icon}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="card p-6 animate-fade-in">
            <h2 className="text-base font-bold mb-1 text-slate-900">{t("subjects")}</h2>
            <p className="text-sm mb-6 text-slate-500">Your progress across different subjects</p>
            {data.subjects.length === 0 ? (
              <div className="text-center py-14">
                <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center bg-blue-50 border border-blue-200">
                  <svg className="w-7 h-7 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-slate-600">No subjects studied yet.</p>
                <p className="text-xs mt-1 text-slate-500">Take a quiz to start building your progress!</p>
              </div>
            ) : (
              <div className="space-y-5">
                {data.subjects.map((subject) => {
                  const pct = Math.round(subject.averageScore);
                  const { text, bar } = scoreTone(pct);
                  return (
                    <div key={subject.name}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-slate-700">{subject.name}</span>
                        <span className={`text-sm font-bold ${text}`}>{pct}%</span>
                      </div>
                      <div className="progress-track h-2">
                        <div className={`progress-fill h-full ${bar}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {data.topics.length > 0 && (
            <div className="card p-6 animate-fade-in">
              <h2 className="text-base font-bold mb-1 text-slate-900">{t("topics")}</h2>
              <p className="text-sm mb-6 text-slate-500">Your mastery per topic based on quiz results</p>
              <div className="space-y-2.5">
                {data.topics.map((topic) => {
                  const pct = Math.round(topic.score);
                  const { text } = scoreTone(pct);
                  return (
                    <div
                      key={`${topic.subject}-${topic.topic}`}
                      className="flex items-center gap-4 p-3.5 rounded-xl bg-slate-50 border border-slate-200 hover:bg-white hover:border-blue-300 transition-colors"
                    >
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 bg-white border border-slate-200 ${text}`}>
                        {pct}%
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate text-slate-800">{topic.topic}</p>
                        <p className="text-xs text-slate-500">{topic.subject}</p>
                      </div>
                      <span className="text-xs whitespace-nowrap text-slate-500">
                        {topic.correctAttempts}/{topic.totalAttempts} correct
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
