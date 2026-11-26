import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { SessionProvider } from "next-auth/react";
import { locales } from "@/i18n/config";
import { auth } from "@/lib/auth";

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!locales.includes(locale as (typeof locales)[number])) {
    notFound();
  }

  const [messages, session] = await Promise.all([getMessages(), auth()]);

  return (
    <NextIntlClientProvider messages={messages}>
      <SessionProvider session={session}>
        {children}
      </SessionProvider>
    </NextIntlClientProvider>
  );
}
