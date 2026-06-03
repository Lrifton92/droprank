"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isAddress } from "viem";
import { useAccount } from "wagmi";
import { Wallet } from "@coinbase/onchainkit/wallet";
import { useMiniKit } from "@coinbase/onchainkit/minikit";

/**
 * Landing. Functional placeholder — the designer ships the premium UI
 * (3D Base cube in #cube-stage, HUD copy). Logic only here:
 *  - Connect Wallet (OnchainKit) -> on connect, go to /enter.
 *  - Paste address (read-only) -> go to /enter for that address.
 */
export default function Home() {
  const router = useRouter();
  const { setMiniAppReady, isMiniAppReady } = useMiniKit();
  const { address, isConnected } = useAccount();
  const [pasted, setPasted] = useState("");

  useEffect(() => {
    if (!isMiniAppReady) setMiniAppReady();
  }, [setMiniAppReady, isMiniAppReady]);

  // When the wallet connects, advance into the entry sequence for that address.
  useEffect(() => {
    if (isConnected && address) {
      router.push(`/enter?address=${address}`);
    }
  }, [isConnected, address, router]);

  const pastedValid = isAddress(pasted.trim());

  return (
    <main style={{ padding: 24, maxWidth: 480, margin: "0 auto" }}>
      <h1>DropRank</h1>
      <p>Your Base airdrop score, ranked.</p>

      {/* Placeholder for the designer's 3D Base cube. */}
      <div
        id="cube-stage"
        aria-hidden
        style={{
          height: 200,
          margin: "24px 0",
          border: "1px dashed #333",
          display: "grid",
          placeItems: "center",
          color: "#555",
        }}
      >
        cube-stage
      </div>

      <Wallet />

      <div style={{ marginTop: 24 }}>
        <label htmlFor="paste-address">Or paste an address (read-only)</label>
        <input
          id="paste-address"
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          placeholder="0x…"
          spellCheck={false}
          style={{ width: "100%", marginTop: 8 }}
        />
        <button
          disabled={!pastedValid}
          onClick={() => router.push(`/enter?address=${pasted.trim()}`)}
          style={{ marginTop: 8 }}
        >
          Check this wallet
        </button>
      </div>
    </main>
  );
}
