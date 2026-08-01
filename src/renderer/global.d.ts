import type { PokeDeskApi } from '../common/types';

declare global {
  interface Window {
    pokedesk: PokeDeskApi;
  }
}

export {};
