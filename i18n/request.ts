import { getRequestConfig } from "next-intl/server";
import { getUserLocale } from "./locale";

/**
 * next-intl request config for the "without i18n routing" setup.
 * Locale comes from the cookie/Accept-Language resolver (no URL segment).
 */
export default getRequestConfig(async () => {
  const locale = await getUserLocale();
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
