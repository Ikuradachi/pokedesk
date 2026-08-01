import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  constrainPositionForMovement,
  movementForPokemon,
} from '../common/movement';

describe('Pokémon movement classification', () => {
  it('keeps grounded Pokémon on land', () => {
    assert.equal(movementForPokemon('pikachu'), 'ground');
    assert.equal(movementForPokemon('doduo'), 'ground');
    assert.equal(movementForPokemon('dodrio'), 'ground');
    assert.equal(movementForPokemon('unknown_future_species'), 'ground');
  });

  it('allows winged and hovering Pokémon to roam in two dimensions', () => {
    assert.equal(movementForPokemon('butterfree'), 'air');
    assert.equal(movementForPokemon('gastly'), 'air');
    assert.equal(movementForPokemon('magnemite'), 'air');
    assert.equal(movementForPokemon('rotom_wash'), 'air');
    assert.equal(movementForPokemon('unown_question'), 'air');
  });

  it('locks ground positions to the bottom while preserving air height', () => {
    assert.deepEqual(constrainPositionForMovement('ground', 1.4, 0.2), {
      x: 1,
      y: 1,
    });
    assert.deepEqual(constrainPositionForMovement('air', -0.2, 0.35), {
      x: 0,
      y: 0.35,
    });
  });
});
