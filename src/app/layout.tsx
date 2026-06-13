import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Metabolic — Þjálfun, fræðsla, vottun",
  description:
    "Metabolic er íslenskt þjálfunarkerfi sem þróað hefur verið síðan 2011. Nýtt: Coach Academy fyrir verðandi þjálfara.",
  metadataBase: new URL("https://metabolic.is"),
  openGraph: {
    title: "Metabolic",
    description: "Þjálfun, fræðsla, vottun.",
    type: "website",
    locale: "is_IS",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="is"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
