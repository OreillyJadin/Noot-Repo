/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages ship as TS source — let Next transpile them.
  transpilePackages: ['@noot/theme', '@noot/ui', '@noot/core'],
};

export default nextConfig;
