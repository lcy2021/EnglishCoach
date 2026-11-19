import type { Metadata } from "next";
import { Literata, Noto_Sans_SC } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";

const read = Literata({
  subsets: ["latin"],
  variable: "--font-read",
});

const ui = Noto_Sans_SC({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ui",
});

export const metadata: Metadata = {
  title: "English Coach",
  description:
    "Personal English reading workbench with agent-controlled practice",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="font-sans">
      <body className={`${read.variable} ${ui.variable} antialiased`}>
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
