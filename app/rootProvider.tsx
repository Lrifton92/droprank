"use client";
import { ReactNode } from "react";
import { createPublicClient, http } from "viem";
import { base, baseSepolia, mainnet } from "wagmi/chains";
import { OnchainKitProvider } from "@coinbase/onchainkit";
import "@coinbase/onchainkit/styles.css";

// Active chain follows NEXT_PUBLIC_CHAIN_ID: 84532 = Base Sepolia (test), else Base mainnet.
const activeChain =
  Number(process.env.NEXT_PUBLIC_CHAIN_ID) === baseSepolia.id ? baseSepolia : base;

// Mainnet client for OnchainKit's basename forward-resolution check (<Name>):
// viem's default mainnet RPC (eth.merkle.io) blocks browser CORS, so the check
// failed silently and basenames never displayed. publicnode allows cross-origin.
const mainnetClient = createPublicClient({
  chain: mainnet,
  transport: http("https://ethereum-rpc.publicnode.com"),
});

export function RootProvider({ children }: { children: ReactNode }) {
  return (
    <OnchainKitProvider
      apiKey={process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY}
      chain={activeChain}
      defaultPublicClients={{ [mainnet.id]: mainnetClient }}
      config={{
        appearance: {
          mode: "dark",
        },
        wallet: {
          display: "modal",
          preference: "all",
        },
      }}
      miniKit={{
        enabled: true,
        // autoConnect spawns a Base wallet-connect popup on every browser reload
        // (outside a MiniApp frame). Connection is explicit via the Connect button.
        autoConnect: false,
        notificationProxyUrl: undefined,
      }}
    >
      {children}
    </OnchainKitProvider>
  );
}
