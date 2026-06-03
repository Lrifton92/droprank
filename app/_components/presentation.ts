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

/** External "do the quest" links, keyed by quest id (mirrors lib/quests.ts). */
export const QUEST_LINKS: Record<string, string> = {
  "swap-aerodrome": "https://aerodrome.finance",
  "swap-uniswap": "https://app.uniswap.org",
  "lend-moonwell": "https://moonwell.fi",
  "supply-aave": "https://app.aave.com",
  "mint-zora": "https://zora.co",
  basename: "https://base.org/names",
  "smart-wallet": "https://www.smartwallet.dev",
  "bridge-canonical": "https://bridge.base.org",
  "hold-usdc": "https://www.base.org",
};
