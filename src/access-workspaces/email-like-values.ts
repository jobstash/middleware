const word = /\w/;
const whitespace = /\s/;

/** Matches the email-shaped values previously used for workspace redaction. */
export function isEmailLikeValue(value: string): boolean {
  if (whitespace.test(value)) return false;
  const at = value.indexOf("@");
  if (at <= 0 || value.indexOf("@", at + 1) !== -1) return false;
  const dot = value.indexOf(".", at + 2);
  return dot !== -1 && dot < value.length - 1;
}

/** Finds an email-shaped substring with the historical ASCII word boundaries. */
export function containsEmailLikeValue(value: string): boolean {
  let localHasWord = false;
  let localEnd = -1;
  for (const token of value.matchAll(/[^\s@]+/g)) {
    if (
      localHasWord &&
      token.index === localEnd + 1 &&
      value[localEnd] === "@"
    ) {
      const dot = token[0].indexOf(".", 1);
      if (dot !== -1 && word.test(token[0].slice(dot + 1))) return true;
    }
    localHasWord = word.test(token[0]);
    localEnd = token.index + token[0].length;
  }
  return false;
}
