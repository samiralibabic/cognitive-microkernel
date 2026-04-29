export function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3);
}

export function roughScore(query: string, text: string): number {
  const q = new Set(tokenize(query));
  const t = new Set(tokenize(text));
  if (q.size === 0 || t.size === 0) return 0;
  let hit = 0;
  for (const token of q) if (t.has(token)) hit += 1;
  return hit / Math.sqrt(q.size * t.size);
}

export function topMatches<T>(query: string, items: T[], render: (item: T) => string, limit = 8): Array<T & { _score: number }> {
  return items
    .map((item) => ({ ...(item as object), _score: roughScore(query, render(item)) }) as T & { _score: number })
    .filter((item) => item._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, limit);
}
