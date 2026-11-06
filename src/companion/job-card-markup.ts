// Remove complete script/style blocks with the same first-closing-tag semantics
// as the text projection, including malformed surrounding HTML.
export function withoutExecutableBlocks(value: string): string {
  const closes: Record<string, { start: number; end: number }[]> = {
    script: [],
    style: [],
  };
  for (const match of value.matchAll(/<\/(script|style)\s*>/gi)) {
    closes[match[1].toLowerCase()].push({
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  const next: Record<string, number> = { script: 0, style: 0 };
  const parts: string[] = [];
  let copied = 0;
  let tagEnd = -1;
  const open = /<(script|style)\b/gi;
  let match: RegExpExecArray | null;
  while ((match = open.exec(value)) !== null) {
    if (tagEnd < match.index) tagEnd = value.indexOf(">", open.lastIndex);
    if (tagEnd === -1) break;
    const kind = match[1].toLowerCase();
    const endings = closes[kind];
    while (next[kind] < endings.length && endings[next[kind]].start <= tagEnd)
      next[kind]++;
    const ending = endings[next[kind]];
    if (!ending) continue;
    parts.push(value.slice(copied, match.index));
    copied = ending.end;
    open.lastIndex = copied;
  }
  parts.push(value.slice(copied));
  return parts.join("");
}
