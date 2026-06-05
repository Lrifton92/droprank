/** i18n configuration. Pure constants + helpers (no Next/server imports here). */

export const LOCALES = ["en", "fr"] as const;
export type Locale = (typeof LOCALES)[number];

/** EN is the default (per product decision). */
export const DEFAULT_LOCALE: Locale = "en";

/** Cookie name used to persist the manual language choice. */
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isLocale(value: string | undefined | null): value is Locale {
  return value != null && (LOCALES as readonly string[]).includes(value);
}

/**
 * Resolve a locale from a raw `Accept-Language` header.
 * Returns the first supported language tag (prefix-matched), else DEFAULT_LOCALE.
 */
export function localeFromAcceptLanguage(header: string | null): Locale {
  if (!header) return DEFAULT_LOCALE;
  for (const part of header.split(",")) {
    const tag = part.split(";")[0]?.trim().toLowerCase();
    if (!tag) continue;
    const base = tag.split("-")[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

/**
 * Resolve the display label of a quest from the i18n `quests` namespace,
 * falling back to the English `label` from lib/quests.ts when no translation
 * exists for the given id. The data layer (lib/quests.ts, /api/quests) is the
 * source of truth for ids + the EN fallback; never mutate it here.
 */
export function questLabel(
  id: string,
  fallbackLabel: string,
  messages: Record<string, string> | undefined,
): string {
  const translated = messages?.[id];
  return translated && translated.length > 0 ? translated : fallbackLabel;
}

/**
 * Score breakdown details ("342 tx", "5 months", "owned"…) are produced in EN by
 * lib/scoring.ts, which we must not modify. To localize them on the UI side we map
 * the criterion key + the raw EN detail back to a message key + interpolation
 * values. Returns `{ key, values }` ready for next-intl `t(key, values)`, or
 * `null` when the detail can't be mapped (the caller then shows the raw EN string
 * as a safe fallback). Pure + testable.
 */
export type DetailMessage = {
  key:
    | "tx"
    | "months"
    | "days"
    | "eth"
    | "contracts"
    | "noTx"
    | "owned"
    | "none"
    | "used"
    | "no"
    | "questsPts"
    // v2 criteria
    | "spread"
    | "categories"
    | "bridged"
    | "noBridge"
    | "idBoth"
    | "idBasename"
    | "idSmartWallet"
    | "sybilBurst"
    | "sybilDust"
    | "sybilBurstDust";
  values?: Record<string, string | number>;
};

export function parseDetail(
  criterionKey: string,
  detail: string,
): DetailMessage | null {
  const num = (re: RegExp): number | null => {
    const m = detail.match(re);
    return m ? Number(m[1]) : null;
  };
  switch (criterionKey) {
    case "txCount": {
      const n = num(/^(\d+)\s+tx$/);
      return n === null ? null : { key: "tx", values: { count: n } };
    }
    case "activeMonths": {
      const n = num(/^(\d+)\s+months$/);
      return n === null ? null : { key: "months", values: { count: n } };
    }
    case "activeDays": {
      const n = num(/^(\d+)\s+days$/);
      return n === null ? null : { key: "days", values: { count: n } };
    }
    case "volumeEth": {
      const m = detail.match(/^([\d.]+)\s+ETH$/);
      return m ? { key: "eth", values: { value: m[1] } } : null;
    }
    case "uniqueContracts": {
      const n = num(/^(\d+)\s+contracts$/);
      return n === null ? null : { key: "contracts", values: { count: n } };
    }
    case "firstTxAge": {
      if (detail === "no tx") return { key: "noTx" };
      const n = num(/^(\d+)\s+days$/);
      return n === null ? null : { key: "days", values: { count: n } };
    }
    case "basename":
      return detail === "owned"
        ? { key: "owned" }
        : detail === "none"
          ? { key: "none" }
          : null;
    case "smartWallet":
      return detail === "used"
        ? { key: "used" }
        : detail === "no"
          ? { key: "no" }
          : null;
    case "quests": {
      const m = detail.match(/^(\d+)\/(\d+)\s+pts$/);
      return m
        ? { key: "questsPts", values: { earned: Number(m[1]), max: Number(m[2]) } }
        : null;
    }
    case "activitySpread": {
      const m = detail.match(/^([\d.]+)\s+spread$/);
      return m ? { key: "spread", values: { value: m[1] } } : null;
    }
    case "protocolDiversity": {
      const n = num(/^(\d+)\s+categories$/);
      return n === null ? null : { key: "categories", values: { count: n } };
    }
    case "bridge":
      return detail === "bridged"
        ? { key: "bridged" }
        : detail === "no bridge"
          ? { key: "noBridge" }
          : null;
    case "identity":
      switch (detail) {
        case "basename + smart wallet":
          return { key: "idBoth" };
        case "basename":
          return { key: "idBasename" };
        case "smart wallet":
          return { key: "idSmartWallet" };
        case "none":
          return { key: "none" };
        default:
          return null;
      }
    case "sybilFlags":
      switch (detail) {
        case "burst":
          return { key: "sybilBurst" };
        case "dust":
          return { key: "sybilDust" };
        case "burst + dust":
          return { key: "sybilBurstDust" };
        default:
          return null;
      }
    default:
      return null;
  }
}
