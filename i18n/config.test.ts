import { describe, it, expect } from "vitest";
import {
  isLocale,
  localeFromAcceptLanguage,
  questLabel,
  parseDetail,
  DEFAULT_LOCALE,
  LOCALES,
} from "./config";
import { computeScore } from "../lib/scoring";
import type { WalletData } from "../lib/types";
import { QUESTS } from "../lib/quests";
import en from "../messages/en.json";
import fr from "../messages/fr.json";

describe("isLocale", () => {
  it("accepts supported locales", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("fr")).toBe(true);
  });
  it("rejects everything else", () => {
    expect(isLocale("de")).toBe(false);
    expect(isLocale("")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(isLocale(null)).toBe(false);
  });
});

describe("localeFromAcceptLanguage", () => {
  it("falls back to default for null/empty", () => {
    expect(localeFromAcceptLanguage(null)).toBe(DEFAULT_LOCALE);
    expect(localeFromAcceptLanguage("")).toBe(DEFAULT_LOCALE);
  });
  it("prefix-matches a region tag", () => {
    expect(localeFromAcceptLanguage("fr-FR,fr;q=0.9")).toBe("fr");
    expect(localeFromAcceptLanguage("en-US,en;q=0.9")).toBe("en");
  });
  it("returns the first SUPPORTED tag, skipping unsupported ones", () => {
    expect(localeFromAcceptLanguage("de-DE,de;q=0.9,fr;q=0.8")).toBe("fr");
  });
  it("falls back to default when nothing is supported", () => {
    expect(localeFromAcceptLanguage("de,es,it")).toBe(DEFAULT_LOCALE);
  });
});

describe("questLabel", () => {
  const messages = { "swap-aerodrome": "Swap sur Aerodrome" };
  it("returns the translation when present", () => {
    expect(questLabel("swap-aerodrome", "Swap on Aerodrome", messages)).toBe(
      "Swap sur Aerodrome",
    );
  });
  it("falls back to the EN label when no translation", () => {
    expect(questLabel("mint-nft", "Mint any NFT", messages)).toBe("Mint any NFT");
  });
  it("falls back when messages is undefined or empty", () => {
    expect(questLabel("mint-nft", "Mint any NFT", undefined)).toBe("Mint any NFT");
    expect(questLabel("mint-nft", "Mint any NFT", { "mint-nft": "" })).toBe(
      "Mint any NFT",
    );
  });
});

describe("parseDetail", () => {
  it("maps each criterion's EN detail to a message descriptor", () => {
    expect(parseDetail("txCount", "342 tx")).toEqual({ key: "tx", values: { count: 342 } });
    expect(parseDetail("activeMonths", "5 months")).toEqual({ key: "months", values: { count: 5 } });
    expect(parseDetail("activeDays", "12 days")).toEqual({ key: "days", values: { count: 12 } });
    expect(parseDetail("volumeEth", "1.234 ETH")).toEqual({ key: "eth", values: { value: "1.234" } });
    expect(parseDetail("uniqueContracts", "9 contracts")).toEqual({ key: "contracts", values: { count: 9 } });
    expect(parseDetail("firstTxAge", "200 days")).toEqual({ key: "days", values: { count: 200 } });
    expect(parseDetail("firstTxAge", "no tx")).toEqual({ key: "noTx" });
    expect(parseDetail("basename", "owned")).toEqual({ key: "owned" });
    expect(parseDetail("basename", "none")).toEqual({ key: "none" });
    expect(parseDetail("smartWallet", "used")).toEqual({ key: "used" });
    expect(parseDetail("smartWallet", "no")).toEqual({ key: "no" });
    expect(parseDetail("quests", "12/20 pts")).toEqual({ key: "questsPts", values: { earned: 12, max: 20 } });
  });
  it("returns null for unknown keys / unparsable details", () => {
    expect(parseDetail("unknown", "x")).toBeNull();
    expect(parseDetail("txCount", "garbage")).toBeNull();
  });

  it("covers every detail format actually emitted by computeScore", () => {
    const data: WalletData = {
      address: "0xabc",
      txCount: 342,
      isContract: false,
      hasBasename: true,
      usedSmartWallet: true,
      txs: [
        { hash: "0x1", from: "0xa", to: "0xb", value: "1000000000000000000", timestamp: 1_700_000_000, toIsContract: true },
        { hash: "0x2", from: "0xa", to: "0xc", value: "0", timestamp: 1_690_000_000, toIsContract: true },
      ],
    };
    const result = computeScore(data, 12, {
      categoriesTouched: ["DEX", "Lending"],
      bridgeDone: true,
    });
    for (const b of result.breakdown) {
      expect(parseDetail(b.key, b.detail), `key=${b.key} detail="${b.detail}"`).not.toBeNull();
    }
  });

  it("covers the v2 sybil-flag detail formats and they exist in every locale", () => {
    // A burst+dust wallet emits the "sybilFlags" row; check its detail maps and
    // that EVERY parseDetail key produced is present in en.json/fr.json detail.
    const now = Math.floor(Date.now() / 1000);
    const burstDust: WalletData = {
      address: "0xabc",
      txCount: 30,
      isContract: false,
      hasBasename: false,
      usedSmartWallet: false,
      txs: Array.from({ length: 30 }, (_, i) => ({
        hash: `0x${i}`,
        from: "0xa",
        to: "0xc0000000000000000000000000000000000000c0",
        value: "0",
        timestamp: now - 86400 + i * 600, // all within ~5h -> burst
        toIsContract: true,
      })),
    };
    const result = computeScore(burstDust, 0, {
      categoriesTouched: ["DEX"],
      bridgeDone: false,
      balanceWei: "1000000000000000", // 0.001 ETH -> dust
    });
    const sybil = result.breakdown.find((b) => b.key === "sybilFlags");
    expect(sybil, "sybilFlags row should be present").toBeDefined();

    const detailEn = (en as { detail: Record<string, string> }).detail;
    const detailFr = (fr as { detail: Record<string, string> }).detail;
    for (const b of result.breakdown) {
      const d = parseDetail(b.key, b.detail);
      if (!d) continue;
      expect(detailEn[d.key], `en.json detail.${d.key}`).toBeTruthy();
      expect(detailFr[d.key], `fr.json detail.${d.key}`).toBeTruthy();
    }
  });
});

describe("quest translation coverage", () => {
  const questsEn = (en as { quests: Record<string, string> }).quests;
  const questsFr = (fr as { quests: Record<string, string> }).quests;
  for (const q of QUESTS) {
    it(`has a non-empty label for "${q.id}" in every locale`, () => {
      expect(questsEn[q.id], `en.json quests.${q.id}`).toBeTruthy();
      expect(questsFr[q.id], `fr.json quests.${q.id}`).toBeTruthy();
    });
  }
  it("exposes both locales", () => {
    expect(LOCALES).toEqual(["en", "fr"]);
  });
});
