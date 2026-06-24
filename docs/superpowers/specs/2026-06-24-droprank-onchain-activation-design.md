# DropRank — Onchain activation for the Talent "Active Smart Contracts" counter

Date: 2026-06-24
Status: Design — awaiting implementation plan

## Goal

Get **10+ distinct real wallets** to transact with DropRank contracts deployed by
Soufian's verified wallet `0x1deeaEc4250e66702E22777Ec1E3A70B19745A72` (`0x1dee`),
so the Talent Protocol **"Active Smart Contracts"** counter rises legitimately.

That metric = *"smart contracts deployed to Base mainnet by the user, with 10+
unique transacting wallets."* Each deployed contract that crosses 10 unique
wallets = **+1**. We have two contracts → target **+2** (Badge + Checkin).

Explicitly **no sybil**: real wallets only (Farcaster audience). Sybil clusters are
exactly what airdrop filters catch and would taint `0x1dee` itself.

## Current state (verified on-chain 2026-06-24)

| Contract | Mainnet deploy | Frontend | Real usage |
|---|---|---|---|
| `DropRankBadge` `0x5d3febf136e461be015713e2947bbd0940c8e92b` | ✅ deployed by `0x1dee` (Blockscout: name "DropRank", creator `0x1dee`) | MintButton exists, **disabled in prod** (`NEXT_PUBLIC_BADGE_CONTRACT` empty) | **0 mints** (`token_transfers_count: 0`, `transactions_count: 1`) |
| `DropRankCheckin` | ❌ not deployed | ❌ none | — |
| Gas sponsorship | ❌ none | — | — |

Notes:
- Runtime source of truth for the badge address is the env var
  `NEXT_PUBLIC_BADGE_CONTRACT` (used by `app/score/MintButton.tsx` and
  `app/api/sign-score/route.ts`). The `DROPRANK_BADGE_ADDRESS` constant in
  `lib/badge-abi.ts` is reference-only / unused at runtime.
- Backend EIP-712 attestation already exists for the badge
  (`app/api/sign-score`, `SIGNER_PRIVATE_KEY`).
- `deploy.ts` currently deploys **only** `DropRankBadge`.

## Scope — three workstreams

### A. Activate the Badge (already deployed — mostly config)
1. Confirm the deployed bytecode at `0x5d3f…e92b` matches the current
   `contracts/src/DropRankBadge.sol`. If diverged, redeploy from `0x1dee` and
   update the address. Verify on Basescan if not already verified.
2. Set **production (Vercel)** env:
   - `NEXT_PUBLIC_BADGE_CONTRACT=0x5d3febf136e461be015713e2947bbd0940c8e92b`
   - `NEXT_PUBLIC_CHAIN_ID=8453`
   - `SIGNER_PRIVATE_KEY` (server-only)
   - `NEXT_PUBLIC_ONCHAINKIT_API_KEY`
3. Test the mint flow end-to-end against mainnet (button enabled, sign-score
   attestation, tx confirmed, badge minted).

### B. Deploy + wire Checkin
1. Extend `contracts/script/deploy.ts` (or add `deploy-checkin.ts` + an
   `npm run deploy:base:checkin` script) to deploy
   `DropRankCheckin(SIGNER_ADDRESS)`.
2. **Soufian deploys from `0x1dee` locally** — Claude prepares the exact command;
   Soufian pastes the `0x1dee` private key into `contracts/.env` locally and runs
   the deploy via `! npm run deploy:base`. The key never transits Claude or any
   service.
3. Add the deployed Checkin address + ABI (`lib/checkin-abi.ts`).
4. Add a backend attestation route `app/api/sign-checkin` (mirrors `sign-score`;
   signs `CheckinAttestation(wallet, score, nonce, deadline)` per the contract's
   EIP-712 type, reading the next nonce from chain state).
5. Add a **Check-in button** UI (mirrors `MintButton.tsx`): connect-gate, chain
   switch, sign attestation, send `checkIn(score, deadline, sig)`, receipt watch,
   success state. Surfaces "already checked in today" gracefully.

### C. Gas sponsorship (Coinbase Paymaster)
- **Chosen approach: wagmi `capabilities.paymasterService`** on both the mint and
  check-in writes (keeps the existing MintButton logic intact — minimal churn,
  lowest regression risk on the existing test suite). Rejected alternative:
  rewriting to OnchainKit `<Transaction>` (larger surface, restyle).
- Add a paymaster service URL env (e.g. `NEXT_PUBLIC_PAYMASTER_URL` from Coinbase
  Developer Platform). Pass it via `capabilities.paymasterService.url` when the
  connected wallet advertises EIP-5792 support.
- **Fallback (honest):** wallets without paymaster capability (plain EOAs like
  MetaMask) pay their own gas — Base gas is cents. Most Farcaster mini-app users
  are on Coinbase Smart Wallet, which supports sponsorship.
- **Griefing guard:** Badge is soulbound (1 mint/wallet); Checkin is 1/UTC-day/
  wallet — so sponsored spend is naturally bounded. Add a CDP paymaster spend
  policy (per-address / daily cap, restrict to the two contract addresses).

### D. Distribution (operational, post-deploy)
- A Farcaster cast / frame driving real distinct wallets to mint + check-in.
- Tracked separately; the counter only moves once each contract crosses 10 unique
  real wallets. This is the genuine bottleneck — code only removes friction.

## Constraints

- Deploy strictly from `0x1dee` (or a wallet Soufian verifies on Talent), executed
  by Soufian; the private key never reaches Claude.
- **DropRank data, scoring, and categories are immutable** — this work only adds an
  onchain action; it does not touch how scores are computed.
- Existing test suite stays green; add tests for the new Check-in button logic and
  `sign-checkin` route (signature shape, nonce read, deadline, score bounds).
- No sybil. Real wallets only.

## Out of scope

- x402-market: its payments are USDC transfers to the `0x1dee` EOA, not
  interactions with a contract `0x1dee` deployed → does not move this counter
  unless rerouted through a deployed receiver contract with 10+ distinct payers
  (unrealistic for an agent-to-agent market). Kept in reserve, not in this work.
- Any change to the scoring model, categories, or radar quests.
- The distribution campaign content itself (planned after activation).

## Success criteria

1. Mint button live in prod against the mainnet Badge; a real wallet can mint
   gas-free.
2. Checkin contract deployed by `0x1dee`, frontend live, a real wallet can check in
   gas-free.
3. Both flows covered by tests; existing suite still green.
4. (Adoption, separate) each contract reaches 10+ unique real wallets → Talent
   "Active Smart Contracts" rises after re-indexing.
