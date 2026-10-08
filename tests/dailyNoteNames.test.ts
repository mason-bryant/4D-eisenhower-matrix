import { describe, expect, it } from 'vitest';
import {
  applyTemplateVariables,
  formatDailyNoteName,
  parseDailyNoteName,
} from '../src/core/dailyNoteNames.ts';

const CUSTOM = '\\📅\\ \\N\\o\\t\\e\\ \\-\\ MM-DD-YYYY (ddd)';

describe('formatDailyNoteName', () => {
  it('defaults to YYYY-MM-DD', () => {
    expect(formatDailyNoteName('2026-10-08', '')).toBe('2026-10-08');
  });

  it('honours custom formats, escapes and subfolders', () => {
    expect(formatDailyNoteName('2026-10-08', CUSTOM)).toBe('📅 Note - 10-08-2026 (Thu)');
    expect(formatDailyNoteName('2026-10-08', 'YYYY/MM/DD-MM-YYYY')).toBe('2026/10/08-10-2026');
  });
});

describe('parseDailyNoteName', () => {
  it('round-trips formatted names', () => {
    expect(parseDailyNoteName('📅 Note - 10-08-2026 (Thu)', CUSTOM)).toBe('2026-10-08');
    expect(parseDailyNoteName('2026/10/08-10-2026', 'YYYY/MM/DD-MM-YYYY')).toBe('2026-10-08');
    expect(parseDailyNoteName('2026-10-08', '')).toBe('2026-10-08');
  });

  it('rejects names that do not match the format', () => {
    expect(parseDailyNoteName('2026-10-08', CUSTOM)).toBeNull();
    expect(parseDailyNoteName('Meeting notes', 'YYYY-MM-DD')).toBeNull();
    expect(parseDailyNoteName('2026-02-30', 'YYYY-MM-DD')).toBeNull();
  });
});

describe('applyTemplateVariables', () => {
  const now = new Date(2026, 9, 8, 9, 5);
  it('expands date, time and title like core Daily notes', () => {
    const out = applyTemplateVariables(
      '{{title}} | {{date}} | {{date:dddd, MMM Do}} | {{time}} | {{time:HH}}h',
      '2026-10-08',
      'MM-DD-YYYY',
      'My note',
      now,
    );
    expect(out).toBe('My note | 10-08-2026 | Thursday, Oct 8th | 09:05 | 09h');
  });
});
