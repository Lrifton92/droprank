import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { BlockscoutError } from "@/lib/providers/blockscout";
import { scoreAddress } from "@/lib/score-address";
import { signAttestation } from "@/lib/sign-attestation";
import { RateLimiter, clientIp } from "@/lib/cache";
import { BADGE_CHAIN_ID } from "@/lib/badge-abi";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Tighter limit than /api/score: signing is more sensitive and recomputes data.
const limiter = new RateLimiter(15, 60_000);

/** Normalize a private key from env to a 0x-prefixed string viem accepts. */
function normalizePk(raw: string): `0x${string}` {
  const k = raw.trim();
  return (k.startsWith("0x") ? k : `0x${k}`) as `0x${string}`;
}

export async function POST(req: NextRequest) {
  if (!limiter.allow(clientIp(req))) {
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
      const status = e.kind === "invalid_address" ? 400 : 502;
      return NextResponse.json({ error: e.message, kind: e.kind }, { status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
