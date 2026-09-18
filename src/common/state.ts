import {
  MAX_PETS,
  PET_SIZES,
  type PersistedState,
  type PetDirection,
  type PetSize,
  type PetState,
  type Preferences,
} from './types';
import { clamp } from './motion';

export const DEFAULT_PREFERENCES: Preferences = {
  size: 'medium',
  paused: false,
  onboardingDismissed: false,
  trayHintSeen: false,
};

export function createEmptyState(): PersistedState {
  return {
    version: 1,
    pets: [],
    preferences: { ...DEFAULT_PREFERENCES },
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPetSize(value: unknown): value is PetSize {
  return (
    typeof value === 'string' &&
    PET_SIZES.includes(value as (typeof PET_SIZES)[number])
  );
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function sanitizePreferences(value: unknown): Preferences {
  const preferences = isRecord(value) ? value : {};

  return {
    size: isPetSize(preferences.size)
      ? preferences.size
      : DEFAULT_PREFERENCES.size,
    paused: booleanOr(preferences.paused, DEFAULT_PREFERENCES.paused),
    onboardingDismissed: booleanOr(
      preferences.onboardingDismissed,
      DEFAULT_PREFERENCES.onboardingDismissed,
    ),
    trayHintSeen: booleanOr(
      preferences.trayHintSeen,
      DEFAULT_PREFERENCES.trayHintSeen,
    ),
  };
}

export function sanitizePersistedState(
  value: unknown,
  pokemonIds: ReadonlySet<string>,
  displayIds: readonly string[],
): PersistedState {
  const input = isRecord(value) ? value : {};
  const primaryDisplayId = displayIds[0] ?? 'primary';
  const seenPetIds = new Set<string>();
  const pets: PetState[] = [];

  if (Array.isArray(input.pets)) {
    for (const candidate of input.pets) {
      if (pets.length >= MAX_PETS) {
        break;
      }
      if (!isRecord(candidate)) {
        continue;
      }

      const id = typeof candidate.id === 'string' ? candidate.id : '';
      const pokemonId =
        typeof candidate.pokemonId === 'string' ? candidate.pokemonId : '';

      if (
        !id ||
        seenPetIds.has(id) ||
        !pokemonIds.has(pokemonId) ||
        pokemonId.length > 80
      ) {
        continue;
      }

      const candidateDisplayId =
        typeof candidate.displayId === 'string'
          ? candidate.displayId
          : primaryDisplayId;
      const displayId = displayIds.includes(candidateDisplayId)
        ? candidateDisplayId
        : primaryDisplayId;
      const direction: PetDirection = candidate.direction === -1 ? -1 : 1;

      pets.push({
        id,
        pokemonId,
        displayId,
        x: clamp(numberOr(candidate.x, 0.5), 0, 1),
        y: clamp(numberOr(candidate.y, 0.65), 0, 1),
        direction,
        speed: clamp(numberOr(candidate.speed, 48), 20, 100),
      });
      seenPetIds.add(id);
    }
  }

  return {
    version: 1,
    pets,
    preferences: sanitizePreferences(input.preferences),
  };
}
