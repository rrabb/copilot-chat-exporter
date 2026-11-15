import { isRecord } from './sdk-events.ts';

/** Validate known event fields and report unread keys without dropping valid siblings. */
export class EventFields {
  private readonly read = new Set<string>();
  private readonly data: Record<string, unknown>;
  private readonly issues: string[];
  private readonly path: string;

  constructor (data: Record<string, unknown>, issues: string[], path = '') {
    this.data = data;
    this.issues = issues;
    this.path = path;
  }

  string (key: string, nullable = false, required = false): string | null | undefined {
    this.read.add(key);
    if (!Object.hasOwn(this.data, key)) {
      required && this.issues.push(`Expected ${this.path}${key} string.`);
      return undefined;
    }
    const value = this.data[key];
    if (typeof value === 'string' || (nullable && value === null))
      return value;
    this.issues.push(`Expected ${this.path}${key} string${nullable ? ' or null' : ''}.`);
    return undefined;
  }

  number (key: string, nonNegative = false): number | undefined {
    this.read.add(key);
    if (!Object.hasOwn(this.data, key))
      return undefined;
    const value = this.data[key];
    if (typeof value === 'number' && Number.isFinite(value) && (!nonNegative || value >= 0))
      return value;
    this.issues.push(`Expected ${this.path}${key} finite${nonNegative ? ', non-negative' : ''} number.`);
    return undefined;
  }

  counter (key: string): number | undefined {
    return this.number(key, true);
  }

  flag (key: string): boolean | undefined {
    this.read.add(key);
    if (!Object.hasOwn(this.data, key))
      return undefined;
    const value = this.data[key];
    if (typeof value === 'boolean')
      return value;
    this.issues.push(`Expected ${this.path}${key} boolean.`);
    return undefined;
  }

  record (key: string, nullable = false, required = false): EventFields | undefined {
    this.read.add(key);
    if (!Object.hasOwn(this.data, key)) {
      required && this.issues.push(`Expected ${this.path}${key} object.`);
      return undefined;
    }
    const value = this.data[key];
    if (nullable && value === null)
      return undefined;
    if (isRecord(value))
      return new EventFields(value, this.issues, `${this.path}${key}.`);
    this.issues.push(`Expected ${this.path}${key} object${nullable ? ' or null' : ''}.`);
    return undefined;
  }

  list (key: string): unknown[] | undefined {
    this.read.add(key);
    if (!Object.hasOwn(this.data, key))
      return undefined;
    const value: unknown = this.data[key];
    if (Array.isArray(value))
      return value;
    this.issues.push(`Expected ${this.path}${key} array.`);
    return undefined;
  }

  stringList (key: string): { values: string[]; empty: boolean } | undefined {
    const list = this.list(key);
    if (list === undefined)
      return undefined;
    const values: string[] = [];
    for (const [index, value] of list.entries()) {
      if (typeof value === 'string')
        values.push(value);
      else
        this.issues.push(`Expected ${this.path}${key}[${index}] string.`);
    }
    return { values, empty: list.length === 0 };
  }

  isEmpty (): boolean {
    return Object.keys(this.data).length === 0;
  }

  finish (): void {
    for (const key of Object.keys(this.data)) {
      if (!this.read.has(key))
        this.issues.push(`Unrecognized field ${this.path}${key}.`);
    }
  }
}
