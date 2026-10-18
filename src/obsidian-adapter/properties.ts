import type { App } from 'obsidian';

export function isExcludedPath(path: string, excludedFolders: string[]): boolean {
  return excludedFolders.some((folder) => path === folder || path.startsWith(folder + '/'));
}

/** Flattens a frontmatter value into comparable strings (list items, scalars). */
export function propertyValueStrings(raw: unknown): string[] {
  if (raw === undefined || raw === null) return [];
  const items: unknown[] = Array.isArray(raw) ? raw : [raw];
  return items
    .filter((v) => v !== null && v !== undefined && typeof v !== 'object')
    .map((v) => String(v).trim())
    .filter((v) => v !== '');
}

/**
 * Collects every frontmatter property (and its distinct values) across the
 * scanned files — same scope as the matrix: all markdown files minus excluded
 * folders. Keys and values are sorted case-insensitively.
 */
export function collectProperties(app: App, excludedFolders: string[]): Map<string, string[]> {
  const byKey = new Map<string, Set<string>>();
  for (const file of app.vault.getMarkdownFiles()) {
    if (isExcludedPath(file.path, excludedFolders)) continue;
    const fm = app.metadataCache.getFileCache(file)?.frontmatter;
    if (!fm) continue;
    for (const [key, raw] of Object.entries(fm)) {
      const values = byKey.get(key) ?? new Set<string>();
      for (const v of propertyValueStrings(raw)) values.add(v);
      byKey.set(key, values);
    }
  }
  const compare = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });
  return new Map(
    [...byKey.keys()].sort(compare).map((key) => [key, [...byKey.get(key)!].sort(compare)]),
  );
}

/** Values of `key` in the note at `path`, or null when the note lacks the property. */
export function notePropertyValues(app: App, path: string, key: string): string[] | null {
  const fm = app.metadataCache.getCache(path)?.frontmatter;
  if (!fm || !(key in fm)) return null;
  return propertyValueStrings(fm[key]);
}

/**
 * True when the note's property has any of `values` (case-insensitive exact
 * match). No key = always true; no values = the property just has to exist.
 */
export function noteMatchesProperty(app: App, path: string, key: string, values: string[]): boolean {
  if (!key) return true;
  const actual = notePropertyValues(app, path, key);
  if (actual === null) return false;
  if (values.length === 0) return true;
  const wanted = new Set(values.map((v) => v.toLowerCase()));
  return actual.some((v) => wanted.has(v.toLowerCase()));
}

/** One property filter row: a key and the accepted values (OR). Empty key = inactive. */
export type PropertyFilter = { key: string; values: string[] };

/** True when the note passes every active filter (AND across filters). */
export function noteMatchesAllProperties(app: App, path: string, filters: PropertyFilter[]): boolean {
  return filters.every((f) => noteMatchesProperty(app, path, f.key, f.values));
}

/** Drops malformed entries from persisted settings. */
export function normalizePropertyFilters(raw: unknown): PropertyFilter[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((f): f is PropertyFilter => !!f && typeof f.key === 'string' && Array.isArray(f.values))
    .map((f) => ({ key: f.key, values: f.values.filter((v): v is string => typeof v === 'string') }))
    .filter((f) => f.key !== '');
}
