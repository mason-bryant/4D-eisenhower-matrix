import { describe, expect, it } from 'vitest';
import {
  DEFAULT_QUADRANT_RULES,
  matchesQuadrantRule,
  normalizeQuadrantRules,
  resolveQuadrant,
  type QuadrantRule,
} from '../src/core/quadrantRules.ts';
import type { Task } from '../src/core/types.ts';

const TODAY = '2026-10-07';

function task(overrides: Partial<Task> = {}): Task {
  return {
    lineIndex: 0, raw: '', status: ' ', checked: false, text: 'x', quadrant: 'OPEN',
    contextTags: [], blockedBy: [], trailingTokens: [], isBlocked: false,
    blockedByTasks: [], blocksTasks: [], missingBlockers: [], hasCircularDependency: false,
    sourceFile: 'a.md', isFromDnes: false, ...overrides,
  };
}

const rule = (r: Partial<QuadrantRule>): QuadrantRule => ({
  enabled: true, priorityOp: 'any', priority: 'normal', dueOverdue: false,
  dueWithin: false, dueBeyond: false, dueNone: false, dueDays: 7, ...r,
});

describe('matchesQuadrantRule', () => {
  it('compares priority on the Tasks scale (no emoji = normal)', () => {
    const aboveNormal = rule({ priorityOp: 'atLeast', priority: 'medium' });
    expect(matchesQuadrantRule(task({ priority: 'high' }), aboveNormal, TODAY)).toBe(true);
    expect(matchesQuadrantRule(task({ priority: 'medium' }), aboveNormal, TODAY)).toBe(true);
    expect(matchesQuadrantRule(task(), aboveNormal, TODAY)).toBe(false);
    const atMostNormal = rule({ priorityOp: 'atMost', priority: 'normal' });
    expect(matchesQuadrantRule(task(), atMostNormal, TODAY)).toBe(true);
    expect(matchesQuadrantRule(task({ priority: 'lowest' }), atMostNormal, TODAY)).toBe(true);
    expect(matchesQuadrantRule(task({ priority: 'medium' }), atMostNormal, TODAY)).toBe(false);
  });

  it('ORs the ticked due-date buckets', () => {
    const r = rule({ dueOverdue: true, dueWithin: true, dueDays: 1 });
    expect(matchesQuadrantRule(task({ dueDate: '2026-10-01' }), r, TODAY)).toBe(true);
    expect(matchesQuadrantRule(task({ dueDate: TODAY }), r, TODAY)).toBe(true);
    expect(matchesQuadrantRule(task({ dueDate: '2026-10-08' }), r, TODAY)).toBe(true);
    expect(matchesQuadrantRule(task({ dueDate: '2026-10-09' }), r, TODAY)).toBe(false);
    expect(matchesQuadrantRule(task(), r, TODAY)).toBe(false);

    const later = rule({ dueNone: true, dueBeyond: true, dueDays: 7 });
    expect(matchesQuadrantRule(task(), later, TODAY)).toBe(true);
    expect(matchesQuadrantRule(task({ dueDate: '2026-10-14' }), later, TODAY)).toBe(false);
    expect(matchesQuadrantRule(task({ dueDate: '2026-10-15' }), later, TODAY)).toBe(true);
  });

  it('never matches when disabled; matches anything when enabled and empty', () => {
    expect(matchesQuadrantRule(task(), rule({ enabled: false }), TODAY)).toBe(false);
    expect(matchesQuadrantRule(task({ priority: 'low' }), rule({}), TODAY)).toBe(true);
  });
});

describe('resolveQuadrant (default rules)', () => {
  const rules = DEFAULT_QUADRANT_RULES;
  const q = (o: Partial<Task>) => resolveQuadrant(task(o), 'rules', rules, TODAY);

  it('keeps tag-only behaviour in tags mode', () => {
    expect(resolveQuadrant(task({ priority: 'high', dueDate: TODAY }), 'tags', rules, TODAY)).toBe('OPEN');
    expect(resolveQuadrant(task({ quadrant: 'DO' }), 'tags', rules, TODAY)).toBe('DO');
  });

  it('lets an explicit quadrant tag override rules', () => {
    expect(q({ quadrant: 'DELETE', priority: 'high', dueDate: TODAY })).toBe('DELETE');
  });

  it('sorts untagged tasks by importance and urgency', () => {
    expect(q({ priority: 'high', dueDate: '2026-10-08' })).toBe('DO');
    expect(q({ priority: 'medium', dueDate: '2026-10-01' })).toBe('DO');
    expect(q({ priority: 'high', dueDate: '2026-10-20' })).toBe('DECIDE');
    expect(q({ priority: 'highest' })).toBe('DECIDE');
    expect(q({ dueDate: TODAY })).toBe('DELEGATE');
    expect(q({ priority: 'low', dueDate: '2026-10-01' })).toBe('DELEGATE');
    expect(q({ priority: 'low' })).toBe('DELETE');
    expect(q({ priority: 'lowest', dueDate: '2026-12-01' })).toBe('DELETE');
  });

  it('leaves normal-priority, non-urgent tasks in OPEN', () => {
    expect(q({})).toBe('OPEN');
    expect(q({ dueDate: '2026-10-10' })).toBe('OPEN');
  });
});

describe('normalizeQuadrantRules', () => {
  it('fills missing quadrants/fields and sanitizes values', () => {
    const r = normalizeQuadrantRules({ DO: { dueDays: -3, priority: 'bogus' } });
    expect(r.DO.dueDays).toBe(7);
    expect(r.DO.priority).toBe('normal');
    expect(r.DECIDE).toEqual(DEFAULT_QUADRANT_RULES.DECIDE);
  });
});
