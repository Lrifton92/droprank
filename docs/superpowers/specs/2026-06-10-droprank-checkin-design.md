# DropRankCheckin — Design Spec

**Date:** 2026-06-10
**Status:** Approved design, pending implementation plan
**Author:** Claude (brainstorm with Soufian)

## 1. Context & Goal

DropRank already ships one Base-mainnet contract: `DropRankBadge` (soulbound ERC-721, `0x5d3febf136e461be015713e2947bbd0940c8e92b`), backend-signed score attestations.

This spec adds a **second, distinct** Base-mainnet contract: `DropRankCheckin` — a repeatable, backend-attested "stamp my rank onchain" action that builds a verifiable streak.

**Product value:** the badge proves *identity* (mint once); the check-in proves *ongoing activity* (a timestamped, verifiable history of a wallet's DropRank score, with a daily streak).

**Secondary goal (Talent Protocol Builder Score):** raise the `Active Smart Contracts` metric, defined as *"contracts deployed to Base mainnet by the user, with 10+ unique transacting wallets"*. A new contract also immediately increments `Contracts Deployed (Mainnet)` and `Verified Smart Contracts`, and feeds `Total/Monthly/Weekly Base Contract Transactions` + fees as usage grows.

> **Honest constraint:** this contract *enables* the 10-unique-wallets threshold but does not manufacture it — it still requires ~10 real DropRank users to each check in at least once. The backend-signature gate makes that count sybil-resistant (only really-scanned wallets can produce a valid check-in).

## 2. Non-Goals

- No upgradeability/proxy (immutable contract; `setSigner` covers key rotation).
- No reentrancy guard (no external calls, no value transfer).
- No on-chain unbounded history array (history lives in events).
- No token/NFT (the badge already covers the collectible angle).
- No on-chain `tier` (derived from score off-chain: BASED ≥80, GOLD ≥60, SILVER ≥40, else BRONZE — same thresholds as the badge).

## 3. Contract — `contracts/src/DropRankCheckin.sol`

Solidity `^0.8.24`, OpenZeppelin `Ownable` + `EIP712` + `ECDSA`. Mirrors `DropRankBadge` conventions (custom errors, `renounceOwnership` disabled, `MAX_SCORE = 100`, `signer` + `setSigner`).

### 3.1 Packed per-wallet state (single storage slot)

```solidity
struct CheckinState {
    uint16 latestScore;   // 0..100
    uint32 count;         // total check-ins
    uint32 currentStreak; // consecutive UTC-day streak
    uint64 lastCheckinAt; // unix ts of last check-in
    uint64 nonce;         // next expected signature nonce
}
mapping(address => CheckinState) public stateOf; // 16+32+32+64+64 = 208 bits → 1 slot
```

One `SSTORE` per check-in (vs 4–5 with separate mappings) — the key gas optimization.

### 3.2 EIP-712 attestation (with nonce)

```
domain  = EIP712("DropRankCheckin", "1")   // chainId + verifyingContract bound by OZ
typehash = keccak256("CheckinAttestation(address wallet,uint16 score,uint64 nonce,uint256 deadline)")
```

The nonce is **not** a call argument — the contract reads `stateOf[msg.sender].nonce` and verifies the signature against it, then increments. The backend must therefore read the current on-chain nonce before signing. This blocks cross-day replay of a stale-score signature (an old signature carries an old nonce that no longer matches state).

### 3.3 `checkIn(uint16 score, uint256 deadline, bytes calldata sig)`

Caller = `msg.sender` = the wallet being stamped.

1. `if (score > MAX_SCORE) revert InvalidScore();`
2. `if (block.timestamp > deadline) revert SignatureExpired();`
3. Recover EIP-712 signature over `(msg.sender, score, st.nonce, deadline)`; `if (recovered != signer) revert InvalidSignature();`
4. **Daily limit + streak:**
   - `today = block.timestamp / 1 days`
   - if `st.count == 0`: `streak = 1`
   - else `lastDay = st.lastCheckinAt / 1 days`:
     - `today == lastDay` → `revert AlreadyCheckedInToday();`
     - `today == lastDay + 1` → `streak = st.currentStreak + 1`
     - else → `streak = 1` (reset after a gap)
5. Write packed state: `latestScore = score; count += 1; currentStreak = streak; lastCheckinAt = block.timestamp; nonce += 1;`
6. `emit CheckedIn(msg.sender, score, streak, uint64(block.timestamp));`

### 3.4 Events, errors, admin

```solidity
event CheckedIn(address indexed wallet, uint16 score, uint32 streak, uint64 timestamp); // = append-only history
event SignerUpdated(address indexed previousSigner, address indexed newSigner);

error InvalidScore();
error SignatureExpired();
error InvalidSignature();
error ZeroSigner();
error AlreadyCheckedInToday();
error RenounceDisabled();
```

- `constructor(address initialSigner)` → `EIP712("DropRankCheckin","1")`, `Ownable(msg.sender)`, set signer (revert `ZeroSigner` on zero).
- `setSigner(address)` `onlyOwner` (revert on zero).
- `renounceOwnership()` overridden to `revert RenounceDisabled()` (same rationale as the badge: never lock out signer rotation).
- `stateOf` public mapping auto-getter is the read API (count/streak/latest/last/nonce).

## 4. Backend — `app/api/sign-checkin/route.ts`

Input: connected `address`. Steps:
1. Recompute / read the wallet's current DropRank score (reuse `score-address` + existing cache — no new scoring logic).
2. Read on-chain `stateOf[address].nonce` via the viem public client (Base mainnet).
3. Build the EIP-712 typed data, sign with `SIGNER_PRIVATE_KEY` (same key as the badge signer `0xAe41cA09…`).
4. Return `{ score, deadline, signature }` (deadline = now + ~10 min).

Only signs for the **connected, actually-scanned** wallet → sybil resistance lives here.

## 5. Frontend

A **"Stamp my rank onchain"** action, shown after a scan of the connected wallet:
- `POST /api/sign-checkin { address }` → `{ score, deadline, signature }`
- wagmi `writeContract` → `checkIn(score, deadline, signature)`
- On success: read `stateOf` and show a streak confirmation (e.g. "Day N streak"). Repeatable once per UTC day (the contract enforces it; the button reflects "already checked in today").

## 6. Deployment & Verification

- New Hardhat contract; extend `contracts/script/deploy.ts` for `DropRankCheckin(initialSigner = 0xAe41cA09F3855BFC0742d61c5573988877B5Ee1c)`.
- Deploy to **Base mainnet (8453)** from the Talent-verified deployer `0x1deeaEc4250e66702E22777Ec1E3A70B19745A72`.
- **Verify on Basescan** (also satisfies the `Verified Smart Contracts` metric).
- Wire `NEXT_PUBLIC_CHECKIN_ADDRESS` into the app env.

## 7. Testing — `contracts/test/DropRankCheckin.t.sol`

Solidity tests (same harness as `DropRankBadge.t.sol`). TDD: write these first.

1. Valid signed check-in → `count=1`, `streak=1`, `latestScore` set, emits `CheckedIn`.
2. Wrong signer → `InvalidSignature`.
3. Expired deadline → `SignatureExpired`.
4. Replay same signature a second time → reverts (nonce advanced).
5. Second check-in same UTC day → `AlreadyCheckedInToday`.
6. Consecutive day (warp +1 day) → `streak=2`.
7. Gap (warp +2 days) → `streak` resets to `1`.
8. `score > 100` → `InvalidScore`.
9. `setSigner` only owner; zero signer reverts; `renounceOwnership` reverts.
10. `nonce` increments by exactly 1 per successful check-in.

## 8. Security Considerations

- **No signature theft / front-run:** the signed `wallet` is bound to `msg.sender`, so a mempool-observed signature is unusable by anyone else.
- **No cross-day stale replay:** nonce advances each check-in; old signatures (old nonce) fail.
- **Score authenticity:** only the backend signer can authorize a score; `score ≤ 100` enforced on-chain.
- **Key rotation:** `setSigner` + non-renounceable ownership.
- **DoS / gas:** O(1) storage, single slot; no loops, no unbounded arrays.

## 9. Resolved Decisions

| Decision | Choice |
|---|---|
| Utility | Check-in / onchain rank proof |
| Record model | Append-only history via **events** + on-chain streak/count summary |
| Trust model | **Backend-signed** EIP-712 (reuses badge signer) |
| Architecture | ① EIP-712 + events + packed on-chain summary |
| `tier` on-chain | Dropped (derived off-chain) |
| Storage | Single packed slot (1 SSTORE/check-in) |
