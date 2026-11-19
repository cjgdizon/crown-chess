import { useSyncExternalStore } from 'react';
import type { StorageRepo } from '../domain/contracts';
import type { BoardPreset, Preferences, ThemeMode } from '../domain/types';
import { LocalStorageRepo } from '../infra/localStorageRepo';

function syncDomAttributes(prefs: Preferences): void {
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.dataset.theme = prefs.theme;
    document.documentElement.dataset.board = prefs.boardPreset;
  }
}

export class PreferencesStore {
  private readonly repo: StorageRepo;
  private prefs: Preferences;
  private readonly listeners = new Set<() => void>();

  constructor(repo: StorageRepo = new LocalStorageRepo()) {
    this.repo = repo;
    this.prefs = this.repo.loadPreferences();
    syncDomAttributes(this.prefs);
  }

  readonly getSnapshot = (): Preferences => this.prefs;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  setTheme(theme: ThemeMode): void {
    if (this.prefs.theme === theme) {
      return;
    }
    this.update((prev) => ({ ...prev, theme }));
  }

  toggleTheme(): void {
    this.setTheme(this.prefs.theme === 'dark' ? 'light' : 'dark');
  }

  setBoardPreset(boardPreset: BoardPreset): void {
    if (this.prefs.boardPreset === boardPreset) {
      return;
    }
    this.update((prev) => ({ ...prev, boardPreset }));
  }

  toggleSound(): void {
    this.update((prev) => ({ ...prev, soundEnabled: !prev.soundEnabled }));
  }

  toggleEvalBar(): void {
    this.update((prev) => ({ ...prev, evalBarVisible: !prev.evalBarVisible }));
  }

  toggleAutoFlipLocal(): void {
    this.update((prev) => ({ ...prev, autoFlipLocal: !prev.autoFlipLocal }));
  }

  updateLastSetup(patch: Partial<Preferences['lastSetup']>): void {
    this.update((prev) => ({
      ...prev,
      lastSetup: {
        ...prev.lastSetup,
        ...patch,
      },
    }));
  }

  private update(updater: (prev: Preferences) => Preferences): void {
    this.prefs = updater(this.prefs);
    this.repo.savePreferences(this.prefs);
    syncDomAttributes(this.prefs);
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const preferencesStore = new PreferencesStore();

export function usePreferences(): Preferences {
  return useSyncExternalStore(
    preferencesStore.subscribe,
    preferencesStore.getSnapshot,
    preferencesStore.getSnapshot
  );
}
