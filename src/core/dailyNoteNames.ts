import { moment as obsidianMoment } from 'obsidian';
import type { Moment, MomentInput } from 'moment';

// Obsidian re-exports moment as a namespace type, which isn't callable under
// esModuleInterop — narrow it to the call signature we use.
const moment = obsidianMoment as unknown as (
  input?: MomentInput,
  format?: string,
  strict?: boolean,
) => Moment;

/** Core "Daily notes" default when no format is configured. */
export const DEFAULT_DAILY_FORMAT = 'YYYY-MM-DD';

/** Daily note path (without `.md`, relative to the daily folder) for an ISO date. */
export function formatDailyNoteName(isoDate: string, format: string): string {
  return moment(isoDate, 'YYYY-MM-DD', true).format(format || DEFAULT_DAILY_FORMAT);
}

/**
 * ISO date for a daily note path (relative to the daily folder, without
 * `.md`), or null when it doesn't match the format. Strict, so other notes in
 * the folder aren't mistaken for daily notes.
 */
export function parseDailyNoteName(name: string, format: string): string | null {
  const m = moment(name, format || DEFAULT_DAILY_FORMAT, true);
  return m.isValid() ? m.format('YYYY-MM-DD') : null;
}

/**
 * Core "Daily notes" template variables: `{{date}}` (daily format),
 * `{{date:FORMAT}}`, `{{time}}` (HH:mm), `{{time:FORMAT}}` and `{{title}}`
 * (the note's file name).
 */
export function applyTemplateVariables(
  template: string,
  isoDate: string,
  format: string,
  title: string,
  now: Date = new Date(),
): string {
  const date = moment(isoDate, 'YYYY-MM-DD', true);
  const time = moment(now);
  return template
    .replace(/\{\{\s*date\s*(?::\s*([^}]*?))?\s*\}\}/gi, (_, fmt?: string) =>
      date.format(fmt?.trim() || format || DEFAULT_DAILY_FORMAT),
    )
    .replace(/\{\{\s*time\s*(?::\s*([^}]*?))?\s*\}\}/gi, (_, fmt?: string) =>
      time.format(fmt?.trim() || 'HH:mm'),
    )
    .replace(/\{\{\s*title\s*\}\}/gi, title);
}
