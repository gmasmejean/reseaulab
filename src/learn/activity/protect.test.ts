import { Network } from '../../engine/network';
import { MASK_24, ip } from '../../engine/testing';
import { protectedDevices } from './evaluate';
import { NO_GUARD, guardOf, protectionOf } from './protect';
import { activitySchema, type Activity } from './schema';

/** Un poste, un switch et un routeur qui a déjà une route ; un second poste reste libre. */
function smallNetwork() {
  const network = new Network();
  const sw = network.addSwitch({ name: 'Switch' });
  const router = network.addRouter({ name: 'Routeur' });
  router.setInterface(0, { ip: ip('192.168.1.254'), mask: MASK_24 });
  router.setStaticRoutes([
    { destination: ip('0.0.0.0'), mask: ip('0.0.0.0'), gateway: ip('10.0.0.1'), iface: 1 },
  ]);
  const server = network.addHost('server', { name: 'Serveur' });
  const free = network.addHost('computer', { name: 'Poste' });
  const uplink = network.connect(router.id, sw.id, { portA: 0 });
  const serverCable = network.connect(server.id, sw.id);
  const freeCable = network.connect(free.id, sw.id);
  return { network, sw, router, server, free, uplink, serverCable, freeCable };
}

const activityWith = (protect: Activity['protect']): Activity => ({
  ...activitySchema.parse({ id: 'essai', title: 'Essai', level: '3e', steps: [{ id: 'a', title: 'A' }] }),
  protect,
});

describe('Réseau de départ protégé', () => {
  test('sans protection, rien n’est verrouillé', () => {
    expect(guardOf(null)).toBe(NO_GUARD);
    expect(guardOf(activityWith(undefined))).toBe(NO_GUARD);
    expect(NO_GUARD.device('n1') || NO_GUARD.cable('c1') || NO_GUARD.route('n1', 0)).toBe(false);
  });

  test('protège les réglages, les interfaces et les routes de départ, et les câbles qui y arrivent', () => {
    const { network, router, server, free, uplink, serverCable, freeCable } = smallNetwork();
    const protect = activitySchema.shape.protect.parse(protectionOf(network, ['Routeur', 'Serveur']));
    const guard = guardOf(activityWith(protect));
    expect(guard.device(router.id)).toBe(true);
    expect(guard.device(server.id)).toBe(true);
    expect(guard.device(free.id)).toBe(false);
    // Les deux interfaces et la route de départ ; ce que l'élève ajoute ensuite reste à lui.
    expect([0, 1, 2].map((i) => guard.iface(router.id, i))).toEqual([true, true, false]);
    expect([0, 1].map((i) => guard.route(router.id, i))).toEqual([true, false]);
    expect(guard.iface(server.id, 0)).toBe(false);
    expect(guard.cable(uplink.id)).toBe(true);
    expect(guard.cable(serverCable.id)).toBe(true);
    expect(guard.cable(freeCable.id)).toBe(false);
  });

  test('un équipement protégé ne se supprime pas, même si aucun objectif ne le cite', () => {
    const { network, router } = smallNetwork();
    const protect = activitySchema.shape.protect.parse(protectionOf(network, ['Routeur']));
    expect(protectedDevices(activityWith(protect)).has(router.id)).toBe(true);
    expect(protectedDevices(activityWith(undefined)).size).toBe(0);
  });

  test('un nom absent du réseau de départ est refusé', () => {
    expect(() => protectionOf(smallNetwork().network, ['Inconnu'])).toThrow('Inconnu');
  });
});
