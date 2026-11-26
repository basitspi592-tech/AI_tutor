"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  AuthShell,
  ErrorBanner,
  Field,
  FooterLink,
  SubmitButton,
  SuccessBanner,
} from "@/components/auth/auth-shell";

function LoginForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = usePathname().split("/")[1] || "en";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [focusEmail, setFocusEmail] = useState(false);
  const [focusPass, setFocusPass] = useState(false);

  const notice = searchParams.get("reset")
    ? t("passwordUpdated")
    : searchParams.get("verified")
      ? t("emailVerified")
      : searchParams.get("error")
        ? t("invalidCredentials")
        : "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);

    if (result?.error) {
      setError("Invalid email or password");
    } else {
      router.push(`/${locale}/tutor`);
      router.refresh();
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to continue your learning journey"
      accent="indigo"
      footer={
        <FooterLink prefix="Don't have an account?" href={`/${locale}/register`} label="Get started" />
      }
    >
      <SuccessBanner>{notice}</SuccessBanner>
      <ErrorBanner>{error}</ErrorBanner>

      <form onSubmit={handleSubmit} className="space-y-4 animate-fade-in">
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
            autoComplete="current-password"
            placeholder="Enter your password"
            icon="🔒"
            value={password}
            onChange={setPassword}
            focused={focusPass}
            onFocus={() => setFocusPass(true)}
            onBlur={() => setFocusPass(false)}
          />
          <div className="flex justify-end mt-2">
            <Link
              href={`/${locale}/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ""}`}
              className="text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors"
            >
              Forgot password?
            </Link>
          </div>
        </div>

        <SubmitButton
          loading={loading}
          label="Sign In"
          loadingLabel="Signing in..."
          accent="indigo"
        />
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
