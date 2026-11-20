import { AppShell } from "@/components/AppShell";

/** One shell for every page so `/stats` and the rest survive a refresh. */
export default function Page() {
  return <AppShell />;
}
