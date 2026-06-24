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
      wallet: WALLET, score: 70, nonce: BigInt(3), contract: CONTRACT,
      chainId: 8453, nowSeconds: 1000,
    });
    expect(a.message.score).toBe(70);
    expect(a.message.nonce).toBe(BigInt(3));
    expect(a.message.deadline).toBe(BigInt(1000 + CHECKIN_ATTESTATION_TTL_SECONDS));
    expect(a.domain.verifyingContract).toBe(CONTRACT);
    expect(a.domain.chainId).toBe(8453);
    expect(a.primaryType).toBe("CheckinAttestation");
  });

  it("clamps an out-of-range score into uint16 bounds", () => {
    const a = buildCheckinAttestation({
      wallet: WALLET, score: -5, nonce: BigInt(0), contract: CONTRACT, chainId: 8453,
    });
    expect(a.message.score).toBe(0);
  });

  it("clamps an above-range score into uint16 bounds", () => {
    const a = buildCheckinAttestation({
      wallet: WALLET, score: 70000, nonce: BigInt(0), contract: CONTRACT, chainId: 8453,
    });
    expect(a.message.score).toBe(65535);
  });
});

describe("signCheckinAttestation", () => {
  it("produces a signature recoverable to the signer for the exact typed data", async () => {
    const account = privateKeyToAccount(KEY);
    const signed = await signCheckinAttestation(account, {
      wallet: WALLET, score: 55, nonce: BigInt(7), contract: CONTRACT,
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
    expect(signed.nonce).toBe(BigInt(7));
    expect(signed.score).toBe(55);
  });
});
