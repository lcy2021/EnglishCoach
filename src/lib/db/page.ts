export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Clamp a requested page onto the rows that exist. */
export function clampPage(
  requested: number,
  pageSize: number,
  total: number,
): { page: number; pageSize: number; offset: number } {
  const size = Math.min(50, Math.max(1, Math.floor(pageSize) || 1));
  const pages = Math.max(1, Math.ceil(Math.max(0, total) / size));
  const page = Math.min(pages, Math.max(1, Math.floor(requested) || 1));
  return { page, pageSize: size, offset: (page - 1) * size };
}

/** Read `page` from a query string. Missing or junk values use the fallback. */
export function readPage(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}
