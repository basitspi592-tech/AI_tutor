export const locales = ["en", "ar", "fr", "ur"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

export const localeNames: Record<Locale, string> = {
  en: "English",
  ar: "العربية",
  fr: "Français",
  ur: "اردو",
};

export const rtlLocales: Locale[] = ["ar", "ur"];
