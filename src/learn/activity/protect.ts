import { Router } from '../../engine/devices/router';
import type { Network } from '../../engine/network';
import type { Activity, ProtectionInput } from './schema';

/* Protection of the starting network of an activity. A pupil who removes a
 * route of the Internet provider, or changes the address of a server, breaks
 * the activity for good: what the protected devices hold at first is read
 * only. Adding stays free — the route an objective asks for, an interface, a
 * cable — and what was added can be taken back. */

/** What the pupil cannot change, as asked by the interface. */
export interface Guard {
  /** The settings of this device (name, addresses, software) are read only. */
  device(id: string): boolean;
  /** This interface of a router was there at first: neither changed nor removed. */
  iface(deviceId: string, index: number): boolean;
  /** This static route of a router was there at first: it cannot be removed. */
  route(deviceId: string, index: number): boolean;
  /** This cable of the starting network cannot be removed. */
  cable(id: string): boolean;
}

const never = () => false;
export const NO_GUARD: Guard = { device: never, iface: never, route: never, cable: never };

export function guardOf(activity: Activity | null): Guard {
  const protect = activity?.protect;
  if (!protect || (protect.devices.length === 0 && protect.cables.length === 0)) return NO_GUARD;
  const devices = new Map(protect.devices.map((d) => [d.id, d]));
  const cables = new Set(protect.cables);
  return {
    device: (id) => devices.has(id),
    iface: (deviceId, index) => index < (devices.get(deviceId)?.interfaces ?? 0),
    route: (deviceId, index) => index < (devices.get(deviceId)?.routes ?? 0),
    cable: (id) => cables.has(id),
  };
}

/**
 * Protects devices of a starting network, given by their names: their
 * settings, the interfaces and routes of the routers, and every cable that
 * reaches one of them.
 */
export function protectionOf(network: Network, names: readonly string[]): ProtectionInput {
  const devices = names.map((name) => {
    const device = network.devices.find((d) => d.name === name);
    if (!device) throw new Error(`Activité : équipement « ${name} » absent du réseau de départ`);
    return device instanceof Router
      ? { id: device.id, interfaces: device.interfaces.length, routes: device.staticRoutes.length }
      : { id: device.id };
  });
  const ids = new Set(devices.map((d) => d.id));
  const cables = network.cables.filter((c) => ids.has(c.a) || ids.has(c.b)).map((c) => c.id);
  return { devices, cables };
}
