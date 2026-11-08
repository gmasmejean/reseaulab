import { Emitter } from './emitter';
import {
  broadcastOf,
  formatCidr,
  formatIp,
  isUsableHostAddress,
  isValidMask,
  maskToPrefix,
  networkOf,
  parseIp,
  parseMask,
  prefixToMask,
  sameNetwork,
} from './ipv4';
import { MAC_BROADCAST, MacAllocator, isValidMac, normalizeMac } from './mac';
import { Scheduler } from './scheduler';

const ip = (text: string) => {
  const value = parseIp(text);
  if (value === null) throw new Error(text);
  return value;
};

describe('IPv4', () => {
  test.each(['0.0.0.0', '192.168.1.10', '255.255.255.255', '10.0.0.1'])('analyse %s', (text) => {
    expect(formatIp(ip(text))).toBe(text);
  });

  test.each(['', '1.2.3', '1.2.3.4.5', '256.1.1.1', '01.2.3.4', 'a.b.c.d', '1..2.3', '-1.0.0.0'])(
    'refuse %j',
    (text) => {
      expect(parseIp(text)).toBeNull();
    },
  );

  test('masques', () => {
    expect(isValidMask(ip('255.255.255.0'))).toBe(true);
    expect(isValidMask(ip('0.0.0.0'))).toBe(true);
    expect(isValidMask(ip('255.255.255.255'))).toBe(true);
    expect(isValidMask(ip('255.0.255.0'))).toBe(false);
    expect(parseMask('255.255.0.1')).toBeNull();
    expect(parseMask('255.255.240.0')).toBe(ip('255.255.240.0'));
    expect(maskToPrefix(ip('255.255.240.0'))).toBe(20);
    expect(maskToPrefix(0)).toBe(0);
    expect(prefixToMask(24)).toBe(ip('255.255.255.0'));
    expect(prefixToMask(0)).toBe(0);
    expect(prefixToMask(32)).toBe(ip('255.255.255.255'));
    expect(() => prefixToMask(33)).toThrow(RangeError);
  });

  test('réseaux', () => {
    const mask = ip('255.255.255.0');
    expect(formatIp(networkOf(ip('192.168.1.77'), mask))).toBe('192.168.1.0');
    expect(formatIp(broadcastOf(ip('192.168.1.77'), mask))).toBe('192.168.1.255');
    expect(sameNetwork(ip('192.168.1.1'), ip('192.168.1.254'), mask)).toBe(true);
    expect(sameNetwork(ip('192.168.1.1'), ip('192.168.2.1'), mask)).toBe(false);
    expect(formatCidr(ip('10.1.2.3'), ip('255.0.0.0'))).toBe('10.0.0.0/8');
  });

  test('adresses de poste utilisables', () => {
    const mask = ip('255.255.255.0');
    expect(isUsableHostAddress(ip('192.168.1.1'), mask)).toBe(true);
    expect(isUsableHostAddress(ip('192.168.1.0'), mask)).toBe(false);
    expect(isUsableHostAddress(ip('192.168.1.255'), mask)).toBe(false);
    expect(isUsableHostAddress(0, mask)).toBe(false);
    expect(isUsableHostAddress(ip('10.0.0.0'), ip('255.255.255.254'))).toBe(true);
  });
});

describe('MAC', () => {
  test('validation et normalisation', () => {
    expect(isValidMac(MAC_BROADCAST)).toBe(true);
    expect(normalizeMac('aa-bb-cc-dd-ee-0f')).toBe('AA:BB:CC:DD:EE:0F');
    expect(normalizeMac('AA:BB:CC')).toBeNull();
  });

  test('allocation déterministe sans doublon', () => {
    const alloc = new MacAllocator();
    alloc.reserve('02:00:00:00:00:02');
    expect(alloc.allocate()).toBe('02:00:00:00:00:01');
    expect(alloc.allocate()).toBe('02:00:00:00:00:03');
    alloc.release('02:00:00:00:00:01');
    expect(new MacAllocator(0x01020304).allocate()).toBe('02:00:01:02:03:04');
  });
});

describe('Scheduler', () => {
  test('exécute les événements dans l’ordre du temps puis de l’insertion', () => {
    const s = new Scheduler();
    const log: string[] = [];
    s.schedule(10, () => log.push('b'));
    s.schedule(5, () => log.push('a'));
    s.schedule(10, () => log.push('c'));
    s.schedule(0, () => {
      log.push('0');
      s.schedule(0, () => log.push('0bis'));
    });
    expect(s.pendingCount).toBe(4);
    s.runUntilIdle();
    expect(log).toEqual(['0', '0bis', 'a', 'b', 'c']);
    expect(s.now).toBe(10);
  });

  test('ordre stable avec beaucoup d’événements', () => {
    const s = new Scheduler();
    const log: number[] = [];
    const delays = [7, 3, 9, 1, 3, 8, 2, 7, 0, 5, 4, 6, 1];
    delays.forEach((d, i) => s.schedule(d, () => log.push(i)));
    s.runUntilIdle();
    const expected = delays.map((d, i) => ({ d, i })).sort((a, b) => a.d - b.d || a.i - b.i);
    expect(log).toEqual(expected.map((e) => e.i));
  });

  test('annulation, avance et réinitialisation', () => {
    const s = new Scheduler();
    const log: string[] = [];
    const id = s.schedule(5, () => log.push('annulé'));
    s.schedule(20, () => log.push('tard'));
    s.cancel(id);
    s.cancel(null);
    s.cancel(9999);
    expect(s.nextEventTime()).toBe(20);
    expect(s.advance(10)).toBe(0);
    expect(s.now).toBe(10);
    expect(s.runUntil(20)).toBe(1);
    expect(log).toEqual(['tard']);
    expect(s.nextEventTime()).toBeNull();
    s.schedule(1, () => log.push('x'));
    s.reset();
    expect(s.now).toBe(0);
    expect(s.runUntilIdle()).toBe(0);
  });

  test('détecte une boucle infinie et refuse les délais invalides', () => {
    const s = new Scheduler();
    const loop = () => s.schedule(1, loop);
    loop();
    expect(() => s.runUntilIdle(50)).toThrow(/sans fin/);
    expect(() => s.schedule(-1, () => undefined)).toThrow(RangeError);
    expect(() => s.schedule(Number.NaN, () => undefined)).toThrow(RangeError);
  });
});

describe('Emitter', () => {
  test('abonnement et désabonnement', () => {
    const e = new Emitter<{ ping: number }>();
    const got: number[] = [];
    const off = e.on('ping', (n) => got.push(n));
    e.emit('ping', 1);
    off();
    e.emit('ping', 2);
    expect(got).toEqual([1]);
  });
});
