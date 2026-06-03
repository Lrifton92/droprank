import { describe, it, expect } from "vitest";
import { clientIp } from "./cache";

function reqWith(headers: Record<string, string>): Request {
  return new Request("https://droprank.app/api/score/0x0", { headers });
}

describe("clientIp (trusted-IP resolution)", () => {
  it("prefers the Vercel-injected header over client-controlled XFF", () => {
    const req = reqWith({
      "x-vercel-forwarded-for": "203.0.113.7",
      "x-forwarded-for": "1.2.3.4, 5.6.7.8",
    });
    expect(clientIp(req)).toBe("203.0.113.7");
  });

  it("ignores spoofable leading XFF hops and takes the last (trusted) hop", () => {
    // A client can prepend "1.1.1.1" but cannot forge the last hop our proxy adds.
    const req = reqWith({ "x-forwarded-for": "1.1.1.1, 9.9.9.9, 203.0.113.7" });
    expect(clientIp(req)).toBe("203.0.113.7");
  });

  it("handles a single-value XFF", () => {
    expect(clientIp(reqWith({ "x-forwarded-for": "203.0.113.7" }))).toBe(
      "203.0.113.7",
    );
  });

  it("falls back to x-real-ip, then 'unknown'", () => {
    expect(clientIp(reqWith({ "x-real-ip": "8.8.8.8" }))).toBe("8.8.8.8");
    expect(clientIp(reqWith({}))).toBe("unknown");
  });
});
