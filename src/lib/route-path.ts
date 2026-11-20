import type { AppRoute } from "./types.ts";

const APP_ROUTES: readonly AppRoute[] = [
  "practice",
  "drill",
  "wrong-book",
  "library",
  "drill-bank",
  "vocab",
  "stats",
  "settings",
];

/** Address for a page. Article reading stays at `/`. */
export function pathFromRoute(route: AppRoute): string {
  return route === "practice" ? "/" : `/${route}`;
}

/** Page for an address. Unknown paths fall back to article reading. */
export function routeFromPath(pathname: string): AppRoute {
  const path = pathname.split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";
  if (path === "/") return "practice";
  const slug = path.slice(1);
  return (APP_ROUTES as readonly string[]).includes(slug) ? (slug as AppRoute) : "practice";
}
