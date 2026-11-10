import type { Network } from '../engine/network';
import { MAX_PROJECT_SIZE, projectSchema } from '../project/schema';
import { ProjectError, fromProject, toProject } from '../project/serialize';
import { activitySchema, workSchema, type Activity, type Work } from './activity/schema';

/* A project file may carry an activity (written by a teacher) and the work of
 * a pupil in it. Both are optional additions to the project format: a plain
 * project is still a valid file, and a file with an activity opens as a plain
 * project in a version of RéseauLab that does not know activities. */

const learnFileSchema = projectSchema.extend({
  activity: activitySchema.optional(),
  work: workSchema.optional(),
});

export interface LearnFile {
  readonly network: Network;
  readonly activity: Activity | null;
  readonly work: Work | null;
}

/** Reads a project, with its activity and the work done when present. Refused as a whole when invalid. */
export function parseLearnFile(text: string): LearnFile {
  if (text.length > MAX_PROJECT_SIZE) throw new ProjectError('Fichier trop volumineux.');
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ProjectError('Ce fichier n’est pas un projet RéseauLab (JSON illisible).');
  }
  const result = learnFileSchema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path.join('.') ?? '';
    throw new ProjectError(
      `Projet invalide${path ? ` (${path})` : ''} : ${issue?.message ?? 'format inconnu'}`,
    );
  }
  const { activity, work, ...project } = result.data;
  if (activity) {
    const ids = activity.steps.flatMap((s) => [s.id, ...s.objectives.map((o) => o.id)]);
    const twice = ids.find((value, index) => ids.indexOf(value) !== index);
    if (twice !== undefined)
      throw new ProjectError(`Activité invalide : l’identifiant « ${twice} » sert deux fois.`);
  }
  return { network: fromProject(project), activity: activity ?? null, work: work ?? null };
}

/** Writes a project file, with the activity and the work of the pupil when they are given. */
export function serializeLearnFile(
  network: Network,
  extra: { activity: Activity | null; work: Work | null },
): string {
  return JSON.stringify(
    {
      ...toProject(network),
      ...(extra.activity ? { activity: extra.activity } : {}),
      ...(extra.work ? { work: extra.work } : {}),
    },
    null,
    2,
  );
}
