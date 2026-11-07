import type { PokemonDefinition } from './types';

const SPECIAL_NAMES: Readonly<Record<string, string>> = {
  farfetchd: "Farfetch'd",
  hooh: 'Ho-Oh',
  mimeJr: 'Mime Jr.',
  mrmime: 'Mr. Mime',
  nidoran_female: 'Nidoran ♀',
  nidoran_male: 'Nidoran ♂',
  porygonZ: 'Porygon-Z',
};

const searchCache = new WeakMap<PokemonDefinition, string>();

function searchIndexFor(pokemon: PokemonDefinition): string {
  let cached = searchCache.get(pokemon);
  if (!cached) {
    cached = normalizeSearchText(
      `${pokemon.name} ${pokemon.id} gen${pokemon.generation}`,
    );
    searchCache.set(pokemon, cached);
  }
  return cached;
}

export function humanizePokemonId(id: string): string {
  const specialName = SPECIAL_NAMES[id];
  if (specialName) {
    return specialName;
  }

  return id
    .replaceAll('_', ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/♀/g, ' female ')
    .replace(/♂/g, ' male ')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .toLowerCase();
}

export function searchCatalog(
  catalog: readonly PokemonDefinition[],
  query: string,
  limit = 40,
): PokemonDefinition[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return [];
  }

  return catalog
    .filter((pokemon) => searchIndexFor(pokemon).includes(normalizedQuery))
    .slice(0, limit);
}
