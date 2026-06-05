/** UI-only presentation helpers. No data logic (that lives in lib/). */

export type Tier = {
  name: "BRONZE" | "SILVER" | "GOLD" | "BASED";
  min: number;
  color: string;
};

const TIERS: Tier[] = [
  { name: "BRONZE", min: 0, color: "#c98a4b" },
  { name: "SILVER", min: 35, color: "#b9c4dd" },
  { name: "GOLD", min: 60, color: "#ffc24d" },
  { name: "BASED", min: 85, color: "#4d86ff" },
];

export function tierFor(score: number): Tier {
  let t = TIERS[0];
  for (const tier of TIERS) if (score >= tier.min) t = tier;
  return t;
}

export function shortAddr(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/**
 * How to improve a given score criterion, for the one-click action shown on
 * each non-maxed breakdown row.
 *  - "link"  : external page (open in new tab)
 *  - "radar" : internal /radar (doing quests generates this activity)
 *  - "time"  : age-based, nothing to click — grows with time
 * labelKey indexes the score.improve.* i18n namespace.
 */
export type ScoreImprove =
  | { kind: "link"; href: string; labelKey: "basename" | "bridge" }
  | { kind: "radar"; labelKey: "quests" | "activity" }
  | { kind: "time"; labelKey: "time" | "spread" };

export function improveFor(key: string): ScoreImprove {
  switch (key) {
    // v2 identity row regroups Basename + Smart Wallet; point at the Basename mint.
    case "identity":
      return { kind: "link", href: "https://www.base.org/names", labelKey: "basename" };
    case "bridge":
      return { kind: "link", href: "https://bridge.base.org", labelKey: "bridge" };
    case "quests":
      return { kind: "radar", labelKey: "quests" };
    case "protocolDiversity":
      return { kind: "radar", labelKey: "activity" };
    case "activitySpread":
      return { kind: "time", labelKey: "spread" };
    case "activeMonths":
    case "firstTxAge":
      return { kind: "time", labelKey: "time" };
    // txCount, volumeEth, uniqueContracts + fallback: do quests across protocols.
    default:
      return { kind: "radar", labelKey: "activity" };
  }
}

/** Compact USD: 1_240_000 -> "$1.2M", 104_000_000 -> "$104M", 0/invalid -> "". */
export function formatUsd(n: number | undefined): string {
  if (!n || !Number.isFinite(n) || n <= 0) return "";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K`;
  return `$${Math.round(n)}`;
}

/** Compact relative time: "just now", "2h ago", "3d ago". 0/invalid -> "—". */
export function timeAgo(ms: number, now = Date.now()): string {
  if (!ms || ms <= 0) return "—";
  const s = Math.floor((now - ms) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return `${Math.floor(s / (7 * 86400))}w ago`;
}
