import "./globals.css";
import Providers from "./providers";
const productDescription =
  "The stock-backed token launchpad. Create and trade tokens paired with verified Stock Tokens. Building on Robinhood Chain.";
export const metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000"),
  ),
  title: "STOVIA — The stock-backed launchpad",
  description: productDescription,
  icons: {
    icon: [{ url: "/brand/stovia-logo.png", type: "image/png" }],
    apple: [{ url: "/brand/stovia-logo.png", type: "image/png" }],
  },
  openGraph: {
    title: "STOVIA — The stock-backed token launchpad",
    description: productDescription,
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
    description: productDescription,
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
