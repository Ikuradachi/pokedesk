import { clamp } from './motion';
import type { PokemonMovement } from './types';

export const GROUND_Y = 1;

/*
 * Seeded from Flying-type and Levitate Pokémon in PokéAPI, then curated for
 * the bundled sprite poses. Unknown Pokémon deliberately default to ground.
 */
const AIRBORNE_POKEMON_IDS = new Set([
  'aerodactyl',
  'altaria',
  'arceus_flying',
  'articuno',
  'azelf',
  'baltoy',
  'beautifly',
  'beedrill',
  'beldum',
  'braviary',
  'bronzong',
  'bronzor',
  'butterfree',
  'carnivine',
  'castform',
  'celebi',
  'charizard',
  'chatot',
  'chimecho',
  'chingling',
  'claydol',
  'combee',
  'cottonee',
  'cresselia',
  'crobat',
  'darkrai',
  'delibird',
  'dragonite',
  'drifblim',
  'drifloon',
  'ducklett',
  'duosion',
  'duskull',
  'dustox',
  'elgyem',
  'emolga',
  'farfetchd',
  'fearow',
  'flygon',
  'froslass',
  'gastly',
  'giratina_origin',
  'gligar',
  'gliscor',
  'golbat',
  'gyarados',
  'haunter',
  'honchkrow',
  'hooh',
  'hoothoot',
  'hoppip',
  'illumise',
  'jirachi',
  'jumpluff',
  'klang',
  'koffing',
  'latias',
  'latios',
  'ledian',
  'ledyba',
  'lugia',
  'lunatone',
  'magnemite',
  'magneton',
  'magnezone',
  'mandibuzz',
  'mantine',
  'mantyke',
  'masquerain',
  'mesprit',
  'metang',
  'mew',
  'misdreavus',
  'mismagius',
  'moltres',
  'mothim',
  'munna',
  'murkrow',
  'musharna',
  'natu',
  'ninjask',
  'noctowl',
  'pelipper',
  'pidgeot',
  'pidgeotto',
  'pidgey',
  'pidove',
  'porygon',
  'porygon2',
  'porygonz',
  'probopass',
  'rayquaza',
  'rotom',
  'salamence',
  'scyther',
  'shaymin_sky',
  'shedinja',
  'shuppet',
  'sigilyph',
  'skarmory',
  'skiploom',
  'solrock',
  'spearow',
  'staraptor',
  'staravia',
  'starly',
  'swablu',
  'swellow',
  'taillow',
  'togekiss',
  'togetic',
  'tropius',
  'unown',
  'uxie',
  'vanillish',
  'venomoth',
  'vespiquen',
  'vibrava',
  'victini',
  'volbeat',
  'weezing',
  'wingull',
  'woobat',
  'xatu',
  'yanma',
  'yanmega',
  'zapdos',
  'zubat',
]);

const GROUND_OVERRIDES = new Set(['dodrio', 'doduo']);

export function movementForPokemon(id: string): PokemonMovement {
  const normalizedId = id.trim().toLowerCase();
  if (GROUND_OVERRIDES.has(normalizedId)) {
    return 'ground';
  }

  const formSeparator = normalizedId.indexOf('_');
  const baseId =
    formSeparator === -1 ? normalizedId : normalizedId.slice(0, formSeparator);

  return AIRBORNE_POKEMON_IDS.has(normalizedId) ||
    AIRBORNE_POKEMON_IDS.has(baseId)
    ? 'air'
    : 'ground';
}

export function constrainPositionForMovement(
  movement: PokemonMovement,
  x: number,
  y: number,
): { x: number; y: number } {
  return {
    x: clamp(x, 0, 1),
    y: movement === 'ground' ? GROUND_Y : clamp(y, 0, 1),
  };
}
