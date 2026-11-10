import type { DeviceKind } from '../../engine/devices/device';

/** Original, simple line icons for each device type (64×64 viewBox). */
export function DeviceIcon({ kind, size = 56 }: { kind: DeviceKind; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className={`device-icon ${kind}`}>
      {kind === 'computer' && (
        <g>
          <rect x="8" y="8" width="48" height="34" rx="3" className="body" />
          <rect x="12" y="12" width="40" height="26" rx="1" className="screen" />
          <rect x="26" y="42" width="12" height="7" className="body" />
          <rect x="16" y="49" width="32" height="5" rx="2" className="body" />
        </g>
      )}
      {kind === 'laptop' && (
        <g>
          <rect x="12" y="12" width="40" height="28" rx="3" className="body" />
          <rect x="16" y="16" width="32" height="20" rx="1" className="screen" />
          <path d="M4 44 h56 l-4 8 h-48 z" className="body" />
        </g>
      )}
      {kind === 'server' && (
        <g>
          <rect x="14" y="6" width="36" height="52" rx="3" className="body" />
          {[14, 26, 38].map((y) => (
            <g key={y}>
              <rect x="19" y={y} width="26" height="8" rx="1" className="screen" />
              <circle cx="40" cy={y + 4} r="1.6" className="light" />
            </g>
          ))}
        </g>
      )}
      {kind === 'printer' && (
        <g>
          <rect x="18" y="8" width="28" height="16" className="screen" />
          <rect x="8" y="22" width="48" height="24" rx="4" className="body" />
          <rect x="16" y="38" width="32" height="18" className="screen" />
          <path d="M21 44 h22 M21 50 h16" className="arrows" />
          <circle cx="48" cy="29" r="1.8" className="light" />
        </g>
      )}
      {kind === 'object' && (
        <g>
          <rect x="18" y="26" width="28" height="30" rx="5" className="body" />
          <circle cx="32" cy="41" r="7" className="screen" />
          <path d="M22 18 a14 14 0 0 1 20 0 M26 23 a8 8 0 0 1 12 0" className="arrows" />
        </g>
      )}
      {kind === 'smartphone' && (
        <g>
          <rect x="20" y="6" width="24" height="52" rx="5" className="body" />
          <rect x="23" y="12" width="18" height="36" rx="1" className="screen" />
          <circle cx="32" cy="53" r="2" className="screen" />
        </g>
      )}
      {kind === 'tablet' && (
        <g>
          <rect x="10" y="10" width="44" height="44" rx="5" className="body" />
          <rect x="14" y="14" width="36" height="32" rx="1" className="screen" />
          <circle cx="32" cy="50" r="2" className="screen" />
        </g>
      )}
      {kind === 'switch' && (
        <g>
          <rect x="4" y="20" width="56" height="24" rx="4" className="body" />
          {[12, 22, 32, 42, 52].map((x) => (
            <rect key={x} x={x - 3} y="34" width="6" height="5" className="port" />
          ))}
          <path d="M14 27 h14 m-4 -3 l4 3 l-4 3 M50 27 h-14 m4 -3 l-4 3 l4 3" className="arrows" />
        </g>
      )}
      {kind === 'box' && (
        <g>
          <path d="M21 20 a15 15 0 0 1 22 0 M26 26 a8 8 0 0 1 12 0" className="arrows" />
          <rect x="6" y="32" width="52" height="20" rx="6" className="body" />
          {[14, 21, 28].map((x) => (
            <circle key={x} cx={x} cy="42" r="1.8" className="light" />
          ))}
          {[40, 49].map((x) => (
            <rect key={x} x={x - 3} y="40" width="6" height="5" className="port" />
          ))}
        </g>
      )}
      {kind === 'router' && (
        <g>
          <ellipse cx="32" cy="22" rx="26" ry="9" className="body" />
          <path d="M6 22 v18 a26 9 0 0 0 52 0 v-18" className="body" />
          <path d="M20 22 h24 M40 18 l4 4 l-4 4 M24 18 l-4 4 l4 4" className="arrows" />
        </g>
      )}
    </svg>
  );
}
