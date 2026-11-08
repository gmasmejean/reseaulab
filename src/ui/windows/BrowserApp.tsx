import { useRef, useState } from 'react';
import type { Host } from '../../engine/devices/host';
import { formatUrl, httpGet, parseUrl, resolveLink, type ParsedUrl } from '../../engine/services/http';
import { isImageData } from '../files';
import { SafeHtml, extractTitle, imageSources } from '../html/SafeHtml';

type Page =
  | { readonly kind: 'blank' }
  | { readonly kind: 'loading'; readonly url: string }
  | { readonly kind: 'error'; readonly url: string; readonly message: string }
  | {
      readonly kind: 'page';
      readonly url: string;
      readonly status: number;
      readonly type: string;
      readonly body: string;
    };

function normalize(input: string): string {
  const text = input.trim();
  return /^http:\/\//i.test(text) ? text : `http://${text}`;
}

export function BrowserApp({ host }: { host: Host }) {
  const [address, setAddress] = useState('');
  const [page, setPage] = useState<Page>({ kind: 'blank' });
  const [images, setImages] = useState<ReadonlyMap<string, string>>(new Map());
  const [history, setHistory] = useState<readonly string[]>([]);
  const request = useRef(0);

  const loadImages = (base: ParsedUrl, html: string, id: number) => {
    for (const src of new Set(imageSources(html))) {
      const url = resolveLink(base, src);
      httpGet(host, url, (result) => {
        if (request.current !== id || result.kind !== 'ok') return;
        const body = result.response.body;
        if (result.response.status === 200 && isImageData(body)) {
          setImages((prev) => new Map(prev).set(url, body));
        }
      });
    }
  };

  const navigate = (input: string, remember = true) => {
    const url = normalize(input);
    const parsed = parseUrl(url);
    if (!parsed) {
      setPage({ kind: 'error', url: input, message: 'Adresse invalide. Exemple : http://www.college.fr/' });
      return;
    }
    const full = formatUrl(parsed);
    if (remember && page.kind !== 'blank' && page.kind !== 'loading') {
      const previous = page.url;
      setHistory((h) => [...h, previous]);
    }
    const id = ++request.current;
    setAddress(full);
    setImages(new Map());
    setPage({ kind: 'loading', url: full });
    httpGet(host, full, (result) => {
      if (request.current !== id) return;
      if (result.kind === 'error') {
        setPage({ kind: 'error', url: full, message: result.message });
        return;
      }
      const { status, headers, body } = result.response;
      const type = headers['content-type'] ?? 'text/html';
      setPage({ kind: 'page', url: full, status, type, body });
      if (type === 'text/html') loadImages(parsed, body, id);
    });
  };

  const base = page.kind === 'page' ? parseUrl(page.url) : null;
  const title = page.kind === 'page' && page.type === 'text/html' ? extractTitle(page.body) : '';
  return (
    <div className="browser">
      <form
        className="browser-bar"
        onSubmit={(e) => {
          e.preventDefault();
          if (address.trim()) navigate(address);
        }}
      >
        <button
          type="button"
          aria-label="Page précédente"
          disabled={history.length === 0}
          onClick={() => {
            const previous = history.at(-1);
            setHistory((h) => h.slice(0, -1));
            if (previous) navigate(previous, false);
          }}
        >
          ←
        </button>
        <button
          type="button"
          aria-label="Actualiser"
          disabled={page.kind === 'blank'}
          onClick={() => {
            if (page.kind !== 'blank') navigate(page.url, false);
          }}
        >
          ⟳
        </button>
        <input
          aria-label="Adresse"
          placeholder="http://www.college.fr/"
          value={address}
          onChange={(e) => {
            setAddress(e.target.value);
          }}
        />
        <button type="submit" className="primary">
          Aller
        </button>
      </form>
      <div className="browser-status">
        {page.kind === 'loading' && 'Chargement…'}
        {page.kind === 'page' && `${page.status} — ${title || page.url}`}
        {page.kind === 'error' && 'Erreur'}
        {page.kind === 'blank' && 'Saisissez une adresse web.'}
      </div>
      <div className="browser-view">
        {page.kind === 'error' && (
          <div className="browser-error">
            <h2>Impossible d’afficher la page</h2>
            <p>{page.message}</p>
          </div>
        )}
        {page.kind === 'page' && page.type === 'text/html' && base && (
          <SafeHtml
            html={page.body}
            onNavigate={(href) => {
              navigate(resolveLink(base, href));
            }}
            resolveImage={(src) => images.get(resolveLink(base, src)) ?? null}
          />
        )}
        {page.kind === 'page' && page.type.startsWith('image/') && isImageData(page.body) && (
          <img src={page.body} alt={page.url} />
        )}
        {page.kind === 'page' && page.type !== 'text/html' && !page.type.startsWith('image/') && (
          <pre>{page.body}</pre>
        )}
      </div>
    </div>
  );
}
