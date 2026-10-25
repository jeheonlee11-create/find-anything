/**
 * Literal matching rules shared by the in-memory matcher and the D1 full-text
 * candidate query, so the two can never disagree about what a "term" is.
 *
 * A query term matches only as a whole word: "cat" matches "cat", "Cat." and
 * "(cat)" but not "category" or "concat". A word character is a letter, a
 * number, or a private-use character, which is the same set SQLite's FTS5
 * `unicode61` tokenizer treats as token characters by default. Matching is
 * case-insensitive and accent-sensitive ("cafe" does not match "café").
 */

const WORD_CHARACTER = /[\p{L}\p{N}\p{Co}]/u;

/**
 * Words too common to narrow a search, dropped from natural-language
 * questions ("What is our current pricing?" searches current + pricing).
 * Substring matching used to hide how many of these were missing: "our"
 * matched inside "source". Words that are also abbreviations ("us", "it")
 * are deliberately not here.
 */
export const QUERY_STOP_WORDS = new Set([
  "a", "an", "and", "are", "at", "be", "been", "blocker", "blockers", "blocking", "by", "did", "do",
  "does", "each", "for", "from", "how", "in", "is", "of", "on", "one", "our", "that", "the", "their",
  "these", "this", "those", "to", "was", "we", "were", "what", "when", "where", "which", "who", "why",
  "with", "your",
]);

/** At most this many distinct terms take part in one search. */
export const MAX_QUERY_TERMS = 16;

export function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase();
}

/**
 * Splits a query into lower-cased terms. A term is a run of letters and
 * numbers that may contain inner apostrophes or hyphens ("don't", "q3-plan").
 * Leading and trailing punctuation is dropped, terms with no letter or number
 * are dropped, and duplicates are removed.
 */
export function queryTerms(value: string): string[] {
  const terms: string[] = [];
  for (const raw of normalizeText(value).split(/[^\p{L}\p{N}\p{Co}'-]+/u)) {
    const term = raw.replace(/^['-]+|['-]+$/g, "");
    if (!term || !WORD_CHARACTER.test(term) || QUERY_STOP_WORDS.has(term)) continue;
    if (!terms.includes(term)) terms.push(term);
    if (terms.length === MAX_QUERY_TERMS) break;
  }
  return terms;
}

function isWordCharacter(character: string | undefined): boolean {
  return character !== undefined && WORD_CHARACTER.test(character);
}

/** The whole code point that ends just before `index` (handles surrogate pairs). */
function codePointBefore(value: string, index: number): string | undefined {
  if (index <= 0) return undefined;
  const low = value.charCodeAt(index - 1);
  const start = low >= 0xdc00 && low <= 0xdfff && index >= 2 ? index - 2 : index - 1;
  return String.fromCodePoint(value.codePointAt(start) ?? 0);
}

function codePointAt(value: string, index: number): string | undefined {
  return index < value.length ? String.fromCodePoint(value.codePointAt(index) ?? 0) : undefined;
}

/**
 * Word-boundary check in the sense of regex `\b`: an edge of the needle that is
 * itself a word character must not touch another word character. An edge that
 * is punctuation ("(cat)") needs no boundary.
 */
function isBoundaryMatch(haystack: string, needle: string, start: number): boolean {
  const needsStart = isWordCharacter(codePointAt(needle, 0)),
    needsEnd = isWordCharacter(codePointBefore(needle, needle.length));
  if (needsStart && isWordCharacter(codePointBefore(haystack, start))) return false;
  if (needsEnd && isWordCharacter(codePointAt(haystack, start + needle.length))) return false;
  return true;
}

/** Every start index where `needle` occurs in `haystack` as a whole word. Both must already be lower-cased. */
export function wordOccurrences(haystack: string, needle: string, limit = Number.POSITIVE_INFINITY): number[] {
  const positions: number[] = [];
  if (!needle) return positions;
  let position = haystack.indexOf(needle);
  while (position !== -1 && positions.length < limit) {
    if (isBoundaryMatch(haystack, needle, position)) positions.push(position);
    position = haystack.indexOf(needle, position + 1);
  }
  return positions;
}

export function containsWord(haystack: string, needle: string): boolean {
  return wordOccurrences(haystack, needle, 1).length > 0;
}

export function countWords(haystack: string, needle: string): number {
  return wordOccurrences(haystack, needle).length;
}

/** First whole-word position of any term, or -1. */
export function firstWordPosition(haystack: string, terms: string[]): number {
  let first = -1;
  for (const term of terms) {
    const [position] = wordOccurrences(haystack, term, 1);
    if (position !== undefined && (first === -1 || position < first)) first = position;
  }
  return first;
}

/** Collapses runs of whitespace so a phrase matches across line breaks inside one unit. */
export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ");
}

/** An FTS5 phrase string for one term. Terms never contain quotes, but escape anyway. */
export function ftsPhrase(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
