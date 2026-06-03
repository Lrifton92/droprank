import { describe, it, expect } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { recoverTypedDataAddress } from "viem";
import {
  buildAttestation,
  signAttestation,
  ATTESTATION_TTL_SECONDS,
} from "./sign-attestation";
import {
  DROPRANK_EIP712_DOMAIN,
  SCORE_ATTESTATION_TYPES,
  BASE_CHAIN_ID,
} from "./badge-abi";

// Deterministic test key (Anvil account #0 — public, no funds, test-only).
const TEST_PK =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const TEST_SIGNER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const WALLET = "0x1111111111111111111111111111111111111111" as const;
const CONTRACT = "0x2222222222222222222222222222222222222222" as const;

describe("buildAttestation", () => {
  it("uses the spec domain + types, the given chain/contract, and clamps score to uint16", () => {
    const att = buildAttestation({
      wallet: WALLET,
      score: 73,
      contract: CONTRACT,
      chainId: BASE_CHAIN_ID,
      nowSeconds: 1_700_000_000,
    });
    expect(att.domain).toEqual({
      ...DROPRANK_EIP712_DOMAIN,
      chainId: BASE_CHAIN_ID,
      verifyingContract: CONTRACT,
    });
    expect(att.types).toBe(SCORE_ATTESTATION_TYPES);
    expect(att.primaryType).toBe("ScoreAttestation");
    expect(att.message.wallet).toBe(WALLET);
    expect(att.message.score).toBe(73);
    expect(att.message.deadline).toBe(
      BigInt(1_700_000_000 + ATTESTATION_TTL_SECONDS),
    );
  });

  it("clamps an out-of-range score into [0, 65535]", () => {
    const hi = buildAttestation({
      wallet: WALLET,
      score: 999,
      contract: CONTRACT,
      chainId: BASE_CHAIN_ID,
      nowSeconds: 0,
    });
    expect(hi.message.score).toBe(999); // pass-through; score is already 0..100
    const neg = buildAttestation({
      wallet: WALLET,
      score: -1,
      contract: CONTRACT,
      chainId: BASE_CHAIN_ID,
      nowSeconds: 0,
    });
    expect(neg.message.score).toBe(0);
  });
});

describe("signAttestation", () => {
  it("produces a signature recoverable to the signer account", async () => {
    const account = privateKeyToAccount(TEST_PK);
    const { signature, attestation } = await signAttestation(account, {
      wallet: WALLET,
      score: 42,
      contract: CONTRACT,
      chainId: BASE_CHAIN_ID,
      nowSeconds: 1_700_000_000,
    });

    expect(signature).toMatch(/^0x[0-9a-fA-F]{130}$/);

    const recovered = await recoverTypedDataAddress({
      domain: attestation.domain,
      types: attestation.types,
      primaryType: attestation.primaryType,
      message: attestation.message,
      signature,
    });
    expect(recovered.toLowerCase()).toBe(TEST_SIGNER.toLowerCase());
  });

  it("returns score + deadline matching the signed message for the contract call", async () => {
    const account = privateKeyToAccount(TEST_PK);
    const out = await signAttestation(account, {
      wallet: WALLET,
      score: 88,
      contract: CONTRACT,
      chainId: BASE_CHAIN_ID,
      nowSeconds: 1_700_000_000,
    });
    expect(out.score).toBe(88);
    expect(out.deadline).toBe(BigInt(1_700_000_000 + ATTESTATION_TTL_SECONDS));
  });
});
