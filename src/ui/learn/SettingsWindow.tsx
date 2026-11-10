import { useRef } from 'react';
import { APP_IDS } from '../../engine/services/catalog';
import { TERMINAL_COMMANDS } from '../../engine/terminal/terminal';
import { APP_INFO, DEVICE_KINDS, DEVICE_LABEL } from '../../i18n/fr';
import {
  PROFILE_LABEL,
  PROFILE_LEVELS,
  can,
  type Feature,
  type ProfileLevel,
  type ProfileSpec,
} from '../../learn/profile/capabilities';
import { DEFAULT_PACK } from '../../learn/content/default-pack';
import { serializePack } from '../../learn/content/schema';
import { MESSAGES } from '../../learn/diagnose/messages.fr';
import { useSession } from '../context';
import { downloadText } from '../files';

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
  const devices = DEVICE_KINDS.filter((kind) => !can(profile, `device:${kind}`));
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
  const pack = session.localPackSummary;
  const packInput = useRef<HTMLInputElement>(null);
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
      <section aria-label="Activités">
        <h3>Activités</h3>
        <p className="muted">
          Écrivez vos propres activités : consignes par étapes et objectifs que RéseauLab vérifie.
        </p>
        <button
          type="button"
          onClick={() => {
            session.openWindow({ type: 'author' });
          }}
        >
          Créer une activité
        </button>
      </section>
      <section aria-label="Pack pédagogique">
        <h3>Pack pédagogique</h3>
        <p className="muted">
          Fiches de connaissances, questions du quiz et messages du diagnostic sont modifiables par un
          fichier. Exportez le contenu fourni, modifiez-le dans un éditeur de texte, puis importez-le.
        </p>
        <p>
          {pack
            ? `Pack installé sur ce poste : ${pack.notions} fiche(s), ${pack.questions} question(s), ${pack.messages} message(s) modifiés, ${pack.hidden} élément(s) masqué(s).`
            : 'Contenu d’origine, sans modification.'}
        </p>
        <div className="button-row">
          <button
            type="button"
            onClick={() => {
              downloadText(
                'reseaulab.pack.reseaulab.json',
                serializePack({
                  notions: DEFAULT_PACK.notions,
                  questions: DEFAULT_PACK.questions,
                  messages: MESSAGES,
                }),
              );
              session.notify(
                'Contenu fourni exporté dans vos téléchargements : reseaulab.pack.reseaulab.json',
              );
            }}
          >
            Exporter le contenu fourni
          </button>
          <button type="button" onClick={() => packInput.current?.click()}>
            Importer un pack…
          </button>
          <input
            ref={packInput}
            type="file"
            accept=".json,application/json"
            hidden
            data-testid="import-pack"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              file
                .text()
                .then((text) => session.importPack(text))
                .catch(() => {
                  session.notify('Lecture du fichier impossible.', 'error');
                });
            }}
          />
          {pack && (
            <button
              type="button"
              className="danger"
              onClick={() => {
                session.resetPack();
              }}
            >
              Revenir au contenu d’origine
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
