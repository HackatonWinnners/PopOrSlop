import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @poporslop/lmsr ships TypeScript source (workspace package).
  transpilePackages: ["@poporslop/lmsr"],
};

export default nextConfig;
