import type { NextConfig } from "next";

// NEXT_PUBLIC_STATIC_EXPORT=1 builds the static GitHub Pages site (see .github/workflows/pages.yml).
const staticExport = process.env.NEXT_PUBLIC_STATIC_EXPORT === "1";

const nextConfig: NextConfig = staticExport
  ? {
      output: "export",
      basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
      images: { unoptimized: true },
    }
  : {};

export default nextConfig;
