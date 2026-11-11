import type { DeviceKind } from '../../engine/devices/device';

/** The knowledge card that explains a kind of device. */
export const DEVICE_NOTION: Record<DeviceKind, string> = {
  computer: 'terminal',
  laptop: 'terminal',
  smartphone: 'terminal',
  tablet: 'terminal',
  printer: 'terminal',
  server: 'client-serveur',
  object: 'objet-connecte',
  switch: 'switch',
  router: 'routeur',
  box: 'box',
};

export interface HelpContext {
  /** Kind of the selected device, if any. */
  readonly device?: DeviceKind | undefined;
  /** Card read last, if the help was opened before. */
  readonly lastRead?: string | undefined;
  /** Whether a card exists (it may have been hidden by the teacher). */
  readonly exists: (id: string) => boolean;
}

/**
 * The card the help opens on when nothing precise is asked: the one of the
 * selected device, otherwise the one read last; none (the home page of the
 * help) the first time.
 */
export function contextualNotion(context: HelpContext): string | undefined {
  const candidates = [
    context.device === undefined ? undefined : DEVICE_NOTION[context.device],
    context.lastRead,
  ];
  return candidates.find((id): id is string => id !== undefined && context.exists(id));
}
