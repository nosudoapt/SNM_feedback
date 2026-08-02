/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      { source: "/", destination: "/home.html" },
      { source: "/feedback", destination: "/feedback.html" },
      { source: "/feedback/pracharak-mahatma", destination: "/feedback/pracharak-mahatma.html" },
      { source: "/feedback/branch-incharge", destination: "/feedback/branch-incharge.html" },
      { source: "/gbm-ebm", destination: "/gbm-ebm.html" },
    ];
  },
};

export default nextConfig;
