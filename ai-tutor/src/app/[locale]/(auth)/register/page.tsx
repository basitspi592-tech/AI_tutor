"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  AuthShell,
  ErrorBanner,
  Field,
  FooterLink,
  SubmitButton,
} from "@/components/auth/auth-shell";

export default function RegisterPage() {
  const router = useRouter();
  const locale = usePathname().split("/")[1] || "en";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [focusName, setFocusName] = useState(false);
  const [focusEmail, setFocusEmail] = useState(false);
  const [focusPass, setFocusPass] = useState(false);

  let passwordStrength = 0;
  if (password.length >= 8) passwordStrength += 33;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) passwordStrength += 33;
  if (/[0-9]/.test(password) || /[^A-Za-z0-9]/.test(password)) passwordStrength += 34;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Registration failed");
        setLoading(false);
        return;
      }

      const query = new URLSearchParams({ email });
      query.set("kind", "EMAIL_VERIFICATION");
      if (!data.verificationEmailSent) query.set("retry", "1");

      router.push(`/${locale}/verify-otp?${query.toString()}`);
    } catch {
      setError("Something went wrong");
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Create account"
      subtitle="A few details and you're ready to learn"
      accent="purple"
      footer={
        <FooterLink prefix="Already have an account?" href={`/${locale}/login`} label="Sign in" />
      }
    >
      <ErrorBanner>{error}</ErrorBanner>

      <form onSubmit={handleSubmit} className="space-y-4 animate-fade-in">
        <Field
          id="name"
          label="Full Name"
          type="text"
          autoComplete="name"
          placeholder="Your name"
          icon="👤"
          value={name}
          onChange={setName}
          focused={focusName}
          onFocus={() => setFocusName(true)}
          onBlur={() => setFocusName(false)}
        />
        <Field
          id="email"
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          icon="✉️"
          value={email}
          onChange={setEmail}
          focused={focusEmail}
          onFocus={() => setFocusEmail(true)}
          onBlur={() => setFocusEmail(false)}
        />
        <div>
          <Field
            id="password"
            label="Password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            placeholder="At least 8 characters"
            icon="🔒"
            value={password}
            onChange={setPassword}
            focused={focusPass}
            onFocus={() => setFocusPass(true)}
            onBlur={() => setFocusPass(false)}
          />
          {password.length > 0 && (
            <div className="flex items-center gap-1.5 mt-2">
              <div className="flex-1 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    passwordStrength < 50
                      ? "bg-red-500"
                      : passwordStrength < 80
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                  }`}
                  style={{
                    width: passwordStrength < 50 ? "33%" : passwordStrength < 80 ? "66%" : "100%",
                  }}
                />
              </div>
              <span
                className={`text-[10px] font-bold uppercase ${
                  passwordStrength < 50
                    ? "text-red-500"
                    : passwordStrength < 80
                      ? "text-amber-600"
                      : "text-emerald-600"
                }`}
              >
                {passwordStrength < 50 ? "Weak" : passwordStrength < 80 ? "Okay" : "Strong"}
              </span>
            </div>
          )}
        </div>

        <SubmitButton
          loading={loading}
          label="Create Account"
          loadingLabel="Creating account..."
          accent="purple"
        />
      </form>
    </AuthShell>
  );
}
