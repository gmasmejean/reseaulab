import { plainText } from '../richtext';
import type { Notion, Pack, PackOverride } from './types';

/**
 * Applies overrides to a pack, in order: a card or a question with a known
 * identifier replaces the existing one (and keeps its place), a new one is
 * added at the end, hidden ones disappear. Links to a card that no longer
 * exists are removed from the « see also » lists, and its questions with it.
 */
export function mergePacks(base: Pack, ...overrides: readonly PackOverride[]): Pack {
  let notions: Notion[] = [...base.notions];
  let questions = [...base.questions];
  let messages: Pack['messages'] = { ...base.messages };
  /** Replaces the items with a known identifier, adds the others at the end. */
  const overlay = <T extends { readonly id: string }>(items: T[], added: readonly T[] = []) => {
    for (const item of added) {
      const index = items.findIndex((existing) => existing.id === item.id);
      if (index >= 0) items[index] = item;
      else items.push(item);
    }
  };
  for (const override of overrides) {
    overlay(notions, override.notions);
    overlay(questions, override.questions);
    const hidden = new Set(override.hidden ?? []);
    notions = notions.filter((n) => !hidden.has(n.id));
    questions = questions.filter((q) => !hidden.has(q.id));
    for (const [code, text] of Object.entries(override.messages ?? {})) {
      const key = code as keyof Pack['messages'];
      messages = { ...messages, [key]: { ...messages[key], ...text } };
    }
  }
  const known = new Set(notions.map((n) => n.id));
  return {
    notions: notions.map((n) => ({ ...n, related: n.related.filter((id) => known.has(id) && id !== n.id) })),
    // A question about a card that no longer exists has nowhere to send the pupil back to.
    questions: questions.filter((q) => known.has(q.notion)),
    messages,
  };
}

/** Lower case, without accents: « Adresse IP » and « adresse ip » are the same word. */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('fr').trim();
}

/** Where a search word was found in a card's text, to show it in context. */
export interface Excerpt {
  readonly before: string;
  readonly match: string;
  readonly after: string;
}

export interface SearchHit {
  readonly notion: Notion;
  /** Present when the words were found in the text, not in a name of the card. */
  readonly excerpt?: Excerpt;
}

/** Characters kept around a word found in a text. */
const EXCERPT_BEFORE = 30;
const EXCERPT_AFTER = 60;

/** The whole text of a card, without its formatting. */
function cardText(notion: Notion): string {
  return [plainText(notion.body), ...notion.remember.map(plainText), notion.example ?? '', notion.inApp ?? '']
    .filter(Boolean)
    .join(' ');
}

/**
 * Index of the first word of `text` that starts with `word` (both folded):
 * \u00ab port \u00bb finds \u00ab ports \u00bb but not \u00ab transporte \u00bb. -1 when there is none.
 */
export function wordStart(text: string, word: string): number {
  if (word === '') return -1;
  for (let at = text.indexOf(word); at >= 0; at = text.indexOf(word, at + 1)) {
    if (at === 0 || !/[\p{L}\p{N}]/u.test(text.charAt(at - 1))) return at;
  }
  return -1;
}

/** `text` around the first word starting with `word` (already folded); none if it cannot be located. */
export function excerptOf(text: string, word: string): Excerpt | undefined {
  // Folding keeps one character per character of a French text, but check it.
  const folded = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr');
  if (folded.length !== text.length) return undefined;
  const at = wordStart(folded, word);
  if (at < 0) return undefined;
  const end = at + word.length;
  let from = Math.max(0, at - EXCERPT_BEFORE);
  let to = Math.min(text.length, end + EXCERPT_AFTER);
  // Whole words only.
  if (from > 0) from = text.indexOf(' ', from) + 1 || from;
  if (from > at) from = at;
  if (to < text.length) to = Math.max(end, text.lastIndexOf(' ', to));
  return {
    before: (from > 0 ? '…' : '') + text.slice(from, at),
    match: text.slice(at, end),
    after: text.slice(end, to) + (to < text.length ? '…' : ''),
  };
}

/**
 * Cards whose title, other names, definition or text have a word starting
 * with each word of `query`, best first: the exact word, the start of the title, another name,
 * then the definition, then the rest of the text.
 */
export function searchHits(notions: readonly Notion[], query: string): SearchHit[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return notions.map((notion) => ({ notion }));
  const wanted = words.join(' ');
  // Each word of the query starts a word of the text.
  const has = (text: string) => words.every((w) => wordStart(text, w) >= 0);
  const hit = (notion: Notion): { rank: number; hit: SearchHit } | undefined => {
    const title = fold(notion.title);
    const aliases = notion.aliases.map(fold);
    const names = `${title} ${aliases.join(' ')}`;
    const short = fold(notion.short);
    const found = (rank: number, text?: string): { rank: number; hit: SearchHit } => {
      const excerpt = text === undefined ? undefined : excerptOf(text, words[0] ?? '');
      return { rank, hit: { notion, ...(excerpt ? { excerpt } : {}) } };
    };
    if (title === wanted) return found(0);
    if (aliases.includes(wanted)) return found(1);
    if (title.startsWith(wanted)) return found(2);
    if (aliases.some((a) => a.startsWith(wanted))) return found(3);
    if ([title, ...aliases].some((n) => has(n))) return found(4);
    if (has(`${names} ${short}`)) return found(5, notion.short);
    const text = cardText(notion);
    if (has(`${names} ${short} ${fold(text)}`)) return found(6, text);
    return undefined;
  };
  return notions
    .map(hit)
    .filter((r) => r !== undefined)
    .sort((a, b) => a.rank - b.rank)
    .map((r) => r.hit);
}

/** The cards found by `searchHits`, best first. */
export function searchNotions(notions: readonly Notion[], query: string): Notion[] {
  return searchHits(notions, query).map((h) => h.notion);
}

export interface LexiconEntry {
  readonly word: string;
  readonly notion: Notion;
}

/**
 * Every word of the lexicon with the card that defines it, in alphabetical
 * order. Another name that only repeats the start of the title (« ARP » for
 * « ARP : trouver l'adresse MAC ») would sit just beside it: it is left out.
 */
export function lexicon(notions: readonly Notion[]): LexiconEntry[] {
  const seen = new Set<string>();
  const entries = notions
    .filter((n) => n.category !== 'guide')
    .flatMap((notion) => {
      const title = fold(notion.title);
      const others = notion.aliases.filter((a) => !title.startsWith(fold(a)));
      return [notion.title, ...others].map((word) => ({ word, notion }));
    })
    .filter(({ word, notion }) => {
      const key = `${fold(word)}>${notion.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return entries.sort((a, b) => fold(a.word).localeCompare(fold(b.word), 'fr'));
}

/** The lexicon cut by initial letter (« # » for what does not start with a letter). */
export function lexiconByLetter(
  notions: readonly Notion[],
): { readonly letter: string; readonly entries: LexiconEntry[] }[] {
  const groups: { letter: string; entries: LexiconEntry[] }[] = [];
  for (const entry of lexicon(notions)) {
    const first = fold(entry.word).charAt(0);
    const letter = /[a-z]/.test(first) ? first.toUpperCase() : '#';
    const group = groups.at(-1);
    if (group?.letter === letter) group.entries.push(entry);
    else groups.push({ letter, entries: [entry] });
  }
  return groups;
}
