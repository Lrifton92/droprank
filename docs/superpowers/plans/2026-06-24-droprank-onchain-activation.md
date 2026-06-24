# DropRank Onchain Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate the already-deployed `DropRankBadge` (gas-sponsored) and deploy + wire `DropRankCheckin` from `0x1dee`, so the Talent "Active Smart Contracts" counter can rise via 10+ real distinct wallets.

**Architecture:** Two Base-mainnet contracts deployed by `0x1dee`. A backend EIP-712 signer attests the wallet's score; the user submits the `mint`/`refresh` (Badge) or `checkIn` (Checkin) transaction. Gas is sponsored through a Coinbase Paymaster via EIP-5792 (`useSendCalls` + `capabilities.paymasterService`), with a graceful fallback to a normal `useWriteContract` for wallets without paymaster support. A single reusable `useSponsoredWrite` hook backs both buttons.

**Tech Stack:** Next.js 15, React 19, wagmi 2.19, viem 2.52, @coinbase/onchainkit 1.1, Hardhat (viem) contracts, vitest (node env), next-intl.

## Global Constraints

- Target chain is **Base mainnet, chainId 8453**. Signer route and write button MUST agree on chain (copied verbatim from spec).
- Deploy strictly from **`0x1deeaEc4250e66702E22777Ec1E3A70B19745A72`** (`0x1dee`), executed by Soufian locally; the private key never reaches Claude or any service.
- Already-deployed Badge address: **`0x5d3febf136e461be015713e2947bbd0940c8e92b`** (Blockscout: name "DropRank", creator `0x1dee`).
- **DropRank scoring, categories, and radar quests are immutable** — no task may change how scores are computed.
- Existing vitest suite (`npm test`) stays green; vitest only includes `lib/**/*.test.ts` and `i18n/**/*.test.ts`, so all newly unit-tested logic lives in `lib/`.
- The backend signer EOA holds no funds; it only signs attestations (`SIGNER_PRIVATE_KEY`, server-only, never `NEXT_PUBLIC`).
- No sybil — real wallets only. Out of scope: x402, scoring changes, the distribution campaign.

---

## File Structure

- `lib/checkin-abi.ts` — Create. Checkin chain id, address (from `NEXT_PUBLIC_CHECKIN_CONTRACT`), EIP-712 domain + types, full ABI (copied from the compiled artifact).
- `lib/sign-checkin-attestation.ts` — Create. Pure builder + signer for the `CheckinAttestation` typed data (testable).
- `lib/sign-checkin-attestation.test.ts` — Create. Unit tests for the builder.
- `app/api/sign-checkin/route.ts` — Create. Reads on-chain nonce, recomputes score, returns a signed checkin attestation.
- `contracts/script/deploy-checkin.ts` — Create. Deploys `DropRankCheckin(SIGNER_ADDRESS)` to `--network base`.
- `contracts/package.json` — Modify. Add `deploy:base:checkin` / `deploy:sepolia:checkin` scripts.
- `app/_components/useSponsoredWrite.ts` — Create. Unified sponsored-or-fallback contract write hook (EIP-5792).
- `app/score/MintButton.tsx` — Modify. Route the write through `useSponsoredWrite` (keep all existing UX).
- `app/score/CheckinButton.tsx` — Create. Daily check-in button, mirrors MintButton, uses `useSponsoredWrite`.
- `app/score/CheckinButton.module.css` — Create (or reuse `score.module.css`).
- `app/score/page.tsx` — Modify. Render `<CheckinButton>` next to `<MintButton>`.
- `messages/en.json`, `messages/fr.json` — Modify. Add a `checkin` namespace.
- `.env.example` — Modify. Document `NEXT_PUBLIC_CHECKIN_CONTRACT` and `NEXT_PUBLIC_PAYMASTER_URL`.

---

## Task 1: Confirm the deployed Badge matches source (go/no-go for redeploy)

**Files:**
- Inspect only: `contracts/src/DropRankBadge.sol`, on-chain bytecode at `0x5d3febf136e461be015713e2947bbd0940c8e92b`.

**Interfaces:**
- Produces: a documented decision — REUSE the deployed Badge, or REDEPLOY (and a new address to thread into env). Tasks 6–9 assume the Badge address used in `NEXT_PUBLIC_BADGE_CONTRACT`.

- [ ] **Step 1: Build the contracts and read the local runtime bytecode**

Run:
```bash
cd "contracts" && npm run build
node -e "const a=require('./artifacts/src/DropRankBadge.sol/DropRankBadge.json');console.log((a.deployedBytecode||a.deployedBytecode?.object||a.evm?.deployedBytecode?.object||'').slice(0,20)+'... len='+((a.deployedBytecode||a.evm?.deployedBytecode?.object||'').length))"
```
Expected: prints a `0x60...`-style hex prefix and a non-zero length (the locally-compiled runtime bytecode).

- [ ] **Step 2: Read the on-chain runtime bytecode**

Run:
```bash
curl -s "https://base.blockscout.com/api/v2/smart-contracts/0x5d3febf136e461be015713e2947bbd0940c8e92b" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log('verified:', !!j.is_verified, 'name:', j.name, 'compiler:', j.compiler_version);})"
```
Expected: prints whether Blockscout has the source verified, the contract name (`DropRankBadge`), and the compiler version.

- [ ] **Step 3: Decide and record**

If the on-chain contract is verified as `DropRankBadge` with the same Solidity (0.8.24) and the constructor signer is `0x1dee`'s configured signer: **REUSE** — note the address `0x5d3febf136e461be015713e2947bbd0940c8e92b`.
If the source has diverged (compile mismatch / not the soulbound badge we expect): **REDEPLOY** later via the same `deploy:base` path from `0x1dee`, and substitute the new address everywhere `NEXT_PUBLIC_BADGE_CONTRACT` is set.
Write the decision + chosen address into the PR/commit message for Task 9.

- [ ] **Step 4: Commit (doc only, if anything was written)**

No code change expected in this task; if you added a note file, commit it:
```bash
git add -A && git commit -m "chore: record DropRankBadge reuse/redeploy decision for mainnet activation"
```

---

## Task 2: Checkin ABI + EIP-712 constants module

**Files:**
- Create: `lib/checkin-abi.ts`
- Source artifact: `contracts/artifacts/src/DropRankCheckin.sol/DropRankCheckin.json`

**Interfaces:**
- Produces:
  - `CHECKIN_CHAIN_ID: number` (mirrors `BADGE_CHAIN_ID`)
  - `DROPRANK_CHECKIN_DOMAIN = { name: 'DropRankCheckin', version: '1' }`
  - `CHECKIN_ATTESTATION_TYPES` (EIP-712 types: wallet, score, nonce, deadline)
  - `DROPRANK_CHECKIN_ABI` (full ABI `as const`)
- Consumed by: Tasks 3 (builder), 4 (route), 8 (button).

- [ ] **Step 1: Generate the ABI file scaffold from the compiled artifact**

Run (from repo root) to emit the ABI array into the new module:
```bash
node -e "
const abi = require('./contracts/artifacts/src/DropRankCheckin.sol/DropRankCheckin.json').abi;
const fs = require('fs');
const header = \`// AUTO-GENERATED ABI from contracts/artifacts/src/DropRankCheckin.sol/DropRankCheckin.json
// Regenerate after contract changes. Do not hand-edit the ABI below.
//
// Repeatable backend-attested check-in (no token) deployed on Base.

export const CHECKIN_BASE_CHAIN_ID = 8453 as const;
export const CHECKIN_BASE_SEPOLIA_CHAIN_ID = 84532 as const;

/** Active chain for signing + check-in. Must match BADGE_CHAIN_ID. */
export const CHECKIN_CHAIN_ID: number =
  Number(process.env.NEXT_PUBLIC_CHAIN_ID) || CHECKIN_BASE_CHAIN_ID;

/** EIP-712 domain (matches the contract constructor EIP712(\\\"DropRankCheckin\\\", \\\"1\\\")). */
export const DROPRANK_CHECKIN_DOMAIN = { name: 'DropRankCheckin', version: '1' } as const;

/** EIP-712 types for the check-in attestation signed by the backend signer. */
export const CHECKIN_ATTESTATION_TYPES = {
  CheckinAttestation: [
    { name: 'wallet', type: 'address' },
    { name: 'score', type: 'uint16' },
    { name: 'nonce', type: 'uint64' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

export const DROPRANK_CHECKIN_ABI = \`;
fs.writeFileSync('lib/checkin-abi.ts', header + JSON.stringify(abi, null, 2) + ' as const;\n');
console.log('wrote lib/checkin-abi.ts');
"
```
Expected: prints `wrote lib/checkin-abi.ts`.

- [ ] **Step 2: Typecheck the new module**

Run:
```bash
npx tsc --noEmit
```
Expected: PASS (no errors referencing `lib/checkin-abi.ts`).

- [ ] **Step 3: Commit**

```bash
git add lib/checkin-abi.ts && git commit -m "feat(checkin): add DropRankCheckin ABI + EIP-712 constants"
```

---

## Task 3: Check-in attestation builder (TDD)

**Files:**
- Create: `lib/sign-checkin-attestation.ts`
- Test: `lib/sign-checkin-attestation.test.ts`

**Interfaces:**
- Consumes: `DROPRANK_CHECKIN_DOMAIN`, `CHECKIN_ATTESTATION_TYPES` from `lib/checkin-abi.ts`.
- Produces:
  - `CHECKIN_ATTESTATION_TTL_SECONDS = 180`
  - `buildCheckinAttestation(input: CheckinAttestationInput): CheckinAttestation`
  - `signCheckinAttestation(account, input): Promise<SignedCheckinAttestation>` where `SignedCheckinAttestation = { signature, score, nonce: bigint, deadline: bigint, attestation }`
  - `CheckinAttestationInput = { wallet: 0x; score: number; nonce: bigint; contract: 0x; chainId: number; nowSeconds?: number }`

- [ ] **Step 1: Write the failing test**

Create `lib/sign-checkin-attestation.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { recoverTypedDataAddress } from "viem";
import {
  buildCheckinAttestation,
  signCheckinAttestation,
  CHECKIN_ATTESTATION_TTL_SECONDS,
} from "./sign-checkin-attestation";

const KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const WALLET = "0x1deeaec4250e66702e22777ec1e3a70b19745a72" as const;
const CONTRACT = "0x000000000000000000000000000000000000c0de" as const;

describe("buildCheckinAttestation", () => {
  it("clamps score to uint16 and sets a future deadline from nowSeconds", () => {
    const a = buildCheckinAttestation({
      wallet: WALLET, score: 70, nonce: 3n, contract: CONTRACT,
      chainId: 8453, nowSeconds: 1000,
    });
    expect(a.message.score).toBe(70);
    expect(a.message.nonce).toBe(3n);
    expect(a.message.deadline).toBe(BigInt(1000 + CHECKIN_ATTESTATION_TTL_SECONDS));
    expect(a.domain.verifyingContract).toBe(CONTRACT);
    expect(a.domain.chainId).toBe(8453);
    expect(a.primaryType).toBe("CheckinAttestation");
  });

  it("clamps an out-of-range score into uint16 bounds", () => {
    const a = buildCheckinAttestation({
      wallet: WALLET, score: -5, nonce: 0n, contract: CONTRACT, chainId: 8453,
    });
    expect(a.message.score).toBe(0);
  });
});

describe("signCheckinAttestation", () => {
  it("produces a signature recoverable to the signer for the exact typed data", async () => {
    const account = privateKeyToAccount(KEY);
    const signed = await signCheckinAttestation(account, {
      wallet: WALLET, score: 55, nonce: 7n, contract: CONTRACT,
      chainId: 8453, nowSeconds: 2000,
    });
    const recovered = await recoverTypedDataAddress({
      domain: signed.attestation.domain,
      types: signed.attestation.types,
      primaryType: "CheckinAttestation",
      message: signed.attestation.message,
      signature: signed.signature,
    });
    expect(recovered.toLowerCase()).toBe(account.address.toLowerCase());
    expect(signed.nonce).toBe(7n);
    expect(signed.score).toBe(55);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/sign-checkin-attestation.test.ts`
Expected: FAIL — cannot resolve `./sign-checkin-attestation`.

- [ ] **Step 3: Write the implementation**

Create `lib/sign-checkin-attestation.ts`:
```ts
/**
 * EIP-712 check-in attestation: the backend signer attests a wallet's score +
 * its next on-chain nonce so the DropRankCheckin contract accepts the check-in.
 * Pure builder + signer, kept out of the route so it is unit-testable.
 */
import type { Account } from "viem";
import { DROPRANK_CHECKIN_DOMAIN, CHECKIN_ATTESTATION_TYPES } from "./checkin-abi";

/** Short replay window (3 min); the contract rejects past deadlines. */
export const CHECKIN_ATTESTATION_TTL_SECONDS = 180;

export interface CheckinAttestationInput {
  wallet: `0x${string}`;
  /** Authoritative score (0..100), recomputed server-side. */
  score: number;
  /** Next expected on-chain nonce, read from stateOf(wallet).nonce. */
  nonce: bigint;
  contract: `0x${string}`;
  chainId: number;
  nowSeconds?: number;
}

export interface CheckinAttestation {
  domain: typeof DROPRANK_CHECKIN_DOMAIN & {
    chainId: number;
    verifyingContract: `0x${string}`;
  };
  types: typeof CHECKIN_ATTESTATION_TYPES;
  primaryType: "CheckinAttestation";
  message: { wallet: `0x${string}`; score: number; nonce: bigint; deadline: bigint };
}

export function buildCheckinAttestation(input: CheckinAttestationInput): CheckinAttestation {
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const score = Math.max(0, Math.min(65535, Math.round(input.score)));
  return {
    domain: {
      ...DROPRANK_CHECKIN_DOMAIN,
      chainId: input.chainId,
      verifyingContract: input.contract,
    },
    types: CHECKIN_ATTESTATION_TYPES,
    primaryType: "CheckinAttestation",
    message: {
      wallet: input.wallet,
      score,
      nonce: input.nonce,
      deadline: BigInt(now + CHECKIN_ATTESTATION_TTL_SECONDS),
    },
  };
}

export interface SignedCheckinAttestation {
  signature: `0x${string}`;
  score: number;
  nonce: bigint;
  deadline: bigint;
  attestation: CheckinAttestation;
}

export async function signCheckinAttestation(
  account: Account,
  input: CheckinAttestationInput,
): Promise<SignedCheckinAttestation> {
  const attestation = buildCheckinAttestation(input);
  if (!account.signTypedData) {
    throw new Error("Signer account cannot sign typed data");
  }
  const signature = await account.signTypedData({
    domain: attestation.domain,
    types: attestation.types,
    primaryType: attestation.primaryType,
    message: attestation.message,
  });
  return {
    signature,
    score: attestation.message.score,
    nonce: attestation.message.nonce,
    deadline: attestation.message.deadline,
    attestation,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/sign-checkin-attestation.test.ts`
Expected: PASS (4 assertions across 3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/sign-checkin-attestation.ts lib/sign-checkin-attestation.test.ts
git commit -m "feat(checkin): EIP-712 check-in attestation builder + tests"
```

---

## Task 4: `sign-checkin` attestation route

**Files:**
- Create: `app/api/sign-checkin/route.ts`
- Reference (mirror): `app/api/sign-score/route.ts`

**Interfaces:**
- Consumes: `signCheckinAttestation` (Task 3), `DROPRANK_CHECKIN_ABI`, `CHECKIN_CHAIN_ID` (Task 2), existing `scoreAddress`, `checkRateLimit`, `BlockscoutError`.
- Produces: `POST /api/sign-checkin` → `{ address, score, nonce, deadline, signature }`. Consumed by CheckinButton (Task 8).

- [ ] **Step 1: Write the route**

Create `app/api/sign-checkin/route.ts`:
```ts
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
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/api/sign-checkin/route.ts
git commit -m "feat(checkin): sign-checkin attestation route (reads on-chain nonce)"
```

---

## Task 5: Checkin deploy script (run by Soufian from 0x1dee)

**Files:**
- Create: `contracts/script/deploy-checkin.ts`
- Modify: `contracts/package.json` (scripts)

**Interfaces:**
- Consumes env (configuration variables): `DEPLOYER_PRIVATE_KEY` (0x1dee), `SIGNER_ADDRESS`, `BASE_RPC_URL`.
- Produces: the deployed `DropRankCheckin` address → goes into `NEXT_PUBLIC_CHECKIN_CONTRACT` (Task 9).

- [ ] **Step 1: Write the deploy script (mirrors `deploy.ts`, deploys Checkin only)**

Create `contracts/script/deploy-checkin.ts`:
```ts
import { network } from "hardhat";

/**
 * Deploy DropRankCheckin to the network passed via `--network`.
 * Separate from deploy.ts so the already-deployed Badge is never re-deployed.
 *
 * Required env (configuration variables):
 *   - DEPLOYER_PRIVATE_KEY : deployer account (0x1dee; needs a little ETH for gas)
 *   - SIGNER_ADDRESS       : backend EIP-712 signer (holds no funds)
 *   - BASE_RPC_URL / BASE_SEPOLIA_RPC_URL : RPC endpoint for the target chain
 */
async function main() {
  const signerAddress = process.env.SIGNER_ADDRESS;
  if (!signerAddress || !/^0x[0-9a-fA-F]{40}$/.test(signerAddress)) {
    throw new Error("SIGNER_ADDRESS env var missing or not a valid address");
  }

  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [deployer] = await viem.getWalletClients();

  console.log("Chain id:", await publicClient.getChainId());
  console.log("Deployer:", deployer.account.address);
  console.log("Backend signer:", signerAddress);

  const checkin = await viem.deployContract("DropRankCheckin", [
    signerAddress as `0x${string}`,
  ]);

  console.log("DropRankCheckin deployed at:", checkin.address);
  console.log("");
  console.log("Set NEXT_PUBLIC_CHECKIN_CONTRACT to this address.");
  console.log("Verify on Basescan:");
  console.log(
    `  npx hardhat verify --network <base|baseSepolia> ${checkin.address} ${signerAddress}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
```

- [ ] **Step 2: Add npm scripts**

In `contracts/package.json`, add to `scripts`:
```json
"deploy:sepolia:checkin": "hardhat run script/deploy-checkin.ts --network baseSepolia",
"deploy:base:checkin": "hardhat run script/deploy-checkin.ts --network base"
```

- [ ] **Step 3: Build to confirm the script compiles against the toolchain**

Run: `cd "contracts" && npm run build`
Expected: PASS (artifacts present for `DropRankCheckin`).

- [ ] **Step 4: Commit**

```bash
git add contracts/script/deploy-checkin.ts contracts/package.json
git commit -m "feat(checkin): hardhat deploy script + npm scripts for DropRankCheckin"
```

- [ ] **Step 5: HUMAN STEP — Soufian deploys from 0x1dee (Base Sepolia first, then mainnet)**

Soufian runs locally (key stays on his machine), via `! `:
```
! cd "contracts" && printf 'DEPLOYER_PRIVATE_KEY=<0x1dee key>\nSIGNER_ADDRESS=<signer addr>\nBASE_SEPOLIA_RPC_URL=<rpc>\nBASE_RPC_URL=<rpc>\n' >> .env && npm run deploy:sepolia:checkin
```
Expected: prints `DropRankCheckin deployed at: 0x...` on Sepolia. After a smoke check, repeat with `npm run deploy:base:checkin` for mainnet. Record the **mainnet** address for Task 9. Then remove the key line from `contracts/.env`.

---

## Task 6: `useSponsoredWrite` hook (EIP-5792 sponsor + fallback)

**Files:**
- Create: `app/_components/useSponsoredWrite.ts`

**Interfaces:**
- Consumes: wagmi `useAccount`, `useCapabilities`, `useSendCalls`, `useCallsStatus`, `useWriteContract`, `useWaitForTransactionReceipt`; viem `encodeFunctionData`.
- Produces a hook:
  ```ts
  useSponsoredWrite(chainId: number): {
    submit: (p: { address: `0x${string}`; abi: readonly unknown[]; functionName: string; args: readonly unknown[] }) => Promise<void>;
    isPending: boolean;
    isSuccess: boolean;
    txHash: `0x${string}` | null;   // best-effort: the mined tx hash (sponsored or not)
    error: Error | null;
    reset: () => void;
  }
  ```
  Consumed by MintButton (Task 7) and CheckinButton (Task 8).

- [ ] **Step 1: Write the hook**

Create `app/_components/useSponsoredWrite.ts`:
```ts
"use client";
import { useCallback, useMemo, useState } from "react";
import {
  useAccount,
  useCapabilities,
  useSendCalls,
  useCallsStatus,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { encodeFunctionData } from "viem";

const PAYMASTER_URL = process.env.NEXT_PUBLIC_PAYMASTER_URL ?? "";

type SubmitParams = {
  address: `0x${string}`;
  abi: readonly unknown[];
  functionName: string;
  args: readonly unknown[];
};

/**
 * One write entrypoint that sponsors gas via EIP-5792 + a Coinbase Paymaster
 * when the connected wallet supports it, and falls back to a normal
 * useWriteContract otherwise. Exposes a uniform pending/success/hash surface so
 * MintButton and CheckinButton share the exact same flow.
 */
export function useSponsoredWrite(chainId: number) {
  const { address } = useAccount();
  const { data: capabilities } = useCapabilities({ account: address });
  const sponsored = useMemo(() => {
    if (!PAYMASTER_URL) return false;
    const forChain = capabilities?.[chainId] as
      | { paymasterService?: { supported?: boolean } }
      | undefined;
    return forChain?.paymasterService?.supported === true;
  }, [capabilities, chainId]);

  // ── Sponsored path (EIP-5792) ──────────────────────────────────────────
  const { sendCallsAsync, isPending: sendingCalls, reset: resetCalls } = useSendCalls();
  const [callsId, setCallsId] = useState<string | null>(null);
  const { data: callsStatus } = useCallsStatus({
    id: callsId ?? "",
    query: { enabled: Boolean(callsId), refetchInterval: ({ state }) =>
      state.data?.status === "success" ? false : 1500 },
  });

  // ── Fallback path (normal tx) ──────────────────────────────────────────
  const { writeContractAsync, reset: resetWrite } = useWriteContract();
  const [fallbackHash, setFallbackHash] = useState<`0x${string}` | null>(null);
  const { isSuccess: fallbackConfirmed } = useWaitForTransactionReceipt({
    hash: fallbackHash ?? undefined,
    chainId,
    query: { enabled: Boolean(fallbackHash) },
  });

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const reset = useCallback(() => {
    setCallsId(null); setFallbackHash(null); setPending(false); setError(null);
    resetCalls(); resetWrite();
  }, [resetCalls, resetWrite]);

  const submit = useCallback(
    async (p: SubmitParams) => {
      setError(null); setPending(true);
      try {
        if (sponsored) {
          const data = encodeFunctionData({
            abi: p.abi, functionName: p.functionName, args: p.args,
          });
          const res = await sendCallsAsync({
            chainId,
            calls: [{ to: p.address, data }],
            capabilities: { paymasterService: { url: PAYMASTER_URL } },
          });
          // wagmi returns { id } for the batch.
          setCallsId(typeof res === "string" ? res : res.id);
        } else {
          const hash = await writeContractAsync({
            abi: p.abi, address: p.address, functionName: p.functionName,
            args: p.args, chainId,
          });
          setFallbackHash(hash);
        }
      } catch (e) {
        setPending(false);
        setError(e instanceof Error ? e : new Error(String(e)));
        throw e;
      }
    },
    [sponsored, sendCallsAsync, writeContractAsync, chainId],
  );

  const sponsoredReceiptHash =
    (callsStatus?.status === "success" &&
      callsStatus.receipts?.[0]?.transactionHash) || null;
  const isSuccess = Boolean(sponsoredReceiptHash) || fallbackConfirmed;
  const txHash = (sponsoredReceiptHash as `0x${string}` | null) ?? fallbackHash;
  const isPending = pending && !isSuccess;

  // settle the pending flag once either path confirms
  if (isSuccess && pending) setPending(false);

  return { submit, isPending, isSuccess, txHash, error, reset, sponsored,
    sending: sendingCalls };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. If `useCapabilities`/`useSendCalls`/`useCallsStatus` are not exported from `wagmi` in 2.19.5, import them from `wagmi/experimental` instead (the installed build exposes both `exports/index.js` and `exports/experimental.js`; prefer the main `wagmi` export and only switch on a typecheck error).

- [ ] **Step 3: Commit**

```bash
git add app/_components/useSponsoredWrite.ts
git commit -m "feat(onchain): useSponsoredWrite hook (EIP-5792 paymaster + fallback)"
```

---

## Task 7: Route MintButton through the sponsored hook

**Files:**
- Modify: `app/score/MintButton.tsx`

**Interfaces:**
- Consumes: `useSponsoredWrite` (Task 6).
- Produces: unchanged public props `{ scannedAddress, empty, score, max }`.

- [ ] **Step 1: Replace the write plumbing, keep all UX**

In `app/score/MintButton.tsx`:
1. Remove the `useWriteContract` and `useWaitForTransactionReceipt` imports/usages and the `txHash`/`receiptConfirmed` local wiring.
2. Add: `import { useSponsoredWrite } from "../_components/useSponsoredWrite";`
3. Inside the component: `const tx = useSponsoredWrite(BADGE_CHAIN_ID);`
4. In `onMint`, replace the `writeContractAsync({...})` + `setTxHash` block with:
```ts
      setPhase("confirm");
      setWasRefresh(owns);
      await tx.submit({
        abi: DROPRANK_BADGE_ABI,
        address: CONTRACT!,
        functionName: owns ? "refresh" : "mint",
        args: [Number(score), BigInt(deadline), signature as `0x${string}`],
      });
      setPhase("pending");
```
5. Replace the success-watch `useEffect` (`receiptConfirmed`) with one keyed on the hook:
```ts
  useEffect(() => {
    if (tx.isSuccess && phase === "pending") {
      setPhase("success");
      setCelebrate(true);
    }
  }, [tx.isSuccess, phase]);
```
6. Everywhere `txHash` was read (explorer link, celebration `txUrl`), use `tx.txHash`. For the success-state "open tx" click, guard on `tx.txHash`.
7. On error, keep the existing `catch` (the hook re-throws), and call `tx.reset()` inside the existing reset paths if any.

- [ ] **Step 2: Typecheck + run the existing suite (must stay green)**

Run: `npx tsc --noEmit && npm test`
Expected: tsc PASS; vitest PASS (unchanged lib/i18n suite).

- [ ] **Step 3: Commit**

```bash
git add app/score/MintButton.tsx
git commit -m "refactor(mint): route mint/refresh through useSponsoredWrite (gas sponsorship)"
```

---

## Task 8: Check-in button UI + score page wiring + i18n

**Files:**
- Create: `app/score/CheckinButton.tsx`
- Modify: `app/score/page.tsx`, `messages/en.json`, `messages/fr.json`
- Reuse: `app/score/score.module.css` classes (`mintWrap`, `mintNote`)

**Interfaces:**
- Consumes: `useSponsoredWrite` (Task 6), `DROPRANK_CHECKIN_ABI`, `CHECKIN_CHAIN_ID` (Task 2), `POST /api/sign-checkin` (Task 4).
- Produces: `<CheckinButton scannedAddress={string} score={number} />`.

- [ ] **Step 1: Add i18n keys (UTF-8; do not corrupt existing accents)**

Add a `checkin` namespace to `messages/en.json`:
```json
"checkin": {
  "soon": "CHECK-IN SOON",
  "soonTitle": "Available once the check-in contract is configured",
  "checkIn": "Stamp score onchain",
  "attesting": "Attesting…",
  "confirmInWallet": "Confirm in wallet",
  "pending": "Stamping…",
  "done": "Checked in",
  "alreadyToday": "Already checked in today",
  "connectToCheckin": "Connect to check in",
  "onlyConnectedWallet": "Connect the scanned wallet to check in",
  "cancelled": "Cancelled",
  "txSubmitted": "Transaction submitted…",
  "failed": "Attestation failed ({status})"
}
```
And the French equivalents to `messages/fr.json`:
```json
"checkin": {
  "soon": "BIENTÔT",
  "soonTitle": "Disponible une fois le contrat de check-in configuré",
  "checkIn": "Graver le score onchain",
  "attesting": "Attestation…",
  "confirmInWallet": "Confirme dans le wallet",
  "pending": "Gravure…",
  "done": "Check-in fait",
  "alreadyToday": "Déjà fait aujourd'hui",
  "connectToCheckin": "Connecte-toi pour le check-in",
  "onlyConnectedWallet": "Connecte le wallet scanné pour le check-in",
  "cancelled": "Annulé",
  "txSubmitted": "Transaction envoyée…",
  "failed": "Attestation échouée ({status})"
}
```

- [ ] **Step 2: Write CheckinButton (mirrors MintButton's structure)**

Create `app/score/CheckinButton.tsx`:
```tsx
"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAccount, useSwitchChain, useReadContract } from "wagmi";
import { isAddress } from "viem";
import { DROPRANK_CHECKIN_ABI, CHECKIN_CHAIN_ID } from "@/lib/checkin-abi";
import { useSponsoredWrite } from "../_components/useSponsoredWrite";
import styles from "./score.module.css";

const ZERO = "0x0000000000000000000000000000000000000000";
const RAW = process.env.NEXT_PUBLIC_CHECKIN_CONTRACT ?? "";
const CONTRACT =
  isAddress(RAW) && RAW.toLowerCase() !== ZERO ? (RAW as `0x${string}`) : null;

type Phase = "idle" | "signing" | "confirm" | "pending" | "success" | "error";

export default function CheckinButton({
  scannedAddress, score,
}: { scannedAddress: string; score: number }) {
  const t = useTranslations("checkin");
  const { address: connected, isConnected, chainId: walletChainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const tx = useSponsoredWrite(CHECKIN_CHAIN_ID);
  const [phase, setPhase] = useState<Phase>("idle");
  const [errMsg, setErrMsg] = useState("");

  // stateOf(wallet) -> [latestScore, count, currentStreak, lastCheckinAt, nonce]
  const { data: state } = useReadContract({
    abi: DROPRANK_CHECKIN_ABI,
    address: CONTRACT ?? undefined,
    functionName: "stateOf",
    args: connected ? [connected] : undefined,
    chainId: CHECKIN_CHAIN_ID,
    query: { enabled: Boolean(CONTRACT && connected) },
  });

  useEffect(() => {
    if (tx.isSuccess && phase === "pending") setPhase("success");
  }, [tx.isSuccess, phase]);

  if (!CONTRACT) {
    return (
      <button className="dr-btn dr-btn--ghost" disabled title={t("soonTitle")}>
        {t("soon")}
      </button>
    );
  }

  const sameWallet =
    isConnected && !!connected &&
    connected.toLowerCase() === scannedAddress.toLowerCase();

  // lastCheckinAt is index 3; compare UTC day to disable a same-day repeat.
  const lastCheckinAt = Array.isArray(state) ? Number(state[3] ?? 0) : 0;
  const checkedInToday =
    lastCheckinAt > 0 &&
    Math.floor(lastCheckinAt / 86400) === Math.floor(Date.now() / 1000 / 86400);

  const busy = phase === "signing" || phase === "confirm" || phase === "pending";
  const label =
    phase === "signing" ? t("attesting")
    : phase === "confirm" ? t("confirmInWallet")
    : phase === "pending" ? t("pending")
    : phase === "success" ? t("done")
    : checkedInToday ? t("alreadyToday")
    : t("checkIn");

  async function onCheckin() {
    setErrMsg("");
    try {
      if (walletChainId !== CHECKIN_CHAIN_ID) {
        await switchChainAsync({ chainId: CHECKIN_CHAIN_ID });
      }
      setPhase("signing");
      const res = await fetch("/api/sign-checkin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: scannedAddress }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? t("failed", { status: res.status }));
      }
      const { score: s, deadline, signature } = await res.json();
      setPhase("confirm");
      await tx.submit({
        abi: DROPRANK_CHECKIN_ABI,
        address: CONTRACT!,
        functionName: "checkIn",
        args: [Number(s), BigInt(deadline), signature as `0x${string}`],
      });
      setPhase("pending");
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setErrMsg(/user rejected|denied/i.test(m) ? t("cancelled") : m);
      setPhase("error");
    }
  }

  const blocked = !sameWallet && phase !== "success";
  const disabled = busy || blocked || (checkedInToday && phase !== "success");
  const hint = !isConnected
    ? t("connectToCheckin")
    : !sameWallet ? t("onlyConnectedWallet") : "";

  return (
    <span className={styles.mintWrap}>
      <button
        className="dr-btn dr-btn--ghost"
        onClick={onCheckin}
        disabled={disabled}
        title={hint || undefined}
        aria-busy={busy}
      >
        {label}
      </button>
      {phase === "error" && errMsg && (
        <span className={`mono ${styles.mintNote}`}>! {errMsg}</span>
      )}
      {phase === "pending" && (
        <span className={`mono ${styles.mintNote}`}>{t("txSubmitted")}</span>
      )}
      {phase !== "error" && phase !== "pending" && hint && (
        <span className={`mono ${styles.mintNote}`}>{hint}</span>
      )}
    </span>
  );
}
```

- [ ] **Step 3: Render it on the score page next to MintButton**

In `app/score/page.tsx`, add the import `import CheckinButton from "./CheckinButton";` and place it directly after the existing `<MintButton ... />` line (around line 135), passing the same data:
```tsx
                <MintButton scannedAddress={address} empty={empty} score={data.score} max={data.max} />
                <CheckinButton scannedAddress={address} score={data.score} />
```

- [ ] **Step 4: Typecheck, run suite, and lint i18n parity**

Run:
```bash
npx tsc --noEmit && npm test && node -e "const en=require('./messages/en.json'),fr=require('./messages/fr.json');const a=Object.keys(en.checkin).sort(),b=Object.keys(fr.checkin).sort();if(JSON.stringify(a)!==JSON.stringify(b))throw new Error('checkin i18n keys differ');console.log('i18n checkin parity OK')"
```
Expected: tsc PASS, vitest PASS, prints `i18n checkin parity OK`.

- [ ] **Step 5: Commit**

```bash
git add app/score/CheckinButton.tsx app/score/page.tsx messages/en.json messages/fr.json
git commit -m "feat(checkin): gas-sponsored daily check-in button on the score page"
```

---

## Task 9: Env, production activation, and end-to-end verification

**Files:**
- Modify: `.env.example`
- Configure (no repo change): Vercel project env, Coinbase Developer Platform paymaster.

**Interfaces:**
- Consumes: Badge address (Task 1), Checkin address (Task 5), paymaster URL.

- [ ] **Step 1: Document the new env vars**

Append to `.env.example`:
```bash
# Deployed DropRankCheckin contract address (Base mainnet). Empty -> button shows "CHECK-IN SOON".
NEXT_PUBLIC_CHECKIN_CONTRACT=""
# Coinbase Paymaster service URL (CDP) used to sponsor mint/check-in gas via EIP-5792.
# Empty -> users pay their own (cheap) Base gas; no sponsorship.
NEXT_PUBLIC_PAYMASTER_URL=""
```
Commit:
```bash
git add .env.example && git commit -m "docs(env): document NEXT_PUBLIC_CHECKIN_CONTRACT and NEXT_PUBLIC_PAYMASTER_URL"
```

- [ ] **Step 2: HUMAN STEP — create the CDP paymaster + spend policy**

In the Coinbase Developer Platform: enable Paymaster for Base mainnet, copy the RPC/paymaster URL. Add an allowlist limited to the two contract addresses (Badge `0x5d3f…e92b` and the deployed Checkin), and a per-address + global daily spend cap. This bounds sponsored spend (Badge mint is one-shot per wallet; check-in is once/UTC-day/wallet).

- [ ] **Step 3: HUMAN STEP — set Vercel production env**

Set on the DropRank Vercel project (Production):
```
NEXT_PUBLIC_CHAIN_ID=8453
NEXT_PUBLIC_BADGE_CONTRACT=0x5d3febf136e461be015713e2947bbd0940c8e92b   # or the redeploy address from Task 1
NEXT_PUBLIC_CHECKIN_CONTRACT=<mainnet address from Task 5>
NEXT_PUBLIC_PAYMASTER_URL=<CDP paymaster URL>
SIGNER_PRIVATE_KEY=<signer key, server-only>
NEXT_PUBLIC_ONCHAINKIT_API_KEY=<key>
BASE_RPC_URL=<base rpc>
```
Redeploy production.

- [ ] **Step 4: HUMAN STEP — end-to-end smoke test on mainnet**

From a real wallet (Coinbase Smart Wallet to exercise sponsorship):
1. Open the production score page for that wallet's address.
2. Mint the badge → confirm a gas-sponsored tx, badge appears (balanceOf → 1).
3. Check in → confirm a gas-sponsored tx, `stateOf(wallet).count` increments, button flips to "Already checked in today".
4. Verify on Basescan that both txs hit the right contracts and that the unique-wallet count increments.

- [ ] **Step 5: Final regression gate**

Run: `npx tsc --noEmit && npm test`
Expected: tsc PASS; vitest PASS. Confirm the Mint flow still works for a wallet WITHOUT paymaster support (fallback path pays its own gas).

---

## Self-Review

**Spec coverage:**
- A. Activate Badge → Task 1 (bytecode/verify decision) + Task 9 (prod env, E2E). ✓
- B. Deploy + wire Checkin → Tasks 2 (ABI), 3 (attestation builder + tests), 4 (route), 5 (deploy script + human deploy), 8 (button + page + i18n). ✓
- C. Gas sponsorship → Task 6 (hook), 7 (mint), 8 (checkin), 9 (CDP policy). ✓
- Constraints: deploy from 0x1dee by Soufian → Task 5 Step 5, Task 9 human steps; scoring immutable → no task touches scoring; suite green → Tasks 7/8/9 run `npm test`; new tests → Task 3 (builder). Note: CheckinButton/route/hook are React+wagmi+Next route glue; the repo's vitest is node-only (`lib/**`, `i18n/**`) and has no component/route tests today (MintButton/sign-score are likewise untested), so those are verified by `tsc` + manual E2E — consistent with the existing codebase rather than introducing a new test runner. ✓
- Out of scope (x402, scoring, campaign) → untouched. ✓

**Placeholder scan:** No TBD/TODO; all code blocks complete; human steps are explicitly marked and unavoidable (private-key deploy, dashboard config, real-wallet E2E).

**Type consistency:** `useSponsoredWrite` returns `{ submit, isPending, isSuccess, txHash, error, reset }` and is consumed with those names in Tasks 7–8. `signCheckinAttestation`/`buildCheckinAttestation` signatures match between Task 3 (def) and Task 4 (use). `stateOf` tuple indexing (nonce = [4], lastCheckinAt = [3]) is consistent between Task 4 and Task 8.
