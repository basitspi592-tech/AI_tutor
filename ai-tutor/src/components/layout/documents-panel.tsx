"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

interface DocumentMeta {
  id: string;
  originalName: string;
  status: "PENDING" | "PROCESSING" | "READY" | "ERROR";
  sizeBytes: number;
  createdAt: string;
}

const STATUS_STYLES: Record<DocumentMeta["status"], { cls: string; icon: string; key: string }> = {
  READY: { cls: "bg-emerald-500 text-white", icon: "✓", key: "ready" },
  PROCESSING: { cls: "bg-blue-400 text-white", icon: "⟳", key: "processing" },
  PENDING: { cls: "bg-slate-300 text-slate-700", icon: "⏳", key: "queued" },
  ERROR: { cls: "bg-red-500 text-white", icon: "⚠", key: "statusError" },
};

export function DocumentsPanel() {
  const t = useTranslations("documents");
  const [documents, setDocuments] = useState<DocumentMeta[]>([]);

  useEffect(() => {
    let active = true;
    const fetchDocuments = async () => {
      try {
        const res = await fetch("/api/documents");
        if (!res.ok) return;
        const data = await res.json();
        if (active) setDocuments(Array.isArray(data) ? data : (data.documents ?? []));
      } catch {
        /* network hiccup — retry on next poll */
      }
    };
    fetchDocuments();
    const interval = setInterval(fetchDocuments, 2500);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <aside className="hidden xl:flex w-80 bg-white border-s border-slate-200 flex-col shrink-0">
      <div className="p-6 border-b border-slate-100 flex items-center justify-between">
        <h2 className="font-bold text-slate-900 flex items-center gap-2">📁 {t("title")}</h2>
        <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
          {documents.length} Files
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {documents.length === 0 ? (
          <p className="text-xs text-slate-400 text-center mt-8 leading-relaxed">{t("noneYet")}</p>
        ) : (
          documents.map((doc) => {
            const status = STATUS_STYLES[doc.status] ?? STATUS_STYLES.PENDING;
            return (
              <div
                key={doc.id}
                className="p-3 bg-slate-50 border border-slate-200 rounded-xl hover:border-blue-200 transition-all"
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl">📄</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">{doc.originalName}</p>
                    <div className="flex items-center justify-between mt-2 gap-2">
                      <span
                        className={`text-[9px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${status.cls}`}
                      >
                        {status.icon} {t(status.key as "ready")}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {(doc.sizeBytes / 1024 / 1024).toFixed(1)} MB
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
