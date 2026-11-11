import { z } from 'zod';
import { LINT_CODES, TRACE_CODES } from '../diagnose/findings';
import { CATEGORIES, LEVELS, type PackOverride } from './types';

/* File of a pedagogical pack (« *.pack.reseaulab.json »), written or edited by
 * a teacher. As for a project, an invalid file is refused as a whole, with a
 * message that says where the problem is. */

export const PACK_FORMAT = 'reseaulab-pack';
export const PACK_VERSION = 1;
/** Maximum accepted size of a pack file (characters). */
export const MAX_PACK_SIZE = 5_000_000;

const id = z
  .string()
  .max(60)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: 'Identifiant invalide (minuscules, chiffres et tirets)' });

const image = z.object({
  data: z
    .string()
    .max(300_000, { message: 'Image trop volumineuse (300 000 caractères au plus)' })
    .regex(/^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/, {
      message: 'Image invalide',
    }),
  alt: z.string().max(300),
});

const notion = z.object({
  id,
  title: z.string().trim().min(1).max(120),
  aliases: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  level: z.enum(LEVELS),
  category: z.enum(CATEGORIES),
  curriculum: z.string().max(400).optional(),
  short: z.string().trim().min(1).max(400),
  body: z.string().max(6000),
  remember: z.array(z.string().max(400)).max(10).default([]),
  example: z.string().max(1500).optional(),
  mistakes: z
    .array(z.object({ belief: z.string().trim().min(1).max(400), truth: z.string().trim().min(1).max(600) }))
    .max(10)
    .optional(),
  inApp: z.string().max(1500).optional(),
  image: image.optional(),
  related: z.array(id).max(20).default([]),
});

const questionBase = {
  id,
  notion: id,
  level: z.enum(LEVELS),
  prompt: z.string().trim().min(1).max(500),
  explanation: z.string().max(800).default(''),
};

const question = z.discriminatedUnion('type', [
  z
    .object({
      ...questionBase,
      type: z.literal('mcq'),
      choices: z.array(z.string().trim().min(1).max(200)).min(2).max(8),
      correct: z.array(z.number().int().min(0).max(7)).min(1).max(8),
    })
    .refine((q) => q.correct.every((index) => index < q.choices.length), {
      message: 'Une bonne réponse désigne un choix qui n’existe pas',
    }),
  z.object({
    ...questionBase,
    type: z.literal('order'),
    items: z.array(z.string().trim().min(1).max(200)).min(2).max(8),
  }),
  z.object({
    ...questionBase,
    type: z.literal('short'),
    accepted: z.array(z.string().trim().min(1).max(80)).min(1).max(10),
  }),
  z.object({ ...questionBase, type: z.literal('same-network') }),
]);

const message = z
  .object({
    title: z.string().max(300),
    explain: z.string().max(1000),
    fix: z.string().max(1000),
    notion: id,
  })
  .partial();

/** What a pack adds, changes or hides; also carried by an activity file. */
export const packContentSchema = z.object({
  notions: z.array(notion).max(500).default([]),
  questions: z.array(question).max(1000).default([]),
  messages: z.partialRecord(z.enum([...LINT_CODES, ...TRACE_CODES]), message).default({}),
  hidden: z.array(id).max(500).default([]),
});

export const packFileSchema = packContentSchema.extend({
  format: z.literal(PACK_FORMAT),
  version: z.literal(PACK_VERSION),
});

export class PackError extends Error {}

/** Reads a pack file. Throws a PackError (in French) when it is not valid. */
export function parsePack(text: string): PackOverride {
  if (text.length > MAX_PACK_SIZE) throw new PackError('Fichier de pack trop volumineux.');
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new PackError('Ce fichier n’est pas un pack pédagogique RéseauLab (JSON illisible).');
  }
  const result = packFileSchema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path.join('.') ?? '';
    throw new PackError(`Pack invalide${path ? ` (${path})` : ''} : ${issue?.message ?? 'format inconnu'}`);
  }
  const { notions, questions, messages, hidden } = result.data;
  const duplicate = notions.find((n, i) => notions.findIndex((o) => o.id === n.id) !== i);
  if (duplicate) throw new PackError(`Pack invalide : la fiche « ${duplicate.id} » est définie deux fois.`);
  const twice = questions.find((q, i) => questions.findIndex((o) => o.id === q.id) !== i);
  if (twice) throw new PackError(`Pack invalide : la question « ${twice.id} » est définie deux fois.`);
  return { notions, questions, messages, hidden };
}

/** Writes a pack file from what a teacher wants to add, change or hide. */
export function serializePack(override: PackOverride): string {
  return JSON.stringify(
    {
      format: PACK_FORMAT,
      version: PACK_VERSION,
      notions: override.notions ?? [],
      questions: override.questions ?? [],
      messages: override.messages ?? {},
      hidden: override.hidden ?? [],
    },
    null,
    2,
  );
}
