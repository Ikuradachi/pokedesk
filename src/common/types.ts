export const MAX_PETS = 24;

export const PET_SIZES = ['small', 'medium', 'large'] as const;

export type PetSize = (typeof PET_SIZES)[number];
export type PetDirection = -1 | 1;
export type PokemonMovement = 'ground' | 'air';

export interface PokemonSprites {
  idle: string;
  walk: string;
  walkLeft?: string;
}

export interface PokemonDefinition {
  id: string;
  name: string;
  generation: number;
  movement: PokemonMovement;
  sprites: PokemonSprites;
}

export interface PetState {
  id: string;
  pokemonId: string;
  displayId: string;
  x: number;
  y: number;
  direction: PetDirection;
  speed: number;
}

export interface Preferences {
  size: PetSize;
  paused: boolean;
  onboardingDismissed: boolean;
  trayHintSeen: boolean;
}

export interface PersistedState {
  version: 1;
  pets: PetState[];
  preferences: Preferences;
}

export interface RenderedPet extends PetState {
  definition: PokemonDefinition;
}

export interface SettingsSnapshot {
  catalog: PokemonDefinition[];
  pets: RenderedPet[];
  preferences: Preferences;
  maxPets: number;
}

export interface DesktopSnapshot {
  displayId: string;
  pets: RenderedPet[];
  preferences: Preferences;
}

export interface PositionUpdate {
  id: string;
  x: number;
  y: number;
  direction: PetDirection;
}

export interface ActionResult {
  ok: boolean;
  message: string;
  pet?: RenderedPet;
}

export interface PokeDeskApi {
  getSettingsState(): Promise<SettingsSnapshot>;
  getDesktopState(): Promise<DesktopSnapshot>;
  spawnPokemon(pokemonId: string): Promise<ActionResult>;
  spawnRandom(): Promise<ActionResult>;
  despawnPet(petId: string): Promise<ActionResult>;
  despawnAll(): Promise<ActionResult>;
  setPaused(paused: boolean): Promise<void>;
  setSize(size: PetSize): Promise<void>;
  dismissOnboarding(): Promise<void>;
  setMousePassthrough(ignore: boolean): void;
  updatePositions(updates: PositionUpdate[]): void;
  onSettingsChanged(callback: (state: SettingsSnapshot) => void): void;
  onDesktopChanged(callback: (state: DesktopSnapshot) => void): void;
}
