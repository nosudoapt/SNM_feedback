/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

// Baseline security headers applied to every response. Deliberately conservative:
// no Content-Security-Policy yet, because the static HTML forms and Next.js rely
// on inline styles/scripts and a wrong CSP would break them. CSP is tracked as a
// follow-up hardening step in the setup guide.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

// HSTS only in production (over HTTPS); harmless-but-pointless on http://localhost.
if (isProd) {
  securityHeaders.push({
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  });
}

const nextConfig = {
  async rewrites() {
    return [
      { source: "/", destination: "/home.html" },
      { source: "/feedback", destination: "/feedback.html" },
      { source: "/feedback/pracharak-mahatma", destination: "/feedback/pracharak-mahatma.html" },
      { source: "/feedback/branch-incharge", destination: "/feedback/branch-incharge.html" },
      { source: "/gbm-ebm", destination: "/gbm-ebm.html" },
      { source: "/find-pracharak", destination: "/find-pracharak.html" },
    ];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
