import { Host } from '../../engine/devices/host';
import type { Network } from '../../engine/network';
import { subtitle } from '../components/Canvas';
import { DeviceIcon } from '../components/DeviceIcon';

const ICON = 44;
const MARGIN = 70;

/**
 * Picture of the plan for the report: devices, links, names and addresses,
 * framed on what is drawn. Nothing can be clicked.
 */
export function PlanFigure({ network }: { network: Network }) {
  const devices = network.devices;
  const notes = network.notes;
  if (devices.length === 0 && notes.length === 0) return <p className="muted">Le plan est vide.</p>;
  const xs = [...devices.map((d) => d.position.x), ...notes.flatMap((n) => [n.x, n.x + n.width])];
  const ys = [...devices.map((d) => d.position.y), ...notes.flatMap((n) => [n.y, n.y + n.height])];
  const left = Math.min(...xs) - MARGIN;
  const top = Math.min(...ys) - MARGIN / 2;
  const width = Math.max(...xs) - left + MARGIN;
  const height = Math.max(...ys) - top + MARGIN;
  return (
    <svg
      className="plan-figure"
      viewBox={`${left} ${top} ${width} ${height}`}
      role="img"
      aria-label="Plan du réseau"
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      {notes
        .filter((n) => n.kind === 'zone')
        .map((n) => (
          <g key={n.id}>
            <rect
              x={n.x}
              y={n.y}
              width={n.width}
              height={n.height}
              rx={8}
              fill={n.color}
              className="figure-zone"
            />
            <text x={n.x + 8} y={n.y + 18} className="figure-note">
              {n.text}
            </text>
          </g>
        ))}
      {network.cables.map((c) => {
        const a = network.device(c.a)?.position;
        const b = network.device(c.b)?.position;
        if (!a || !b) return null;
        return (
          <line
            key={c.id}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            className={c.wireless ? 'figure-cable wireless' : 'figure-cable'}
          />
        );
      })}
      {notes
        .filter((n) => n.kind === 'text')
        .map((n) => (
          <text
            key={n.id}
            x={n.x}
            y={n.y + n.fontSize}
            fill={n.color}
            fontSize={n.fontSize}
            fontWeight={n.bold ? 700 : 400}
            fontStyle={n.italic ? 'italic' : 'normal'}
          >
            {n.text}
          </text>
        ))}
      {devices.map((d) => {
        const sub = subtitle(d);
        const label = d instanceof Host && d.showIpAsName && sub ? sub : d.name;
        return (
          <g key={d.id} transform={`translate(${d.position.x}, ${d.position.y})`}>
            <g transform={`translate(${-ICON / 2}, ${-ICON / 2})`}>
              <DeviceIcon kind={d.kind} size={ICON} />
            </g>
            <text y={ICON / 2 + 15} className="figure-label">
              {label}
            </text>
            {sub && sub !== label && (
              <text y={ICON / 2 + 29} className="figure-sub">
                {sub}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
