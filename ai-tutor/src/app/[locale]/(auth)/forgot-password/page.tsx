"use client";

import { Suspense, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  AuthShell,
  ErrorBanner,
  Field,
  FooterLink,
  SubmitButton,
} from "@/components/auth/auth-shell";

function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = usePathname().split("/")[1] || "en";

  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [focus, setFocus] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, kind: "PASSWORD_RESET" }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? t("sendCodeError"));
        setLoading(false);
        return;
      }

      router.push(`/${locale}/verify-otp?email=${encodeURIComponent(email)}`);
    } catch {
      setError(t("sendCodeError"));
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title={t("forgotPasswordTitle")}
      subtitle={t("forgotPasswordSubtitle")}
      footer={
        <FooterLink
          prefix={t("remembered")}
          href={`/${locale}/login`}
          label={t("backToLogin")}
        />
      }
    >
      <ErrorBanner>{error}</ErrorBanner>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 animate-fade-in"
        style={{ animationDelay: "150ms" }}
      >
        <Field
          id="email"
          label={t("email")}
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={setEmail}
          focused={focus}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
        />

        <SubmitButton
          loading={loading}
          label={t("sendCode")}
          loadingLabel={t("sendingCode")}
          accent="indigo"
        />
      </form>
    </AuthShell>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotPasswordForm />
    </Suspense>
  );
}
