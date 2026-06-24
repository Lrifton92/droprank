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
