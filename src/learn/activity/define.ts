import { parseIp, prefixToMask, type Ipv4 } from '../../engine/core/ipv4';
import type { Network } from '../../engine/network';
import { activitySchema, type Activity, type ActivityInput } from './schema';

/* Small helpers to write the activities shipped with RéseauLab. */

export const MASK_24 = prefixToMask(24);

export function ip(text: string): Ipv4 {
  const value = parseIp(text);
  if (value === null) throw new Error(`Activité : adresse invalide « ${text} »`);
  return value;
}

export const named = (name: string) => ({ by: 'name', name }) as const;

/** Reference to a device of the starting network, by its name at that time. */
export function existing(network: Network, name: string) {
  const device = network.devices.find((d) => d.name === name);
  if (!device) throw new Error(`Activité : équipement « ${name} » absent du réseau de départ`);
  return { by: 'id', id: device.id, label: name } as const;
}

export function define(network: Network, activity: ActivityInput): { network: Network; activity: Activity } {
  return { network, activity: activitySchema.parse(activity) };
}
