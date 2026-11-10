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
  inApp: z.string().max(1500).optional(),
  image: image.optional(),
  related: z.array(id).max(20).default([]),
});

const message = z
  .object({
    title: z.string().max(300),
    explain: z.string().max(1000),
    fix: z.string().max(1000),
    notion: id,
  })
  .partial();

export const packFileSchema = z.object({
  format: z.literal(PACK_FORMAT),
  version: z.literal(PACK_VERSION),
  notions: z.array(notion).max(500).default([]),
  messages: z.partialRecord(z.enum([...LINT_CODES, ...TRACE_CODES]), message).default({}),
  hidden: z.array(id).max(500).default([]),
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
  const { notions, messages, hidden } = result.data;
  const duplicate = notions.find((n, i) => notions.findIndex((o) => o.id === n.id) !== i);
  if (duplicate) throw new PackError(`Pack invalide : la fiche « ${duplicate.id} » est définie deux fois.`);
  return { notions, messages, hidden };
}

/** Writes a pack file from what a teacher wants to add, change or hide. */
export function serializePack(override: PackOverride): string {
  return JSON.stringify(
    {
      format: PACK_FORMAT,
      version: PACK_VERSION,
      notions: override.notions ?? [],
      messages: override.messages ?? {},
      hidden: override.hidden ?? [],
    },
    null,
    2,
  );
}
