import type { Notion, Pack, PackOverride } from './types';

/**
 * Applies overrides to a pack, in order: a card with a known identifier
 * replaces the existing one (and keeps its place), a new one is added at the
 * end, hidden ones disappear. Links to a card that no longer exists are
 * removed from the « see also » lists.
 */
export function mergePacks(base: Pack, ...overrides: readonly PackOverride[]): Pack {
  let notions: Notion[] = [...base.notions];
  let messages: Pack['messages'] = { ...base.messages };
  for (const override of overrides) {
    for (const notion of override.notions ?? []) {
      const index = notions.findIndex((n) => n.id === notion.id);
      if (index >= 0) notions[index] = notion;
      else notions.push(notion);
    }
    const hidden = new Set(override.hidden ?? []);
    notions = notions.filter((n) => !hidden.has(n.id));
    for (const [code, text] of Object.entries(override.messages ?? {})) {
      const key = code as keyof Pack['messages'];
      messages = { ...messages, [key]: { ...messages[key], ...text } };
    }
  }
  const known = new Set(notions.map((n) => n.id));
  return {
    notions: notions.map((n) => ({ ...n, related: n.related.filter((id) => known.has(id) && id !== n.id) })),
    messages,
  };
}

/** Lower case, without accents: « Adresse IP » and « adresse ip » are the same word. */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('fr').trim();
}

/** Cards whose title, other names or definition contain every word of `query`. */
export function searchNotions(notions: readonly Notion[], query: string): Notion[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...notions];
  const wanted = words.join(' ');
  const rank = (notion: Notion): number => {
    const title = fold(notion.title);
    const aliases = notion.aliases.map(fold);
    const all = `${title} ${aliases.join(' ')} ${fold(notion.short)}`;
    if (!words.every((w) => all.includes(w))) return -1;
    // Best first: the exact word, the start of the title, another name, then the definition.
    if (title === wanted || aliases.includes(wanted)) return title === wanted ? 0 : 1;
    if (title.startsWith(wanted)) return 2;
    if (aliases.some((a) => a.startsWith(wanted))) return 3;
    return [title, ...aliases].some((n) => words.every((w) => n.includes(w))) ? 4 : 5;
  };
  return notions
    .map((notion) => ({ notion, rank: rank(notion) }))
    .filter((r) => r.rank >= 0)
    .sort((a, b) => a.rank - b.rank)
    .map((r) => r.notion);
}

/** Every word of the lexicon with the card that defines it, in alphabetical order. */
export function lexicon(notions: readonly Notion[]): { readonly word: string; readonly notion: Notion }[] {
  const entries = notions
    .filter((n) => n.category !== 'guide')
    .flatMap((notion) => [notion.title, ...notion.aliases].map((word) => ({ word, notion })));
  return entries.sort((a, b) => fold(a.word).localeCompare(fold(b.word), 'fr'));
}
