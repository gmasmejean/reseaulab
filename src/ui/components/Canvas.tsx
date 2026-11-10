import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import { IP_ANY, formatIp } from '../../engine/core/ipv4';
import type { Device, DeviceKind } from '../../engine/devices/device';
import { Host } from '../../engine/devices/host';
import { Switch } from '../../engine/devices/switch';
import { worstFor, type Finding } from '../../learn/diagnose/findings';
import { useSession } from '../context';
import { findingText, useLint } from '../learn/hooks';
import type { Session } from '../session';
import { DeviceIcon } from './DeviceIcon';
import { NoteShape } from './NoteShape';
import { ContextMenu, anchorOf, isMenuKey, type MenuEntry } from './ContextMenu';
import { cableMenu, deviceMenu, noteMenu } from './canvasMenus';

export const DEVICE_DRAG_TYPE = 'application/x-reseaulab-device';
const ICON = 56;

interface Drag {
  /** What is dragged: a device, a note, or the resize handle of a note. */
  readonly target: 'device' | 'note' | 'resize';
  readonly id: string;
  readonly pointerX: number;
  readonly pointerY: number;
  readonly originX: number;
  readonly originY: number;
  moved: boolean;
}

interface OpenMenu {
  readonly target: { readonly kind: 'device' | 'cable' | 'note'; readonly id: string };
  readonly x: number;
  readonly y: number;
  readonly mode: Session['mode'];
  /** Element that gets the focus back when the menu is cancelled. */
  readonly opener: SVGElement;
}

function subtitle(device: Device): string | null {
  // A switch with Wi-Fi clients shows the name of its network.
  if (device instanceof Switch) {
    return device.ports.some((p) => p.cable?.wireless) ? `Wi-Fi « ${device.ssid} »` : null;
  }
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

function menuLabel(session: Session, target: OpenMenu['target']): string {
  const net = session.network;
  if (target.kind === 'device') return `« ${net.device(target.id)?.name ?? ''} »`;
  if (target.kind === 'note') return net.note(target.id)?.kind === 'zone' ? 'la zone' : 'le texte';
  return 'le câble';
}

/**
 * « ! » on a device whose configuration has a problem. A separate element: the
 * accessible name of the device stays its name and address.
 */
function LintMark({ findings, deviceId }: { findings: readonly Finding[]; deviceId: string }) {
  const { network } = useSession();
  const level = worstFor(findings, deviceId);
  if (level !== 'error' && level !== 'warning') return null;
  const shown = findings.filter((f) => f.severity === level);
  return (
    <g className={`lint-mark ${level}`} transform={`translate(${ICON / 2 + 2}, ${-ICON / 2 - 2})`}>
      <title>
        {shown.map((f) => findingText(network, f).title).join(' — ')} (bouton Vérifier pour les détails)
      </title>
      <circle r={10} />
      <text y={5}>!</text>
    </g>
  );
}

export function Canvas() {
  const session = useSession();
  const net = session.network;
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  /** Point of the plan to keep under the pointer after a zoom with the wheel. */
  const anchor = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const devices = net.devices;
  const notes = net.notes;
  // The plan is drawn in its own units and scaled by the zoom.
  const zoom = session.zoom;
  const { width, height } = session.planSize;
  const simulation = session.mode === 'simulation';
  const now = net.scheduler.now;
  const lint = useLint();

  const toSvg = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    return { x: (clientX - (rect?.left ?? 0)) / zoom, y: (clientY - (rect?.top ?? 0)) / zoom };
  };

  // The session needs the size of the stage to fit the plan and place the windows.
  useEffect(() => {
    const element = scrollRef.current;
    // ResizeObserver is absent from jsdom: the plan then keeps its default size.
    if (!element || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      session.setViewport(Math.floor(rect.width), Math.floor(rect.height));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => {
      observer.disconnect();
    };
  }, [session]);

  // Ctrl + wheel zooms around the pointer (a React handler could not cancel the page zoom).
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;
      anchor.current = {
        x: (element.scrollLeft + offsetX) / session.zoom,
        y: (element.scrollTop + offsetY) / session.zoom,
        offsetX,
        offsetY,
      };
      session.zoomStep(event.deltaY < 0 ? 1 : -1);
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      element.removeEventListener('wheel', onWheel);
    };
  }, [session]);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    const kept = anchor.current;
    if (!element || !kept) return;
    anchor.current = null;
    element.scrollLeft = kept.x * zoom - kept.offsetX;
    element.scrollTop = kept.y * zoom - kept.offsetY;
  }, [zoom]);

  const onDevicePointerDown = (event: PointerEvent, device: Device) => {
    event.stopPropagation();
    if (event.button !== 0) return;
    if (session.tool === 'cable' && !simulation) {
      session.cableClick(device.id);
      return;
    }
    drag.current = {
      target: 'device',
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
    const movedX = event.clientX - d.pointerX;
    const movedY = event.clientY - d.pointerY;
    if (!d.moved && Math.hypot(movedX, movedY) < 4) return;
    d.moved = true;
    const dx = movedX / zoom;
    const dy = movedY / zoom;
    if (d.target === 'device') {
      net.move(d.id, {
        x: Math.max(40, Math.round(d.originX + dx)),
        y: Math.max(40, Math.round(d.originY + dy)),
      });
    } else if (d.target === 'note') {
      net.updateNote(d.id, {
        x: Math.max(0, Math.round(d.originX + dx)),
        y: Math.max(0, Math.round(d.originY + dy)),
      });
    } else {
      net.updateNote(d.id, {
        width: Math.max(20, Math.round(d.originX + dx)),
        height: Math.max(16, Math.round(d.originY + dy)),
      });
    }
  };

  const onNotePointerDown = (event: PointerEvent, id: string, mode: 'move' | 'resize') => {
    if (event.button !== 0) return;
    const note = net.note(id);
    if (!note) return;
    if (session.cableStart) session.setTool('cable');
    drag.current = {
      target: mode === 'move' ? 'note' : 'resize',
      id,
      pointerX: event.clientX,
      pointerY: event.clientY,
      originX: mode === 'move' ? note.x : note.width,
      originY: mode === 'move' ? note.y : note.height,
      moved: false,
    };
    session.select({ kind: 'note', id });
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- absent from jsdom
    svgRef.current?.setPointerCapture?.(event.pointerId);
  };

  /** Click (without drag) or Enter/Space on a device. */
  const activate = (device: Device) => {
    session.select({ kind: 'device', id: device.id });
    if (simulation) openDevice(session, device);
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved || d.target !== 'device') return;
    const device = net.device(d.id);
    if (device) activate(device);
  };

  const onDeviceKeyDown = (event: KeyboardEvent<SVGGElement>, device: Device) => {
    if (onElementMenuKey({ kind: 'device', id: device.id }, event)) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (session.tool === 'cable' && !simulation) session.cableClick(device.id);
    else activate(device);
  };

  /** Right click (or menu key) on an element of the plan. */
  const openMenu = (target: OpenMenu['target'], x: number, y: number, opener: SVGElement) => {
    drag.current = null;
    if (session.cableStart) session.setTool('cable');
    if (!simulation || target.kind === 'device') session.select(target);
    setMenu({ target, x, y, opener, mode: session.mode });
  };

  const onElementMenu =
    (target: OpenMenu['target']) =>
    (event: MouseEvent<SVGGElement>): void => {
      event.preventDefault();
      event.stopPropagation();
      openMenu(target, event.clientX, event.clientY, event.currentTarget);
    };

  /** Menu key or Shift+F10 on a focused element; true when handled. */
  const onElementMenuKey = (target: OpenMenu['target'], event: KeyboardEvent<SVGGElement>): boolean => {
    if (!isMenuKey(event)) return false;
    event.preventDefault();
    const { x, y } = anchorOf(event.currentTarget);
    openMenu(target, x, y, event.currentTarget);
    return true;
  };

  const closeMenu = useCallback(
    (reason: 'cancel' | 'select' | 'outside') => {
      if (reason === 'cancel') menu?.opener.focus();
      setMenu(null);
    },
    [menu],
  );

  /** "Configurer": select the device and move the focus to its settings. */
  const configure = (device: Device) => {
    session.select({ kind: 'device', id: device.id });
    window.setTimeout(() => {
      document.querySelector<HTMLElement>('.panel [role="tab"], .panel input')?.focus();
    }, 0);
  };

  const menuEntries = (open: OpenMenu): MenuEntry[] => {
    if (open.mode !== session.mode) return [];
    const { kind, id } = open.target;
    if (kind === 'cable') return net.cable(id) ? cableMenu(session, id) : [];
    if (kind === 'note') {
      const note = net.note(id);
      return note ? noteMenu(session, note) : [];
    }
    const device = net.device(id);
    return device
      ? deviceMenu(session, device, () => {
          configure(device);
        })
      : [];
  };
  const entries = menu ? menuEntries(menu) : [];

  const onDrop = (event: DragEvent) => {
    const kind = event.dataTransfer.getData(DEVICE_DRAG_TYPE) as DeviceKind | '';
    if (!kind || simulation) return;
    event.preventDefault();
    const p = toSvg(event.clientX, event.clientY);
    session.addDevice(kind, { x: Math.max(40, Math.round(p.x)), y: Math.max(40, Math.round(p.y)) });
  };

  const selected = session.selection;
  return (
    <div className="canvas-scroll" data-tool={session.tool} ref={scrollRef}>
      <svg
        ref={svgRef}
        className={`canvas ${simulation ? 'simulating' : ''}`}
        width={Math.floor(width * zoom)}
        height={Math.floor(height * zoom)}
        viewBox={`0 0 ${width} ${height}`}
        role="application"
        aria-label="Plan du réseau"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerDown={() => {
          if (session.cableStart) session.setTool('cable');
          session.select(null);
        }}
        onContextMenu={(e) => {
          // Like Filius: no menu on the empty plan (and not the browser's one).
          e.preventDefault();
          setMenu(null);
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
        {[...notes]
          .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'zone' ? -1 : 1))
          .map((n) => (
            <NoteShape
              key={n.id}
              note={n}
              selected={selected?.kind === 'note' && selected.id === n.id}
              interactive={!simulation}
              onPointerDown={(e, mode) => {
                onNotePointerDown(e, n.id, mode);
              }}
              onActivate={() => {
                session.select({ kind: 'note', id: n.id });
              }}
              onMenu={(x, y, opener) => {
                openMenu({ kind: 'note', id: n.id }, x, y, opener);
              }}
            />
          ))}
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
              className={`cable ${c.wireless ? 'wireless' : ''} ${active ? 'active' : ''} ${isSelected ? 'selected' : ''}`}
              onPointerDown={(e) => {
                e.stopPropagation();
                if (!simulation) session.select({ kind: 'cable', id: c.id });
              }}
              onContextMenu={onElementMenu({ kind: 'cable', id: c.id })}
              onKeyDown={(e) => {
                if (!simulation && onElementMenuKey({ kind: 'cable', id: c.id }, e)) return;
                if ((e.key === 'Enter' || e.key === ' ') && !simulation) {
                  e.preventDefault();
                  session.select({ kind: 'cable', id: c.id });
                }
              }}
              role="button"
              tabIndex={simulation ? -1 : 0}
              aria-label={`${c.wireless ? 'Wi-Fi' : 'Câble'} ${net.device(c.a)?.name ?? ''} – ${net.device(c.b)?.name ?? ''}`}
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
              onContextMenu={onElementMenu({ kind: 'device', id: d.id })}
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
              <LintMark findings={lint.filter((f) => f.deviceIds.includes(d.id))} deviceId={d.id} />
            </g>
          );
        })}
      </svg>
      {menu && entries.length > 0 && (
        <ContextMenu
          label={`Menu de ${menuLabel(session, menu.target)}`}
          x={menu.x}
          y={menu.y}
          entries={entries}
          onClose={closeMenu}
        />
      )}
      {devices.length === 0 && notes.length === 0 && (
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
