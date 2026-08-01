import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_PREFERENCES, sanitizePersistedState } from '../common/state';

describe('persisted state', () => {
  it('filters invalid pets and preserves later valid entries', () => {
    const result = sanitizePersistedState(
      {
        pets: [
          null,
          {
            id: 'valid',
            pokemonId: 'pikachu',
            displayId: 'missing',
            x: 2,
            y: -1,
            direction: -1,
            speed: 500,
          },
          {
            id: 'valid',
            pokemonId: 'pikachu',
            displayId: '1',
          },
          {
            id: 'unknown',
            pokemonId: 'missingno',
            displayId: '1',
          },
        ],
      },
      new Set(['pikachu']),
      ['1'],
    );

    assert.deepEqual(result.pets, [
      {
        id: 'valid',
        pokemonId: 'pikachu',
        displayId: '1',
        x: 1,
        y: 0,
        direction: -1,
        speed: 100,
      },
    ]);
  });

  it('falls back to safe preferences', () => {
    const result = sanitizePersistedState(
      {
        preferences: {
          size: 'enormous',
          paused: 'yes',
          onboardingDismissed: true,
        },
      },
      new Set(),
      ['primary'],
    );

    assert.deepEqual(result.preferences, {
      ...DEFAULT_PREFERENCES,
      onboardingDismissed: true,
    });
  });
});
