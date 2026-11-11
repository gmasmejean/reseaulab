import { useState } from 'react';
import { TRAFFIC_LEGEND } from '../../learn/diagnose/messages.fr';
import { useSession } from '../context';

/**
 * What helps to read the simulation, in a corner of the plan: a notice while
 * the simulation is paused, the choice of hiding the automatic traffic, and
 * the legend of the frames (folded by default).
 */
export function SimulationOverlay() {
  const session = useSession();
  const [open, setOpen] = useState(false);
  if (session.mode !== 'simulation') return null;
  return (
    <div className="simulation-overlay">
      {session.paused && (
        <p className="pause-notice" role="status">
          ⏸ Simulation en pause — <b>Reprendre</b> ou <b>Trame suivante</b> pour continuer.
        </p>
      )}
      <label
        className="hide-automatic"
        title="Les échanges que les équipements font seuls (adresses DHCP, routes RIP) ne sont plus animés ; ils restent listés dans les échanges de données."
      >
        <input
          type="checkbox"
          checked={session.hideAutomatic}
          onChange={(e) => {
            session.setHideAutomatic(e.target.checked);
          }}
        />
        Masquer le trafic automatique
      </label>
      <div className="legend" data-ui="legende">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => {
            setOpen(!open);
          }}
        >
          {open ? '▾' : '▸'} Légende des trames
        </button>
        {open && (
          <ul aria-label="Légende des trames">
            {TRAFFIC_LEGEND.map((item) => (
              <li key={item.tag}>
                <span className={`legend-chip packet ${item.tag}`} aria-hidden />
                <b>{item.name}</b> : {item.role}
              </li>
            ))}
            <li>
              <span className="legend-chip drop" aria-hidden>
                ✕
              </span>
              <b>Abandon</b> : l’équipement n’a pas pu aller plus loin
            </li>
          </ul>
        )}
      </div>
    </div>
  );
}
