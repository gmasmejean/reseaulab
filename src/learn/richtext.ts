/* Small formatted text for the knowledge cards and the instructions of an
 * activity: enough to write a clear explanation, nothing that could carry
 * code. It is parsed into a tree that the interface turns into elements; the
 * text of a teacher's file is never inserted as HTML.
 *
 *   Paragraphs are separated by an empty line.
 *   - A line starting with « - » is an item of a list.
 *   **gras**, *italique*, `code`
 *   [[passerelle]] or [[passerelle|sa passerelle]] : link to a knowledge card.
 *   [touche:Ctrl+Z] : keys of the keyboard, drawn as keys.
 *   [[ecran:simulation]] or [[ecran:simulation|le mode Simulation]] : an
 *   element of the screen (see content/screen.ts), shown on demand.
 */

import { screenElement } from './content/screen';

export type Inline =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'bold' | 'italic'; readonly children: readonly Inline[] }
  | { readonly type: 'code'; readonly text: string }
  | { readonly type: 'link'; readonly notion: string; readonly text: string }
  | { readonly type: 'keys'; readonly keys: readonly string[] }
  /** `known`: false for a name that is not in the list (the text stays plain). */
  | { readonly type: 'screen'; readonly target: string; readonly text: string; readonly known: boolean };

/** Prefix of a link to an element of the screen. */
const SCREEN_PREFIX = 'ecran:';

/** « Ctrl+Z » → Ctrl, Z ; « + » alone is the key +. */
function splitKeys(source: string): string[] {
  const text = source.trim();
  if (text === '+') return ['+'];
  return text
    .split(/\s*\+\s*(?=.)/)
    .map((k) => k.trim())
    .filter(Boolean);
}

function linkOrScreen(id: string, label?: string): Inline {
  const target = id.trim();
  if (target.startsWith(SCREEN_PREFIX)) {
    const name = target.slice(SCREEN_PREFIX.length).trim();
    const element = screenElement(name);
    return { type: 'screen', target: name, text: (label ?? element?.label ?? name).trim(), known: !!element };
  }
  return { type: 'link', notion: target, text: (label ?? id).trim() };
}

export type Block =
  | { readonly type: 'paragraph'; readonly content: readonly Inline[] }
  | { readonly type: 'list'; readonly items: readonly (readonly Inline[])[] };

/** Marks of the inline format, tried in this order at each position. */
const MARKS = [
  { pattern: /^`([^`]+)`/, build: (m: string): Inline => ({ type: 'code', text: m }) },
  {
    pattern: /^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/,
    build: linkOrScreen,
  },
  {
    pattern: /^\[touche:([^\]]+)\]/,
    build: (keys: string): Inline => ({ type: 'keys', keys: splitKeys(keys) }),
  },
  {
    pattern: /^\*\*([^*]+(?:\*[^*]+)*?)\*\*/,
    build: (m: string): Inline => ({ type: 'bold', children: parseInline(m) }),
  },
  {
    pattern: /^\*([^*\s][^*]*)\*/,
    build: (m: string): Inline => ({ type: 'italic', children: parseInline(m) }),
  },
] as const;

export function parseInline(source: string): Inline[] {
  const result: Inline[] = [];
  let plain = '';
  const flush = () => {
    if (plain !== '') result.push({ type: 'text', text: plain });
    plain = '';
  };
  let rest = source;
  while (rest !== '') {
    let matched = false;
    for (const mark of MARKS) {
      const m = mark.pattern.exec(rest);
      if (!m) continue;
      flush();
      result.push(mark.build(m[1] ?? '', m[2]));
      rest = rest.slice(m[0].length);
      matched = true;
      break;
    }
    if (!matched) {
      plain += rest.charAt(0);
      rest = rest.slice(1);
    }
  }
  flush();
  return result;
}

export function parseRich(source: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of source.replace(/\r\n?/g, '\n').split(/\n\s*\n/)) {
    const lines = chunk
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '');
    if (lines.length === 0) continue;
    let paragraph: string[] = [];
    let items: Inline[][] = [];
    const flushParagraph = () => {
      if (paragraph.length > 0) blocks.push({ type: 'paragraph', content: parseInline(paragraph.join(' ')) });
      paragraph = [];
    };
    const flushList = () => {
      if (items.length > 0) blocks.push({ type: 'list', items });
      items = [];
    };
    for (const line of lines) {
      if (line.startsWith('- ')) {
        flushParagraph();
        items.push(parseInline(line.slice(2).trim()));
      } else if (items.length > 0 && paragraph.length === 0 && !line.startsWith('-')) {
        // A long item may continue on the next line.
        const last = items.pop() ?? [];
        items.push([...last, ...parseInline(` ${line}`)]);
      } else {
        flushList();
        paragraph.push(line);
      }
    }
    flushParagraph();
    flushList();
  }
  return blocks;
}

/** Identifiers of the knowledge cards a text links to. */
export function linkedNotions(source: string): string[] {
  const found = new Set<string>();
  const visit = (inline: Inline) => {
    if (inline.type === 'link') found.add(inline.notion);
    else if (inline.type === 'bold' || inline.type === 'italic') inline.children.forEach(visit);
  };
  for (const block of parseRich(source)) {
    if (block.type === 'paragraph') block.content.forEach(visit);
    else
      block.items.forEach((item) => {
        item.forEach(visit);
      });
  }
  return [...found];
}

/** The text without its marks, for search and for tooltips. */
export function plainText(source: string): string {
  const flat = (inline: Inline): string => {
    switch (inline.type) {
      case 'bold':
      case 'italic':
        return inline.children.map(flat).join('');
      case 'keys':
        return inline.keys.join('+');
      default:
        return inline.text;
    }
  };
  return parseRich(source)
    .map((block) =>
      block.type === 'paragraph'
        ? block.content.map(flat).join('')
        : block.items.map((item) => item.map(flat).join('')).join(' '),
    )
    .join(' ');
}
