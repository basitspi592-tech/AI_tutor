"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
}

interface Quiz {
  id: string;
  title: string | null;
  status: string;
  questions: QuizQuestion[];
  answers?: number[] | null;
  score?: number | null;
}

interface Subject {
  id: string;
  name: string;
}

interface Topic {
  id: string;
  name: string;
}

interface QuizResult {
  correct: number;
  total: number;
  score: number;
}

const QUESTION_COUNTS = [5, 10, 20, 50, 100];
const UNANSWERED = -1;

type Mode = "list" | "take" | "result";

function cleanOption(option: string): string {
  return option.replace(/^[A-D]\)\s*/, "");
}

function optionLetter(index: number): string {
  return String.fromCharCode(65 + index);
}


export default function QuizzesPage() {
  const t = useTranslations("quiz");

  const [mode, setMode] = useState<Mode>("list");
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);

  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [selectedTopicId, setSelectedTopicId] = useState("");
  const [topicSearch, setTopicSearch] = useState("");
  const [questionCount, setQuestionCount] = useState(10);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [rowBusy, setRowBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(true);

  const loadQuizzes = useCallback(async () => {
    try {
      const res = await fetch("/api/quizzes");
      if (!res.ok) throw new Error("Failed to load quizzes");
      const data = await res.json();
      setQuizzes((data.quizzes ?? []) as Quiz[]);
    } catch {
      // Silent fail - list stays empty
    }
  }, []);

  useEffect(() => {
    fetch("/api/quizzes")
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const data = await res.json();
        setQuizzes((data.quizzes ?? []) as Quiz[]);
      })
      .catch(() => {
        // Silent fail - list stays empty
      });

    fetch("/api/subjects")
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const data = await res.json();
        setSubjects((data.subjects ?? []) as Subject[]);
      })
      .catch(() => {
        // Silent fail
      });
  }, []);

  const selectSubject = async (subjectId: string) => {
    setSelectedSubjectId(subjectId);
    setSelectedTopicId("");
    setTopics([]);
    if (!subjectId) return;
    try {
      const res = await fetch(
        `/api/topics?subjectId=${encodeURIComponent(subjectId)}`
      );
      if (!res.ok) throw new Error("Failed to load topics");
      const data = await res.json();
      setTopics((data.topics ?? []) as Topic[]);
    } catch {
      // Silent fail
    }
  };

  const pickTopic = (topicId: string) => {
    setSelectedTopicId(topicId);
    setTopicSearch("");
  };

  const createQuiz = async () => {
    const customTopic = topicSearch.trim();
    if (!selectedTopicId && !customTopic) return;
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/quizzes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicId: selectedTopicId || undefined,
          topicName: selectedTopicId ? undefined : customTopic,
          questionCount,
        }),
      });
      if (!res.ok) throw new Error("Failed to generate quiz");
      const data = await res.json();
      const quiz = data.quiz as Quiz;
      setActiveQuiz(quiz);
      setAnswers(new Array(quiz.questions.length).fill(UNANSWERED));
      setResult(null);
      setMode("take");
    } catch {
      setError(t("generateError"));
    } finally {
      setCreating(false);
    }
  };

  const openQuiz = async (quizId: string) => {
    setError("");
    try {
      const res = await fetch(`/api/quizzes/${quizId}`);
      if (!res.ok) throw new Error("Failed to load quiz");
      const data = await res.json();
      const quiz = data.quiz as Quiz;

      if (quiz.status === "COMPLETED") {
        const savedAnswers = quiz.answers ?? [];
        let correct = 0;
        for (let i = 0; i < quiz.questions.length; i++) {
          if (savedAnswers[i] === quiz.questions[i].correctIndex) {
            correct++;
          }
        }
        const fallbackScore = Math.round(
          (correct / quiz.questions.length) * 100
        );
        setActiveQuiz(quiz);
        setAnswers(savedAnswers);
        setResult({
          correct,
          total: quiz.questions.length,
          score: Math.round(quiz.score ?? fallbackScore),
        });
        setMode("result");
      } else {
        setActiveQuiz(quiz);
        setAnswers(new Array(quiz.questions.length).fill(UNANSWERED));
        setResult(null);
        setMode("take");
      }
    } catch {
      setError(t("loadError"));
    }
  };

  const startEdit = (quiz: Quiz) => {
    setEditingId(quiz.id);
    setEditTitle(quiz.title ?? "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditTitle("");
  };

  const saveEdit = async (quizId: string) => {
    const title = editTitle.trim();
    if (!title || rowBusy) return;
    setRowBusy(true);
    try {
      const res = await fetch(`/api/quizzes/${quizId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error();
      setQuizzes((prev) =>
        prev.map((q) => (q.id === quizId ? { ...q, title } : q))
      );
      if (activeQuiz?.id === quizId) setActiveQuiz({ ...activeQuiz, title });
      cancelEdit();
    } catch {
      setError(t("actionError"));
    } finally {
      setRowBusy(false);
    }
  };

  const handleDelete = async (quizId: string) => {
    if (rowBusy) return;
    if (!window.confirm(t("deleteConfirm"))) return;
    setRowBusy(true);
    try {
      const res = await fetch(`/api/quizzes/${quizId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setQuizzes((prev) => prev.filter((q) => q.id !== quizId));
    } catch {
      setError(t("actionError"));
    } finally {
      setRowBusy(false);
    }
  };

  const chooseOption = (questionIndex: number, optionIndex: number) => {
    setAnswers((prev) =>
      prev.map((a, i) => (i === questionIndex ? optionIndex : a))
    );
  };

  const submitQuiz = async () => {
    if (!activeQuiz) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/quizzes/${activeQuiz.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      if (!res.ok) throw new Error("Failed to submit quiz");
      const data = await res.json();
      setResult(data.result as QuizResult);
      void loadQuizzes();
      setMode("result");
    } catch {
      setError(t("submitError"));
    } finally {
      setSubmitting(false);
    }
  };

  const backToList = () => {
    setMode("list");
    setActiveQuiz(null);
    setResult(null);
    setError("");
    void loadQuizzes();
  };

  /* ── TAKE QUIZ ──────────────────────────────────── */
  if (mode === "take" && activeQuiz) {
    const answered = answers.filter((a) => a !== UNANSWERED).length;
    const progress = (answered / answers.length) * 100;
    return (
      <div className="app-bg min-h-screen p-6 lg:p-10">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="mb-10 animate-fade-in">
            <span className="chip bg-blue-50 border-blue-200 text-blue-700 uppercase mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ripple" />
              {t("inProgress")}
            </span>
            <h1 className="text-3xl lg:text-4xl font-black tracking-tight leading-tight text-slate-900">
              {activeQuiz.title}
            </h1>
            <div className="flex items-center gap-4 mt-4">
              <span
                className={`text-sm font-semibold ${
                  answered === answers.length
                    ? "text-emerald-600"
                    : "text-slate-500"
                }`}
              >
                {answered}/{answers.length} {t("answered")}
              </span>
              <div className="flex-1 h-2 progress-track">
                <div
                  className={`progress-fill ${
                    submitting ? "progress-fill-striped" : ""
                  }`}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-sm font-bold text-slate-600">
                {Math.round(progress)}%
              </span>
            </div>
          </div>

          {/* Questions */}
          <div className="space-y-5">
            {activeQuiz.questions.map((q, qi) => (
              <div
                key={qi}
                className="card p-6 animate-fade-in"
                style={{ animationDelay: `${qi * 40}ms` }}
              >
                {/* Question label */}
                <div className="flex items-center gap-3 mb-4">
                   <span
                     className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-sm font-black ${
                       answers[qi] !== UNANSWERED
                         ? "bg-gradient-to-br from-blue-600 to-indigo-700 text-white"
                         : "bg-blue-50 border border-blue-200 text-blue-700"
                     }`}
                   >
                     Q{qi + 1}
                   </span>
                   <p className="text-base font-bold leading-relaxed flex-1 text-slate-800">
                     {q.question}
                   </p>
                </div>

                {/* Options */}
                <div className="space-y-2.5">
                  {q.options.map((opt, oi) => {
                    const sel = answers[qi] === oi;
                    return (
                       <button
                         key={oi}
                         type="button"
                         onClick={() => chooseOption(qi, oi)}
                         className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-start border-2 transition-colors duration-200 ${
                           sel
                             ? "bg-blue-50 border-blue-600 text-blue-900"
                             : "bg-white border-slate-200 hover:border-blue-200 hover:bg-blue-50/30 cursor-pointer text-slate-700"
                         }`}
                       >
                         <span
                           className={`w-10 h-10 shrink-0 rounded-xl text-sm font-black flex items-center justify-center transition-colors duration-200 ${
                             sel
                               ? "bg-blue-600 border border-blue-600 text-white"
                               : "bg-slate-50 border border-slate-200 text-slate-500"
                           }`}
                         >
                           {optionLetter(oi)}
                         </span>
                         <span className="text-sm font-medium flex-1">
                           {cleanOption(opt)}
                         </span>
                         {sel && (
                           <span className="text-blue-600">
                             <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                               <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                             </svg>
                           </span>
                         )}
                       </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {error ? <p className="mt-6 text-sm font-medium text-rose-600">{error}</p> : null}

          <button
            type="button"
            onClick={submitQuiz}
            disabled={submitting || answers.some((a) => a === UNANSWERED)}
            className="bg-gradient-to-br from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white font-bold rounded-xl shadow-lg w-full mt-8 py-4 text-base tracking-wide"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-3">
                <span className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                {t("submitting")}
              </span>
            ) : t("submit")}
          </button>
        </div>
      </div>
    );
  }

  /* ── RESULT VIEW ────────────────────────────────── */
  if (mode === "result" && activeQuiz && result) {
    const scoreStyle = result.score >= 70
      ? { text: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200", tile: "bg-emerald-50 border-emerald-300", label: "Excellent!" }
      : result.score >= 40
      ? { text: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200", tile: "bg-amber-50 border-amber-300", label: "Keep Going!" }
      : { text: "text-rose-600", bg: "bg-rose-50", border: "border-rose-200", tile: "bg-rose-50 border-rose-300", label: "Try Again!" };
    return (
      <div className="app-bg min-h-screen p-6 lg:p-10">
        <div className="max-w-3xl mx-auto">
          {/* Trophy result hero */}
          <div
            className={`relative rounded-3xl p-10 text-center mb-8 overflow-hidden border-2 animate-fade-in-scale ${scoreStyle.bg} ${scoreStyle.border}`}
          >
            {/* Trophy icon */}
            <div
              className={`relative w-24 h-24 mx-auto mb-6 rounded-3xl flex items-center justify-center text-5xl border-2 ${scoreStyle.tile}`}
            >
              🏆
            </div>

            {/* Score */}
            <p className="text-xs font-black uppercase tracking-[0.2em] mb-2 text-slate-500">{t("yourScore")}</p>
            <p className={`text-7xl sm:text-8xl font-black leading-none mb-2 ${scoreStyle.text}`}>
              {result.score}%
            </p>
            <p className={`text-2xl font-black mb-3 ${scoreStyle.text}`}>{scoreStyle.label}</p>
            <p className="text-base font-semibold text-slate-500">
              {result.correct} {t("outOf")} {result.total} {t("correctUnit")}
            </p>
          </div>

          {/* Review heading */}
          <div className="mb-6">
            <h1 className="text-3xl font-black tracking-tight text-slate-900">{t("reviewTitle")}</h1>
            <p className="mt-1 text-sm font-medium text-slate-500">Review your answers below</p>
          </div>

          {/* Questions review */}
          <div className="space-y-4">
            {activeQuiz.questions.map((q, qi) => {
              const userAns = answers[qi];
              const isCorrect = userAns === q.correctIndex;
              const unanswered = userAns === undefined || userAns === UNANSWERED;
              return (
                <div
                  key={qi}
                  className="card p-5 animate-fade-in"
                  style={{ animationDelay: `${qi * 30}ms` }}
                >
                  {/* Question header */}
                  <div className={`flex items-start gap-3 mb-3 pb-3 border-b ${isCorrect ? "border-emerald-200" : "border-rose-200"}`}>
                    <span
                      className={`w-10 h-10 shrink-0 rounded-xl text-sm font-black flex items-center justify-center border ${
                        isCorrect
                          ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                          : "bg-rose-50 border-rose-300 text-rose-700"
                      }`}
                    >
                      {isCorrect ? "✓" : "✗"}
                    </span>
                    <p className="text-sm font-bold leading-relaxed flex-1 text-slate-800">
                      {qi + 1}. {q.question}
                    </p>
                  </div>

                  <div className="space-y-2">
                    {q.options.map((opt, oi) => {
                      const correctOpt = oi === q.correctIndex;
                      const userOpt = oi === userAns;
                      return (
                        <div
                          key={oi}
                          className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium border ${
                            correctOpt
                              ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                              : userOpt
                              ? "bg-rose-50 border-rose-300 text-rose-800"
                              : "bg-slate-50 border-slate-200 text-slate-500"
                          }`}
                        >
                          <span className="w-6 text-xs font-black shrink-0">{optionLetter(oi)}</span>
                          <span className="flex-1">{cleanOption(opt)}</span>
                          {correctOpt && <span className="ms-auto text-xs font-black shrink-0">✓ Correct</span>}
                          {userOpt && !correctOpt ? (
                            <span className="ms-auto text-xs font-semibold italic opacity-70 shrink-0">({t("yourAnswer")})</span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>

                  {unanswered && <p className="mt-3 text-xs font-bold text-rose-600">{t("notAnswered")}</p>}

                  {q.explanation && (
                    <div className="card-solid mt-4 p-4 text-slate-700">
                      <p className="text-xs leading-relaxed">
                          <span className="font-black text-blue-600">{t("explanation")}: </span>
                        {q.explanation}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={backToList}
            className="white border border-slate-200 text-slate-600 hover:bg-slate-50 w-full mt-8 py-4 text-base rounded-xl"
          >
            ← {t("back")}
          </button>
        </div>
      </div>
    );
  }

  /* ── SCORE BADGE HELPER ─────────────────────────── */
  const scoreBadgeStyle = (score: number) => {
    if (score >= 70) return "bg-emerald-50 border border-emerald-200 text-emerald-700";
    if (score >= 40) return "bg-amber-50 border border-amber-200 text-amber-700";
    return "bg-rose-50 border border-rose-200 text-rose-700";
  };

  /* ── LIST VIEW ──────────────────────────────────── */
  return (
    <div className="min-h-screen p-6 lg:p-10">
      <div className="max-w-3xl mx-auto">
        {/* Hero header */}
        <div className="mb-10 animate-fade-in">
          <div className="flex items-center gap-4 mb-3">
             <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-3xl shrink-0 shadow-sm">
               🧠
             </div>
            <div>
              <h1 className="text-4xl font-black tracking-tight leading-tight text-gradient">
                {t("title")}
              </h1>
              <p className="text-sm font-medium mt-0.5 text-slate-500">{t("subtitle")}</p>
            </div>
          </div>
        </div>

        {/* Create panel */}
        <section className="card p-6 mb-8">
          <button
            type="button"
            onClick={() => setCreateOpen((o) => !o)}
            aria-expanded={createOpen}
            className="-mx-3 -mt-2 w-full flex items-center gap-4 px-3 py-2 rounded-xl text-start transition-colors duration-200 hover:bg-slate-50"
          >
             <span className="w-10 h-10 shrink-0 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-lg">
               ✨
             </span>
            <div className="flex-1">
              <h2 className="text-lg font-black text-slate-900">{t("newQuiz")}</h2>
              <p className="text-xs font-medium text-slate-500">Generate a quiz from any topic</p>
            </div>
            <svg className={`w-5 h-5 text-slate-500 transition-transform duration-200 ${createOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </button>

          {createOpen && (
            <div className="mt-6">
              {/* Step 1 */}
              <div className="flex items-center gap-3 mb-4">
                 <span className="w-7 h-7 shrink-0 rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center text-xs font-black">1</span>
                <label htmlFor="topic-search" className="text-sm font-bold text-slate-700">{t("searchAnyTopic")}</label>
              </div>
              <div className="relative mb-5">
                <svg className="absolute start-4 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-slate-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
                <input
                  id="topic-search"
                  type="text"
                  value={topicSearch}
                  onChange={(e) => { setTopicSearch(e.target.value); setSelectedTopicId(""); }}
                  placeholder={t("searchPlaceholder")}
                  className="input ps-11!"
                />
              </div>

              <p className="text-[11px] font-black uppercase tracking-[0.14em] mb-3 text-slate-500"><strong>{t("orBrowse")}</strong></p>
              <div className="flex flex-wrap gap-2 mb-2">
                {subjects.map((s) => (
                  <button key={s.id} type="button" onClick={() => selectSubject(selectedSubjectId === s.id ? "" : s.id)}
                     className={`rounded-full px-4 py-2 text-sm font-semibold border transition-colors duration-200 ${
                       selectedSubjectId === s.id
                         ? "bg-blue-50 border-blue-300 text-blue-700"
                         : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900"
                     }`}
                  >{s.name}</button>
                ))}
              </div>

               {topics.length > 0 && (
                 <div className="mt-4 rounded-2xl px-5 py-4 bg-blue-50 border border-blue-200">
                   <p className="text-[11px] font-black uppercase tracking-[0.14em] mb-3 text-slate-500">{t("chooseTopic")}</p>
                   <div className="flex flex-wrap gap-2">
                     {topics.map((tp) => (
                       <button key={tp.id} type="button" onClick={() => pickTopic(tp.id)}
                         className={`rounded-full px-3.5 py-2 text-sm font-semibold border transition-colors duration-200 ${
                           selectedTopicId === tp.id
                             ? "bg-blue-50 border-blue-300 text-blue-700"
                             : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900"
                         }`}
                       >{tp.name}</button>
                     ))}
                   </div>
                 </div>
               )}

              <div className="my-6 border-t border-dashed border-slate-200" />

              {/* Step 2 */}
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
                <div>
                  <div className="flex items-center gap-3 mb-3">
                     <span className="w-7 h-7 shrink-0 rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center text-xs font-black">2</span>
                    <p className="text-sm font-bold text-slate-700">{t("questionsLabel")}</p>
                  </div>
                  <div className="inline-flex rounded-full p-1 bg-slate-50 border border-slate-200">
                    {QUESTION_COUNTS.map((n) => (
                      <button key={n} type="button" onClick={() => setQuestionCount(n)}
                        className={`min-w-[44px] px-3 py-1.5 rounded-full text-sm transition-colors duration-200 ${
                          questionCount === n
                             ? "bg-gradient-to-br from-blue-600 to-indigo-700 text-white font-bold"
                             : "font-semibold text-slate-600 hover:text-slate-900 hover:bg-white"
                        }`}
                      >{n}</button>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={createQuiz}
                  disabled={creating || (!selectedTopicId && !topicSearch.trim())}
                  className="bg-gradient-to-br from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white font-bold rounded-xl shadow-lg w-full sm:w-auto shrink-0 px-8 py-3.5 text-sm tracking-wide"
                >{creating ? t("generating") : t("generate")}</button>
              </div>
              {error && <p className="mt-4 text-sm font-medium text-rose-600">{error}</p>}
            </div>
          )}
        </section>

        {/* Saved quizzes */}
        <section>
          {/* Section header */}
          <div className="flex items-center gap-4 px-1 mb-4">
            <span className="w-10 h-10 shrink-0 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-lg">
              📚
            </span>
            <h2 className="text-lg font-black flex-1 text-slate-900">{t("yourQuizzes")}</h2>
            {quizzes.length > 0 && (
               <span className="chip bg-blue-50 border-blue-200 text-blue-700">
                 {quizzes.length}
               </span>
            )}
          </div>

          {error && quizzes.length > 0 && <p className="mb-3 text-sm font-medium text-rose-600">{error}</p>}

          {quizzes.length === 0 ? (
            <div className="card text-center py-16 px-8">
               <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-3xl">
                 📋
               </div>
              <p className="text-base font-bold mb-1 text-slate-700">{t("emptyTitle")}</p>
              <p className="text-sm max-w-xs mx-auto text-slate-500">{t("emptyDesc")}</p>
            </div>
          ) : (
            <ul className="card overflow-hidden divide-y divide-slate-200 animate-fade-in">
              {quizzes.map((q) => {
                const done = q.status === "COMPLETED";
                const score = done && typeof q.score === "number" ? Math.round(q.score) : null;
                const isEditing = editingId === q.id;
                return (
                  <li
                    key={q.id}
                     className="group transition-colors duration-200 hover:bg-slate-50"
                  >
                    {isEditing ? (
                      <div className="flex items-center gap-2.5 p-4">
                        <input
                          autoFocus
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") saveEdit(q.id); if (e.key === "Escape") cancelEdit(); }}
                          className="input flex-1 min-w-0"
                        />
                         <button type="button" onClick={() => saveEdit(q.id)} disabled={rowBusy || !editTitle.trim()}
                           className="bg-gradient-to-br from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white font-bold rounded-xl shadow-lg shrink-0 px-4 py-2.5 text-xs">
                           {t("save")}
                         </button>
                         <button type="button" onClick={cancelEdit}
                           className="white border border-slate-200 text-slate-600 hover:bg-slate-50 shrink-0 px-3 py-2.5 text-xs rounded-xl">
                           {t("cancel")}
                         </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 p-2">
                        <button type="button" onClick={() => openQuiz(q.id)}
                          className="flex-1 min-w-0 flex items-center gap-4 px-3 py-2.5 text-start">
                          {/* Status icon */}
                          <span
                            className={`w-14 h-14 shrink-0 rounded-2xl flex items-center justify-center text-2xl border ${
                              done
                                ? "bg-emerald-50 border-emerald-200"
                                 : "bg-blue-50 border-blue-200"
                            }`}
                          >
                            {done ? "✅" : "📖"}
                          </span>
                          {/* Text */}
                          <span className="flex-1 min-w-0">
                            <span className="block font-bold text-base truncate text-slate-900">{q.title}</span>
                            <span className="flex items-center gap-2.5 mt-1.5 flex-wrap">
                              <span className="text-xs font-semibold text-slate-500">{q.questions.length} {t("questionsUnit")}</span>
                              {score !== null && (
                                <span className={`text-xs font-black px-2.5 py-1 rounded-full ${scoreBadgeStyle(score)}`}>{score}%</span>
                              )}
                              {!done && (
                                 <span className="chip bg-blue-50 border-blue-200 text-blue-700">
                                   <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ripple" />
                                   In Progress
                                 </span>
                              )}
                            </span>
                          </span>
                          {/* CTA badge */}
                          <span
                            className={`hidden md:inline shrink-0 px-4 py-2 rounded-full text-xs font-bold border transition-colors duration-200 ${
                              done
                                ? "text-slate-500 bg-slate-50 border-slate-200"
                                 : "text-blue-700 bg-blue-50 border-blue-200"
                            }`}
                          >
                            {done ? t("viewResult") : t("takeQuiz")} →
                          </span>
                        </button>

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0 ps-1">
                          <button type="button" onClick={() => startEdit(q)} aria-label={t("edit")} disabled={rowBusy}
                             className="flex items-center gap-1.5 shrink-0 px-3 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-blue-700 hover:bg-blue-50 disabled:opacity-40 transition-colors duration-200 sm:opacity-0 sm:group-hover:opacity-100">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                            </svg>
                            {t("edit")}
                          </button>
                          <button type="button" onClick={() => handleDelete(q.id)} aria-label={t("delete")} disabled={rowBusy}
                            className="btn-danger-ghost flex items-center gap-1.5 shrink-0 px-3 py-2 rounded-xl text-xs font-bold text-slate-500 disabled:opacity-40 sm:opacity-0 sm:group-hover:opacity-100">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                            </svg>
                            {t("delete")}
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
