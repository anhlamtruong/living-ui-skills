// Part of living-ui-skills (MIT). Adapt freely.
// app/layout.tsx for a living page. Fonts become CSS variables on <body>
// (the swarm engine reads --font-geist-mono from body for its canvas text),
// and the build flag script runs in <head> before first paint, so items are
// only hidden when the build animation will really play.
// Keep this layout static: no auth(), cookies() or headers() here.

import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { BuildFlagScript } from "@/components/swarm/build-flag-script";
import "./globals.css";

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

// Accent serif: not a variable font, so the weight is required.
const displaySerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["italic"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Your Name: Your Role",
  description: "One sentence on what you build.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The build flag script edits <html> before hydration.
    <html lang="en" suppressHydrationWarning>
      <head>
        <BuildFlagScript />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} ${displaySerif.variable}`}>
        {children}
      </body>
    </html>
  );
}
