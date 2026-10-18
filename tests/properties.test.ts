import { describe, expect, it } from 'vitest';
import type { App, TFile } from 'obsidian';
import {
  collectProperties,
  noteMatchesAllProperties,
  noteMatchesProperty,
  normalizePropertyFilters,
  notePropertyValues,
  isExcludedPath,
  propertyValueStrings,
} from '../src/obsidian-adapter/properties.ts';

function fakeApp(files: Record<string, Record<string, unknown> | undefined>): App {
  const tfiles = Object.keys(files).map((path) => ({ path }) as TFile);
  return {
    vault: { getMarkdownFiles: () => tfiles },
    metadataCache: {
      getFileCache: (f: TFile) => (files[f.path] ? { frontmatter: files[f.path] } : null),
      getCache: (path: string) => (files[path] ? { frontmatter: files[path] } : null),
    },
  } as unknown as App;
}

describe('propertyValueStrings', () => {
  it('flattens lists and scalars, drops empties and objects', () => {
    expect(propertyValueStrings(['a', ' b ', '', null, { x: 1 }, 3])).toEqual(['a', 'b', '3']);
    expect(propertyValueStrings('solo')).toEqual(['solo']);
    expect(propertyValueStrings(true)).toEqual(['true']);
    expect(propertyValueStrings(null)).toEqual([]);
  });
});

describe('isExcludedPath', () => {
  it('matches the folder and its descendants only', () => {
    expect(isExcludedPath('templates/a.md', ['templates'])).toBe(true);
    expect(isExcludedPath('templates', ['templates'])).toBe(true);
    expect(isExcludedPath('templates-old/a.md', ['templates'])).toBe(false);
  });
});

describe('collectProperties', () => {
  it('gathers sorted keys and distinct values, skipping excluded folders', () => {
    const app = fakeApp({
      'a.md': { context: ['Remitly', 'career'], type: 'note' },
      'b.md': { context: 'remitly-ops', status: null },
      'tpl/c.md': { context: ['template-only'] },
      'd.md': undefined,
    });
    const props = collectProperties(app, ['tpl']);
    expect([...props.keys()]).toEqual(['context', 'status', 'type']);
    expect(props.get('context')).toEqual(['career', 'Remitly', 'remitly-ops']);
    expect(props.get('status')).toEqual([]);
  });
});

describe('noteMatchesProperty', () => {
  const app = fakeApp({
    'list.md': { context: ['Remitly', 'career'] },
    'scalar.md': { context: 'personal' },
    'none.md': { other: 'x' },
  });

  it('passes everything when no key is set', () => {
    expect(noteMatchesProperty(app, 'none.md', '', [])).toBe(true);
  });

  it('requires the property when no values are selected', () => {
    expect(noteMatchesProperty(app, 'scalar.md', 'context', [])).toBe(true);
    expect(noteMatchesProperty(app, 'none.md', 'context', [])).toBe(false);
  });

  it('matches any selected value, case-insensitively and exactly', () => {
    expect(noteMatchesProperty(app, 'list.md', 'context', ['remitly'])).toBe(true);
    expect(noteMatchesProperty(app, 'scalar.md', 'context', ['remitly', 'personal'])).toBe(true);
    expect(noteMatchesProperty(app, 'list.md', 'context', ['remit'])).toBe(false);
  });
});

describe('notePropertyValues', () => {
  it('returns null when the property is missing', () => {
    const app = fakeApp({ 'a.md': { context: ['x', 'y'] }, 'b.md': { other: 1 } });
    expect(notePropertyValues(app, 'a.md', 'context')).toEqual(['x', 'y']);
    expect(notePropertyValues(app, 'b.md', 'context')).toBeNull();
    expect(notePropertyValues(app, 'missing.md', 'context')).toBeNull();
  });
});

describe('noteMatchesAllProperties', () => {
  const app = fakeApp({
    'both.md': { context: ['work'], project: 'alpha' },
    'ctx.md': { context: 'work' },
    'proj.md': { project: 'alpha' },
  });
  const filters = [
    { key: 'context', values: ['work'] },
    { key: 'project', values: ['alpha'] },
  ];

  it('requires every filter to match (AND)', () => {
    expect(noteMatchesAllProperties(app, 'both.md', filters)).toBe(true);
    expect(noteMatchesAllProperties(app, 'ctx.md', filters)).toBe(false);
    expect(noteMatchesAllProperties(app, 'proj.md', filters)).toBe(false);
  });

  it('passes everything with no filters', () => {
    expect(noteMatchesAllProperties(app, 'proj.md', [])).toBe(true);
  });
});

describe('normalizePropertyFilters', () => {
  it('drops malformed and keyless entries', () => {
    expect(
      normalizePropertyFilters([
        { key: 'context', values: ['work', 3] },
        { key: '', values: [] },
        { key: 'x' },
        null,
      ]),
    ).toEqual([{ key: 'context', values: ['work'] }]);
    expect(normalizePropertyFilters('nope')).toEqual([]);
  });
});
