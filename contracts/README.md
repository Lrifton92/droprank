# DropRank Badge — contracts

Soulbound ERC-721 badge for DropRank. The score is attested off-chain (EIP-712)
by a backend signer and stored fully on-chain (SVG `tokenURI`). Non-transferable,
one token per address, burnable by its holder, refreshable score.

Built with **Hardhat 3** (Foundry was not available on this Windows machine; see
the parent mission report). Solidity tests use forge-std `Test`, so they read like
forge tests.

## Layout

```
contracts/
  src/DropRankBadge.sol      # the contract
  test/DropRankBadge.t.sol   # Solidity tests (forge-std)
  script/deploy.ts           # deployment script (viem)
  hardhat.config.ts          # solc 0.8.24 / cancun, Base + Base Sepolia networks
```

## Install & test

```bash
cd contracts
npm install
npm run build        # compile (solc 0.8.24, evm target cancun)
npm test             # run Solidity tests (19 passing)
```

## Configuration

Secrets are read from environment variables (never hard-coded). Either export them
in your shell or use the Hardhat keystore (encrypted, recommended for private keys):

```bash
# Recommended: store the private key encrypted in the Hardhat keystore
npx hardhat keystore set DEPLOYER_PRIVATE_KEY
npx hardhat keystore set ETHERSCAN_API_KEY

# Or export for the current session (less safe — plaintext in shell history)
export SIGNER_ADDRESS=0xYourBackendSignerAddress
export BASE_RPC_URL=https://mainnet.base.org
export BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
```

See `.env.example` for the full list of variables. `.env` is gitignored.

| Variable | Used for |
|---|---|
| `DEPLOYER_PRIVATE_KEY` | account that sends the deploy tx (needs gas ETH) |
| `SIGNER_ADDRESS` | backend EIP-712 signer set in the constructor (holds no funds) |
| `BASE_RPC_URL` / `BASE_SEPOLIA_RPC_URL` | RPC endpoints |
| `ETHERSCAN_API_KEY` | contract verification (Etherscan v2, one key for all chains incl. Base) |

## Deploy

```bash
# Base Sepolia (testnet)
npm run deploy:sepolia

# Base mainnet
npm run deploy:base
```

The script prints the deployed address and the exact `verify` command.

## Verify on Basescan

```bash
npx hardhat verify --network baseSepolia <DEPLOYED_ADDRESS> <SIGNER_ADDRESS>
npx hardhat verify --network base        <DEPLOYED_ADDRESS> <SIGNER_ADDRESS>
```

(`<SIGNER_ADDRESS>` is the constructor argument and must match `SIGNER_ADDRESS`.)

## After deploying

Update `lib/badge-abi.ts` at the repo root with the deployed addresses
(`DROPRANK_BADGE_ADDRESS`). The ABI there is auto-generated from the build
artifact; regenerate it if the contract changes.

## EIP-712 attestation

The backend signs this typed data; the contract verifies it on `mint`/`refresh`:

- Domain: `name="DropRank"`, `version="1"`, `chainId`, `verifyingContract`
- Type: `ScoreAttestation(address wallet, uint16 score, uint256 deadline)`
- The signed `wallet` must equal `msg.sender` (anti-replay across wallets) and
  `block.timestamp <= deadline` (temporal anti-replay).
