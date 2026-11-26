"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  AuthShell,
  ErrorBanner,
  FooterLink,
  SubmitButton,
} from "@/components/auth/auth-shell";
import { CodeInput } from "@/components/auth/code-input";
import { ResendButton } from "@/components/auth/resend-button";

function VerifyOtpForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = usePathname().split("/")[1] || "en";

  const email = searchParams.get("email") ?? "";
  const kind =
    searchParams.get("kind") === "EMAIL_VERIFICATION"
      ? "EMAIL_VERIFICATION"
      : "PASSWORD_RESET";

  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const shouldAutoSend = searchParams.get("retry") === "1";

  useEffect(() => {
    if (!shouldAutoSend || !email) return;

    let cancelled = false;

    async function autoSend() {
      try {
        const res = await fetch("/api/auth/otp/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, kind }),
        });
        if (!res.ok && !cancelled) {
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? t("sendCodeError"));
        }
      } catch {
        if (!cancelled) setError(t("sendCodeError"));
      }
    }

    autoSend();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldAutoSend, email, kind]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (code.length !== 6) {
      setError(t("codeIncomplete"));
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, kind }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? t("codeExpired"));
        setCode("");
        setLoading(false);
        return;
      }

      if (kind === "PASSWORD_RESET") {
        router.push(
          `/${locale}/reset-password?token=${encodeURIComponent(data.resetToken)}`,
        );
        return;
      }

      router.push(`/${locale}/login?verified=1`);
    } catch {
      setError(t("codeExpired"));
      setLoading(false);
    }
  }

  if (!email) {
    return (
      <AuthShell
        title={t("verifyEmailTitle")}
        subtitle={t("forgotPasswordSubtitle")}
        footer={<FooterLink prefix="" href={`/${locale}/login`} label={t("backToLogin")} />}
      >
        <ErrorBanner>{t("missingEmail")}</ErrorBanner>
      </AuthShell>
    );
  }

  const isReset = kind === "PASSWORD_RESET";

  return (
    <AuthShell
      title={isReset ? t("enterCode") : t("verifyEmailTitle")}
      subtitle={
        isReset
          ? t("codeSentTo", { email })
          : t("verifyEmailSubtitle", { email })
      }
      accent={isReset ? "indigo" : "purple"}
      footer={
        <FooterLink
          prefix={t("wrongEmail")}
          href={
            isReset
              ? `/${locale}/forgot-password`
              : `/${locale}/login`
          }
          label={isReset ? t("startOver") : t("backToLogin")}
        />
      }
    >
      <ErrorBanner>{error}</ErrorBanner>

      <form
        onSubmit={handleSubmit}
        className="space-y-6 animate-fade-in"
        style={{ animationDelay: "150ms" }}
      >
        <CodeInput value={code} onChange={setCode} disabled={loading} />

        <div className="text-center">
          <ResendButton
            email={email}
            kind={kind}
            onError={setError}
            onSent={() => setCode("")}
          />
        </div>

        <SubmitButton
          loading={loading}
          label={t("verify")}
          loadingLabel={t("verifying")}
          accent={isReset ? "indigo" : "purple"}
          disabled={code.length !== 6}
        />
      </form>
    </AuthShell>
  );
}

export default function VerifyOtpPage() {
  return (
    <Suspense fallback={null}>
      <VerifyOtpForm />
    </Suspense>
  );
}
