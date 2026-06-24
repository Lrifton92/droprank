import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, isAddress } from "viem";
import { base, baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { BlockscoutError } from "@/lib/providers/blockscout";
import { scoreAddress } from "@/lib/score-address";
import { signCheckinAttestation } from "@/lib/sign-checkin-attestation";
import { checkRateLimit } from "@/lib/cache";
import { CHECKIN_CHAIN_ID, DROPRANK_CHECKIN_ABI } from "@/lib/checkin-abi";

export const maxDuration = 60;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function normalizePk(raw: string): `0x${string}` {
  const k = raw.trim();
  return (k.startsWith("0x") ? k : `0x${k}`) as `0x${string}`;
}

export async function POST(req: NextRequest) {
  if (!(await checkRateLimit(req, { prefix: "sign-checkin", limit: 10, windowSeconds: 60 }))) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  const pk = process.env.SIGNER_PRIVATE_KEY;
  if (!pk) return NextResponse.json({ error: "Signer not configured" }, { status: 503 });

  const contract = process.env.NEXT_PUBLIC_CHECKIN_CONTRACT;
  if (!contract || !isAddress(contract) || contract.toLowerCase() === ZERO_ADDRESS) {
    return NextResponse.json({ error: "Checkin contract not configured" }, { status: 503 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const address = (body as { address?: unknown })?.address;
  if (typeof address !== "string" || !isAddress(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  let account;
  try { account = privateKeyToAccount(normalizePk(pk)); } catch {
    return NextResponse.json({ error: "Signer not configured" }, { status: 503 });
  }

  try {
    // Read the wallet's NEXT expected nonce from chain state (stateOf returns
    // [latestScore, count, currentStreak, lastCheckinAt, nonce]).
    const rpc = process.env.BASE_RPC_URL;
    const client = createPublicClient({
      chain: CHECKIN_CHAIN_ID === baseSepolia.id ? baseSepolia : base,
      transport: http(rpc),
    });
    const state = (await client.readContract({
      abi: DROPRANK_CHECKIN_ABI,
      address: contract as `0x${string}`,
      functionName: "stateOf",
      args: [address as `0x${string}`],
    })) as readonly [number, number, number, bigint, bigint];
    const nonce = state[4];

    // Score is ALWAYS recomputed server-side; never trusted from the client.
    const result = await scoreAddress(address, req.signal);
    const signed = await signCheckinAttestation(account, {
      wallet: address.toLowerCase() as `0x${string}`,
      score: result.score,
      nonce,
      contract: contract as `0x${string}`,
      chainId: CHECKIN_CHAIN_ID,
    });

    return NextResponse.json(
      {
        address: address.toLowerCase(),
        score: signed.score,
        nonce: signed.nonce.toString(),
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
      console.error("[sign-checkin] upstream error:", e.kind, e.message);
      return NextResponse.json({ error: "Upstream unavailable" }, { status: 502 });
    }
    console.error("[sign-checkin] internal error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
