import { Moon, Sun } from 'lucide-react';
import type { ThemeMode } from '../../domain/types';

interface ThemeToggleProps {
  theme: ThemeMode;
  onToggle: () => void;
  compact?: boolean;
}

export function ThemeToggle({ theme, onToggle, compact = false }: ThemeToggleProps) {
  const isDark = theme === 'dark';
  const nextLabel = isDark ? 'Switch to light theme' : 'Switch to dark theme';

  if (compact) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-label={nextLabel}
        title={nextLabel}
        className="theme-transition inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]"
      >
        {isDark ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={nextLabel}
      aria-pressed={!isDark}
      title={nextLabel}
      className="theme-transition inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-card)] p-1 text-xs font-medium shadow-[var(--shadow-card)] hover:border-[var(--border-strong)]"
    >
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors ${
          isDark
            ? 'bg-[var(--bg-surface)] text-[var(--text-primary)]'
            : 'text-[var(--text-muted)]'
        }`}
      >
        <Moon className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Dark</span>
      </span>
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors ${
          !isDark
            ? 'bg-[var(--bg-surface)] text-[var(--text-primary)]'
            : 'text-[var(--text-muted)]'
        }`}
      >
        <Sun className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Light</span>
      </span>
    </button>
  );
}
