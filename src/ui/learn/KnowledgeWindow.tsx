import { useEffect, useRef, useState } from 'react';
import { lexiconByLetter, searchHits, type Excerpt } from '../../learn/content/merge';
import {
  nextNotion,
  pathCards,
  pathsUpTo,
  readingOrder,
  resumeAt,
  type LevelFilter,
  type PathId,
} from '../../learn/content/order';
import { CATEGORIES, CATEGORY_LABEL, type Notion } from '../../learn/content/types';
import { useSession } from '../context';
import { CardCheck } from './CardCheck';
import { RichLine, RichText } from './RichText';

/** The home page of the help, in the reading history. */
const HOME = '';

const PATH_TITLE: Record<PathId, string> = {
  guide: 'Premiers pas',
  '5e': 'Les notions de 5e',
  '4e': 'Les notions de 4e',
  '3e': 'Les notions de 3e',
};
const PATH_TEXT: Record<PathId, string> = {
  guide: 'Construire un réseau, le faire fonctionner, trouver ce qui ne marche pas.',
  '5e': 'Le matériel d’un réseau, et ce qui le relie.',
  '4e': 'Les adresses des équipements, et comment tester une communication.',
  '3e': 'Passer d’un réseau à l’autre, les protocoles et les services d’Internet.',
};

/**
 * The home page: the first steps, then a path for each school year up to the
 * class's, with what has been read.
 */
function Home({ onFollow }: { onFollow: (path: PathId) => void }) {
  const session = useSession();
  const paths = pathsUpTo(session.profile.base)
    .map((path) => ({ path, cards: pathCards(session.pack.notions, path) }))
    .filter(({ cards }) => cards.length > 0);
  return (
    <section className="knowledge-home" aria-label="Accueil de l’aide">
      <h2>Aide et connaissances</h2>
      <p>
        Suivez un parcours, fiche après fiche, ou cherchez une notion dans la liste. La plupart des fiches se
        terminent par une question pour vérifier.
      </p>
      <ul className="path-list">
        {paths.map(({ path, cards }) => {
          const read = cards.filter((n) => session.readCards.has(n.id)).length;
          const label = read === 0 ? 'Commencer' : read === cards.length ? 'Relire' : 'Continuer';
          return (
            <li key={path} className="path-card">
              <h3>{PATH_TITLE[path]}</h3>
              <p className="muted">{PATH_TEXT[path]}</p>
              <div className="path-progress">
                <progress max={cards.length} value={read} aria-label={`${PATH_TITLE[path]} : fiches lues`} />
                <span className="small">
                  {read} / {cards.length} fiches lues
                </span>
              </div>
              <button
                type="button"
                className={read < cards.length ? 'primary' : ''}
                aria-label={`${label} : ${PATH_TITLE[path]}`}
                onClick={() => {
                  onFollow(path);
                }}
              >
                {label}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Cards remembered for « Retour ». */
const MAX_TRAIL = 30;

const FILTER_LABEL: Record<LevelFilter, string> = {
  all: 'Tous niveaux',
  '5e': 'Niveau 5e',
  '4e': 'Jusqu’en 4e',
  '3e': 'Jusqu’en 3e',
};

/** One knowledge card. */
function Card({ notion, onOpen }: { notion: Notion; onOpen: (id: string) => void }) {
  const session = useSession();
  const related = notion.related.map((id) => session.notion(id)).filter((n): n is Notion => n !== undefined);
  const titleOf = (id: string) => session.notion(id)?.title ?? null;
  return (
    <article className="notion" aria-label={notion.title}>
      <header>
        <h2>{notion.title}</h2>
        {notion.category !== 'guide' && (
          <span className="level-badge" title={`Notion abordée en ${notion.level}`}>
            {notion.level}
          </span>
        )}
      </header>
      <p className="notion-short">{notion.short}</p>
      {notion.remember.length > 0 && (
        <section className="notion-remember" aria-label="À retenir">
          <h3>À retenir</h3>
          <ul>
            {notion.remember.map((line) => (
              <li key={line}>
                <RichLine source={line} onOpenNotion={onOpen} titleOf={titleOf} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <RichText source={notion.body} onOpenNotion={onOpen} titleOf={titleOf} />
      {notion.image && <img className="notion-image" src={notion.image.data} alt={notion.image.alt} />}
      {notion.example !== undefined && (
        <p className="notion-example">
          <b>Exemple.</b> {notion.example}
        </p>
      )}
      {notion.mistakes && notion.mistakes.length > 0 && (
        <section className="notion-mistakes" aria-label="Erreurs fréquentes">
          <h3>Erreurs fréquentes</h3>
          <ul>
            {notion.mistakes.map((mistake) => (
              <li key={mistake.belief}>
                <p className="mistake-belief">
                  <span aria-hidden>✘ </span>
                  <b>On croit que</b>{' '}
                  <RichLine source={mistake.belief} onOpenNotion={onOpen} titleOf={titleOf} />
                </p>
                <p className="mistake-truth">
                  <span aria-hidden>✔ </span>
                  <b>En fait,</b> <RichLine source={mistake.truth} onOpenNotion={onOpen} titleOf={titleOf} />
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
      {notion.inApp !== undefined && (
        <p className="notion-in-app">
          <b>Dans RéseauLab.</b> {notion.inApp}
        </p>
      )}
      {related.length > 0 && (
        <p className="notion-related">
          <b>Voir aussi :</b>{' '}
          {related.map((other, index) => (
            <span key={other.id}>
              {index > 0 && ', '}
              <button
                type="button"
                className="link"
                onClick={() => {
                  onOpen(other.id);
                }}
              >
                {other.title}
              </button>
            </span>
          ))}
        </p>
      )}
      {session.pack.questions.some((q) => q.notion === notion.id) && (
        <CardCheck key={notion.id} notion={notion} />
      )}
      {notion.curriculum !== undefined && <p className="muted small">Programme : {notion.curriculum}</p>}
    </article>
  );
}

/**
 * « Aide et connaissances » : how to use RéseauLab, and the notions to know,
 * as cards one can search, filter by school year and browse from link to link.
 */
export function KnowledgeWindow({ notion: asked }: { notion?: string | undefined }) {
  const session = useSession();
  const notions = session.pack.notions;
  const [query, setQuery] = useState('');
  // Opened on the level of the class; the pupil may still look further.
  const base = session.profile.base;
  const [filter, setFilter] = useState<LevelFilter>(base === '5e' || base === '4e' ? base : 'all');
  const [view, setView] = useState<'cards' | 'lexicon'>('cards');
  // Where the pupil was when the help was last closed: the card asked for
  // comes on top of it, so that « Retour » leads back there. The first time,
  // the home page of the help.
  const exists = (id: string) => id === HOME || session.notion(id) !== undefined;
  const [start] = useState(() => {
    const before = session.reading;
    const last = before.current !== undefined && exists(before.current) ? before.current : undefined;
    const target = asked !== undefined && session.notion(asked) ? asked : (last ?? HOME);
    const trail = last !== undefined && last !== target ? [...before.trail, last] : before.trail;
    return { current: target, trail: trail.filter(exists).slice(-MAX_TRAIL), path: before.path };
  });
  const [current, setCurrent] = useState<string>(start.current);
  /** Cards read before the current one ('' for the home page), for the « Retour » button. */
  const [trail, setTrail] = useState<readonly string[]>(start.trail);
  /** The reading path followed, if any: « Fiche suivante » goes on in it. */
  const [path, setPath] = useState<PathId | undefined>(start.path);
  const shown = current === HOME ? undefined : session.notion(current);
  useEffect(() => {
    session.rememberReading({ current: shown ? shown.id : HOME, trail, ...(path ? { path } : {}) });
    if (shown) session.markRead(shown.id);
  }, [session, shown, trail, path]);
  // Another card is read from its top.
  const reader = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (reader.current) reader.current.scrollTop = 0;
  }, [current]);

  const go = (id: string) => {
    if (id === current || !exists(id)) return;
    setTrail([...trail, current].slice(-MAX_TRAIL));
    setCurrent(id);
  };
  const open = (id: string) => {
    if (session.notion(id)) go(id);
  };
  const back = () => {
    const previous = trail.at(-1);
    if (previous === undefined) return;
    setTrail(trail.slice(0, -1));
    setCurrent(previous);
  };
  const follow = (to: PathId) => {
    const card = resumeAt(pathCards(notions, to), session.readCards);
    if (!card) return;
    setPath(to);
    go(card.id);
  };

  const visible = readingOrder(notions, filter);
  // In a path, the next card of the path; otherwise the next one of the list.
  const inPath = path && shown ? pathCards(notions, path) : [];
  const next = !shown
    ? undefined
    : inPath.some((n) => n.id === shown.id)
      ? nextNotion(inPath, shown.id)
      : nextNotion(visible, shown.id);
  const readCount = visible.filter((n) => session.readCards.has(n.id)).length;
  const found = searchHits(visible, query);
  const searching = query.trim() !== '';
  const item = (notion: Notion, label = notion.title, excerpt?: Excerpt) => (
    <li key={`${notion.id}:${label}`}>
      <button
        type="button"
        className={notion.id === shown?.id ? 'active' : ''}
        aria-current={notion.id === shown?.id ? 'true' : undefined}
        onClick={() => {
          open(notion.id);
        }}
      >
        <span className="knowledge-item-label">
          {label}
          {label !== notion.title && <span className="muted small"> → {notion.title}</span>}
          {excerpt && (
            <span className="knowledge-excerpt">
              {excerpt.before}
              <mark>{excerpt.match}</mark>
              {excerpt.after}
            </span>
          )}
        </span>
        {session.readCards.has(notion.id) && (
          <span className="read-mark" aria-hidden title="Fiche déjà lue">
            ✓
          </span>
        )}
        {notion.category !== 'guide' && (
          <span className="level-tag" aria-hidden title={`Notion abordée en ${notion.level}`}>
            {notion.level}
          </span>
        )}
      </button>
    </li>
  );

  return (
    <div className="knowledge">
      <nav className="knowledge-index" aria-label="Fiches">
        <input
          type="search"
          aria-label="Chercher une notion"
          placeholder="Chercher (ex. passerelle)"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
          }}
        />
        <div className="knowledge-filters">
          <select
            aria-label="Niveau"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value as LevelFilter);
            }}
          >
            {(['all', '5e', '4e'] as const).map((value) => (
              <option key={value} value={value}>
                {FILTER_LABEL[value]}
              </option>
            ))}
          </select>
          <div className="segmented" role="group" aria-label="Présentation">
            {(
              [
                ['cards', 'Fiches'],
                ['lexicon', 'Lexique'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={view === value}
                onClick={() => {
                  setView(value);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="knowledge-list">
          {found.length === 0 && <p className="muted">Aucune fiche ne correspond.</p>}
          {searching && found.length > 0 && (
            <ul>{found.map((hit) => item(hit.notion, hit.notion.title, hit.excerpt))}</ul>
          )}
          {!searching &&
            view === 'cards' &&
            CATEGORIES.map((category) => {
              const cards = visible.filter((n) => n.category === category);
              if (cards.length === 0) return null;
              return (
                <section key={category}>
                  <h3>{CATEGORY_LABEL[category]}</h3>
                  <ul>{cards.map((n) => item(n))}</ul>
                </section>
              );
            })}
          {!searching &&
            view === 'lexicon' &&
            lexiconByLetter(visible).map(({ letter, entries }) => (
              <section key={letter} aria-label={`Lettre ${letter}`}>
                <h3 className="lexicon-letter">{letter}</h3>
                <ul>{entries.map((w) => item(w.notion, w.word))}</ul>
              </section>
            ))}
        </div>
        <p className="knowledge-progress muted small">
          {readCount} fiche{readCount > 1 ? 's' : ''} lue{readCount > 1 ? 's' : ''} sur {visible.length}
          {readCount > 0 && (
            <>
              {' · '}
              <button
                type="button"
                className="link"
                title="Sur un poste partagé : repartir de zéro pour un autre élève"
                onClick={() => {
                  session.clearRead();
                }}
              >
                effacer
              </button>
            </>
          )}
        </p>
        <button
          type="button"
          className="knowledge-quiz"
          title="Quelques questions corrigées tout de suite, avec un bilan par notion"
          onClick={() => {
            session.openQuiz();
          }}
        >
          Quiz d’entraînement
        </button>
      </nav>
      <div className="knowledge-reader">
        <div className="knowledge-steps" role="group" aria-label="Parcourir les fiches">
          <button type="button" onClick={back} disabled={trail.length === 0}>
            ← Retour
          </button>
          <button
            type="button"
            aria-pressed={current === HOME}
            title="Premiers pas et parcours par niveau"
            onClick={() => {
              go(HOME);
            }}
          >
            ⌂ Accueil
          </button>
          {next && (
            <button
              type="button"
              title={`Fiche suivante : ${next.title}`}
              onClick={() => {
                open(next.id);
              }}
            >
              Fiche suivante →
            </button>
          )}
        </div>
        <div className="knowledge-card" ref={reader}>
          {shown ? <Card notion={shown} onOpen={open} /> : <Home onFollow={follow} />}
        </div>
      </div>
    </div>
  );
}
