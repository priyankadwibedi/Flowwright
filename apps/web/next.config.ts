import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  // GitHub Pages serves project sites from /Flowwright; local development keeps this empty.
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
  transpilePackages: ["@flowwright/workflow-schema"],
};
export default nextConfig;
