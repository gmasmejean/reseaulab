import { IP_ANY, maskToPrefix, networkOf, type Ipv4 } from '../core/ipv4';

export type RouteSource = 'connected' | 'default' | 'static' | 'rip';

export interface Route {
  readonly destination: Ipv4;
  readonly mask: Ipv4;
  /** Next hop; IP_ANY means the destination is directly reachable. */
  readonly gateway: Ipv4;
  /** Index of the outgoing interface. */
  readonly iface: number;
  readonly metric: number;
  readonly source: RouteSource;
}

/** Longest-prefix match, then lowest metric, then table order. */
export function lookupRoute(routes: readonly Route[], dst: Ipv4): Route | null {
  let best: Route | null = null;
  let bestPrefix = -1;
  for (const route of routes) {
    if (networkOf(dst, route.mask) !== networkOf(route.destination, route.mask)) continue;
    const prefix = maskToPrefix(route.mask);
    if (prefix > bestPrefix || (prefix === bestPrefix && best !== null && route.metric < best.metric)) {
      best = route;
      bestPrefix = prefix;
    }
  }
  return best;
}

export function nextHop(route: Route, dst: Ipv4): Ipv4 {
  return route.gateway === IP_ANY ? dst : route.gateway;
}
