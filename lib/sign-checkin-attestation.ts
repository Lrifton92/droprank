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
