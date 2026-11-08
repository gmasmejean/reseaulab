/* Minimal, strict XML parser: enough for the documents written by Java's
 * XMLEncoder (elements, attributes, text, entities, comments, CDATA). Kept
 * free of the DOM so that the importer runs and is tested anywhere. */

export interface XmlElement {
  readonly name: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: readonly XmlNode[];
}

export type XmlNode = XmlElement | string;

export class XmlError extends Error {}

const NAME = /[A-Za-z_:][-A-Za-z0-9_:.]*/y;
const SPACE = /\s*/y;

const ENTITIES: Readonly<Record<string, string>> = {
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  apos: "'",
};

function decodeEntities(text: string, position: number): string {
  return text.replace(/&(#x[0-9A-Fa-f]+|#[0-9]+|[A-Za-z]+);/g, (whole, body: string) => {
    if (body.startsWith('#x')) return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
    if (body.startsWith('#')) return String.fromCodePoint(Number.parseInt(body.slice(1), 10));
    const value = ENTITIES[body];
    if (value === undefined) throw new XmlError(`Entité inconnue ${whole} (position ${String(position)})`);
    return value;
  });
}

class Parser {
  private pos = 0;

  constructor(private readonly src: string) {}

  parseDocument(): XmlElement {
    this.skipMisc();
    if (this.src.startsWith('<!DOCTYPE', this.pos)) throw new XmlError('DOCTYPE non pris en charge.');
    const root = this.parseElement();
    this.skipMisc();
    if (this.pos < this.src.length) this.fail('contenu après l’élément racine');
    return root;
  }

  private fail(what: string): never {
    throw new XmlError(`XML invalide : ${what} (position ${String(this.pos)}).`);
  }

  private skipSpace(): void {
    SPACE.lastIndex = this.pos;
    SPACE.exec(this.src);
    this.pos = SPACE.lastIndex;
  }

  /** Whitespace, comments and processing instructions between markup. */
  private skipMisc(): void {
    for (;;) {
      this.skipSpace();
      if (this.src.startsWith('<?', this.pos)) this.skipPast('?>');
      else if (this.src.startsWith('<!--', this.pos)) this.skipPast('-->');
      else return;
    }
  }

  private skipPast(end: string): number {
    const index = this.src.indexOf(end, this.pos);
    if (index < 0) this.fail(`« ${end} » manquant`);
    const start = this.pos;
    this.pos = index + end.length;
    return start;
  }

  private name(): string {
    NAME.lastIndex = this.pos;
    const match = NAME.exec(this.src);
    if (!match) this.fail('nom attendu');
    this.pos = NAME.lastIndex;
    return match[0];
  }

  private parseElement(): XmlElement {
    if (this.src[this.pos] !== '<') this.fail('« < » attendu');
    this.pos++;
    const name = this.name();
    const attributes: Record<string, string> = {};
    for (;;) {
      this.skipSpace();
      const c = this.src[this.pos];
      if (c === '/' || c === '>') break;
      const key = this.name();
      this.skipSpace();
      if (this.src[this.pos] !== '=') this.fail('« = » attendu');
      this.pos++;
      this.skipSpace();
      const quote = this.src[this.pos];
      if (quote !== '"' && quote !== "'") this.fail('guillemet attendu');
      const end = this.src.indexOf(quote, this.pos + 1);
      if (end < 0) this.fail('guillemet fermant manquant');
      if (Object.hasOwn(attributes, key)) this.fail(`attribut ${key} en double`);
      attributes[key] = decodeEntities(this.src.slice(this.pos + 1, end), this.pos);
      this.pos = end + 1;
    }
    if (this.src.startsWith('/>', this.pos)) {
      this.pos += 2;
      return { name, attributes, children: [] };
    }
    this.pos++; // '>'
    const children: XmlNode[] = [];
    let text = '';
    const flush = () => {
      if (text) children.push(text);
      text = '';
    };
    for (;;) {
      if (this.pos >= this.src.length) this.fail(`élément <${name}> non fermé`);
      if (this.src.startsWith('</', this.pos)) {
        this.pos += 2;
        const closing = this.name();
        if (closing !== name) this.fail(`</${closing}> ne ferme pas <${name}>`);
        this.skipSpace();
        if (this.src[this.pos] !== '>') this.fail('« > » attendu');
        this.pos++;
        flush();
        return { name, attributes, children };
      }
      if (this.src.startsWith('<!--', this.pos)) {
        this.skipPast('-->');
      } else if (this.src.startsWith('<![CDATA[', this.pos)) {
        this.pos += 9;
        const start = this.skipPast(']]>');
        text += this.src.slice(start, this.pos - 3);
      } else if (this.src.startsWith('<?', this.pos)) {
        this.skipPast('?>');
      } else if (this.src[this.pos] === '<') {
        flush();
        children.push(this.parseElement());
      } else {
        const next = this.src.indexOf('<', this.pos);
        const end = next < 0 ? this.src.length : next;
        text += decodeEntities(this.src.slice(this.pos, end), this.pos);
        this.pos = end;
      }
    }
  }
}

export function parseXml(text: string): XmlElement {
  return new Parser(text).parseDocument();
}

/** Child elements only (whitespace text is dropped). */
export function elementsOf(element: XmlElement): XmlElement[] {
  return element.children.filter((c): c is XmlElement => typeof c !== 'string');
}

/** Concatenated text content of the direct children. */
export function textOf(element: XmlElement): string {
  return element.children.filter((c): c is string => typeof c === 'string').join('');
}
