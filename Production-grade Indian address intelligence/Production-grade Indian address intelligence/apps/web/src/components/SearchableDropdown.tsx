import { useState, useRef, useEffect, useMemo } from 'react';

type Option = { id: string; code: string; label: string; value: string };

type Props = {
  label: string;
  options: Option[];
  value: string; // selected id
  onChange: (id: string, label: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  disabled?: boolean;
  loading?: boolean;
  emptyText?: string;
};

export default function SearchableDropdown({
  label,
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  disabled = false,
  loading = false,
  emptyText,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedOption = useMemo(() => options.find(o => o.id === value), [options, value]);
  const selectedLabel = selectedOption?.label ?? '';

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return options;
    const q = searchQuery.toLowerCase();
    return options.filter(o => o.label.toLowerCase().includes(q));
  }, [options, searchQuery]);

  // Reset highlighted index when filtered changes or dropdown opens
  useEffect(() => {
    if (!isOpen) return;
    if (filtered.length === 0) {
      setHighlightedIndex(-1);
      return;
    }
    const selectedIdx = selectedOption ? filtered.findIndex(o => o.id === selectedOption.id) : -1;
    setHighlightedIndex(selectedIdx >= 0 ? selectedIdx : 0);
  }, [filtered, isOpen, selectedOption]);

  // Auto focus search input when opened
  useEffect(() => {
    if (isOpen) {
      // small delay to ensure DOM mounted + animation start
      requestAnimationFrame(() => searchInputRef.current?.focus());
    } else {
      setSearchQuery('');
      setHighlightedIndex(-1);
    }
  }, [isOpen]);

  // Click outside & Escape handling
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen]);

  // Scroll highlighted into view
  useEffect(() => {
    if (highlightedIndex < 0 || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-index="${highlightedIndex}"]`);
    if (el) (el as HTMLElement).scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex]);

  const handleSelect = (opt: Option) => {
    onChange(opt.id, opt.label);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('', '');
    setIsOpen(false);
  };

  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) setIsOpen(true);
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev + 1) % filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev - 1 + filtered.length) % filtered.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && filtered[highlightedIndex]) {
        handleSelect(filtered[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const displayText = selectedLabel || (loading ? 'Loading...' : placeholder);
  const isPlaceholder = !selectedLabel;

  return (
    <div ref={containerRef} className="relative w-full">
      <label
        style={{ fontFamily: 'var(--font-mono)' }}
        className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]"
      >
        {label}
      </label>

      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => !disabled && setIsOpen(o => !o)}
        onKeyDown={handleTriggerKeyDown}
        className={`group flex w-full items-center justify-between gap-2 rounded-[7px] border px-3 py-[0.62rem] text-left text-sm font-normal outline-none transition-all duration-200
          ${disabled
            ? 'cursor-not-allowed opacity-50 bg-[var(--background-secondary)] border-[var(--border)]'
            : isOpen
              ? 'border-[var(--accent)] bg-[var(--card)] shadow-[0_0_0_3px_var(--accent-soft)]'
              : 'border-[var(--border)] bg-[var(--background-secondary)] hover:border-[var(--border-hover)] hover:bg-[var(--card)]'
          }`}
      >
        <span className={`truncate pr-2 ${isPlaceholder ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}`}>
          {displayText}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {value && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              onClick={handleClear}
              className="mr-1 rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border)] transition-colors"
              aria-label="Clear selection"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </span>
          )}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`text-[var(--text-muted)] transition-transform duration-200 ${isOpen ? 'rotate-180 text-[var(--accent)]' : 'group-hover:text-[var(--text-secondary)]'}`}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>

      {isOpen && !disabled && (
        <div
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--card)] shadow-[0_12px_32px_rgba(0,0,0,0.45),0_4px_12px_rgba(0,0,0,0.25)]"
          style={{
            animation: 'dropdownIn 180ms ease-out',
          }}
        >
          {/* Search input */}
          <div className="border-b border-[var(--border)] bg-[var(--card)] p-2">
            <div className="relative">
              <svg
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder={searchPlaceholder}
                className="w-full rounded-[6px] border border-[var(--border)] bg-[var(--background-secondary)] py-2 pl-8 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-colors focus:border-[var(--accent)] focus:bg-[var(--card)] focus:shadow-[0_0_0_3px_var(--accent-soft)]"
              />
            </div>
          </div>

          {/* Options */}
          <div
            ref={listRef}
            role="listbox"
            className="max-h-[260px] overflow-y-auto overscroll-contain py-1"
            style={{ scrollbarWidth: 'thin' }}
          >
            {loading ? (
              <div className="flex items-center gap-2 px-3 py-3 text-sm text-[var(--text-muted)]">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]" />
                Loading...
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-8 text-center">
                <p className="text-sm text-[var(--text-muted)]">
                  {searchQuery ? `No results for "${searchQuery}"` : (emptyText ?? 'No options')}
                </p>
                {searchQuery && options.length > 0 && (
                  <p className="mt-1 text-xs text-[var(--text-muted)]">Try a different search term</p>
                )}
              </div>
            ) : (
              filtered.map((opt, idx) => {
                const isSelected = opt.id === value;
                const isHighlighted = idx === highlightedIndex;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    data-index={idx}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    onClick={() => handleSelect(opt)}
                    className={`flex w-full items-center justify-between px-3 py-[9px] text-left text-sm transition-colors
                      ${isSelected
                        ? 'bg-[var(--accent-soft)] text-[var(--accent-ink)]'
                        : isHighlighted
                          ? 'bg-[var(--card-hover)] text-[var(--text-primary)]'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--card-hover)] hover:text-[var(--text-primary)]'
                      }`}
                  >
                    <span className="truncate pr-2">{opt.label}</span>
                    {isSelected && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Footer count */}
          {!loading && filtered.length > 0 && (
            <div className="border-t border-[var(--border)] bg-[var(--background-secondary)] px-3 py-1.5 text-[11px] text-[var(--text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
              {filtered.length !== options.length ? `${filtered.length} of ${options.length}` : `${options.length} options`}
              {searchQuery && ` • filtered by "${searchQuery}"`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
