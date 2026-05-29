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
  title: "Criptomorse",
  description: "Banking-grade stablecoin wallet on Arc Testnet with ERC-8183 agentic jobs",
  // O Next.js transforma isso automaticamente na tag <meta> correta dentro do head
  other: {
    "talentapp:project_verification": "a86bc5b3e4d61bf1baa1f88217333e7dcaf25934351cef9a9b037e22466fe7049c25ee38126b03e9defdd447e2c644af75d4af21c",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}