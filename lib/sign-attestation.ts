/**
 * EIP-712 score attestation: the backend signer attests a wallet's score so the
 * soulbound badge contract can verify it on mint/refresh.
 *
 * Pure builder + signer, kept out of the route so it is unit-testable with a
 * deterministic test key.
 */

import type { Account } from "viem";
import { DROPRANK_EIP712_DOMAIN, SCORE_ATTESTATION_TYPES } from "./badge-abi";

/** Signature validity window. The contract rejects deadlines in the past. */
export const ATTESTATION_TTL_SECONDS = 10 * 60;

export interface AttestationInput {
  wallet: `0x${string}`;
  /** Authoritative score (0..100), recomputed server-side. */
  score: number;
  /** Badge contract address (EIP-712 verifyingContract). */
  contract: `0x${string}`;
  chainId: number;
  /** Override for tests; defaults to now. */
  nowSeconds?: number;
}

export interface Attestation {
  domain: typeof DROPRANK_EIP712_DOMAIN & {
    chainId: number;
    verifyingContract: `0x${string}`;
  };
  types: typeof SCORE_ATTESTATION_TYPES;
  primaryType: "ScoreAttestation";
  message: {
    wallet: `0x${string}`;
    score: number;
    deadline: bigint;
  };
}

/** Build the typed-data attestation (no signing). uint16 clamp on score. */
export function buildAttestation(input: AttestationInput): Attestation {
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const score = Math.max(0, Math.min(65535, Math.round(input.score)));
  return {
    domain: {
      ...DROPRANK_EIP712_DOMAIN,
      chainId: input.chainId,
      verifyingContract: input.contract,
    },
    types: SCORE_ATTESTATION_TYPES,
    primaryType: "ScoreAttestation",
    message: {
      wallet: input.wallet,
      score,
      deadline: BigInt(now + ATTESTATION_TTL_SECONDS),
    },
  };
}

export interface SignedAttestation {
  signature: `0x${string}`;
  /** uint16 score, as the contract's mint/refresh expects. */
  score: number;
  /** uint256 deadline (seconds), as the contract expects. */
  deadline: bigint;
  attestation: Attestation;
}

/** Build + sign the attestation with the given signer account. */
export async function signAttestation(
  account: Account,
  input: AttestationInput,
): Promise<SignedAttestation> {
  const attestation = buildAttestation(input);
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
    deadline: attestation.message.deadline,
    attestation,
  };
}
