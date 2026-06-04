"use server";
import { cookies, headers } from "next/headers";
import {
  LOCALE_COOKIE,
  type Locale,
  isLocale,
  localeFromAcceptLanguage,
} from "./config";

/**
 * Locale resolution WITHOUT i18n routing (no /en, /fr URL prefix).
 * This keeps the MiniKit deep-links and /.well-known/farcaster.json intact:
 * homeUrl/heroImageUrl point at ROOT_URL with no locale segment, and there is
 * no middleware to redirect "/" → "/en".
 *
 * Priority: explicit cookie (manual choice) > Accept-Language (auto-detect) > EN.
 */
export async function getUserLocale(): Promise<Locale> {
  const cookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(cookie)) return cookie;
  const accept = (await headers()).get("accept-language");
  return localeFromAcceptLanguage(accept);
}

/** Persist the manual language choice in a cookie (1 year). */
export async function setUserLocale(locale: Locale): Promise<void> {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
