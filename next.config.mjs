/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Required for NextAuth v5 on Vercel - trusts the host header
    trustHost: true,
  },
};

export default nextConfig;
