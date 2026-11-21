import type { Metadata } from "next";
import { Literata, Noto_Sans_SC } from "next/font/google";
import NextTopLoader from "nextjs-toploader";
import "./globals.css";
import { ShellState } from "@/components/ShellState";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getStats } from "@/lib/db/stats";
import { vocabSummary } from "@/lib/db/vocab";
import type { VocabSummary } from "@/lib/vocab/srs";

export const dynamic = "force-dynamic";

/** Sidebar figures for the first paint. Client navigations do not ask for them again. */
function readShell(): { today: { drills: number; tokens: number }; vocab: VocabSummary } {
  try {
    const stats = getStats(1);
    return {
      today: { drills: stats.today.drills, tokens: stats.today.input + stats.today.output },
      vocab: vocabSummary(),
    };
  } catch {
    return {
      today: { drills: 0, tokens: 0 },
      vocab: { total: 0, due: 0, mastered: 0, keys: [] },
    };
  }
}

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
  const shell = readShell();
  return (
    <html lang="zh-CN" className="font-sans">
      <body className={`${read.variable} ${ui.variable} antialiased`}>
        <NextTopLoader
          color="#00bcf2"
          height={2}
          showSpinner={false}
          shadow={false}
        />
        <TooltipProvider>
          <ShellState today={shell.today} vocab={shell.vocab}>
            {children}
          </ShellState>
        </TooltipProvider>
      </body>
    </html>
  );
}
