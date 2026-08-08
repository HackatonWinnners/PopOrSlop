import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @poporslop/lmsr ships TypeScript source (workspace package).
  transpilePackages: ["@poporslop/lmsr"],
  // Slim self-contained server for the Docker image.
  output: "standalone",
};

export default nextConfig;
