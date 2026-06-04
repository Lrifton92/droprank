import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/**
 * CSP shipped in Report-Only first so we can observe violations without breaking
 * OnchainKit / WalletConnect / the wallet popups. Notes:
 *  - frame-ancestors allows Farcaster + Base App so the mini-app can be embedded
 *    (we deliberately DO NOT set X-Frame-Options: DENY, which would break framing).
 *  - connect-src includes wss: for WalletConnect relays and https: for RPC/APIs.
 *  - script-src keeps 'unsafe-inline' (Next inline runtime) but NOT 'unsafe-eval'.
 * Flip the header name to "Content-Security-Policy" to enforce once it's clean.
 */
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss:",
  "frame-src 'self' https:",
  "frame-ancestors 'self' https://*.farcaster.xyz https://*.warpcast.com https://*.base.org",
].join("; ");

const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  { key: "Content-Security-Policy-Report-Only", value: csp },
];

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);
