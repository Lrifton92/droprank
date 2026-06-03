"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ScoreResult } from "@/lib/types";

function ScoreInner() {
  const params = useSearchParams();
  const address = params.get("address") ?? "";
  const [data, setData] = useState<ScoreResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) return;
    const ctrl = new AbortController();
    setData(null);
    setError(null);
    fetch(`/api/score/${address}`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") setError(String(e.message ?? e));
      });
    return () => ctrl.abort();
  }, [address]);

  return (
    <main
      style={{
        padding: 24,
        maxWidth: 480,
        margin: "0 auto",
        fontFamily: "var(--font-source-code-pro), monospace",
      }}
    >
      <h1>SCORE</h1>
      <p>{address}</p>
      {error && <p style={{ color: "#f55" }}>error: {error}</p>}
      {!data && !error && <p>loading…</p>}
      {data && (
        <>
          <p style={{ fontSize: 48, fontVariantNumeric: "tabular-nums" }}>
            {data.score}
            <span style={{ fontSize: 20, opacity: 0.5 }}>/{data.max}</span>
          </p>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {data.breakdown.map((b) => (
              <li
                key={b.key}
                style={{ display: "flex", justifyContent: "space-between" }}
              >
                <span>
                  {b.label} <span style={{ opacity: 0.5 }}>({b.detail})</span>
                </span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>
                  {b.points}/{b.max}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}

export default function Score() {
  return (
    <Suspense fallback={null}>
      <ScoreInner />
    </Suspense>
  );
}
