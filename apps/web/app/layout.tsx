import "./globals.css";
import Providers from "./providers";
export const metadata = {
  title: "STOVIA — The stock-backed launchpad",
  description: "Stock-denominated token markets on Robinhood Chain.",
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
