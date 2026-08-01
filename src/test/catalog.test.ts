import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  humanizePokemonId,
  normalizeSearchText,
  searchCatalog,
} from '../common/catalog';
import type { PokemonDefinition } from '../common/types';

const catalog: PokemonDefinition[] = [
  {
    id: 'mrMime',
    name: 'Mr. Mime',
    generation: 1,
    movement: 'ground',
    sprites: { idle: 'idle.gif', walk: 'walk.gif' },
  },
  {
    id: 'treecko',
    name: 'Treecko',
    generation: 3,
    movement: 'ground',
    sprites: { idle: 'idle.gif', walk: 'walk.gif' },
  },
];

describe('Pokémon catalog helpers', () => {
  it('formats known forms and camel-case identifiers', () => {
    assert.equal(humanizePokemonId('nidoran_female'), 'Nidoran ♀');
    assert.equal(humanizePokemonId('rotom_wash'), 'Rotom Wash');
    assert.equal(humanizePokemonId('mimeJr'), 'Mime Jr.');
  });

  it('normalizes punctuation and accents for search', () => {
    assert.equal(normalizeSearchText('Mr. Mime'), 'mrmime');
    assert.equal(normalizeSearchText('Pokémon'), 'pokemon');
  });

  it('searches by display name and generation', () => {
    assert.deepEqual(
      searchCatalog(catalog, 'mime').map((pokemon) => pokemon.id),
      ['mrMime'],
    );
    assert.deepEqual(
      searchCatalog(catalog, 'gen3').map((pokemon) => pokemon.id),
      ['treecko'],
    );
  });
});
