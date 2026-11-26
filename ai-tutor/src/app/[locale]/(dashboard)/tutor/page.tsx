"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import katex from "katex";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface DocumentMeta {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
}

interface ConversationMeta {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

function formatChatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function TypingIndicator() {
  return (
    <div className="msg-assistant w-fit rounded-2xl px-5 py-3">
      <div className="flex gap-1.5 items-center h-5">
        <div className="typing-dot w-2 h-2 rounded-full bg-blue-400" />
        <div className="typing-dot w-2 h-2 rounded-full bg-blue-500" />
        <div className="typing-dot w-2 h-2 rounded-full bg-blue-600" />
      </div>
    </div>
  );
}

const MATH_SPLIT_REGEX =
  /(\$\$[\s\S]+?\$\$)|(\\\[[\s\S]+?\\\])|(\\\([\s\S]+?\\\))|(\$[^$\n]+?\$)/g;

function renderKatex(tex: string, displayMode: boolean): string {
  return katex.renderToString(tex.trim(), { throwOnError: false, displayMode });
}

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const segments = text.split(MATH_SPLIT_REGEX);
  let n = 0;

  segments.forEach((segment) => {
    if (!segment) return;

    const displayMatch =
      segment.match(/^\$\$([\s\S]+?)\$\$$/) ||
      segment.match(/^\\\[([\s\S]+?)\\\]$/);
    const inlineMatch = displayMatch
      ? null
      : segment.match(/^\\\(([\s\S]+?)\\\)$/) ||
        segment.match(/^\$([^$\n]+?)\$$/);

    if (displayMatch || inlineMatch) {
      try {
        nodes.push(
          <span
            key={`${keyPrefix}-m${n++}`}
            dangerouslySetInnerHTML={{
              __html: renderKatex((displayMatch ?? inlineMatch)![1], Boolean(displayMatch)),
            }}
          />
        );
      } catch {
        nodes.push(segment);
      }
      return;
    }

    const regex =
      /(`[^`\n]+`)|(\*\*\*(.+?)\*\*\*)|(\*\*(.+?)\*\*)|(\*(.+?)\*)|(~~(.+?)~~)|(\[([^\]]+)\]\(([^)\s]+)\))/g;
    let last = 0;
    let m: RegExpExecArray | null;

    while ((m = regex.exec(segment)) !== null) {
      if (m.index > last) nodes.push(segment.slice(last, m.index));
      const key = `${keyPrefix}-i${n++}`;

      if (m[1]) {
        nodes.push(
          <code
            key={key}
            className="px-1.5 py-0.5 rounded-md font-mono text-[13px] bg-blue-50 border border-blue-200 text-blue-700"
          >
            {m[1].slice(1, -1)}
          </code>
        );
      } else if (m[2]) {
        nodes.push(<strong key={key} className="text-slate-900 font-bold"><em>{m[3]}</em></strong>);
      } else if (m[4]) {
        nodes.push(<strong key={key} className="text-slate-900 font-bold">{m[5]}</strong>);
      } else if (m[6]) {
        nodes.push(<em key={key}>{m[7]}</em>);
      } else if (m[8]) {
        nodes.push(<s key={key}>{m[9]}</s>);
      } else if (m[10]) {
        nodes.push(
          <a key={key} href={m[12]} target="_blank" rel="noopener noreferrer"
            className="text-blue-600 underline underline-offset-2 hover:text-blue-700"
          >{m[11]}</a>
        );
      }
      last = regex.lastIndex;
    }

    if (last < segment.length) nodes.push(segment.slice(last));
  });

  return nodes;
}

function MarkdownContent({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("```")) {
      if (inCodeBlock) {
        elements.push(
          <pre
            key={`code-${i}`}
            className="my-4 p-4 rounded-xl overflow-x-auto bg-slate-50 border border-slate-200 shadow-sm"
          >
            <code className="text-sm font-mono leading-relaxed text-slate-700">
              {codeLines.join("\n")}
            </code>
          </pre>
        );
        codeLines = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) { codeLines.push(line); continue; }

    if (/^\s*\$\$/.test(line)) {
      let tex = line.replace(/^\s*\$\$/, "");
      let j = i;
      if (/\$\$\s*$/.test(tex)) {
        tex = tex.replace(/\$\$\s*$/, "");
      } else {
        j = i + 1;
        while (j < lines.length && !/\$\$\s*$/.test(lines[j])) {
          tex += "\n" + lines[j];
          j++;
        }
        if (j < lines.length) tex += "\n" + lines[j].replace(/\$\$\s*$/, "");
      }
      let mathHtml: string | null = null;
      try { mathHtml = renderKatex(tex, true); } catch {}
      if (mathHtml !== null) {
        elements.push(
          <div key={`math-${i}`} className="my-4 overflow-x-auto text-center" dangerouslySetInnerHTML={{ __html: mathHtml }} />
        );
      } else {
        elements.push(<p key={`math-${i}`} className="font-mono text-sm text-slate-700">{tex}</p>);
      }
      i = j;
      continue;
    }

    if (/^\s*\|/.test(line)) {
      const tableLines: string[] = [];
      let j = i;
      while (j < lines.length && /^\s*\|/.test(lines[j])) { tableLines.push(lines[j]); j++; }
      const parseRow = (row: string) =>
        row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
      const hasSeparator = tableLines.length > 1 && parseRow(tableLines[1]).every((cell) => /^:?-+:?$/.test(cell));
      if (hasSeparator && tableLines.length > 2) {
        const header = parseRow(tableLines[0]);
        const rows = tableLines.slice(2).map(parseRow);
        elements.push(
          <div key={`table-${i}`} className="my-4 overflow-x-auto">
            <table className="w-full text-sm border-collapse rounded-xl overflow-hidden">
              <thead>
                <tr>
                  {header.map((cell, ci) => (
                    <th key={ci} className="border px-3 py-2 text-start font-semibold border-blue-200 bg-blue-50 text-blue-700">
                      {renderInline(cell, `${i}-h${ci}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci} className="border px-3 py-2 border-slate-200 text-slate-700">
                        {renderInline(cell, `${i}-r${ri}c${ci}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        i = j - 1;
        continue;
      }
    }

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      elements.push(<hr key={i} className="my-5 border-slate-200" />);
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quoteLines: string[] = [];
      let j = i;
      while (j < lines.length && /^\s*>/.test(lines[j])) { quoteLines.push(lines[j].replace(/^\s*>\s?/, "")); j++; }
      elements.push(
        <blockquote key={`quote-${i}`} className="my-4 px-4 py-2.5 rounded-e-lg border-s-[3px] border-blue-500 bg-blue-50">
          {quoteLines.map((ql, qi) =>
            ql.trim() !== "" && (
              <p key={qi} className="leading-relaxed italic text-slate-700">
                {renderInline(ql, `${i}-q${qi}`)}
              </p>
            )
          )}
        </blockquote>
      );
      i = j - 1;
      continue;
    }

    if (line.startsWith("### "))
      elements.push(<h3 key={i} className="text-base font-bold mt-6 mb-2 text-slate-900">{renderInline(line.slice(4), `h${i}`)}</h3>);
    else if (line.startsWith("## "))
      elements.push(<h2 key={i} className="text-lg font-bold mt-7 mb-2 text-slate-900">{renderInline(line.slice(3), `h${i}`)}</h2>);
    else if (line.startsWith("# "))
      elements.push(<h1 key={i} className="text-xl font-bold mt-7 mb-2 text-slate-900">{renderInline(line.slice(2), `h${i}`)}</h1>);
    else if (line.startsWith("- ") || line.startsWith("* "))
      elements.push(<li key={i} className="ms-5 list-disc leading-[1.7] py-0.5 text-slate-700">{renderInline(line.slice(2), `l${i}`)}</li>);
    else if (/^\d+\.\s/.test(line))
      elements.push(<li key={i} className="ms-5 list-decimal leading-[1.7] py-0.5 text-slate-700">{renderInline(line.replace(/^\d+\.\s/, ""), `l${i}`)}</li>);
    else if (line.trim() === "")
      elements.push(<div key={i} className="h-2" />);
    else
      elements.push(<p key={i} className="leading-[1.75] text-slate-700">{renderInline(line, `p${i}`)}</p>);
  }

  return <>{elements}</>;
}

export default function TutorPage() {
  const t = useTranslations("tutor");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [documents, setDocuments] = useState<DocumentMeta[]>([]);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docError, setDocError] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [inputFocused, setInputFocused] = useState(false);

  const MAX_INPUT_HEIGHT = 144;

  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, MAX_INPUT_HEIGHT);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > MAX_INPUT_HEIGHT ? "auto" : "hidden";
  }

  function resetInputHeight() {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.overflowY = "hidden";
    }
  }

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
    fetch("/api/tutor/conversations")
      .then(async (res) => { if (!res.ok) throw new Error(); const data = await res.json(); setConversations((data.conversations ?? []) as ConversationMeta[]); })
      .catch(() => {});
    fetch("/api/documents")
      .then(async (res) => { if (!res.ok) throw new Error(); const data = await res.json(); setDocuments((data.documents ?? []) as DocumentMeta[]); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const hasPending = documents.some((d) => d.status !== "READY" && d.status !== "ERROR");
    if (!hasPending) return;
    const timer = setInterval(() => {
      fetch("/api/documents").then(async (res) => { if (!res.ok) throw new Error(); const data = await res.json(); setDocuments((data.documents ?? []) as DocumentMeta[]); }).catch(() => {});
    }, 2500);
    return () => clearInterval(timer);
  }, [documents]);

  async function refreshDocuments() {
    try {
      const res = await fetch("/api/documents");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setDocuments((data.documents ?? []) as DocumentMeta[]);
    } catch {}
  }

  async function handleFileSelected(file: File) {
    setUploadingDoc(true);
    setDocError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/documents", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Upload failed");
      await refreshDocuments();
    } catch {
      setDocError(t("uploadFailed"));
    } finally {
      setUploadingDoc(false);
    }
  }

  async function removeDocument(id: string) {
    try {
      await fetch(`/api/documents?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    } catch {}
  }

  function toggleSidebar() {
    if (typeof window !== "undefined" && window.innerWidth >= 1024) setSidebarVisible((v) => !v);
    else setSidebarOpen(true);
  }

  async function fetchConversations() {
    try {
      const res = await fetch("/api/tutor/conversations");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setConversations((data.conversations ?? []) as ConversationMeta[]);
    } catch {}
  }

  async function selectConversation(id: string) {
    if (loading) return;
    try {
      const res = await fetch(`/api/tutor/conversations/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMessages((data.messages ?? []) as Message[]);
      setConversationId(data.conversationId);
      setSidebarOpen(false);
      requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView({ behavior: "auto" }));
    } catch {}
  }

  function startNewChat() {
    setMessages([]);
    setConversationId(null);
    setInput("");
    resetInputHeight();
    setDocError("");
    setSidebarOpen(false);
    inputRef.current?.focus();
  }

  async function removeConversation(id: string) {
    try {
      await fetch(`/api/tutor/conversations/${encodeURIComponent(id)}`, { method: "DELETE" });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (id === conversationId) { setMessages([]); setConversationId(null); }
    } catch {}
  }

  async function sendMessage() {
    if (!input.trim() || loading) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: input.trim() };
    const assistantId = crypto.randomUUID();
    const assistantMsg: Message = { id: assistantId, role: "assistant", content: "" };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    resetInputHeight();
    setLoading(true);

    try {
      const res = await fetch("/api/tutor/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg.content, conversationId }),
      });

      if (!res.ok) {
        const data = await res.json();
        setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: data.error || "Sorry, something went wrong." } : m));
        setLoading(false);
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      if (!reader) { setLoading(false); return; }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6);
          try {
            const event = JSON.parse(json);
            if (event.type === "chunk") {
              setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: m.content + event.content } : m));
            } else if (event.type === "done") {
              if (event.conversationId) { setConversationId(event.conversationId); void fetchConversations(); }
            } else if (event.type === "error") {
              setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: event.content } : m));
            }
          } catch {}
        }
      }
    } catch {
      setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: "Failed to connect to the tutor." } : m));
    } finally {
      setLoading(false);
    }
  }

  const sidebar = (
    <>
      {/* Sidebar header */}
      <div className="px-4 pt-5 pb-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br from-blue-600 to-indigo-700 shadow-sm">
          <span className="text-base">🎓</span>
        </div>
        <span className="text-sm font-bold tracking-tight text-slate-900">{t("title")}</span>
      </div>

      {/* New chat */}
      <div className="px-4 pb-3">
        <button
          onClick={startNewChat}
          disabled={loading}
          className="w-full inline-flex items-center justify-center gap-2 py-2.5 text-sm bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-medium disabled:opacity-50"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          {t("newChat")}
        </button>
      </div>

      {/* Conversations label */}
      <div className="px-5 pb-2">
        <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-600">
          {t("conversations")}
        </span>
      </div>

      {/* Conversation list */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-0.5">
        {conversations.length === 0 ? (
          <p className="text-xs px-2 py-3 leading-relaxed text-slate-500">
            {t("noConversations")}
          </p>
        ) : (
          conversations.map((c) => {
            const active = c.id === conversationId;
            return (
              <div
                key={c.id}
                className={`group relative rounded-xl transition-colors ${
                  active
                    ? "bg-blue-50 text-blue-600 border-e-[3px] border-blue-600"
                    : "border-e-[3px] border-transparent hover:bg-slate-50"
                }`}
              >
                <button
                  onClick={() => selectConversation(c.id)}
                  disabled={loading}
                  className="w-full text-start ps-3.5 pe-9 py-2.5 rounded-xl disabled:opacity-60"
                >
                  <span className="flex items-center gap-2">
                    {active && (
                      <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-blue-600" />
                    )}
                    <span className={`block text-sm truncate ${active ? "text-blue-600 font-bold" : "text-slate-500"}`}>
                      {c.title || "…"}
                    </span>
                  </span>
                  <span className="block text-[11px] mt-0.5 ps-3.5 text-slate-600">
                    {formatChatDate(c.updatedAt)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => removeConversation(c.id)}
                  aria-label="Delete conversation"
                  className="btn-danger-ghost absolute end-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-lg hidden group-hover:flex items-center justify-center text-slate-500"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            );
          })
        )}
      </nav>
    </>
  );

  return (
    <div className="flex h-full app-bg">
      {/* Sidebar desktop */}
      {sidebarVisible && (
        <aside className="hidden lg:flex w-64 shrink-0 flex-col bg-white border-e border-slate-200">
          {sidebar}
        </aside>
      )}

      {/* Sidebar mobile drawer */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute inset-y-0 start-0 w-64 max-w-[85%] flex flex-col animate-slide-in-right bg-white border-e border-slate-200 shadow-lg">
            {sidebar}
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center gap-2 px-4 py-3 bg-white border-b border-slate-200">
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={t("conversations")}
            className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
              sidebarVisible
                ? "text-blue-600 bg-blue-50 border border-blue-200"
                : "text-slate-500 bg-white border border-slate-200 hover:text-slate-700 hover:bg-slate-100"
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-slate-900">{t("title")}</span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 py-6">
            {messages.length === 0 ? (
              <div className="flex items-center justify-center min-h-[calc(100vh-14rem)]">
                <div className="text-center max-w-md">
                  {/* Logo tile */}
                  <div className="mx-auto mb-8 w-20 h-20 rounded-2xl flex items-center justify-center bg-gradient-to-br from-blue-600 to-indigo-700 shadow-sm animate-fade-in-scale">
                    <span className="text-4xl">🎓</span>
                  </div>

                  <h2
                    className="text-2xl font-bold mb-3 tracking-tight text-slate-900 animate-fade-in"
                    style={{ animationDelay: "100ms" }}
                  >
                    {t("noMessages")}
                  </h2>
                  <p className="text-sm leading-relaxed mb-10 text-slate-500 animate-fade-in" style={{ animationDelay: "200ms" }}>
                    Ask me anything about any subject. I&apos;ll explain concepts, give examples, and help you understand.
                  </p>

                  {/* Quick prompts */}
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-3 animate-fade-in" style={{ animationDelay: "350ms" }}>
                    {[
                      { text: "Explain photosynthesis", icon: "🌿", color: "#34d399" },
                      { text: "Solve 2x + 5 = 15",      icon: "🔢", color: "#60a5fa" },
                      { text: "Capital of France?",      icon: "🌍", color: "#22d3ee" },
                    ].map((q) => (
                      <button
                        key={q.text}
                        onClick={() => { setInput(q.text); inputRef.current?.focus(); }}
                        className="bg-white border border-slate-200 hover:border-blue-300 hover:text-blue-600 rounded-full px-4 py-2 text-sm flex items-center gap-2.5 text-start text-slate-600"
                      >
                        <span className="text-base shrink-0">{q.icon}</span>
                        <span className="font-medium leading-tight">{q.text}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {messages.map((msg) => (
                  <div key={msg.id} className="animate-fade-in">
                    {msg.role === "user" ? (
                      <div className="flex justify-end">
                        <div className="msg-user max-w-[80%] rounded-2xl px-5 py-3">
                          <p className="text-base leading-[1.65] whitespace-pre-wrap text-white">
                            {msg.content}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="w-full">
                        {msg.content === "" && loading ? (
                          <TypingIndicator />
                        ) : (
                          <div className="msg-assistant rounded-2xl px-5 py-3 text-[16px] text-slate-700">
                            <MarkdownContent content={msg.content} />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input area */}
        <div className="p-4 pb-3 bg-white border-t border-slate-200">
          <form
            onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
            className="max-w-3xl mx-auto"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFileSelected(f); e.target.value = ""; }}
            />

            {(documents.length > 0 || uploadingDoc || docError) && (
              <div className="flex flex-wrap items-center gap-2 mb-3">
                {documents.map((d) => (
                  <span
                    key={d.id}
                    className="inline-flex items-center gap-2 ps-3 pe-1.5 py-1.5 rounded-full text-xs max-w-[240px] bg-blue-50 border border-blue-200 text-blue-700"
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        d.status === "READY"
                          ? "bg-emerald-500"
                          : d.status === "PROCESSING"
                          ? "bg-amber-500"
                          : d.status === "ERROR"
                          ? "bg-rose-500"
                          : "bg-slate-500"
                      }`}
                    />
                    <span className="truncate cursor-default" title={`${d.originalName} · ${d.status}`}>{d.originalName}</span>
                    <button
                      type="button"
                      onClick={() => removeDocument(d.id)}
                      className="btn-danger-ghost w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-slate-500"
                    >
                      ×
                    </button>
                  </span>
                ))}
                {uploadingDoc && (
                  <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs bg-blue-50 border border-blue-200 text-slate-500">
                    <span className="w-3 h-3 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin" />
                    {t("uploading")}
                  </span>
                )}
                {docError && <span className="text-xs text-rose-600">{docError}</span>}
              </div>
            )}

            <div className={`card rounded-2xl flex items-end gap-2 px-3 py-2 transition-shadow ${inputFocused ? "ring-2 ring-blue-500/25" : ""}`}>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingDoc}
                title={t("attach")}
                aria-label={t("attach")}
                className="btn-ghost w-10 h-10 shrink-0 rounded-xl"
              >
                <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
                </svg>
              </button>
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => { setInput(e.target.value); autoResize(e.target); }}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder={t("placeholder")}
                disabled={loading}
                className="flex-1 resize-none bg-white border-2 border-slate-200 focus:border-blue-500 rounded-2xl px-4 py-2 text-sm leading-6 text-slate-900 placeholder:text-slate-400 outline-none disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                aria-label={t("send")}
                className="w-10 h-10 shrink-0 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white transition-all active:scale-95 flex items-center justify-center disabled:cursor-not-allowed"
              >
                <svg className="w-[17px] h-[17px]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                </svg>
              </button>
            </div>
            <p className="text-[10px] uppercase text-slate-400 text-center tracking-wide mt-2.5">
              AI Tutor can make mistakes. Verify important information.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
