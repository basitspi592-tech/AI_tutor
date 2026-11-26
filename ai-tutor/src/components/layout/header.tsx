"use client";

import { usePathname, useRouter, Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useSession, signOut } from "next-auth/react";
import { usePathname as useRawPathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { locales, defaultLocale, type Locale } from "@/i18n/config";

const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  ar: "العربية",
  fr: "Français",
  ur: "اردو",
};

const NAV_ITEMS = [
  { key: "tutor", href: "/tutor", emoji: "💬" },
  { key: "ask", href: "/ask", emoji: "🔍" },
  { key: "quizzes", href: "/quizzes", emoji: "🧠" },
  { key: "notebooks", href: "/notebooks", emoji: "📓" },
  { key: "progress", href: "/progress", emoji: "📊" },
] as const;

function getInitials(name?: string | null, email?: string | null): string {
  const fromName = name?.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  if (fromName) return fromName;
  return (email?.[0] ?? "U").toUpperCase();
}

export function Header() {
  const t = useTranslations("nav");
  const tc = useTranslations("common");
  const pathname = usePathname();
  const rawPathname = useRawPathname();
  const router = useRouter();
  const locale = (rawPathname.split("/")[1] as Locale) || defaultLocale;
  const { data: session } = useSession();
  const [langOpen, setLangOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!langOpen) return;
    function handleClick(e: MouseEvent) {
      if (langRef.current && !langRef.current.contains(e.target as Node)) setLangOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [langOpen]);

  useEffect(() => {
    if (!profileOpen) return;
    function handleClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [profileOpen]);

  return (
    <header className="relative h-16 bg-white border-b border-slate-200 px-4 md:px-8 flex items-center justify-between z-40 shadow-sm shrink-0">
      <div className="flex items-center gap-2 md:gap-3 min-w-0">
        <button
          type="button"
          onClick={() => setNavOpen((v) => !v)}
          className="md:hidden p-2 -ms-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          aria-label="Toggle navigation"
          aria-expanded={navOpen}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>

        <Link href="/tutor" className="flex items-center gap-2 shrink-0" onClick={() => setNavOpen(false)}>
          <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center text-base">
            🎓
          </span>
          <span className="text-sm font-bold tracking-tight text-slate-900 hidden sm:block">
            {tc("appName")}
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-1 ms-3">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.key}
                href={item.href}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "bg-blue-50 text-blue-600 font-bold"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900 font-medium"
                }`}
              >
                <span className="text-base leading-none">{item.emoji}</span>
                {t(item.key)}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-2 md:gap-4">
        {/* Language selector */}
        <div className="relative" ref={langRef}>
          <button
            type="button"
            onClick={() => setLangOpen((v) => !v)}
            className="flex items-center bg-slate-100 rounded-full px-3 py-1.5 gap-2 cursor-pointer hover:bg-slate-200 transition-colors border border-slate-200"
          >
            <span>🌐</span>
            <span className="text-xs font-bold uppercase">{locale}</span>
          </button>
          {langOpen && (
            <div className="absolute end-0 top-full mt-2 w-44 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden animate-fade-in-scale z-50">
              {locales.map((l) => (
                <button
                  key={l}
                  onClick={() => {
                    setLangOpen(false);
                    router.replace(pathname, { locale: l });
                  }}
                  className={`w-full text-start px-4 py-2.5 text-sm transition-colors ${
                    l === locale
                      ? "bg-blue-50 text-blue-600 font-bold"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {LOCALE_LABELS[l]}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="h-6 w-px bg-slate-200 mx-1 hidden sm:block" />

        {/* User */}
        <div className="relative" ref={profileRef}>
          <button
            type="button"
            onClick={() => setProfileOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={profileOpen}
            className="flex items-center gap-3 rounded-full ps-1 pe-1 py-1 hover:bg-slate-100 transition-colors"
          >
            <div className="hidden md:block text-right">
              <p className="text-sm font-bold text-slate-900">
                {session?.user?.name || "Student"}
              </p>
              <p className="text-[10px] font-bold text-blue-600 uppercase">Beta User</p>
            </div>
            {session?.user?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={session.user.image}
                alt="Avatar"
                width={36}
                height={36}
                className="w-9 h-9 rounded-full ring-2 ring-slate-100"
              />
            ) : (
              <div className="w-9 h-9 rounded-full ring-2 ring-slate-100 bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center text-xs font-bold">
                {getInitials(session?.user?.name, session?.user?.email)}
              </div>
            )}
          </button>

          {profileOpen && (
            <div
              role="menu"
              className="absolute end-0 top-full mt-2 w-60 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden animate-fade-in-scale z-50"
            >
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="text-sm font-bold text-slate-900 truncate">
                  {session?.user?.name || "Student"}
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {session?.user?.email}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setProfileOpen(false);
                  void signOut({ callbackUrl: `/${locale}/login` });
                }}
                className="w-full flex items-center gap-2.5 text-start px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-rose-50 hover:text-rose-600 transition-colors"
              >
                <span className="text-base leading-none">🚪</span>
                {t("logout")}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile navigation dropdown */}
      {navOpen && (
        <nav className="md:hidden absolute top-full inset-x-0 bg-white border-b border-slate-200 shadow-lg z-50 p-2 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={() => setNavOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "bg-blue-50 text-blue-600 font-bold"
                    : "text-slate-600 hover:bg-slate-50 font-medium"
                }`}
              >
                <span className="text-base leading-none">{item.emoji}</span>
                {t(item.key)}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}
