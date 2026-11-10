import { fold } from '../content/merge';
import type { Level } from '../content/types';
import { activitySchema, type Activity, type Check } from './schema';
import { referByName, type StartMode } from './suggest';

/* What a teacher fills in to write an activity, before it becomes a file.
 * Plain texts and lists: identifiers are derived, so that nothing technical
 * has to be typed. */

export interface DraftObjective {
  readonly label: string;
  readonly check: Check;
}

export interface DraftStep {
  readonly title: string;
  readonly body: string;
  /** One hint per line. */
  readonly hints: string;
  /** Identifiers of the knowledge cards to read. */
  readonly notions: readonly string[];
  readonly objectives: readonly DraftObjective[];
}

export interface Draft {
  readonly title: string;
  readonly level: Level;
  /** Minutes, as typed (empty: not said). */
  readonly duration: string;
  readonly intro: string;
  readonly start: StartMode;
  readonly steps: readonly DraftStep[];
}

export const EMPTY_STEP: DraftStep = { title: '', body: '', hints: '', notions: [], objectives: [] };

export function emptyDraft(): Draft {
  return { title: '', level: '4e', duration: '', intro: '', start: 'no-addresses', steps: [EMPTY_STEP] };
}

/** « Mon 1er réseau ! » → « mon-1er-reseau ». */
export function slug(text: string, fallback = 'activite'): string {
  const value = fold(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/, '');
  return value === '' ? fallback : value;
}

export type Built = { readonly activity: Activity } | { readonly error: string };

/** Turns a draft into a valid activity, or says in French what is missing. */
export function buildActivity(draft: Draft): Built {
  if (draft.title.trim() === '') return { error: 'Donnez un titre à l’activité.' };
  const steps = draft.steps.filter(
    (s) => s.title.trim() !== '' || s.body.trim() !== '' || s.objectives.length > 0,
  );
  if (steps.length === 0) return { error: 'Ajoutez au moins une étape.' };
  const untitled = steps.findIndex((s) => s.title.trim() === '');
  if (untitled >= 0) return { error: `Donnez un titre à l’étape ${untitled + 1}.` };
  if (!steps.some((s) => s.objectives.length > 0)) {
    return { error: 'Ajoutez au moins un objectif, pour que l’activité se vérifie toute seule.' };
  }
  const unlabelled = steps.flatMap((s) => s.objectives).some((o) => o.label.trim() === '');
  if (unlabelled) return { error: 'Chaque objectif doit avoir une phrase qui le décrit.' };
  const minutes = draft.duration.trim() === '' ? undefined : Number(draft.duration);
  if (minutes !== undefined && (!Number.isInteger(minutes) || minutes < 1 || minutes > 600)) {
    return { error: 'La durée est un nombre de minutes (de 1 à 600), ou vide.' };
  }
  const result = activitySchema.safeParse({
    id: slug(draft.title),
    title: draft.title,
    level: draft.level,
    ...(minutes === undefined ? {} : { duration: minutes }),
    intro: draft.intro,
    profile: { base: draft.level },
    steps: steps.map((step, s) => ({
      id: `etape-${s + 1}`,
      title: step.title,
      body: step.body,
      hints: step.hints
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== ''),
      notions: [...step.notions],
      objectives: step.objectives.map((objective, o) => ({
        id: `etape-${s + 1}-objectif-${o + 1}`,
        label: objective.label,
        // On an empty plan the devices of the solution no longer exist: they are named.
        check: draft.start === 'empty' ? referByName(objective.check) : objective.check,
      })),
    })),
  });
  if (!result.success) {
    const issue = result.error.issues[0];
    return { error: `Activité invalide (${issue?.path.join('.') ?? ''}) : ${issue?.message ?? ''}` };
  }
  return { activity: result.data };
}
