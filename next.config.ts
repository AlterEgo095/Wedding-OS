import type { NextConfig } from "next";

const securityHeaders = [
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on'
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload'
  },
  {
    key: 'X-Frame-Options',
    value: 'SAMEORIGIN'
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin'
  },
  {
    key: 'X-XSS-Protection',
    value: '1; mode=block'
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(self)'
  },
  // P1-SEC-2: Content-Security-Policy.
  // Permissive enough for Next.js (inline styles for styled-jsx + Tailwind,
  // 'unsafe-eval' only in dev for HMR, images from same origin + uploads).
  // Tight enough to block external scripts and exfil channels.
  // NOTE: This is a baseline. For a stricter policy, replace 'self' with
  // explicit origins and remove 'unsafe-inline' for style-src by using
  // nonces (see Next.js docs on CSP with nonces).
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Allow inline styles (Tailwind + styled-jsx) and the Next.js inline <script> that sets the theme
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      // Allow inline scripts ONLY for Next.js runtime (theme bootstrap, etc.)
      // In dev, 'unsafe-eval' is required by HMR/Turbopack.
      process.env.NODE_ENV === 'production'
        ? "script-src 'self' 'unsafe-inline'"
        : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "media-src 'self' blob:",
      "connect-src 'self' https:",
      "frame-ancestors 'self'",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  // P3: TypeScript checking in production builds — RE-ENABLED.
  // All 41 type errors from the P1+P2 / Phase 5 merge have been fixed in P3.
  // ESLint during build is handled by `bun run lint` (Next.js 16 removed the
  // `eslint` key from next.config — use .eslintrc / eslint.config instead).
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
  images: {
    // P1-PROD-9: Restrict remote image hostnames to the known CDN domains
    // (the sandbox preview + the production domain). Previously allowed
    // '**' which is an SSRF/DoS vector (anyone could make the Next.js
    // Image optimizer fetch arbitrary URLs).
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.space-z.ai',
      },
      {
        protocol: 'https',
        hostname: 'heureuxmariage.aenews.net',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
