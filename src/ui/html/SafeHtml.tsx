import { createElement, type ReactNode } from 'react';

/**
 * Renders untrusted HTML received in the simulation as React elements, keeping
 * only an allow-list of tags and attributes. Scripts, styles, event handlers
 * and external URLs never reach the real page.
 */

const ALLOWED_TAGS = new Set([
  'a',
  'b',
  'blockquote',
  'br',
  'center',
  'code',
  'div',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'img',
  'li',
  'ol',
  'p',
  'pre',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'u',
  'ul',
]);
const VOID_TAGS = new Set(['br', 'hr', 'img']);
/** Content of these tags is dropped entirely. */
const DROPPED_TAGS = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'noscript',
  'template',
  'head',
  'title',
]);

export interface SafeHtmlProps {
  readonly html: string;
  /** Called when a link is clicked, with its raw href. */
  readonly onNavigate: (href: string) => void;
  /** Maps an <img src> to a displayable data: URL (or null while loading / on error). */
  readonly resolveImage: (src: string) => string | null;
}

export function extractTitle(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.title.trim();
}

/** Lists the image sources referenced by a page. */
export function imageSources(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return [...doc.querySelectorAll('img[src]')].map((img) => img.getAttribute('src') ?? '').filter(Boolean);
}

function safeDimension(value: string | null): number | undefined {
  if (value === null) return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 && n <= 2000 ? n : undefined;
}

function convert(node: Node, props: SafeHtmlProps, key: string): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  if (DROPPED_TAGS.has(tag)) return null;
  const children = () => [...el.childNodes].map((child, i) => convert(child, props, `${key}.${i}`));
  if (!ALLOWED_TAGS.has(tag)) return <span key={key}>{children()}</span>;

  const attrs: Record<string, unknown> = { key };
  if (tag === 'a') {
    const href = el.getAttribute('href') ?? '';
    attrs.href = '#';
    attrs.title = href;
    attrs.onClick = (e: { preventDefault: () => void }) => {
      e.preventDefault();
      if (href && !/^\s*(javascript|data|vbscript):/i.test(href)) props.onNavigate(href);
    };
  } else if (tag === 'img') {
    const src = props.resolveImage(el.getAttribute('src') ?? '');
    attrs.alt = el.getAttribute('alt') ?? '';
    const width = safeDimension(el.getAttribute('width'));
    const height = safeDimension(el.getAttribute('height'));
    if (width) attrs.width = width;
    if (height) attrs.height = height;
    if (src === null)
      return (
        <span key={key} className="img-placeholder">
          [image : {(attrs.alt as string) || 'chargement…'}]
        </span>
      );
    attrs.src = src;
  } else if (tag === 'td' || tag === 'th') {
    const colSpan = safeDimension(el.getAttribute('colspan'));
    if (colSpan) attrs.colSpan = colSpan;
  } else if (tag === 'table' && el.getAttribute('border') !== null) {
    attrs.className = 'bordered';
  }
  return VOID_TAGS.has(tag) ? createElement(tag, attrs) : createElement(tag, attrs, ...children());
}

export function SafeHtml(props: SafeHtmlProps) {
  const doc = new DOMParser().parseFromString(props.html, 'text/html');
  return (
    <div className="web-page">{[...doc.body.childNodes].map((n, i) => convert(n, props, String(i)))}</div>
  );
}
