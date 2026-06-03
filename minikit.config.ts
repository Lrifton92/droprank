const ROOT_URL =
  process.env.NEXT_PUBLIC_URL ||
  (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) ||
  "http://localhost:3000";

/**
 * MiniApp configuration object. Must follow the mini app manifest specification.
 *
 * The accountAssociation is read from env (FARCASTER_HEADER/PAYLOAD/SIGNATURE).
 * These are produced by `npx create-onchain --manifest` at deploy time and stay
 * empty until the Farcaster account is signed. Structure is ready.
 *
 * @see {@link https://docs.base.org/mini-apps/features/manifest}
 */
export const minikitConfig = {
  accountAssociation: {
    header: process.env.FARCASTER_HEADER ?? "",
    payload: process.env.FARCASTER_PAYLOAD ?? "",
    signature: process.env.FARCASTER_SIGNATURE ?? "",
  },
  baseBuilder: {
    ownerAddress: process.env.NEXT_PUBLIC_BUILDER_ADDRESS ?? "",
  },
  miniapp: {
    version: "1",
    name: "DropRank",
    subtitle: "Base airdrop score & quest radar",
    description:
      "Check your Base wallet airdrop score /100 and scan onchain quests. Mint a soulbound badge.",
    screenshotUrls: [],
    iconUrl: `${ROOT_URL}/icon.png`,
    splashImageUrl: `${ROOT_URL}/splash.png`,
    splashBackgroundColor: "#000000",
    homeUrl: ROOT_URL,
    webhookUrl: `${ROOT_URL}/api/webhook`,
    primaryCategory: "utility",
    tags: ["base", "airdrop", "score", "quests", "onchain"],
    heroImageUrl: `${ROOT_URL}/hero.png`,
    tagline: "Your Base airdrop score, ranked.",
    ogTitle: "DropRank — your Base airdrop score",
    ogDescription: "Score your Base wallet /100 and scan onchain quests.",
    ogImageUrl: `${ROOT_URL}/hero.png`,
  },
};
