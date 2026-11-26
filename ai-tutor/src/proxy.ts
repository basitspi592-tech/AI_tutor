import createMiddleware from "next-intl/middleware";
import { auth } from "@/lib/auth";
import { routing } from "@/i18n/routing";
import { defaultLocale, locales } from "@/i18n/config";

const handleI18nRouting = createMiddleware(routing);

const SIGN_IN_PAGES = ["login", "register"];
const OTP_PAGES = ["forgot-password", "verify-otp", "reset-password"];

function localeFromPath(pathname: string): string {
  const segment = pathname.split("/")[1];
  return locales.includes(segment as (typeof locales)[number]) ? segment : defaultLocale;
}

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;
  const locale = localeFromPath(pathname);

  const segments = pathname.split("/");
  const isSignInPage = SIGN_IN_PAGES.some((page) => segments.includes(page));
  const isOtpPage = OTP_PAGES.some((page) => segments.includes(page));

  if (isSignInPage) {
    if (isLoggedIn) {
      return Response.redirect(new URL(`/${locale}/tutor`, req.url));
    }
    return handleI18nRouting(req);
  }

  if (isOtpPage) {
    return handleI18nRouting(req);
  }

  if (!isLoggedIn) {
    return Response.redirect(new URL(`/${locale}/login`, req.url));
  }

  return handleI18nRouting(req);
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};
