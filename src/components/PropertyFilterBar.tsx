export type PropertyFilterRow = {
  key: string;
  values: { value: string; count: number }[];
  selectedValues: string[];
};

type Props = {
  propertyKeys: string[];
  rows: PropertyFilterRow[];
  onSelectKey: (row: number, key: string) => void;
  onToggleValue: (row: number, value: string) => void;
  onRemoveRow: (row: number) => void;
  onAddRow: () => void;
  onClear: () => void;
};

/**
 * Frontmatter property filters. Each row picks a property and one or more of
 * its values (OR); rows combine with AND. Tasks from today's daily note
 * always pass.
 */
export function PropertyFilterBar({
  propertyKeys,
  rows,
  onSelectKey,
  onToggleValue,
  onRemoveRow,
  onAddRow,
  onClear,
}: Props) {
  if (propertyKeys.length === 0 && rows.every((r) => !r.key)) return null;
  const anyActive = rows.some((r) => r.key);

  return (
    <div className="em-propbars">
      {rows.map((row, i) => {
        const usedElsewhere = new Set(rows.filter((_, j) => j !== i).map((r) => r.key));
        const keys = propertyKeys.filter((k) => !usedElsewhere.has(k));
        if (row.key && !keys.includes(row.key)) keys.unshift(row.key);
        const isLast = i === rows.length - 1;
        return (
          <div key={i} className="em-filterbar em-propbar">
            <span className="em-filterbar-label">{i === 0 ? 'Property:' : 'and'}</span>
            <select
              className="dropdown em-propbar-select"
              value={row.key}
              onChange={(e) => onSelectKey(i, e.currentTarget.value)}
              aria-label={`Filter by property ${i + 1}`}
            >
              <option value="">(any note)</option>
              {keys.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
            {row.key && row.values.length === 0 && (
              <span className="em-propbar-empty">No tasks in notes with this property</span>
            )}
            {row.values.map(({ value, count }) => {
              const isSelected = row.selectedValues.some(
                (s) => s.toLowerCase() === value.toLowerCase(),
              );
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => onToggleValue(i, value)}
                  className={`em-chip ${isSelected ? 'em-chip-active' : ''}`}
                  aria-pressed={isSelected}
                >
                  {isSelected && (
                    <span className="em-chip-check" aria-hidden="true">
                      ✓
                    </span>
                  )}
                  <span>{value}</span>
                  <span className="em-chip-count">{count}</span>
                </button>
              );
            })}
            <span className="em-propbar-actions">
              {(rows.length > 1 || row.key) && (
                <button
                  type="button"
                  className="em-propbar-btn"
                  onClick={() => onRemoveRow(i)}
                  aria-label="Remove this property filter"
                  title="Remove this property filter"
                >
                  ×
                </button>
              )}
              {isLast && (
                <button
                  type="button"
                  className="em-propbar-btn"
                  onClick={onAddRow}
                  disabled={!row.key}
                  aria-label="Add another property filter"
                  title={row.key ? 'Add another property filter (AND)' : 'Pick a property first'}
                >
                  +
                </button>
              )}
              {isLast && anyActive && (
                <>
                  <span className="em-filterbar-sep">·</span>
                  <button type="button" onClick={onClear} className="em-filterbar-clear">
                    clear
                  </button>
                </>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
