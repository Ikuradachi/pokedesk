import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createEmptyState, sanitizePersistedState } from '../common/state';
import type { PersistedState } from '../common/types';

export class AppStateStore {
  readonly isFirstRun: boolean;
  private stateValue: PersistedState;

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

  update(mutator: (state: PersistedState) => void): void {
    mutator(this.stateValue);
    this.save();
  }

  save(): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      writeFileSync(
        this.filePath,
        `${JSON.stringify(this.stateValue, null, 2)}\n`,
        'utf8',
      );
    } catch (error: unknown) {
      console.error('Unable to save PokeDesk state:', error);
    }
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
