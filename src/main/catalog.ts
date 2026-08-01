import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { humanizePokemonId } from '../common/catalog';
import { movementForPokemon } from '../common/movement';
import type { PokemonDefinition } from '../common/types';

function chooseSprite(
  directory: string,
  fileNames: readonly string[],
  preferredName: string,
  fallbackName?: string,
): string | undefined {
  const selectedName =
    fileNames.find((name) => name === preferredName) ??
    (fallbackName
      ? fileNames.find((name) => name === fallbackName)
      : undefined);

  return selectedName
    ? pathToFileURL(join(directory, selectedName)).href
    : undefined;
}

export function loadPokemonCatalog(assetRoot: string): PokemonDefinition[] {
  const definitions: PokemonDefinition[] = [];
  const generationDirectories = readdirSync(assetRoot, {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory() && /^gen\d+$/.test(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const generationDirectory of generationDirectories) {
    const generation = Number(generationDirectory.name.slice(3));
    const generationPath = join(assetRoot, generationDirectory.name);
    const pokemonDirectories = readdirSync(generationPath, {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .sort((left, right) => left.name.localeCompare(right.name));

    for (const pokemonDirectory of pokemonDirectories) {
      const pokemonPath = join(generationPath, pokemonDirectory.name);
      const fileNames = readdirSync(pokemonPath).filter((name) =>
        name.endsWith('.gif'),
      );
      const idle = chooseSprite(
        pokemonPath,
        fileNames,
        'default_idle_8fps.gif',
        'default_walk_8fps.gif',
      );
      const walk = chooseSprite(
        pokemonPath,
        fileNames,
        'default_walk_8fps.gif',
        'default_idle_8fps.gif',
      );

      if (!idle || !walk) {
        continue;
      }

      const walkLeft = chooseSprite(
        pokemonPath,
        fileNames,
        'default_walk_left_8fps.gif',
      );

      definitions.push({
        id: pokemonDirectory.name,
        name: humanizePokemonId(pokemonDirectory.name),
        generation,
        movement: movementForPokemon(pokemonDirectory.name),
        sprites: {
          idle,
          walk,
          ...(walkLeft ? { walkLeft } : {}),
        },
      });
    }
  }

  return definitions;
}
