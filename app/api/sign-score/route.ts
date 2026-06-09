import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { BlockscoutError } from "@/lib/providers/blockscout";
import { scoreAddress } from "@/lib/score-address";
import { signAttestation } from "@/lib/sign-attestation";
import { checkRateLimit } from "@/lib/cache";
import { BADGE_CHAIN_ID } from "@/lib/badge-abi";

// Re-scans the wallet (scoreAddress) to recompute the score server-side; a
// deep-history wallet can exceed Vercel's default function timeout. 60 = Hobby max.
export const maxDuration = 60;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/** Normalize a private key from env to a 0x-prefixed string viem accepts. */
function normalizePk(raw: string): `0x${string}` {
  const k = raw.trim();
  return (k.startsWith("0x") ? k : `0x${k}`) as `0x${string}`;
}

export async function POST(req: NextRequest) {
  // Tighter limit than /api/score: signing is sensitive and recomputes data.
  if (!(await checkRateLimit(req, {
    prefix: "sign-score",
    limit: 10,
    windowSeconds: 60,
  }))) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  const pk = process.env.SIGNER_PRIVATE_KEY;
  if (!pk) {
    return NextResponse.json(
      { error: "Signer not configured" },
      { status: 503 },
    );
  }

  const contract = process.env.NEXT_PUBLIC_BADGE_CONTRACT;
  // Refuse to sign against a missing/placeholder contract: a signature for the
  // zero address is worthless and would only mislead the client.
  if (
    !contract ||
    !isAddress(contract) ||
    contract.toLowerCase() === ZERO_ADDRESS
  ) {
    return NextResponse.json(
      { error: "Badge contract not configured" },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const address = (body as { address?: unknown })?.address;
  if (typeof address !== "string" || !isAddress(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  let account;
  try {
    account = privateKeyToAccount(normalizePk(pk));
  } catch {
    return NextResponse.json(
      { error: "Signer not configured" },
      { status: 503 },
    );
  }

  try {
    // The score is ALWAYS recomputed server-side; never trusted from the client.
    const result = await scoreAddress(address, req.signal);
    const signed = await signAttestation(account, {
      wallet: address.toLowerCase() as `0x${string}`,
      score: result.score,
      contract: contract as `0x${string}`,
      chainId: BADGE_CHAIN_ID,
    });

    return NextResponse.json(
      {
        address: address.toLowerCase(),
        score: signed.score,
        deadline: signed.deadline.toString(),
        signature: signed.signature,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    if (e instanceof BlockscoutError) {
      if (e.kind === "invalid_address") {
        return NextResponse.json({ error: "Invalid address" }, { status: 400 });
      }
      // Don't leak upstream internals to the client; log them server-side.
      console.error("[sign-score] upstream error:", e.kind, e.message);
      return NextResponse.json(
        { error: "Upstream unavailable" },
        { status: 502 },
      );
    }
    console.error("[sign-score] internal error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
