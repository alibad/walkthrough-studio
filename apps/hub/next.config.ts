import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Captures live under public/walkthroughs and are served straight off the
  // filesystem — but the data layer also probes them with fs (hashing PNGs for
  // the health report, detecting persona art). Next's output tracing can't
  // resolve those dynamic paths, so it conservatively bundles the whole media
  // tree into every serverless function. Videos are the heavy part and are
  // never read server-side, only linked by URL, so exclude them. The glob is
  // doubled because the tracing root may resolve to the app or the repo root.
  outputFileTracingExcludes: {
    "*": ["public/walkthroughs/**/*.mp4", "**/public/walkthroughs/**/*.mp4"],
  },

  images: {
    // Captures are MUTABLE CONTENT AT A STABLE PATH: re-walking a feature
    // overwrites `{featureId}/{surface}/step-01.png` in place. The image
    // optimizer keys its cache on the URL alone and defaults to a 4-hour TTL,
    // so without this a fresh walk keeps serving yesterday's screenshots —
    // which breaks the one thing this app promises.
    //
    // Setting the minimum to 0 makes the optimizer honour the upstream
    // `cache-control: public, max-age=0` that Next serves `public/` files
    // with, so each request revalidates against the file on disk. We keep
    // optimization itself (a 758 kB PNG becomes a 25 kB WebP), just not stale
    // optimization.
    minimumCacheTTL: 0,
  },
};

export default nextConfig;
