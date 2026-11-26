"use client";

import Link from "next/link";

type Accent = "indigo" | "purple";

const ACCENTS: Record<Accent, { from: string; to: string }> = {
  indigo: { from: "#2563eb", to: "#4f46e5" },
  purple: { from: "#7c3aed", to: "#2563eb" },
};

export function ErrorBanner({ children }: { children?: string | null }) {
  if (!children) return null;
  return (
    <div className="mb-6 p-4 rounded-xl text-sm font-medium animate-fade-in flex items-start gap-3 bg-red-50 border border-red-200">
      <span className="text-red-500 text-lg leading-none flex-shrink-0">⚠️</span>
      <p className="text-red-800">{children}</p>
    </div>
  );
}

export function SuccessBanner({ children }: { children?: string | null }) {
  if (!children) return null;
  return (
    <div className="mb-6 p-4 rounded-xl text-sm font-medium animate-fade-in flex items-start gap-3 bg-emerald-50 border border-emerald-200">
      <span className="text-emerald-500 text-lg leading-none flex-shrink-0">✓</span>
      <p className="text-emerald-800">{children}</p>
    </div>
  );
}

export function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export function SubmitButton({
  loading,
  label,
  loadingLabel,
  accent,
  type = "submit",
  onClick,
  disabled,
}: {
  loading: boolean;
  label: string;
  loadingLabel?: string;
  accent: Accent;
  type?: "submit" | "button";
  onClick?: () => void;
  disabled?: boolean;
}) {
  const isDisabled = loading || disabled;
  const a = ACCENTS[accent];

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      className="w-full text-white font-bold py-4 rounded-2xl shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-sm uppercase tracking-wide"
      style={{ background: `linear-gradient(135deg, ${a.from}, ${a.to})` }}
    >
      {loading ? (
        <span className="inline-flex items-center justify-center gap-2">
          <Spinner />
          {loadingLabel ?? label}
        </span>
      ) : (
        <span>{label}</span>
      )}
    </button>
  );
}

export function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
  inputMode,
  maxLength,
  minLength,
  icon,
  focused,
  onFocus,
  onBlur,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  inputMode?: "text" | "numeric" | "email";
  maxLength?: number;
  minLength?: number;
  icon?: string;
  focused: boolean;
  onFocus: () => void;
  onBlur: () => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-bold mb-2 uppercase tracking-wide text-slate-700">
        {label}
      </label>
      <div className="relative">
        {icon && (
          <span className="absolute start-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none leading-none">
            {icon}
          </span>
        )}
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={placeholder}
          autoComplete={autoComplete}
          inputMode={inputMode}
          maxLength={maxLength}
          minLength={minLength}
          required
          className={`w-full bg-white border-2 rounded-2xl text-sm text-slate-900 placeholder:text-slate-400 transition-all outline-none py-3.5 ${
            icon ? "ps-11 pe-4" : "px-4"
          } ${
            focused
              ? "border-blue-500 ring-4 ring-blue-50"
              : "border-slate-200 hover:border-slate-300"
          }`}
        />
      </div>
    </div>
  );
}

export function AuthShell({
  title,
  subtitle,
  accent = "indigo",
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  accent?: Accent;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const a = ACCENTS[accent];

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center space-y-3 mb-8 animate-fade-in">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl text-white shadow-lg text-2xl"
            style={{ background: `linear-gradient(135deg, ${a.from}, ${a.to})` }}
          >
            🎓
          </div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">{title}</h1>
          <p className="text-slate-500 font-medium text-sm">{subtitle}</p>
        </div>

        {/* Form card */}
        <div className="bg-white p-8 rounded-3xl shadow-lg border border-slate-100 animate-fade-in">
          {children}
        </div>

        {footer && (
          <p className="text-center text-slate-600 text-sm font-medium mt-8 animate-fade-in">
            {footer}
          </p>
        )}
      </div>
    </div>
  );
}

export function FooterLink({ prefix, href, label }: { prefix: string; href: string; label: string }) {
  return (
    <>
      {prefix}{" "}
      <Link href={href} className="text-blue-600 font-bold hover:underline">
        {label}
      </Link>
    </>
  );
}
