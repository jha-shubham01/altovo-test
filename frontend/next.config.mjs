/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // In local dev the Python API runs separately (e.g. uvicorn on :8000).
  // In production the Vercel rewrite handles /api/* — no rewrite needed here.
  async rewrites() {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL;
    if (!apiBase) return [];
    return [{ source: "/api/:path*", destination: `${apiBase}/api/:path*` }];
  },
};

export default nextConfig;
