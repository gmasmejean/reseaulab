import { APP_IDS } from '../../engine/services/catalog';
import { TERMINAL_COMMANDS } from '../../engine/terminal/terminal';
import { APP_INFO, DEVICE_LABEL } from '../../i18n/fr';
import {
  PROFILE_LABEL,
  PROFILE_LEVELS,
  can,
  type Feature,
  type ProfileLevel,
  type ProfileSpec,
} from '../../learn/profile/capabilities';
import { useSession } from '../context';

const FEATURE_LABEL: Record<Feature, string> = {
  wifi: 'Wi-Fi',
  'dhcp-client': 'configuration automatique (DHCP)',
  gateway: 'passerelle',
  'dns-field': 'serveur DNS',
  'static-routes': 'routes statiques',
  rip: 'routage automatique (RIP)',
  'router-firewall': 'pare-feu du routeur',
  capture: 'échanges de données',
  'mac-table': 'table des adresses MAC',
  tables: 'tables de routage et ARP',
  notes: 'textes et zones',
};

const LEVEL_HINT: Record<ProfileLevel, string> = {
  '5e': 'Composants d’un réseau local : ordinateurs, switch, liaisons, Wi-Fi, navigateur et serveur web.',
  '4e': 'Adressage : adresse IP et masque, DHCP, ligne de commande (ipconfig, ping), échanges de données.',
  '3e': 'Plusieurs réseaux : routeur, passerelle, routage, DNS, messagerie, pare-feu.',
  complet: 'Tout ce que propose RéseauLab, sans restriction.',
};

/** What a level leaves out, as a sentence per family. */
function hiddenBy(profile: ProfileSpec): string[] {
  const lines: string[] = [];
  const devices = (['computer', 'laptop', 'switch', 'router'] as const).filter(
    (kind) => !can(profile, `device:${kind}`),
  );
  if (devices.length > 0) lines.push(`Équipements : ${devices.map((k) => DEVICE_LABEL[k]).join(', ')}.`);
  const apps = APP_IDS.filter((app) => !can(profile, `app:${app}`));
  if (apps.length > 0) lines.push(`Logiciels : ${apps.map((a) => APP_INFO[a].name).join(', ')}.`);
  const commands = TERMINAL_COMMANDS.filter((command) => !can(profile, `cmd:${command}`));
  if (commands.length > 0) lines.push(`Commandes : ${commands.join(', ')}.`);
  const features = (Object.keys(FEATURE_LABEL) as Feature[]).filter((f) => !can(profile, `feature:${f}`));
  if (features.length > 0)
    lines.push(`Réglages et outils : ${features.map((f) => FEATURE_LABEL[f]).join(', ')}.`);
  return lines;
}

/** « Réglages » : the teacher chooses what RéseauLab offers to the class. */
export function SettingsWindow() {
  const session = useSession();
  const current = session.profile.base;
  const hidden = hiddenBy(session.profile);
  return (
    <div className="settings">
      <h2>Niveau de la classe</h2>
      <p className="muted">
        RéseauLab ne propose que ce qui correspond au niveau choisi. Le choix est gardé sur ce poste. Ce qui
        est déjà sur le plan continue de fonctionner, même au-delà du niveau.
      </p>
      <div className="level-choice" role="radiogroup" aria-label="Niveau de la classe">
        {PROFILE_LEVELS.map((level) => (
          <label key={level} className={current === level ? 'chosen' : ''}>
            <input
              type="radio"
              name="niveau"
              checked={current === level}
              onChange={() => {
                session.setProfileLevel(level);
              }}
            />
            <span>
              <b>{PROFILE_LABEL[level]}</b>
              <span className="muted small"> — {LEVEL_HINT[level]}</span>
            </span>
          </label>
        ))}
      </div>
      <section aria-label="Ce qui est masqué">
        <h3>Masqué à ce niveau</h3>
        {hidden.length === 0 ? (
          <p className="muted">Rien : tout est proposé.</p>
        ) : (
          <ul>
            {hidden.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
