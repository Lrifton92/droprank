import { ImageResponse } from "next/og";
import { isAddress } from "viem";
import { scoreAddress } from "@/lib/score-address";
import type { ScoreResult } from "@/lib/types";

/**
 * Dynamic share image (1200x800, 3:2 — Farcaster-friendly).
 * Premium DropRank score card: Base blue on dark, mono data, tier.
 * Computes the score in-process via scoreAddress() (no self-fetch to /api/score,
 * which would double Blockscout quota). Degrades to a clean fallback card on any
 * failure. JSX lives here; route.ts re-exports GET.
 */

const TIERS: { name: string; min: number; color: string }[] = [
  { name: "BRONZE", min: 0, color: "#c98a4b" },
  { name: "SILVER", min: 35, color: "#b9c4dd" },
  { name: "GOLD", min: 60, color: "#ffc24d" },
  { name: "BASED", min: 85, color: "#4d86ff" },
];
function tierFor(score: number) {
  let t = TIERS[0];
  for (const x of TIERS) if (score >= x.min) t = x;
  return t;
}
function shortAddr(a: string) {
  return a.length < 12 ? a : `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export async function renderOg(
  req: Request,
  address: string,
): Promise<ImageResponse> {
  const W = 1200;
  const H = 800;

  let score: number | null = null;
  let breakdown: ScoreResult["breakdown"] = [];
  if (isAddress(address)) {
    try {
      const data = await scoreAddress(address, req.signal);
      score = data.score;
      breakdown = data.breakdown;
    } catch {
      /* fall through to fallback card */
    }
  }

  const tier = score !== null ? tierFor(score) : null;
  const top = [...breakdown]
    .sort((a, b) => b.points / b.max - a.points / a.max)
    .slice(0, 4);

  const mono = 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace';

  return new ImageResponse(
    (
      <div
        style={{
          width: W,
          height: H,
          display: "flex",
          flexDirection: "column",
          padding: 64,
          color: "#fff",
          fontFamily: mono,
          background:
            "radial-gradient(900px 600px at 50% -10%, rgba(0,82,255,0.35), transparent 60%), #05070d",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: "linear-gradient(150deg, #4d86ff, #0052ff)",
                border: "2px solid rgba(138,176,255,0.6)",
              }}
            />
            <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: 4 }}>
              DROP·RANK
            </div>
          </div>
          <div style={{ fontSize: 22, color: "#69748f", letterSpacing: 3 }}>
            {"// BASE MAINNET"}
          </div>
        </div>

        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: 56,
            marginTop: 24,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 24, color: "#69748f", letterSpacing: 4 }}>
              {score !== null ? "DROPRANK SCORE" : "WALLET"}
            </div>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <div
                style={{
                  fontSize: 260,
                  fontWeight: 800,
                  lineHeight: 1,
                  letterSpacing: -10,
                  textShadow: "0 0 70px rgba(0,82,255,0.7)",
                }}
              >
                {score !== null ? score : "?"}
              </div>
              <div style={{ fontSize: 70, color: "#69748f", marginBottom: 40 }}>
                /100
              </div>
            </div>
            {tier ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 20,
                  marginTop: 8,
                }}
              >
                <div
                  style={{
                    fontSize: 30,
                    fontWeight: 700,
                    letterSpacing: 6,
                    color: tier.color,
                    border: `2px solid ${tier.color}`,
                    borderRadius: 999,
                    padding: "10px 28px",
                  }}
                >
                  {tier.name}
                </div>
                <div style={{ fontSize: 26, color: "#aeb9d4" }}>
                  {shortAddr(address)}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 26, color: "#aeb9d4", marginTop: 8 }}>
                {shortAddr(address)}
              </div>
            )}
          </div>

          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: 18,
              padding: 32,
              borderRadius: 20,
              border: "1px solid rgba(120,160,255,0.16)",
              background: "rgba(12,17,28,0.6)",
            }}
          >
            <div style={{ fontSize: 20, color: "#69748f", letterSpacing: 3 }}>
              score.top[]
            </div>
            {top.length > 0 ? (
              top.map((b) => (
                <div
                  key={b.key}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 26,
                  }}
                >
                  <div style={{ color: "#8ab0ff" }}>{b.key}</div>
                  <div style={{ color: "#6ce0ff", display: "flex" }}>
                    {b.points}
                    <span style={{ color: "#69748f" }}>/{b.max}</span>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ fontSize: 24, color: "#aeb9d4" }}>
                Check your Base airdrop rank →
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 22,
            color: "#69748f",
            letterSpacing: 2,
          }}
        >
          <div>droprank · onchain reputation</div>
          <div style={{ color: "#4d86ff" }}>scan your wallet ↗</div>
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      headers: {
        "cache-control":
          "public, s-maxage=3600, stale-while-revalidate",
      },
    },
  );
}
