import type { Metadata, Viewport } from "next";
// Fonts are bundled with the app (no Google Fonts request at build or run time).
// Teko: condensed broadcast-scoreboard face for names, prices and headings.
import "@fontsource/teko/500.css";
import "@fontsource/teko/600.css";
import "@fontsource/teko/700.css";
// Outfit: clean, modern body text.
import "@fontsource/outfit/400.css";
import "@fontsource/outfit/500.css";
import "@fontsource/outfit/600.css";
import "@fontsource/outfit/700.css";
import "@fontsource/outfit/800.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "CCL Auctions",
  description: "Live cricket player auctions for the CCL family",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/icon.svg",
    apple: "/icons/apple-touch-icon.svg",
  },
  appleWebApp: {
    capable: true,
    title: "CCL Auctions",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#060914",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
