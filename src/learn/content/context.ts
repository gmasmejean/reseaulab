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

/** The card on how to use RéseauLab in each mode. */
export const MODE_GUIDE = { design: 'guide-construire', simulation: 'guide-simuler' } as const;

export interface HelpContext {
  /** Kind of the selected device, if any. */
  readonly device?: DeviceKind | undefined;
  /** Card read last, if the help was opened before. */
  readonly lastRead?: string | undefined;
  readonly mode: keyof typeof MODE_GUIDE;
  /** Whether a card exists (it may have been hidden by the teacher). */
  readonly exists: (id: string) => boolean;
}

/**
 * The card the help opens on when nothing precise is asked: the one of the
 * selected device, otherwise the one read last, otherwise the guide of the
 * current mode.
 */
export function contextualNotion(context: HelpContext): string | undefined {
  const candidates = [
    context.device === undefined ? undefined : DEVICE_NOTION[context.device],
    context.lastRead,
    MODE_GUIDE[context.mode],
  ];
  return candidates.find((id): id is string => id !== undefined && context.exists(id));
}
