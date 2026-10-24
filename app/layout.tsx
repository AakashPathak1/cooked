import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "@/components/providers";

const display = localFont({
  src: "./fonts/Bricolage.woff2",
  variable: "--font-display",
  weight: "200 800",
  display: "swap",
});
const body = localFont({
  src: "./fonts/InstrumentSans.woff2",
  variable: "--font-body",
  weight: "400 700",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Cooked", template: "%s · Cooked" },
  description: "Photograph what you cook, rank it against everything else you've made, and compare notes with friends.",
  manifest: "/manifest.json",
  applicationName: "Cooked",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Cooked" },
  icons: {
    icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f4f0" },
    { media: "(prefers-color-scheme: dark)", color: "#111215" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
