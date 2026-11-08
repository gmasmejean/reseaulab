import { XmlError, elementsOf, textOf, type XmlElement } from './xml';

/* Interpreter for the subset of java.beans.XMLDecoder documents used by
 * Filius. Java objects become generic `JObject`s: properties set or read
 * through getters, list items (add / index) and map entries (put / get).
 * XMLEncoder only writes values that differ from the defaults, so reading a
 * property that was never set yields an empty placeholder object; the
 * converter then applies Filius' default values. Nothing is ever executed. */

export class JObject {
  readonly props = new Map<string, JValue>();
  readonly items: (JValue | undefined)[] = [];
  readonly entries = new Map<string, JValue>();

  constructor(
    readonly className: string | null,
    readonly args: readonly JValue[] = [],
  ) {}

  /** Property value, creating an empty placeholder when it was never written. */
  child(name: string): JObject {
    const value = this.props.get(name);
    if (value instanceof JObject) return value;
    const created = new JObject(null);
    // Never overwrite a written primitive value with a placeholder.
    if (value === undefined) this.props.set(name, created);
    return created;
  }

  item(index: number): JObject {
    const value = this.items[index];
    if (value instanceof JObject) return value;
    const created = new JObject(null);
    // Never overwrite a written primitive value with a placeholder.
    if (value === undefined) this.items[index] = created;
    return created;
  }

  entry(key: string): JObject {
    const value = this.entries.get(key);
    if (value instanceof JObject) return value;
    const created = new JObject(null);
    // Never overwrite a written primitive value with a placeholder.
    if (value === undefined) this.entries.set(key, created);
    return created;
  }

  string(name: string): string | undefined {
    const value = this.props.get(name);
    return typeof value === 'string' ? value : undefined;
  }

  number(name: string): number | undefined {
    const value = this.props.get(name);
    return typeof value === 'number' ? value : undefined;
  }

  boolean(name: string): boolean | undefined {
    const value = this.props.get(name);
    return typeof value === 'boolean' ? value : undefined;
  }
}

/** Result of `Class.getField(name)`, used by Filius for public fields. */
export class JField {
  constructor(readonly name: string) {}
}

export type JValue = string | number | boolean | null | JObject | JField;

const MAX_DEPTH = 200;

class Decoder {
  private readonly ids = new Map<string, JValue>();

  constructor(private readonly maxElements: number) {}

  private count = 0;

  run(root: XmlElement): JValue[] {
    if (root.name !== 'java') throw new XmlError('Document XMLEncoder attendu (élément <java>).');
    return elementsOf(root)
      .filter((e) => e.name !== 'void')
      .map((e) => this.value(e, 0));
  }

  private tick(depth: number): void {
    if (++this.count > this.maxElements) throw new XmlError('Document trop volumineux.');
    if (depth > MAX_DEPTH) throw new XmlError('Document trop imbriqué.');
  }

  private register(element: XmlElement, value: JValue): void {
    const id = element.attributes.id;
    if (id !== undefined) this.ids.set(id, value);
  }

  private value(element: XmlElement, depth: number): JValue {
    this.tick(depth);
    const text = textOf(element).trim();
    switch (element.name) {
      case 'string':
        return this.stringValue(element);
      case 'int':
      case 'short':
      case 'long':
      case 'byte':
      case 'float':
      case 'double': {
        const n = Number(text);
        if (!Number.isFinite(n)) throw new XmlError(`Nombre invalide : ${text}`);
        return n;
      }
      case 'boolean':
        return text === 'true';
      case 'char':
        return this.charValue(element);
      case 'null':
        return null;
      case 'class':
        return text;
      case 'object':
        return this.objectValue(element, depth);
      case 'array': {
        const array = new JObject(`${element.attributes.class ?? 'java.lang.Object'}[]`);
        const length = Number(element.attributes.length ?? '0');
        if (Number.isInteger(length) && length > 0 && length <= 100_000) array.items.length = length;
        this.register(element, array);
        this.statements(array, element, depth);
        return array;
      }
      default:
        throw new XmlError(`Élément XMLEncoder inattendu : <${element.name}>`);
    }
  }

  private stringValue(element: XmlElement): string {
    return element.children
      .map((child) => (typeof child === 'string' ? child : this.charValue(child)))
      .join('');
  }

  private charValue(element: XmlElement): string {
    const code = element.attributes.code;
    if (code === undefined) return textOf(element);
    const n = code.startsWith('#') ? Number.parseInt(code.slice(1), 10) : Number.NaN;
    if (!Number.isInteger(n) || n < 0 || n > 0x10ffff) throw new XmlError(`Caractère invalide : ${code}`);
    return String.fromCodePoint(n);
  }

  private objectValue(element: XmlElement, depth: number): JValue {
    const { idref, class: className, field, method } = element.attributes;
    if (idref !== undefined) {
      if (!this.ids.has(idref)) throw new XmlError(`Référence inconnue : ${idref}`);
      return this.ids.get(idref) ?? null;
    }
    const args = elementsOf(element)
      .filter((e) => e.name !== 'void')
      .map((e) => this.value(e, depth + 1));
    // Static fields and factory methods (SwingConstants.CENTER, …) are opaque.
    const name =
      field !== undefined || method !== undefined ? `${className ?? ''}#${field ?? method ?? ''}` : className;
    const object = new JObject(name ?? null, args);
    this.register(element, object);
    this.statements(object, element, depth);
    return object;
  }

  private statements(target: JValue, element: XmlElement, depth: number): void {
    for (const child of elementsOf(element)) {
      if (child.name === 'void') this.statement(target, child, depth + 1);
    }
  }

  private statement(target: JValue, element: XmlElement, depth: number): void {
    this.tick(depth);
    const { property, method, index, class: staticClass, idref } = element.attributes;
    if (idref !== undefined) {
      // <void idref="X"> re-opens a known object to run statements on it.
      if (!this.ids.has(idref)) throw new XmlError(`Référence inconnue : ${idref}`);
      this.statements(this.ids.get(idref) ?? null, element, depth);
      return;
    }
    const args: JValue[] = [];
    for (const child of elementsOf(element)) {
      if (child.name !== 'void') args.push(this.value(child, depth + 1));
      else if (child.attributes.idref !== undefined) this.statement(target, child, depth + 1);
    }
    let result: JValue | undefined;
    if (staticClass !== undefined) {
      result = method === 'getField' && typeof args[0] === 'string' ? new JField(args[0]) : new JObject(null);
    } else if (target instanceof JField) {
      // Field.set(object, value)
      const [object, value] = args;
      if (method === 'set' && object instanceof JObject && value !== undefined)
        object.props.set(target.name, value);
    } else if (target instanceof JObject) {
      result = this.call(target, { property, method, index }, args);
    }
    if (result !== undefined) {
      this.register(element, result);
      for (const child of elementsOf(element)) {
        if (child.name === 'void' && child.attributes.idref === undefined)
          this.statement(result, child, depth + 1);
      }
    }
  }

  private call(
    target: JObject,
    {
      property,
      method,
      index,
    }: { property: string | undefined; method: string | undefined; index: string | undefined },
    args: JValue[],
  ): JValue | undefined {
    if (property !== undefined) {
      if (args.length === 0) return target.child(property);
      target.props.set(property, args[0] ?? null);
      return undefined;
    }
    if (index !== undefined) {
      const i = Number(index);
      if (!Number.isInteger(i) || i < 0 || i > 100_000) throw new XmlError(`Indice invalide : ${index}`);
      if (args.length === 0) return target.item(i);
      target.items[i] = args[0] ?? null;
      return undefined;
    }
    switch (method) {
      case 'add':
        if (args.length === 1) target.items.push(args[0] ?? null);
        else if (args.length === 2 && typeof args[0] === 'number')
          target.items.splice(args[0], 0, args[1] ?? null);
        return undefined;
      case 'put':
        if (args.length === 2 && (typeof args[0] === 'string' || typeof args[0] === 'number')) {
          target.entries.set(String(args[0]), args[1] ?? null);
        }
        return undefined;
      case 'get':
        if (typeof args[0] === 'string') return target.entry(args[0]);
        if (typeof args[0] === 'number') return target.item(args[0]);
        return new JObject(null);
      case 'isEnabled':
        return true;
      default:
        return new JObject(null);
    }
  }
}

/** Evaluates an XMLEncoder document; returns its top-level values in order. */
export function decodeXmlEncoder(root: XmlElement, maxElements = 2_000_000): JValue[] {
  return new Decoder(maxElements).run(root);
}
