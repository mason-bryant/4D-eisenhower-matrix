type Props = {
  propertyKeys: string[];
  selectedKey: string;
  values: { value: string; count: number }[];
  selectedValues: string[];
  onSelectKey: (key: string) => void;
  onToggleValue: (value: string) => void;
  onClear: () => void;
};

/**
 * Frontmatter property filter: pick a property, then one or more of its
 * values (OR). Tasks from today's daily note always pass.
 */
export function PropertyFilterBar({
  propertyKeys,
  selectedKey,
  values,
  selectedValues,
  onSelectKey,
  onToggleValue,
  onClear,
}: Props) {
  if (propertyKeys.length === 0 && !selectedKey) return null;

  const keys = selectedKey && !propertyKeys.includes(selectedKey)
    ? [selectedKey, ...propertyKeys]
    : propertyKeys;

  return (
    <div className="em-filterbar em-propbar">
      <span className="em-filterbar-label">Property:</span>
      <select
        className="dropdown em-propbar-select"
        value={selectedKey}
        onChange={(e) => onSelectKey(e.currentTarget.value)}
        aria-label="Filter by property"
      >
        <option value="">(any note)</option>
        {keys.map((key) => (
          <option key={key} value={key}>
            {key}
          </option>
        ))}
      </select>
      {selectedKey && values.length === 0 && (
        <span className="em-propbar-empty">No tasks in notes with this property</span>
      )}
      {values.map(({ value, count }) => {
        const isSelected = selectedValues.some((s) => s.toLowerCase() === value.toLowerCase());
        return (
          <button
            key={value}
            type="button"
            onClick={() => onToggleValue(value)}
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
      {selectedKey && (
        <>
          <span className="em-filterbar-sep">·</span>
          <button type="button" onClick={onClear} className="em-filterbar-clear">
            clear
          </button>
        </>
      )}
    </div>
  );
}
