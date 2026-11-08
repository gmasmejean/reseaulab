/**
 * Discrete-event scheduler working in virtual milliseconds.
 *
 * Events scheduled for the same instant run in insertion order, which keeps
 * the whole simulation deterministic.
 */
export type TimerId = number;

interface ScheduledEvent {
  readonly time: number;
  readonly seq: number;
  readonly id: TimerId;
  readonly action: () => void;
}

export class Scheduler {
  private currentTime = 0;
  private seq = 0;
  private readonly heap: ScheduledEvent[] = [];
  private readonly cancelled = new Set<TimerId>();

  get now(): number {
    return this.currentTime;
  }

  get pendingCount(): number {
    return this.heap.length - this.cancelled.size;
  }

  schedule(delay: number, action: () => void): TimerId {
    if (!Number.isFinite(delay) || delay < 0) throw new RangeError(`Délai invalide : ${delay}`);
    const id = ++this.seq;
    this.push({ time: this.currentTime + delay, seq: id, id, action });
    return id;
  }

  cancel(id: TimerId | null | undefined): void {
    if (id === null || id === undefined) return;
    if (this.heap.some((e) => e.id === id)) this.cancelled.add(id);
  }

  /** Time of the next pending event, or null when idle. */
  nextEventTime(): number | null {
    this.dropCancelledHead();
    return this.heap[0]?.time ?? null;
  }

  /** Runs every event due at or before `time`, then sets the clock to `time`. */
  runUntil(time: number): number {
    let processed = 0;
    for (;;) {
      const next = this.nextEventTime();
      if (next === null || next > time) break;
      this.runNext();
      processed++;
    }
    this.currentTime = Math.max(this.currentTime, time);
    return processed;
  }

  advance(delay: number): number {
    return this.runUntil(this.currentTime + delay);
  }

  /** Runs events until none remain (guarded against infinite periodic timers). */
  runUntilIdle(maxEvents = 100_000): number {
    let processed = 0;
    while (this.nextEventTime() !== null) {
      if (processed >= maxEvents) throw new Error('Simulation sans fin : trop d’événements.');
      this.runNext();
      processed++;
    }
    return processed;
  }

  /** Removes every pending event and resets the clock. */
  reset(): void {
    this.heap.length = 0;
    this.cancelled.clear();
    this.currentTime = 0;
  }

  private runNext(): void {
    const event = this.pop();
    if (!event) return;
    this.currentTime = event.time;
    event.action();
  }

  private dropCancelledHead(): void {
    let head = this.heap[0];
    while (head && this.cancelled.has(head.id)) {
      this.cancelled.delete(head.id);
      this.pop();
      head = this.heap[0];
    }
  }

  private static before(a: ScheduledEvent, b: ScheduledEvent): boolean {
    return a.time < b.time || (a.time === b.time && a.seq < b.seq);
  }

  private push(event: ScheduledEvent): void {
    const heap = this.heap;
    heap.push(event);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      const p = heap[parent];
      if (!p || !Scheduler.before(event, p)) break;
      heap[i] = p;
      i = parent;
    }
    heap[i] = event;
  }

  private pop(): ScheduledEvent | undefined {
    const heap = this.heap;
    const top = heap[0];
    const last = heap.pop();
    if (heap.length === 0 || !last) return top;
    let i = 0;
    for (;;) {
      const left = 2 * i + 1;
      const right = left + 1;
      let smallest = i;
      let smallestEvent = last;
      const l = heap[left];
      const r = heap[right];
      if (l && Scheduler.before(l, smallestEvent)) {
        smallest = left;
        smallestEvent = l;
      }
      if (r && Scheduler.before(r, smallestEvent)) {
        smallest = right;
        smallestEvent = r;
      }
      if (smallest === i) break;
      heap[i] = smallestEvent;
      i = smallest;
    }
    heap[i] = last;
    return top;
  }
}
