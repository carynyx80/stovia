import "./globals.css";
import Providers from "./providers";
export const metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000"),
  ),
  title: "STOVIA — The stock-backed launchpad",
  description: "Stock-denominated token markets on Robinhood Chain.",
  icons: {
    icon: [{ url: "/brand/stovia-logo.png", type: "image/png" }],
    apple: [{ url: "/brand/stovia-logo.png", type: "image/png" }],
  },
  openGraph: {
    title: "STOVIA — The stock-backed token launchpad",
    description:
      "Create tokens. Pair with Stock Tokens. Building on Robinhood Chain.",
    images: [
      {
        url: "/brand/stovia-logo.png",
        width: 1254,
        height: 1254,
        alt: "Stovia logo",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "STOVIA — The stock-backed token launchpad",
    description:
      "Create tokens. Pair with Stock Tokens. Building on Robinhood Chain.",
    images: ["/brand/stovia-logo.png"],
  },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
