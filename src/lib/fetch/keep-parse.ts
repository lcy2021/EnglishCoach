/**
 * Turn the model reply into a sorted list of unique paragraph indexes.
 * Expects {"ranges":[[from,to],...]} with inclusive bounds; returns null when unusable.
 */
export function parseKeepIndexes(raw: string, count: number): number[] | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let data: unknown;
  try {
    data = JSON.parse(match[0]);
  } catch {
    return null;
  }
  const ranges = (data as { ranges?: unknown })?.ranges;
  if (!Array.isArray(ranges)) return null;
  const out = new Set<number>();
  for (const item of ranges) {
    if (!Array.isArray(item) || item.length !== 2) continue;
    const [from, to] = item as unknown[];
    if (!Number.isInteger(from) || !Number.isInteger(to)) continue;
    for (let i = Math.max(0, from as number); i <= Math.min(count - 1, to as number); i += 1) out.add(i);
  }
  return out.size > 0 ? [...out].sort((a, b) => a - b) : null;
}
