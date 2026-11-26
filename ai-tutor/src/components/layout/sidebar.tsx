"use client";

import { usePathname, Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { signOut } from "next-auth/react";
import { usePathname as useRawPathname } from "next/navigation";

const navItems = [
  { key: "tutor", href: "/tutor", emoji: "💬" },
  { key: "ask", href: "/ask", emoji: "🔍" },
  { key: "quizzes", href: "/quizzes", emoji: "🧠" },
  { key: "notebooks", href: "/notebooks", emoji: "📓" },
  { key: "progress", href: "/progress", emoji: "📊" },
] as const;

export function Sidebar({ open, onClose }: { open: boolean; onClose?: () => void }) {
  const t = useTranslations("nav");
  const tc = useTranslations("common");
  const pathname = usePathname();
  const rawPathname = useRawPathname();
  const locale = rawPathname.split("/")[1] || "en";

  return (
    <aside
      className={`fixed inset-y-0 start-0 z-50 w-72 bg-white border-e border-slate-200 flex flex-col transform transition-transform duration-300 lg:static lg:translate-x-0 shadow-xl lg:shadow-none ${
        open
          ? "translate-x-0"
          : "max-lg:ltr:-translate-x-full max-lg:rtl:translate-x-full"
      }`}
    >
      {/* Logo */}
      <div className="p-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl flex items-center justify-center text-white shadow-lg">
            <span className="text-2xl">🎓</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">{tc("appName")}</h1>
        </div>
        <button
          onClick={onClose}
          className="lg:hidden text-slate-500 hover:text-slate-900 text-lg"
          aria-label="Close menu"
        >
          ✕
        </button>
      </div>

      {/* New Conversation */}
      <div className="px-4 mb-6">
        <Link
          href="/tutor"
          onClick={onClose}
          className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white py-3 px-4 rounded-xl font-medium transition-all active:scale-[0.98]"
        >
          <span className="text-lg leading-none">+</span>
          {t("newConversation")}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        <div className="px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-widest">
          {t("mainMenu")}
        </div>
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.key}
              href={item.href}
              onClick={onClose}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all border-e-[3px] ${
                isActive
                  ? "bg-blue-50 text-blue-600 border-blue-600 font-bold"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-900 border-transparent font-medium"
              }`}
            >
              <span className="text-base leading-none">{item.emoji}</span>
              {t(item.key)}
            </Link>
          );
        })}
      </nav>

      {/* Pro Tip */}
      <div className="p-4">
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 rounded-2xl flex items-start gap-3 border border-blue-100">
          <span className="text-lg">✨</span>
          <div>
            <p className="text-xs font-bold text-blue-900 uppercase">{t("proTip")}</p>
            <p className="text-xs text-blue-700 leading-relaxed mt-0.5">{t("proTipText")}</p>
          </div>
        </div>
      </div>

      {/* Logout */}
      <div className="px-3 pb-4 border-t border-slate-100 pt-3">
        <button
          onClick={() => signOut({ callbackUrl: `/${locale}/login` })}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-all"
        >
          <span className="text-base leading-none">🚪</span>
          {t("logout")}
        </button>
      </div>
    </aside>
  );
}
