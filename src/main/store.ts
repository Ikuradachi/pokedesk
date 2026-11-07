import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { createEmptyState, sanitizePersistedState } from '../common/state';
import type { PersistedState } from '../common/types';

export class AppStateStore {
  readonly isFirstRun: boolean;
  private stateValue: PersistedState;
  private saveTimer?: NodeJS.Timeout;

  constructor(
    private readonly filePath: string,
    pokemonIds: ReadonlySet<string>,
    displayIds: readonly string[],
  ) {
    this.isFirstRun = !existsSync(filePath);
    this.stateValue = this.read(pokemonIds, displayIds);
  }

  get state(): PersistedState {
    return this.stateValue;
  }

  update(mutator: (state: PersistedState) => void, immediate = true): void {
    mutator(this.stateValue);
    if (immediate) {
      this.save();
    } else {
      this.scheduleSave();
    }
  }

  flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = undefined;
      this.save();
    }
  }

  save(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = undefined;
    }
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
      writeFileSync(
        temporaryPath,
        `${JSON.stringify(this.stateValue, null, 2)}\n`,
        'utf8',
      );
      renameSync(temporaryPath, this.filePath);
    } catch (error: unknown) {
      console.error('Unable to save PokeDesk state:', error);
    }
  }

  private scheduleSave(delayMs = 1000): void {
    if (this.saveTimer) {
      return;
    }
    this.saveTimer = setTimeout(() => {
      this.saveTimer = undefined;
      this.save();
    }, delayMs);
  }

  private read(
    pokemonIds: ReadonlySet<string>,
    displayIds: readonly string[],
  ): PersistedState {
    if (!existsSync(this.filePath)) {
      return createEmptyState();
    }

    try {
      const parsed: unknown = JSON.parse(readFileSync(this.filePath, 'utf8'));
      return sanitizePersistedState(parsed, pokemonIds, displayIds);
    } catch (error: unknown) {
      console.error('Unable to read PokeDesk state; using defaults:', error);
      return createEmptyState();
    }
  }
}
