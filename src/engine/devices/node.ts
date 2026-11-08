import { CaptureLog } from '../net/capture';
import type { EthernetFrame } from '../net/frames';
import type { Port, SimContext } from '../net/link';
import { IpStack } from '../stack/ip-stack';
import { Device, type DeviceKind, type Position } from './device';

/** A device with an IP stack (computer, laptop, router). */
export abstract class NetworkNode extends Device {
  readonly stack: IpStack;
  readonly capture = new CaptureLog();

  protected constructor(id: string, kind: DeviceKind, name: string, position: Position, ctx: SimContext) {
    super(id, kind, name, position, ctx);
    this.stack = new IpStack(ctx.scheduler, () => {
      this.changed();
    });
  }

  receiveFrame(port: Port, frame: EthernetFrame): void {
    this.capture.record(this.ctx.scheduler.now, port.index, 'in', frame);
    this.stack.receiveFrame(port, frame);
    this.changed();
  }

  frameSent(port: Port, frame: EthernetFrame): void {
    this.capture.record(this.ctx.scheduler.now, port.index, 'out', frame);
  }

  override stop(): void {
    this.stack.reset();
    this.capture.clear();
  }
}
