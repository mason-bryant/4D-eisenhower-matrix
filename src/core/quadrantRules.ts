import type { Priority, Quadrant, Task } from './types.ts';
import { addDaysISO } from './taskUtils.ts';

/** How quadrants are assigned: leading quadrant tag only, or tag + rules. */
export type QuadrantMode = 'tags' | 'rules';

export type RuleQuadrant = Exclude<Quadrant, 'OPEN'>;
export const RULE_QUADRANTS: RuleQuadrant[] = ['DO', 'DECIDE', 'DELEGATE', 'DELETE'];

/** Tasks priority scale incl. "normal" (no priority emoji). */
export type PriorityLevel = Priority | 'normal';
export const PRIORITY_LEVELS: PriorityLevel[] = ['highest', 'high', 'medium', 'normal', 'low', 'lowest'];
const PRIORITY_RANK: Record<PriorityLevel, number> = {
  lowest: 0,
  low: 1,
  normal: 2,
  medium: 3,
  high: 4,
  highest: 5,
};

export type PriorityOp = 'any' | 'atLeast' | 'atMost';

/**
 * A quadrant rule — all set conditions must hold (AND). Due-date buckets are
 * OR'ed among themselves; none ticked = any due date.
 */
export type QuadrantRule = {
  enabled: boolean;
  priorityOp: PriorityOp;
  priority: PriorityLevel;
  dueOverdue: boolean;
  /** Due today .. today + dueDays. */
  dueWithin: boolean;
  /** Due after today + dueDays. */
  dueBeyond: boolean;
  dueNone: boolean;
  dueDays: number;
};

export type QuadrantRules = Record<RuleQuadrant, QuadrantRule>;

const emptyRule = (): QuadrantRule => ({
  enabled: false,
  priorityOp: 'any',
  priority: 'normal',
  dueOverdue: false,
  dueWithin: false,
  dueBeyond: false,
  dueNone: false,
  dueDays: 7,
});

/**
 * Defaults used once the mode is switched to rules: "important" = Medium
 * priority or higher, "urgent" = overdue or due by tomorrow. Rules run in order, so DECIDE / DELETE only see what the urgent
 * rules above them didn't take. Normal-priority, non-urgent tasks stay in OPEN
 * for triage.
 */
export const DEFAULT_QUADRANT_RULES: QuadrantRules = {
  // Important + urgent.
  DO: { ...emptyRule(), enabled: true, priorityOp: 'atLeast', priority: 'medium', dueOverdue: true, dueWithin: true, dueDays: 1 },
  // Important, not urgent.
  DECIDE: { ...emptyRule(), enabled: true, priorityOp: 'atLeast', priority: 'medium' },
  // Urgent, less important.
  DELEGATE: { ...emptyRule(), enabled: true, priorityOp: 'atMost', priority: 'normal', dueOverdue: true, dueWithin: true, dueDays: 1 },
  // Neither: explicitly low priority and not urgent.
  DELETE: { ...emptyRule(), enabled: true, priorityOp: 'atMost', priority: 'low' },
};

/** Fills gaps in persisted rules (older data, hand-edited data.json). */
export function normalizeQuadrantRules(raw: unknown): QuadrantRules {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<RuleQuadrant, Partial<QuadrantRule>>>;
  const out = {} as QuadrantRules;
  for (const q of RULE_QUADRANTS) {
    const merged = { ...DEFAULT_QUADRANT_RULES[q], ...(src[q] ?? {}) };
    const days = Number(merged.dueDays);
    merged.dueDays = Number.isFinite(days) && days >= 0 ? Math.floor(days) : 7;
    if (!PRIORITY_LEVELS.includes(merged.priority)) merged.priority = 'normal';
    if (!['any', 'atLeast', 'atMost'].includes(merged.priorityOp)) merged.priorityOp = 'any';
    out[q] = merged;
  }
  return out;
}

export function matchesQuadrantRule(task: Task, rule: QuadrantRule, today: string): boolean {
  if (!rule.enabled) return false;

  if (rule.priorityOp !== 'any') {
    const rank = PRIORITY_RANK[task.priority ?? 'normal'];
    const target = PRIORITY_RANK[rule.priority];
    if (rule.priorityOp === 'atLeast' ? rank < target : rank > target) return false;
  }

  const anyDueBucket = rule.dueOverdue || rule.dueWithin || rule.dueBeyond || rule.dueNone;
  if (anyDueBucket) {
    const due = task.dueDate;
    const horizon = addDaysISO(today, rule.dueDays);
    const ok =
      (rule.dueNone && !due) ||
      (rule.dueOverdue && !!due && due < today) ||
      (rule.dueWithin && !!due && due >= today && due <= horizon) ||
      (rule.dueBeyond && !!due && due > horizon);
    if (!ok) return false;
  }

  return true;
}

/**
 * Effective quadrant. A leading quadrant tag (`task.quadrant` from the parser)
 * always wins — that's how dragging pins a task. Otherwise, in rules mode, the
 * first enabled, matching rule (DO → DECIDE → DELEGATE → DELETE) decides; no
 * match = OPEN.
 */
export function resolveQuadrant(
  task: Task,
  mode: QuadrantMode,
  rules: QuadrantRules,
  today: string,
): Quadrant {
  if (mode !== 'rules' || task.quadrant !== 'OPEN') return task.quadrant;
  return RULE_QUADRANTS.find((q) => matchesQuadrantRule(task, rules[q], today)) ?? 'OPEN';
}

export function applyQuadrantRules(
  tasks: Task[],
  mode: QuadrantMode,
  rules: QuadrantRules,
  today: string,
): Task[] {
  if (mode !== 'rules') return tasks;
  return tasks.map((t) => {
    const quadrant = resolveQuadrant(t, mode, rules, today);
    return quadrant === t.quadrant ? t : { ...t, quadrant };
  });
}
