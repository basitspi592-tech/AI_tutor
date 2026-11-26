"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

export function ResendButton({
  email,
  kind,
  onError,
  onSent,
}: {
  email: string;
  kind: "EMAIL_VERIFICATION" | "PASSWORD_RESET";
  onError: (message: string) => void;
  onSent?: () => void;
}) {
  const t = useTranslations("auth");
  const [cooldown, setCooldown] = useState(60);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function handleResend() {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, kind }),
      });

      const data = await res.json();

      if (!res.ok) {
        onError(data.error ?? t("codeExpired"));
        return;
      }

      setCooldown(60);
      onSent?.();
    } catch {
      onError(t("sendCodeError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleResend}
      disabled={cooldown > 0 || loading}
      className="text-sm font-semibold transition-opacity"
      style={{
        color: cooldown > 0 ? "rgba(148,163,184,0.45)" : "#818cf8",
        cursor: cooldown > 0 || loading ? "not-allowed" : "pointer",
      }}
    >
      {cooldown > 0 ? t("resendIn", { seconds: cooldown }) : t("resendCode")}
    </button>
  );
}
