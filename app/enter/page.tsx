"use client";
import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Entry sequence placeholder. The designer ships the HUD boot animation
 * (SCANNING WALLET / BASE LINK ESTABLISHED / ACCESS GRANTED, scanlines).
 * Here we only forward the address into the menu.
 */
function EnterInner() {
  const router = useRouter();
  const params = useSearchParams();
  const address = params.get("address") ?? "";

  useEffect(() => {
    if (!address) {
      router.replace("/");
      return;
    }
    const t = setTimeout(() => {
      router.replace(`/menu?address=${address}`);
    }, 600);
    return () => clearTimeout(t);
  }, [address, router]);

  return (
    <main style={{ padding: 24, fontFamily: "var(--font-source-code-pro), monospace" }}>
      <p>SCANNING WALLET…</p>
      <p>{address}</p>
    </main>
  );
}

export default function Enter() {
  return (
    <Suspense fallback={null}>
      <EnterInner />
    </Suspense>
  );
}
