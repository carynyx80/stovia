export default {
  poweredByHeader: false,
  reactStrictMode: true,
  devIndicators: false,
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
};
