import type { Metadata } from "next";
import { Bebas_Neue, Syne, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const bebas = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const syne = Syne({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-body",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Lambertain — Full-Stack Developer",
  description:
    "Full-Stack розробник: AI-інтеграції, Telegram боти, Mini Apps, SaaS платформи. info@lambertain.agency",
  openGraph: {
    title: "Lambertain — Full-Stack Developer",
    description: "AI-інтеграції, Telegram боти, Mini Apps, SaaS платформи.",
    url: "https://lambertain.agency",
    siteName: "Lambertain",
    locale: "uk_UA",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="uk" className={`${bebas.variable} ${syne.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
