import { useId, type ReactNode } from 'react';
import type { DeviceKind } from '../../engine/devices/device';
import { figureInfo, type FigureId } from '../../learn/content/figures';
import { DeviceIcon } from '../components/DeviceIcon';

/* The figures of the knowledge cards (see learn/content/figures.ts): small
 * drawings made with the icons of the plan, in the colours of the
 * application, readable on paper. */

const ICON = 48;

/** Identifiers of the arrow heads of one figure (several figures may be on the page). */
interface Arrows {
  readonly accent: string;
  readonly ok: string;
}

function Icon({ kind, x, y, size = ICON }: { kind: DeviceKind; x: number; y: number; size?: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <DeviceIcon kind={kind} size={size} />
    </g>
  );
}

function Label({
  x,
  y,
  children,
  className = '',
  anchor = 'middle',
}: {
  x: number;
  y: number;
  children: ReactNode;
  className?: string;
  anchor?: 'start' | 'middle' | 'end';
}) {
  return (
    <text x={x} y={y} textAnchor={anchor} className={className}>
      {children}
    </text>
  );
}

function Arrow({
  from,
  to,
  color,
  arrows,
  dashed = false,
}: {
  from: readonly [number, number];
  to: readonly [number, number];
  color: 'accent' | 'ok';
  arrows: Arrows;
  dashed?: boolean;
}) {
  return (
    <line
      x1={from[0]}
      y1={from[1]}
      x2={to[0]}
      y2={to[1]}
      className={`fig-arrow ${color}${dashed ? ' dashed' : ''}`}
      markerEnd={`url(#${arrows[color]})`}
    />
  );
}

/**
 * A text written along a line, above it (`offset` < 0) or below it, never
 * upside down.
 */
function AlongLabel({
  from,
  to,
  offset,
  className,
  children,
}: {
  from: readonly [number, number];
  to: readonly [number, number];
  offset: number;
  className: string;
  children: ReactNode;
}) {
  const [a, b] = from[0] <= to[0] ? [from, to] : [to, from];
  const angle = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  return (
    <text
      transform={`translate(${mx} ${my}) rotate(${angle.toFixed(1)}) translate(0 ${offset})`}
      textAnchor="middle"
      className={className}
    >
      {children}
    </text>
  );
}

function Cable({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  return <line x1={x1} y1={y1} x2={x2} y2={y2} className="fig-cable" />;
}

const LAYERS = [
  { className: 'layer-link', name: 'Liaison', adds: 'adresses MAC (d’un équipement au suivant)' },
  { className: 'layer-network', name: 'Réseau', adds: 'adresses IP (de l’expéditeur au destinataire)' },
  { className: 'layer-transport', name: 'Transport', adds: 'numéro de port (quel logiciel)' },
  { className: 'layer-application', name: 'Application', adds: 'les données (page web, courriel…)' },
] as const;

function Layers() {
  return (
    <>
      {LAYERS.map((layer, i) => {
        const x = 10 + i * 22;
        const y = 10 + i * 42;
        const last = i === LAYERS.length - 1;
        return (
          <g key={layer.name}>
            <rect x={x} y={y} width={500 - i * 44} height={200 - i * 52} rx="8" className={layer.className} />
            <Label x={x + 12} y={y + (last ? 27 : 20)} anchor="start">
              <tspan className="strong">{layer.name}</tspan> — {layer.adds}
            </Label>
          </g>
        );
      })}
    </>
  );
}

const BYTES = ['192', '168', '1', '10'] as const;
const MASK = ['255', '255', '255', '0'] as const;

function AddressParts() {
  return (
    <>
      <Label x={10} y={46} anchor="start" className="muted">
        adresse
      </Label>
      <Label x={10} y={88} anchor="start" className="muted">
        masque
      </Label>
      {BYTES.map((byte, i) => {
        const x = 90 + i * 100;
        return (
          <g key={i}>
            <rect x={x} y={20} width={80} height={40} rx="6" className={i < 3 ? 'zone-a' : 'zone-b'} />
            <Label x={x + 40} y={47} className="mono big">
              {byte}
            </Label>
            <Label x={x + 40} y={88} className="mono muted">
              {MASK[i]}
            </Label>
            {i < 3 && (
              <Label x={x + 90} y={50} className="big">
                .
              </Label>
            )}
          </g>
        );
      })}
      <path d="M90 102 v8 h280 v-8" className="fig-bracket" />
      <Label x={230} y={130} className="accent strong">
        réseau : 192.168.1
      </Label>
      <path d="M390 102 v8 h80 v-8" className="fig-bracket" />
      <Label x={430} y={130} className="ok strong">
        équipement n° 10
      </Label>
    </>
  );
}

/** An address written with its network part in colour, a byte marked as different. */
function Address({
  x,
  y,
  bytes,
  differs,
}: {
  x: number;
  y: number;
  bytes: readonly string[];
  differs?: number;
}) {
  return (
    <text x={x} y={y} className="mono big">
      {bytes.map((byte, i) => (
        <tspan key={i} className={i === differs ? 'danger strong' : i < 3 ? 'accent strong' : 'muted'}>
          {i > 0 ? '.' : ''}
          {byte}
        </tspan>
      ))}
    </text>
  );
}

function SameNetwork() {
  return (
    <>
      <Label x={10} y={18} anchor="start" className="muted">
        On compare la partie réseau : les trois premiers nombres.
      </Label>
      <Address x={20} y={56} bytes={['192', '168', '1', '10']} />
      <Address x={20} y={82} bytes={['192', '168', '1', '25']} />
      <Label x={260} y={74} anchor="start" className="ok strong">
        ✔ même réseau (192.168.1)
      </Label>
      <line x1={10} x2={510} y1={102} y2={102} className="fig-separator" />
      <Address x={20} y={136} bytes={['192', '168', '1', '10']} differs={2} />
      <Address x={20} y={162} bytes={['192', '168', '2', '10']} differs={2} />
      <Label x={260} y={154} anchor="start" className="danger strong">
        ✘ deux réseaux différents
      </Label>
    </>
  );
}

function Gateway({ arrows }: { arrows: Arrows }) {
  return (
    <>
      <rect x={10} y={10} width={330} height={190} rx="10" className="zone-a" />
      <Label x={22} y={30} anchor="start" className="strong">
        Réseau 192.168.1.0
      </Label>
      <rect x={420} y={10} width={170} height={190} rx="10" className="zone-b" />
      <Label x={432} y={30} anchor="start" className="strong">
        Réseau 10.0.0.0
      </Label>
      <Cable x1={78} y1={94} x2={170} y2={94} />
      <Cable x1={218} y1={94} x2={356} y2={94} />
      <Cable x1={404} y1={94} x2={500} y2={94} />
      <Icon kind="computer" x={30} y={70} />
      <Icon kind="switch" x={170} y={70} />
      <Icon kind="router" x={356} y={70} />
      <Icon kind="server" x={500} y={70} />
      <Label x={22} y={140} anchor="start" className="strong">
        Poste
      </Label>
      <Label x={22} y={156} anchor="start" className="mono">
        192.168.1.10
      </Label>
      <Label x={22} y={174} anchor="start" className="accent strong">
        passerelle : 192.168.1.1
      </Label>
      <Label x={194} y={140}>
        Switch
      </Label>
      <Label x={380} y={60} className="strong">
        Routeur
      </Label>
      <Label x={352} y={140} anchor="end" className="mono accent strong">
        192.168.1.1
      </Label>
      <Label x={408} y={140} anchor="start" className="mono">
        10.0.0.1
      </Label>
      <Label x={524} y={140} className="strong">
        Serveur
      </Label>
      <Label x={524} y={156} className="mono">
        10.0.0.80
      </Label>
      <path
        d="M196 168 Q 290 182 330 148"
        className="fig-arrow accent dashed"
        markerEnd={`url(#${arrows.accent})`}
      />
    </>
  );
}

function Arp({ arrows }: { arrows: Arrows }) {
  return (
    <>
      <Cable x1={68} y1={74} x2={210} y2={74} />
      <Cable x1={258} y1={74} x2={470} y2={28} />
      <Cable x1={258} y1={74} x2={470} y2={120} />
      <Icon kind="computer" x={20} y={50} />
      <Icon kind="switch" x={210} y={50} />
      <Icon kind="computer" x={470} y={4} />
      <Icon kind="computer" x={470} y={96} />
      <Label x={10} y={120} anchor="start" className="strong">
        A · 192.168.1.10
      </Label>
      <Label x={234} y={120}>
        Switch
      </Label>
      <Label x={494} y={70} className="strong">
        B · 192.168.1.20
      </Label>
      <Label x={494} y={162} className="strong">
        C · 192.168.1.30
      </Label>
      <Label x={494} y={177} className="muted">
        ignore la demande
      </Label>
      <Arrow from={[74, 63]} to={[204, 63]} color="accent" arrows={arrows} dashed />
      <Arrow from={[262, 63]} to={[462, 19]} color="accent" arrows={arrows} dashed />
      <Arrow from={[264, 66]} to={[462, 107]} color="accent" arrows={arrows} dashed />
      <Label x={139} y={54} className="accent strong">
        ①
      </Label>
      <Arrow from={[466, 40]} to={[266, 85]} color="ok" arrows={arrows} />
      <Arrow from={[204, 86]} to={[74, 86]} color="ok" arrows={arrows} />
      <Label x={139} y={102} className="ok strong">
        ②
      </Label>
      <Label x={10} y={208} anchor="start">
        <tspan className="accent strong">①</tspan> A demande à tous : « Qui a l’adresse 192.168.1.20 ? »
      </Label>
      <Label x={10} y={228} anchor="start">
        <tspan className="ok strong">②</tspan> Seul B répond : « C’est moi, mon adresse MAC est
        02:00:00:00:00:20. »
      </Label>
    </>
  );
}

function Dns({ arrows }: { arrows: Arrows }) {
  const ask = [
    [74, 92],
    [464, 22],
  ] as const;
  const answer = [
    [464, 38],
    [78, 106],
  ] as const;
  const page = [
    [74, 118],
    [464, 170],
  ] as const;
  return (
    <>
      <Icon kind="computer" x={20} y={80} />
      <Icon kind="server" x={470} y={4} />
      <Icon kind="server" x={470} y={150} />
      <Label x={44} y={150} className="strong">
        Poste
      </Label>
      <Label x={526} y={24} anchor="start" className="strong">
        Serveur DNS
      </Label>
      <Label x={526} y={40} anchor="start" className="mono muted">
        10.0.0.53
      </Label>
      <Label x={526} y={170} anchor="start" className="strong">
        Serveur web
      </Label>
      <Label x={526} y={186} anchor="start" className="mono muted">
        10.0.0.80
      </Label>
      <Arrow from={ask[0]} to={ask[1]} color="accent" arrows={arrows} />
      <AlongLabel from={ask[0]} to={ask[1]} offset={-7} className="accent">
        ① « Quelle est l’adresse de www.college.fr ? »
      </AlongLabel>
      <Arrow from={answer[0]} to={answer[1]} color="ok" arrows={arrows} />
      <AlongLabel from={answer[0]} to={answer[1]} offset={17} className="ok">
        ② « C’est 10.0.0.80. »
      </AlongLabel>
      <Arrow from={page[0]} to={page[1]} color="accent" arrows={arrows} />
      <AlongLabel from={page[0]} to={page[1]} offset={17} className="accent">
        ③ la page est demandée à 10.0.0.80
      </AlongLabel>
    </>
  );
}

const ROUTE: readonly { kind: DeviceKind; name: string; hop?: number }[] = [
  { kind: 'computer', name: 'Poste' },
  { kind: 'box', name: 'Box', hop: 1 },
  { kind: 'router', name: 'Routeur', hop: 2 },
  { kind: 'router', name: 'Routeur', hop: 3 },
  { kind: 'server', name: 'Serveur web' },
];

function Route({ arrows }: { arrows: Arrows }) {
  return (
    <>
      {ROUTE.map((node, i) => {
        const x = 10 + i * 125;
        return (
          <g key={i}>
            {i < ROUTE.length - 1 && (
              <Arrow from={[x + ICON + 4, 64]} to={[x + 125 - 6, 64]} color="accent" arrows={arrows} />
            )}
            <Icon kind={node.kind} x={x} y={40} />
            {node.hop !== undefined && (
              <Label x={x + ICON / 2} y={28} className="accent strong">
                saut {node.hop}
              </Label>
            )}
            <Label x={x + ICON / 2} y={110} className="strong">
              {node.name}
            </Label>
          </g>
        );
      })}
    </>
  );
}

type Point = readonly [number, number];

/** A small network: cables first, so that the icons, drawn centred on their point, hide their ends. */
function Mesh({
  nodes,
  cables,
  wires = [],
}: {
  nodes: readonly { kind: DeviceKind; at: Point }[];
  cables: readonly (readonly [number, number])[];
  /** Cables that do not join two drawn devices (the shared cable of a bus). */
  wires?: readonly (readonly [Point, Point])[];
}) {
  const size = (kind: DeviceKind) => (kind === 'computer' ? 32 : 38);
  return (
    <>
      {wires.map(([from, to], i) => (
        <Cable key={`wire-${i}`} x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} />
      ))}
      {cables.map(([a, b]) => {
        const [from, to] = [nodes[a]?.at, nodes[b]?.at];
        return from && to ? (
          <Cable key={`${a}-${b}`} x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} />
        ) : null;
      })}
      {nodes.map((node, i) => (
        <Icon
          key={i}
          kind={node.kind}
          x={node.at[0] - size(node.kind) / 2}
          y={node.at[1] - size(node.kind) / 2}
          size={size(node.kind)}
        />
      ))}
    </>
  );
}

/** Second row: the topologies of older networks, under the three of today. */
const ROW = 255;

const BUS_Y = ROW + 130;
const BUS_X = [65, 135, 205, 275] as const;

const RING_CENTRE: Point = [495, ROW + 130];
const RING = [-90, -18, 54, 126, 198].map((angle): Point => {
  const radians = (angle * Math.PI) / 180;
  return [
    Math.round(RING_CENTRE[0] + 72 * Math.cos(radians)),
    Math.round(RING_CENTRE[1] + 72 * Math.sin(radians)),
  ];
});

const TOPOLOGIES: readonly {
  name: string;
  hint: string;
  /** Centre of the panel, and its row. */
  middle: number;
  row: 0 | 1;
  nodes: readonly { kind: DeviceKind; at: Point }[];
  cables: readonly (readonly [number, number])[];
  wires?: readonly (readonly [Point, Point])[];
}[] = [
  {
    name: 'En étoile',
    middle: 110,
    row: 0,
    hint: 'un switch au centre',
    nodes: [
      { kind: 'switch', at: [110, 128] },
      { kind: 'computer', at: [40, 70] },
      { kind: 'computer', at: [180, 70] },
      { kind: 'computer', at: [40, 186] },
      { kind: 'computer', at: [180, 186] },
    ],
    cables: [
      [0, 1],
      [0, 2],
      [0, 3],
      [0, 4],
    ],
  },
  {
    name: 'En arbre',
    middle: 330,
    row: 0,
    hint: 'des étoiles reliées entre elles',
    nodes: [
      { kind: 'switch', at: [330, 66] },
      { kind: 'switch', at: [275, 130] },
      { kind: 'switch', at: [385, 130] },
      { kind: 'computer', at: [247, 192] },
      { kind: 'computer', at: [303, 192] },
      { kind: 'computer', at: [357, 192] },
      { kind: 'computer', at: [413, 192] },
    ],
    cables: [
      [0, 1],
      [0, 2],
      [1, 3],
      [1, 4],
      [2, 5],
      [2, 6],
    ],
  },
  {
    name: 'Maillée',
    middle: 550,
    row: 0,
    hint: 'plusieurs chemins possibles',
    nodes: [
      { kind: 'router', at: [490, 72] },
      { kind: 'router', at: [610, 72] },
      { kind: 'router', at: [490, 180] },
      { kind: 'router', at: [610, 180] },
    ],
    cables: [
      [0, 1],
      [0, 2],
      [1, 3],
      [2, 3],
      [0, 3],
    ],
  },
  {
    name: 'En bus (anciens réseaux)',
    middle: 165,
    row: 1,
    hint: 'un seul câble partagé par tous',
    nodes: BUS_X.map((x, i) => ({ kind: 'computer', at: [x, BUS_Y + (i % 2 === 0 ? -50 : 50)] })),
    cables: [],
    wires: [
      [
        [30, BUS_Y],
        [300, BUS_Y],
      ],
      ...BUS_X.map((x, i): readonly [Point, Point] => [
        [x, BUS_Y],
        [x, BUS_Y + (i % 2 === 0 ? -50 : 50)],
      ]),
    ],
  },
  {
    name: 'En anneau (anciens réseaux)',
    middle: 495,
    row: 1,
    hint: 'chacun relié à ses deux voisins',
    nodes: RING.map((at) => ({ kind: 'computer', at })),
    cables: RING.map((_, i) => [i, (i + 1) % RING.length] as const),
  },
];

function Topologies() {
  return (
    <>
      <line x1={220} x2={220} y1={10} y2={240} className="fig-separator" />
      <line x1={440} x2={440} y1={10} y2={240} className="fig-separator" />
      <line x1={10} x2={650} y1={ROW} y2={ROW} className="fig-separator" />
      <line x1={330} x2={330} y1={ROW + 10} y2={ROW + 240} className="fig-separator" />
      {TOPOLOGIES.map((topology) => {
        const top = topology.row * ROW;
        return (
          <g key={topology.name}>
            <Label x={topology.middle} y={top + 24} className="strong">
              {topology.name}
            </Label>
            <Mesh nodes={topology.nodes} cables={topology.cables} wires={topology.wires ?? []} />
            <Label x={topology.middle} y={top + 238} className="muted">
              {topology.hint}
            </Label>
          </g>
        );
      })}
    </>
  );
}

const DRAWINGS: Record<FigureId, { width: number; height: number; draw: (arrows: Arrows) => ReactNode }> = {
  couches: { width: 520, height: 220, draw: () => <Layers /> },
  'adresse-ip': { width: 520, height: 140, draw: () => <AddressParts /> },
  'meme-reseau': { width: 520, height: 180, draw: () => <SameNetwork /> },
  passerelle: { width: 600, height: 210, draw: (arrows) => <Gateway arrows={arrows} /> },
  arp: { width: 560, height: 238, draw: (arrows) => <Arp arrows={arrows} /> },
  dns: { width: 640, height: 205, draw: (arrows) => <Dns arrows={arrows} /> },
  'chemin-internet': { width: 640, height: 125, draw: (arrows) => <Route arrows={arrows} /> },
  topologies: { width: 660, height: 505, draw: () => <Topologies /> },
};

/** A figure of the knowledge cards, with its caption; nothing for an unknown name. */
export function Figure({ id }: { id: string }) {
  const base = useId().replace(/[^a-zA-Z0-9]/g, '');
  const info = figureInfo(id);
  if (!info) return null;
  const drawing = DRAWINGS[id as FigureId];
  const arrows: Arrows = { accent: `fig-${base}-accent`, ok: `fig-${base}-ok` };
  return (
    <figure className="notion-figure">
      <svg
        className="fig"
        viewBox={`0 0 ${drawing.width} ${drawing.height}`}
        style={{ maxWidth: drawing.width }}
        role="img"
        aria-label={info.title}
      >
        <desc>{info.description}</desc>
        <defs>
          {(['accent', 'ok'] as const).map((color) => (
            <marker
              key={color}
              id={arrows[color]}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0 0 L10 5 L0 10 z" className={`fig-head ${color}`} />
            </marker>
          ))}
        </defs>
        {drawing.draw(arrows)}
      </svg>
      <figcaption>{info.title}</figcaption>
    </figure>
  );
}
