"use client";
import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

/**
 * Menu placeholder. Two cards: SCORE and RADAR (designer styles the premium UI).
 */
function MenuInner() {
  const params = useSearchParams();
  const address = params.get("address") ?? "";
  const qs = address ? `?address=${address}` : "";

  return (
    <main style={{ padding: 24, maxWidth: 480, margin: "0 auto" }}>
      <h1>DropRank</h1>
      <p style={{ fontFamily: "var(--font-source-code-pro), monospace" }}>{address}</p>

      <nav style={{ display: "grid", gap: 16, marginTop: 24 }}>
        <Link href={`/score${qs}`} style={{ border: "1px solid #333", padding: 24 }}>
          SCORE
        </Link>
        <Link href={`/radar${qs}`} style={{ border: "1px solid #333", padding: 24 }}>
          RADAR
        </Link>
      </nav>
    </main>
  );
}

export default function Menu() {
  return (
    <Suspense fallback={null}>
      <MenuInner />
    </Suspense>
  );
}
