export default {
  poweredByHeader: false,
  reactStrictMode: true,
  devIndicators: false,
  distDir:
    process.env.NODE_ENV === "development"
      ? process.env.STOVIA_DEV_DIST_DIR || ".next-dev"
      : ".next",
};
