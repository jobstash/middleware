// These are text projections, not HTML sanitizers. Preserve the historical
// tag/link grammars without restarting an unanchored match at every opener.
export function replaceProseTags(
  value: string,
  replacement: (tag: string) => string | null,
  allowEmpty = false,
): string {
  const parts: string[] = [];
  let copied = 0;
  let start = value.indexOf("<");
  let end = -1;
  while (start !== -1) {
    if (end < start) end = value.indexOf(">", start + 1);
    if (end === -1) break;
    const tagPrefix = value.slice(start + 1, Math.min(end, start + 9));
    const replaced =
      allowEmpty || end > start + 1 ? replacement(tagPrefix) : null;
    if (replaced !== null) {
      parts.push(value.slice(copied, start), replaced);
      copied = end + 1;
      start = value.indexOf("<", copied);
    } else {
      start = value.indexOf("<", start + 1);
    }
  }
  parts.push(value.slice(copied));
  return parts.join("");
}

function nestedProseUrlEnds(value: string): Int32Array {
  const urlEnds = new Int32Array(value.length);
  urlEnds.fill(-1);
  const opens: { index: number; depth: number }[] = [];
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "(") opens.push({ index: i, depth: 1 });
    else if (value[i] === ")" && opens.length) {
      const open = opens.pop()!;
      if (open.depth <= 2) urlEnds[open.index] = i;
      if (opens.length) {
        const parent = opens.at(-1)!;
        parent.depth = Math.max(parent.depth, open.depth + 1);
      }
    }
  }
  return urlEnds;
}

function plainProseUrlEnds(value: string): Int32Array {
  const urlEnds = new Int32Array(value.length);
  let close = -1;
  for (let i = value.length - 1; i >= 0; i--) {
    urlEnds[i] = close;
    if (value[i] === ")") close = i;
  }
  return urlEnds;
}

export function proseLinkLabels(
  value: string,
  imagesAndNestedUrls = false,
): string {
  const urlEnds = imagesAndNestedUrls
    ? nestedProseUrlEnds(value)
    : plainProseUrlEnds(value);
  const parts: string[] = [];
  let copied = 0;
  let start = value.indexOf("[");
  while (start !== -1) {
    const labelEnd = value.indexOf("]", start + 1);
    if (labelEnd === -1) break;
    const urlStart = labelEnd + 1;
    const urlEnd = urlEnds[urlStart];
    if (
      value[urlStart] === "(" &&
      urlEnd >= 0 &&
      (imagesAndNestedUrls || (labelEnd > start + 1 && urlEnd > urlStart + 1))
    ) {
      const imageStart =
        imagesAndNestedUrls && value[start - 1] === "!" ? start - 1 : start;
      parts.push(
        value.slice(copied, imageStart),
        value.slice(start + 1, labelEnd),
      );
      copied = urlEnd + 1;
      start = value.indexOf("[", copied);
    } else {
      start = value.indexOf("[", labelEnd + 1);
    }
  }
  parts.push(value.slice(copied));
  return parts.join("");
}
