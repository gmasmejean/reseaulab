import { useState } from 'react';
import { lexicon, searchNotions } from '../../learn/content/merge';
import { CATEGORIES, CATEGORY_LABEL, LEVELS, type Level, type Notion } from '../../learn/content/types';
import { useSession } from '../context';
import { RichText } from './RichText';

/** Levels shown: every card, or those met up to a school year. */
type LevelFilter = 'all' | Level;

const FILTER_LABEL: Record<LevelFilter, string> = {
  all: 'Tous les niveaux',
  '5e': 'Niveau 5e',
  '4e': 'Jusqu’en 4e',
  '3e': 'Jusqu’en 3e',
};

function upTo(notion: Notion, filter: LevelFilter): boolean {
  if (filter === 'all' || notion.category === 'guide') return true;
  return LEVELS.indexOf(notion.level) <= LEVELS.indexOf(filter);
}

/** One knowledge card. */
function Card({ notion, onOpen }: { notion: Notion; onOpen: (id: string) => void }) {
  const session = useSession();
  const related = notion.related.map((id) => session.notion(id)).filter((n): n is Notion => n !== undefined);
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
      <RichText
        source={notion.body}
        onOpenNotion={onOpen}
        titleOf={(id) => session.notion(id)?.title ?? null}
      />
      {notion.image && <img className="notion-image" src={notion.image.data} alt={notion.image.alt} />}
      {notion.example !== undefined && (
        <p className="notion-example">
          <b>Exemple.</b> {notion.example}
        </p>
      )}
      {notion.remember.length > 0 && (
        <section className="notion-remember">
          <h3>À retenir</h3>
          <ul>
            {notion.remember.map((line) => (
              <li key={line}>{line}</li>
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
        <p>
          <button
            type="button"
            onClick={() => {
              session.openQuiz(notion.id);
            }}
          >
            S’entraîner sur cette notion
          </button>
        </p>
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
  const [current, setCurrent] = useState<string | undefined>(() =>
    asked !== undefined && session.notion(asked) ? asked : notions[0]?.id,
  );
  /** Cards read before the current one, for the « Retour » button. */
  const [trail, setTrail] = useState<readonly string[]>([]);
  const shown = session.notion(current ?? '') ?? notions[0];

  const open = (id: string) => {
    if (id === shown?.id || !session.notion(id)) return;
    if (shown) setTrail([...trail, shown.id]);
    setCurrent(id);
  };
  const back = () => {
    const previous = trail.at(-1);
    if (previous === undefined) return;
    setTrail(trail.slice(0, -1));
    setCurrent(previous);
  };

  const visible = notions.filter((n) => upTo(n, filter));
  const found = searchNotions(visible, query);
  const searching = query.trim() !== '';
  const item = (notion: Notion, label = notion.title) => (
    <li key={`${notion.id}:${label}`}>
      <button
        type="button"
        className={notion.id === shown?.id ? 'active' : ''}
        aria-current={notion.id === shown?.id ? 'true' : undefined}
        onClick={() => {
          open(notion.id);
        }}
      >
        {label}
        {label !== notion.title && <span className="muted small"> → {notion.title}</span>}
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
        <button
          type="button"
          className="primary"
          title="Quelques questions corrigées tout de suite, avec un bilan par notion"
          onClick={() => {
            session.openQuiz();
          }}
        >
          Quiz d’entraînement
        </button>
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
          {searching && found.length > 0 && <ul>{found.map((n) => item(n))}</ul>}
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
          {!searching && view === 'lexicon' && <ul>{lexicon(visible).map((w) => item(w.notion, w.word))}</ul>}
        </div>
      </nav>
      <div className="knowledge-card">
        {trail.length > 0 && (
          <button type="button" className="link" onClick={back}>
            ← Retour
          </button>
        )}
        {shown ? <Card notion={shown} onOpen={open} /> : <p className="muted">Aucune fiche.</p>}
      </div>
    </div>
  );
}
