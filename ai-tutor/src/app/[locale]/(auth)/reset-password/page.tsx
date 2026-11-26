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

function ResetPasswordForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = usePathname().split("/")[1] || "en";

  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [focusPass, setFocusPass] = useState(false);
  const [focusConfirm, setFocusConfirm] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError(t("passwordTooShort"));
      return;
    }

    if (password !== confirm) {
      setError(t("passwordsDoNotMatch"));
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? t("resetFailed"));
        setLoading(false);
        return;
      }

      router.push(`/${locale}/login?reset=1`);
    } catch {
      setError(t("resetFailed"));
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <AuthShell
        title={t("newPasswordTitle")}
        subtitle={t("newPasswordSubtitle")}
        footer={
          <FooterLink
            prefix=""
            href={`/${locale}/forgot-password`}
            label={t("requestNewCode")}
          />
        }
      >
        <ErrorBanner>{t("resetLinkInvalid")}</ErrorBanner>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={t("newPasswordTitle")}
      subtitle={t("newPasswordSubtitle")}
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
          id="new-password"
          label={t("newPassword")}
          type="password"
          autoComplete="new-password"
          placeholder={t("passwordPlaceholder")}
          value={password}
          onChange={setPassword}
          focused={focusPass}
          onFocus={() => setFocusPass(true)}
          onBlur={() => setFocusPass(false)}
        />

        <Field
          id="confirm-password"
          label={t("confirmPassword")}
          type="password"
          autoComplete="new-password"
          placeholder={t("passwordPlaceholder")}
          value={confirm}
          onChange={setConfirm}
          focused={focusConfirm}
          onFocus={() => setFocusConfirm(true)}
          onBlur={() => setFocusConfirm(false)}
        />

        <SubmitButton
          loading={loading}
          label={t("updatePassword")}
          loadingLabel={t("updatingPassword")}
          accent="indigo"
        />
      </form>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
