import type { App, TFile } from 'obsidian';
import { normalizePath, TFolder } from 'obsidian';
import {
  DEFAULT_DAILY_FORMAT,
  applyTemplateVariables,
  formatDailyNoteName,
} from '../core/dailyNoteNames.ts';

/**
 * Vrátí složku, kam ukládat daily notes. Priorita:
 *   1. `override` (z plugin settings) — pokud neprázdný, použij
 *   2. core plugin „Daily notes" — uživatelův global config
 *   3. fallback: vault root (prázdný string)
 */
export function getDailyNotesFolder(app: App, override?: string): string {
  if (override && override.trim()) return override.trim();

  const internalPlugins = (app as unknown as InternalApp).internalPlugins;
  const dailyNotes = internalPlugins?.plugins?.['daily-notes'];
  if (dailyNotes?.enabled && dailyNotes.instance?.options?.folder !== undefined) {
    return dailyNotes.instance.options.folder ?? '';
  }
  return '';
}

/**
 * Cesta k template souboru z core pluginu „Daily notes" (pokud má uživatel
 * template nakonfigurovaný). Vrací prázdný string pokud žádný není.
 */
export function getDailyNotesTemplatePath(app: App): string {
  const internalPlugins = (app as unknown as InternalApp).internalPlugins;
  const dailyNotes = internalPlugins?.plugins?.['daily-notes'];
  if (dailyNotes?.enabled && dailyNotes.instance?.options?.template) {
    return dailyNotes.instance.options.template;
  }
  return '';
}

/**
 * Date format of daily note file names — the core "Daily notes" setting
 * (moment.js syntax, may contain `/` for subfolders); `YYYY-MM-DD` when unset.
 */
export function getDailyNoteFilenameFormat(app: App): string {
  const internalPlugins = (app as unknown as InternalApp).internalPlugins;
  const dailyNotes = internalPlugins?.plugins?.['daily-notes'];
  const format = dailyNotes?.enabled ? dailyNotes.instance?.options?.format?.trim() : '';
  return format || DEFAULT_DAILY_FORMAT;
}

/**
 * Cesta k daily note souboru pro daný ISO datum.
 */
export function buildDailyNotePath(app: App, isoDate: string, override?: string): string {
  const folder = getDailyNotesFolder(app, override);
  const filename = `${formatDailyNoteName(isoDate, getDailyNoteFilenameFormat(app))}.md`;
  return normalizePath(folder ? `${folder}/${filename}` : filename);
}

/**
 * Pokud daily note pro `isoDate` neexistuje, vytvoří ji:
 *   1. Pokud má uživatel v core „Daily notes" nastavený template → použij ten
 *   2. Jinak → vlož minimální scaffold (frontmatter + `# Today` heading)
 *
 * Vrací `TFile` existujícího nebo nově vytvořeného souboru.
 */
export async function ensureDailyExists(
  app: App,
  isoDate: string,
  sectionHeading: string,
  override?: string,
): Promise<TFile> {
  const targetPath = buildDailyNotePath(app, isoDate, override);
  const existing = app.vault.getFileByPath(targetPath);
  if (existing) return existing;

  // Ensure parent folders exist (the format may add subfolders, e.g. YYYY/MM/…)
  const parts = targetPath.split('/').slice(0, -1);
  for (let i = 1; i <= parts.length; i++) {
    const dir = parts.slice(0, i).join('/');
    if (!(app.vault.getAbstractFileByPath(dir) instanceof TFolder)) {
      await app.vault.createFolder(dir);
    }
  }

  // Try to use core Daily Notes template
  const templatePath = getDailyNotesTemplatePath(app);
  let initialContent = '';

  if (templatePath) {
    const templateFile = app.vault.getFileByPath(
      templatePath.endsWith('.md') ? templatePath : `${templatePath}.md`,
    );
    if (templateFile) {
      const raw = await app.vault.cachedRead(templateFile);
      const title = targetPath.split('/').pop()!.replace(/\.md$/, '');
      initialContent = applyTemplateVariables(raw, isoDate, getDailyNoteFilenameFormat(app), title);
    }
  }

  if (!initialContent) {
    initialContent = buildMinimalScaffold(isoDate, sectionHeading);
  }

  // Ujistíme se, že obsah obsahuje sekční heading (aggregator + appendTaskUnderHeading
  // z lineOps ho potřebuje).
  const headingNorm = sectionHeading.trim().toLowerCase();
  const hasHeading = initialContent
    .split(/\r?\n/)
    .some((l) => /^#+\s/.test(l) && l.trim().toLowerCase() === headingNorm);
  if (!hasHeading) {
    initialContent = `${initialContent.trimEnd()}\n\n${sectionHeading.trim()}\n`;
  }

  return await app.vault.create(targetPath, initialContent);
}

function buildMinimalScaffold(isoDate: string, sectionHeading: string): string {
  const d = parseISODate(isoDate);
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const weekday = weekdays[d.getDay()];
  const month = months[d.getMonth()];

  return [
    '---',
    `date: ${isoDate}`,
    'tags:',
    '  - daily',
    '---',
    '',
    `# ${weekday} ${d.getDate()} ${month} ${d.getFullYear()}`,
    '',
    sectionHeading.trim(),
    '',
  ].join('\n');
}

function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// === Internal Obsidian API shape (untyped in public types) ===
type InternalApp = {
  internalPlugins: {
    plugins: {
      'daily-notes'?: {
        enabled: boolean;
        instance?: {
          options?: {
            folder?: string;
            format?: string;
            template?: string;
          };
        };
      };
    };
  };
};
