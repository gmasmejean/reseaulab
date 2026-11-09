import { Scheduler } from '../engine/core/scheduler';
import { LINK_DELAY } from '../engine/network';
import { ManualFrames } from '../test/doubles';
import { HOP_MS, SimulationClock } from './clock';

/** A clock whose "cables" carry frames during the given simulated intervals. */
function setup(transits: readonly (readonly [number, number])[] = []) {
  const scheduler = new Scheduler();
  const frames = new ManualFrames();
  const busyUntil = () => {
    const now = scheduler.now;
    const ends = transits.filter(([start, end]) => start <= now && end > now).map(([, end]) => end);
    return ends.length > 0 ? Math.max(...ends) : null;
  };
  const clock = new SimulationClock(
    () => scheduler,
    () => undefined,
    frames,
    busyUntil,
  );
  return { scheduler, frames, clock };
}

describe('SimulationClock', () => {
  test('sans trame sur les câbles, le temps simulé suit le temps réel (plus vite au-delà de × 1)', () => {
    const { scheduler, clock } = setup();
    clock.speed = 0.25;
    clock.advance(80);
    expect(scheduler.now).toBe(80);
    clock.speed = 4;
    clock.advance(10);
    expect(scheduler.now).toBe(120);
  });

  test('une trame met HOP_MS / vitesse millisecondes réelles à traverser un câble', () => {
    const { scheduler, clock } = setup([[0, LINK_DELAY]]);
    clock.speed = 0.5;
    expect(clock.transitRate).toBeCloseTo((LINK_DELAY * 0.5) / HOP_MS);
    clock.advance(HOP_MS); // la moitié de la traversée à × 0,5
    expect(scheduler.now).toBeCloseTo(LINK_DELAY / 2);
    clock.advance(HOP_MS);
    expect(scheduler.now).toBeCloseTo(LINK_DELAY);
  });

  test('passe du temps normal au ralenti dès qu’une trame part, au milieu d’une image', () => {
    // Une trame part à 50 ms (timer), puis les câbles redeviennent libres.
    const { scheduler, clock } = setup([[50, 50 + LINK_DELAY]]);
    clock.speed = 1;
    let fired = 0;
    scheduler.schedule(50, () => fired++);
    clock.advance(50 + HOP_MS / 2);
    expect(fired).toBe(1);
    expect(scheduler.now).toBeCloseTo(50 + LINK_DELAY / 2);
    // Fin de la traversée puis 30 ms de temps normal.
    clock.advance(HOP_MS / 2 + 30);
    expect(scheduler.now).toBeCloseTo(50 + LINK_DELAY + 30);
  });

  test('les images sont plafonnées à 100 ms et l’horloge s’arrête', () => {
    const { scheduler, frames, clock } = setup();
    clock.speed = 1;
    clock.start();
    clock.start();
    frames.step(0);
    frames.step(500);
    expect(scheduler.now).toBe(100);
    clock.stop();
    expect(frames.active).toBe(false);
    expect(clock.running).toBe(false);
  });
});
