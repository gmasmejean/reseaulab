import { useRef, type DragEvent, type KeyboardEvent, type PointerEvent } from 'react';
import { IP_ANY, formatIp } from '../../engine/core/ipv4';
import type { Device, DeviceKind } from '../../engine/devices/device';
import { Host } from '../../engine/devices/host';
import { useSession } from '../context';
import type { Session } from '../session';
import { DeviceIcon } from './DeviceIcon';

export const DEVICE_DRAG_TYPE = 'application/x-reseaulab-device';
const ICON = 56;
const MIN_WIDTH = 1400;
const MIN_HEIGHT = 900;

interface Drag {
  readonly id: string;
  readonly pointerX: number;
  readonly pointerY: number;
  readonly originX: number;
  readonly originY: number;
  moved: boolean;
}

function subtitle(device: Device): string | null {
  if (!(device instanceof Host)) return null;
  const ip = device.addressing.ip;
  if (ip !== IP_ANY) return formatIp(ip);
  return device.config.useDhcp ? 'DHCP' : 'sans adresse';
}

/** Where to write a router's port name: just outside its icon, along the cable. */
function portLabelPosition(
  from: { readonly x: number; readonly y: number },
  to: { readonly x: number; readonly y: number },
): { x: number; y: number } {
  const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  const distance = Math.min(ICON, length / 2);
  return {
    x: Math.round(from.x + ((to.x - from.x) / length) * distance),
    y: Math.round(from.y + ((to.y - from.y) / length) * distance - 6),
  };
}

function openDevice(session: Session, device: Device): void {
  if (device instanceof Host) session.openWindow({ type: 'desktop', deviceId: device.id });
  else if (device.kind === 'switch') session.openWindow({ type: 'switch', deviceId: device.id });
  else session.openWindow({ type: 'router', deviceId: device.id });
}

export function Canvas() {
  const session = useSession();
  const net = session.network;
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const devices = net.devices;
  const width = Math.max(MIN_WIDTH, ...devices.map((d) => d.position.x + 160));
  const height = Math.max(MIN_HEIGHT, ...devices.map((d) => d.position.y + 160));
  const simulation = session.mode === 'simulation';
  const now = net.scheduler.now;

  const toSvg = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) };
  };

  const onDevicePointerDown = (event: PointerEvent, device: Device) => {
    event.stopPropagation();
    if (event.button !== 0) return;
    if (session.tool === 'cable' && !simulation) {
      session.cableClick(device.id);
      return;
    }
    drag.current = {
      id: device.id,
      pointerX: event.clientX,
      pointerY: event.clientY,
      originX: device.position.x,
      originY: device.position.y,
      moved: false,
    };
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- absent from jsdom
    svgRef.current?.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = event.clientX - d.pointerX;
    const dy = event.clientY - d.pointerY;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    d.moved = true;
    net.move(d.id, {
      x: Math.max(40, Math.round(d.originX + dx)),
      y: Math.max(40, Math.round(d.originY + dy)),
    });
  };

  /** Click (without drag) or Enter/Space on a device. */
  const activate = (device: Device) => {
    session.select({ kind: 'device', id: device.id });
    if (simulation) openDevice(session, device);
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return;
    const device = net.device(d.id);
    if (device) activate(device);
  };

  const onDeviceKeyDown = (event: KeyboardEvent, device: Device) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (session.tool === 'cable' && !simulation) session.cableClick(device.id);
    else activate(device);
  };

  const onDrop = (event: DragEvent) => {
    const kind = event.dataTransfer.getData(DEVICE_DRAG_TYPE) as DeviceKind | '';
    if (!kind || simulation) return;
    event.preventDefault();
    const p = toSvg(event.clientX, event.clientY);
    session.addDevice(kind, { x: Math.max(40, Math.round(p.x)), y: Math.max(40, Math.round(p.y)) });
  };

  const selected = session.selection;
  return (
    <div className="canvas-scroll" data-tool={session.tool}>
      <svg
        ref={svgRef}
        className={`canvas ${simulation ? 'simulating' : ''}`}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="application"
        aria-label="Plan du réseau"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerDown={() => {
          if (session.cableStart) session.setTool('cable');
          session.select(null);
        }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(DEVICE_DRAG_TYPE)) e.preventDefault();
        }}
        onDrop={onDrop}
      >
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" className="grid-line" />
          </pattern>
        </defs>
        <rect width={width} height={height} fill="url(#grid)" />
        {net.cables.map((c) => {
          const a = net.device(c.a)?.position;
          const b = net.device(c.b)?.position;
          if (!a || !b) return null;
          const active = session.inFlight.some((f) => f.cableId === c.id);
          const isSelected = selected?.kind === 'cable' && selected.id === c.id;
          const routerLabel = (
            deviceId: string,
            port: number,
            from: { x: number; y: number },
            to: { x: number; y: number },
          ) =>
            net.device(deviceId)?.kind === 'router' ? (
              <text {...portLabelPosition(from, to)} className="port-label">
                {`eth${port}`}
              </text>
            ) : null;
          return (
            <g
              key={c.id}
              className={`cable ${active ? 'active' : ''} ${isSelected ? 'selected' : ''}`}
              onPointerDown={(e) => {
                e.stopPropagation();
                if (!simulation) session.select({ kind: 'cable', id: c.id });
              }}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && !simulation) {
                  e.preventDefault();
                  session.select({ kind: 'cable', id: c.id });
                }
              }}
              role="button"
              tabIndex={simulation ? -1 : 0}
              aria-label={`Câble ${net.device(c.a)?.name ?? ''} – ${net.device(c.b)?.name ?? ''}`}
              aria-pressed={isSelected}
            >
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="cable-hit" />
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="cable-line" />
              {routerLabel(c.a, c.portA, a, b)}
              {routerLabel(c.b, c.portB, b, a)}
            </g>
          );
        })}
        {simulation &&
          session.inFlight.map((f, i) => {
            const cable = net.cable(f.cableId);
            if (!cable) return null;
            const fromPos = net.device(f.from)?.position;
            const toPos = (cable.a.owner.id === f.from ? cable.b : cable.a).owner.id;
            const target = net.device(toPos)?.position;
            if (!fromPos || !target) return null;
            const t = Math.min(1, Math.max(0, (now - f.start) / (f.end - f.start || 1)));
            return (
              <circle
                key={i}
                cx={fromPos.x + (target.x - fromPos.x) * t}
                cy={fromPos.y + (target.y - fromPos.y) * t}
                r={6}
                className={`packet ${f.protocol}`}
              />
            );
          })}
        {devices.map((d) => {
          const isSelected = selected?.kind === 'device' && selected.id === d.id;
          const pending = session.cableStart === d.id;
          const sub = subtitle(d);
          const label = d instanceof Host && d.showIpAsName && sub ? sub : d.name;
          return (
            <g
              key={d.id}
              className={`device ${isSelected ? 'selected' : ''} ${pending ? 'pending' : ''}`}
              transform={`translate(${d.position.x}, ${d.position.y})`}
              onPointerDown={(e) => {
                onDevicePointerDown(e, d);
              }}
              onDoubleClick={() => {
                openDevice(session, d);
              }}
              onKeyDown={(e) => {
                onDeviceKeyDown(e, d);
              }}
              tabIndex={0}
              role="button"
              aria-label={`${d.name}${sub ? ` (${sub})` : ''}`}
              aria-pressed={isSelected}
              data-device={d.id}
            >
              <rect
                x={-ICON / 2 - 8}
                y={-ICON / 2 - 8}
                width={ICON + 16}
                height={ICON + 16}
                rx={10}
                className="halo"
              />
              <g transform={`translate(${-ICON / 2}, ${-ICON / 2})`}>
                <DeviceIcon kind={d.kind} size={ICON} />
              </g>
              <text y={ICON / 2 + 18} className="device-label">
                {label}
              </text>
              {sub && label !== sub && (
                <text y={ICON / 2 + 34} className="device-sub">
                  {sub}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {devices.length === 0 && (
        <div className="canvas-empty">
          <p>
            <strong>Le plan est vide.</strong>
          </p>
          <p>
            Ajoutez des équipements depuis la palette (clic ou glisser-déposer), reliez-les avec l’outil
            Câble,
          </p>
          <p>
            ou{' '}
            <button
              type="button"
              className="link"
              onClick={() => {
                session.loadExample();
              }}
            >
              chargez le réseau d’exemple
            </button>
            .
          </p>
        </div>
      )}
    </div>
  );
}
