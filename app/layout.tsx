import type { Metadata, Viewport } from "next";
// Fonts are bundled with the app (no Google Fonts request at build or run time).
// Barlow Condensed: broadcast-style face for names, prices and scoreboards.
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "@fontsource/barlow-condensed/800.css";
import "@fontsource/barlow-condensed/700-italic.css";
import "@fontsource/barlow-condensed/800-italic.css";
// Plus Jakarta Sans: clean, modern body text.
import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
import "@fontsource/plus-jakarta-sans/800.css";
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
