import { CATEGORIES, LEVELS, type Level, type Notion } from './types';

/** Cards shown: every one, or those met up to a school year. */
export type LevelFilter = 'all' | Level;

/** Whether a card is shown at `filter`; the cards on how to use RéseauLab always are. */
export function shownAt(notion: Notion, filter: LevelFilter): boolean {
  if (filter === 'all' || notion.category === 'guide') return true;
  return LEVELS.indexOf(notion.level) <= LEVELS.indexOf(filter);
}

/**
 * The cards in the order they are listed and read: by section, then by school
 * year within a section, keeping the order of the pack otherwise (a card added
 * by the teacher comes after those of its year).
 */
export function readingOrder(notions: readonly Notion[], filter: LevelFilter = 'all'): Notion[] {
  const rank = (n: Notion) => CATEGORIES.indexOf(n.category) * LEVELS.length + LEVELS.indexOf(n.level);
  return notions
    .map((notion, index) => ({ notion, index }))
    .filter(({ notion }) => shownAt(notion, filter))
    .sort((a, b) => rank(a.notion) - rank(b.notion) || a.index - b.index)
    .map(({ notion }) => notion);
}

/** The card to read after `id`, in reading order; none after the last one or outside the order. */
export function nextNotion(order: readonly Notion[], id: string): Notion | undefined {
  const index = order.findIndex((n) => n.id === id);
  return index < 0 ? undefined : order[index + 1];
}
