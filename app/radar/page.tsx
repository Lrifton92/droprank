"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { QuestsResult } from "@/lib/types";

function RadarInner() {
  const params = useSearchParams();
  const address = params.get("address") ?? "";
  const [data, setData] = useState<QuestsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) return;
    const ctrl = new AbortController();
    setData(null);
    setError(null);
    fetch(`/api/quests/${address}`, { signal: ctrl.signal })
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
      <h1>RADAR</h1>
      <p>{address}</p>
      {error && <p style={{ color: "#f55" }}>error: {error}</p>}
      {!data && !error && <p>loading…</p>}
      {data && (
        <>
          <p style={{ fontVariantNumeric: "tabular-nums" }}>
            {data.earned}/{data.total} pts
          </p>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {data.quests.map((q) => (
              <li
                key={q.id}
                style={{ display: "flex", justifyContent: "space-between" }}
              >
                <span>
                  {q.done ? "✅" : "❌"} {q.label}
                </span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>
                  {q.points}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}

export default function Radar() {
  return (
    <Suspense fallback={null}>
      <RadarInner />
    </Suspense>
  );
}
