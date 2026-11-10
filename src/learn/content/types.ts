import type { FindingCode } from '../diagnose/findings';
import type { MessageOverride } from '../diagnose/messages.fr';
import type { Question } from '../quiz/types';

/* The pedagogical pack: what RéseauLab teaches, as data. The application
 * ships a default pack; a teacher can replace or complete any part of it with
 * a file, without touching the code. */

/** School year in which a notion is first met (French collège, cycle 4). */
export const LEVELS = ['5e', '4e', '3e'] as const;
export type Level = (typeof LEVELS)[number];

export const CATEGORIES = ['guide', 'materiel', 'adressage', 'protocoles', 'services', 'securite'] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  guide: 'Prise en main',
  materiel: 'Matériel et réseaux',
  adressage: 'Adresses',
  protocoles: 'Protocoles et échanges',
  services: 'Services',
  securite: 'Sécurité',
};

/** A knowledge card. Texts are plain, except `body` (see richtext.ts). */
export interface Notion {
  /** Stable identifier, used by links: « passerelle ». */
  readonly id: string;
  readonly title: string;
  /** Other words pupils may look for (lexicon and search). */
  readonly aliases: readonly string[];
  readonly level: Level;
  readonly category: Category;
  /** Reference to the official curriculum, written by the teacher. */
  readonly curriculum?: string | undefined;
  /** The definition, in one sentence. */
  readonly short: string;
  /** The explanation. */
  readonly body: string;
  /** What must be remembered. */
  readonly remember: readonly string[];
  readonly example?: string | undefined;
  /** Where to see or try it in RéseauLab. */
  readonly inApp?: string | undefined;
  /** An illustration provided by the teacher (data: URL of an image). */
  readonly image?: { readonly data: string; readonly alt: string } | undefined;
  /** Identifiers of the cards to read next. */
  readonly related: readonly string[];
}

export interface Pack {
  readonly notions: readonly Notion[];
  /** Questions of the self-assessment quiz. */
  readonly questions: readonly Question[];
  /** Rewording of the messages of the diagnosis. */
  readonly messages: Partial<Record<FindingCode, MessageOverride>>;
}

/** A file written by a teacher: what it adds to, changes in or removes from a pack. */
export interface PackOverride {
  readonly notions?: readonly Notion[];
  readonly questions?: readonly Question[];
  readonly messages?: Pack['messages'];
  /** Identifiers of the cards and questions of the base pack to hide. */
  readonly hidden?: readonly string[];
}
