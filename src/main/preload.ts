import { contextBridge, ipcRenderer } from 'electron';
import type {
  ActionResult,
  DesktopSnapshot,
  PetSize,
  PokeDeskApi,
  PositionUpdate,
  SettingsSnapshot,
} from '../common/types';

const api: PokeDeskApi = {
  getSettingsState: () =>
    ipcRenderer.invoke('settings:get-state') as Promise<SettingsSnapshot>,
  getDesktopState: () =>
    ipcRenderer.invoke('desktop:get-state') as Promise<DesktopSnapshot>,
  spawnPokemon: (pokemonId: string) =>
    ipcRenderer.invoke('pets:spawn', pokemonId) as Promise<ActionResult>,
  spawnRandom: () =>
    ipcRenderer.invoke('pets:spawn-random') as Promise<ActionResult>,
  despawnPet: (petId: string) =>
    ipcRenderer.invoke('pets:despawn', petId) as Promise<ActionResult>,
  despawnAll: () =>
    ipcRenderer.invoke('pets:despawn-all') as Promise<ActionResult>,
  setPaused: (paused: boolean) =>
    ipcRenderer.invoke('preferences:set-paused', paused) as Promise<void>,
  setSize: (size: PetSize) =>
    ipcRenderer.invoke('preferences:set-size', size) as Promise<void>,
  dismissOnboarding: () =>
    ipcRenderer.invoke('preferences:dismiss-onboarding') as Promise<void>,
  setMousePassthrough: (ignore: boolean) => {
    ipcRenderer.send('desktop:set-mouse-passthrough', ignore);
  },
  updatePositions: (updates: PositionUpdate[]) => {
    ipcRenderer.send('desktop:update-positions', updates);
  },
  onSettingsChanged: (callback: (state: SettingsSnapshot) => void) => {
    ipcRenderer.on(
      'settings:state-changed',
      (_event, state: SettingsSnapshot) => {
        callback(state);
      },
    );
  },
  onDesktopChanged: (callback: (state: DesktopSnapshot) => void) => {
    ipcRenderer.on(
      'desktop:state-changed',
      (_event, state: DesktopSnapshot) => {
        callback(state);
      },
    );
  },
};

contextBridge.exposeInMainWorld('pokedesk', api);
