import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  session,
  Tray,
  type Display,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type MenuItemConstructorOptions,
} from 'electron';
import {
  MAX_PETS,
  PET_SIZES,
  type ActionResult,
  type DesktopSnapshot,
  type PetDirection,
  type PetSize,
  type PetState,
  type PokemonDefinition,
  type PositionUpdate,
  type RenderedPet,
  type SettingsSnapshot,
} from '../common/types';
import { GROUND_Y } from '../common/movement';
import { loadPokemonCatalog } from './catalog';
import { AppStateStore } from './store';

const SETTINGS_CHANGED = 'settings:state-changed';
const DESKTOP_CHANGED = 'desktop:state-changed';
const isSmokeTest = process.argv.includes('--smoke-test');

if (isSmokeTest) {
  app.setPath('userData', join(app.getPath('temp'), 'pokedesk-smoke'));
}

let settingsWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let stateStore: AppStateStore | null = null;
let catalog: PokemonDefinition[] = [];
let pokemonById = new Map<string, PokemonDefinition>();
let isQuitting = false;

const overlayWindows = new Map<string, BrowserWindow>();
const overlayDisplayByWebContents = new Map<number, string>();

function getStateStore(): AppStateStore {
  if (!stateStore) {
    throw new Error('PokeDesk state is not initialized.');
  }

  return stateStore;
}

function appAssetPath(...segments: string[]): string {
  return join(app.getAppPath(), 'assets', ...segments);
}

function rendererPath(fileName: string): string {
  return join(app.getAppPath(), 'src', 'renderer', fileName);
}

function preloadPath(): string {
  return join(__dirname, 'preload.js');
}

function hardenWindow(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });
  window.webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
}

function commonWebPreferences() {
  return {
    preload: preloadPath(),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    spellcheck: false,
    devTools: !app.isPackaged,
  };
}

function toRenderedPet(
  pet: Readonly<{
    id: string;
    pokemonId: string;
    displayId: string;
    x: number;
    y: number;
    direction: PetDirection;
    speed: number;
  }>,
): RenderedPet | undefined {
  const definition = pokemonById.get(pet.pokemonId);
  return definition ? { ...pet, definition } : undefined;
}

function toPersistedPet(pet: RenderedPet): PetState {
  return {
    id: pet.id,
    pokemonId: pet.pokemonId,
    displayId: pet.displayId,
    x: pet.x,
    y: pet.y,
    direction: pet.direction,
    speed: pet.speed,
  };
}

function getRenderedPets(displayId?: string): RenderedPet[] {
  return getStateStore().state.pets.flatMap((pet) => {
    if (displayId && pet.displayId !== displayId) {
      return [];
    }

    const renderedPet = toRenderedPet(pet);
    return renderedPet ? [renderedPet] : [];
  });
}

function getSettingsSnapshot(): SettingsSnapshot {
  const state = getStateStore().state;
  return {
    catalog,
    pets: getRenderedPets(),
    preferences: { ...state.preferences },
    maxPets: MAX_PETS,
  };
}

function getDesktopSnapshot(displayId: string): DesktopSnapshot {
  return {
    displayId,
    pets: getRenderedPets(displayId),
    preferences: { ...getStateStore().state.preferences },
  };
}

function broadcastState(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send(SETTINGS_CHANGED, getSettingsSnapshot());
  }

  for (const [displayId, overlayWindow] of overlayWindows) {
    if (!overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send(
        DESKTOP_CHANGED,
        getDesktopSnapshot(displayId),
      );
    }
  }

  updateTrayMenu();
}

function createPet(pokemonId: string, displayId: string): RenderedPet {
  const definition = pokemonById.get(pokemonId);
  if (!definition) {
    throw new Error(`Unknown Pokémon: ${pokemonId}`);
  }

  return {
    id: randomUUID(),
    pokemonId,
    displayId,
    x: 0.12 + Math.random() * 0.76,
    y: definition.movement === 'ground' ? GROUND_Y : 0.1 + Math.random() * 0.78,
    direction: Math.random() < 0.5 ? -1 : 1,
    speed: 36 + Math.random() * 24,
    definition,
  };
}

function displayUnderCursor(): Display {
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
}

function spawnPokemon(pokemonId: string): ActionResult {
  const definition = pokemonById.get(pokemonId);
  if (!definition) {
    return {
      ok: false,
      message: 'That Pokémon is not in the bundled sprite catalog.',
    };
  }

  const store = getStateStore();
  if (store.state.pets.length >= MAX_PETS) {
    return {
      ok: false,
      message: `Team full. Remove one before adding more (${MAX_PETS} max).`,
    };
  }

  const pet = createPet(pokemonId, String(displayUnderCursor().id));
  store.update((state) => {
    state.pets.push(toPersistedPet(pet));
  });
  broadcastState();

  return {
    ok: true,
    message: `${definition.name} joined your desktop.`,
    pet,
  };
}

function spawnRandomPokemon(): ActionResult {
  const definition = catalog[Math.floor(Math.random() * catalog.length)];
  return definition
    ? spawnPokemon(definition.id)
    : {
        ok: false,
        message: 'No Pokémon sprites are available.',
      };
}

function despawnPet(petId: string): ActionResult {
  const store = getStateStore();
  const existingPet = store.state.pets.find((pet) => pet.id === petId);
  if (!existingPet) {
    return {
      ok: false,
      message: 'That companion is already gone.',
    };
  }

  const name = pokemonById.get(existingPet.pokemonId)?.name ?? 'Companion';
  store.update((state) => {
    state.pets = state.pets.filter((pet) => pet.id !== petId);
  });
  broadcastState();

  return {
    ok: true,
    message: `${name} returned to its Poké Ball.`,
  };
}

function despawnAll(): ActionResult {
  const store = getStateStore();
  const count = store.state.pets.length;
  if (count === 0) {
    return {
      ok: true,
      message: 'Desktop already clear.',
    };
  }

  store.update((state) => {
    state.pets = [];
  });
  broadcastState();

  return {
    ok: true,
    message: `${count} ${count === 1 ? 'companion' : 'companions'} returned.`,
  };
}

function setPaused(paused: boolean): void {
  getStateStore().update((state) => {
    state.preferences.paused = paused;
  });
  broadcastState();
}

function setPetSize(size: PetSize): void {
  getStateStore().update((state) => {
    state.preferences.size = size;
  });
  broadcastState();
}

function dismissOnboarding(): void {
  getStateStore().update((state) => {
    state.preferences.onboardingDismissed = true;
  });
  broadcastState();
}

function assertSettingsSender(event: IpcMainEvent | IpcMainInvokeEvent): void {
  if (
    !settingsWindow ||
    settingsWindow.isDestroyed() ||
    event.sender.id !== settingsWindow.webContents.id
  ) {
    throw new Error('Settings-only operation rejected.');
  }
}

function overlayDisplayForEvent(
  event: IpcMainEvent | IpcMainInvokeEvent,
): string | undefined {
  return overlayDisplayByWebContents.get(event.sender.id);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsePositionUpdates(value: unknown): PositionUpdate[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.slice(0, MAX_PETS).flatMap((candidate) => {
    if (
      !isRecord(candidate) ||
      typeof candidate.id !== 'string' ||
      typeof candidate.x !== 'number' ||
      !Number.isFinite(candidate.x) ||
      typeof candidate.y !== 'number' ||
      !Number.isFinite(candidate.y) ||
      (candidate.direction !== -1 && candidate.direction !== 1)
    ) {
      return [];
    }

    return [
      {
        id: candidate.id,
        x: Math.min(1, Math.max(0, candidate.x)),
        y: Math.min(1, Math.max(0, candidate.y)),
        direction: candidate.direction,
      },
    ];
  });
}

function registerIpc(): void {
  ipcMain.handle('settings:get-state', (event) => {
    assertSettingsSender(event);
    return getSettingsSnapshot();
  });

  ipcMain.handle('desktop:get-state', (event) => {
    const displayId = overlayDisplayForEvent(event);
    if (!displayId) {
      throw new Error('Desktop operation rejected.');
    }
    return getDesktopSnapshot(displayId);
  });

  ipcMain.handle('pets:spawn', (event, pokemonId: unknown) => {
    assertSettingsSender(event);
    return typeof pokemonId === 'string'
      ? spawnPokemon(pokemonId)
      : {
          ok: false,
          message: 'Invalid Pokémon selection.',
        };
  });

  ipcMain.handle('pets:spawn-random', (event) => {
    assertSettingsSender(event);
    return spawnRandomPokemon();
  });

  ipcMain.handle('pets:despawn', (event, petId: unknown) => {
    assertSettingsSender(event);
    return typeof petId === 'string'
      ? despawnPet(petId)
      : {
          ok: false,
          message: 'Invalid companion selection.',
        };
  });

  ipcMain.handle('pets:despawn-all', (event) => {
    assertSettingsSender(event);
    return despawnAll();
  });

  ipcMain.handle('preferences:set-paused', (event, paused: unknown) => {
    assertSettingsSender(event);
    if (typeof paused !== 'boolean') {
      throw new Error('Invalid pause preference.');
    }
    setPaused(paused);
  });

  ipcMain.handle('preferences:set-size', (event, size: unknown) => {
    assertSettingsSender(event);
    if (typeof size !== 'string' || !PET_SIZES.includes(size as PetSize)) {
      throw new Error('Invalid size preference.');
    }
    setPetSize(size as PetSize);
  });

  ipcMain.handle('preferences:dismiss-onboarding', (event) => {
    assertSettingsSender(event);
    dismissOnboarding();
  });

  ipcMain.on('desktop:set-mouse-passthrough', (event, ignore: unknown) => {
    const displayId = overlayDisplayForEvent(event);
    const overlayWindow = displayId ? overlayWindows.get(displayId) : undefined;
    if (!overlayWindow || overlayWindow.isDestroyed()) {
      return;
    }

    overlayWindow.setIgnoreMouseEvents(ignore !== false, {
      forward: true,
    });
  });

  ipcMain.on('desktop:update-positions', (event, value: unknown) => {
    const displayId = overlayDisplayForEvent(event);
    if (!displayId) {
      return;
    }

    const updates = parsePositionUpdates(value);
    if (updates.length === 0) {
      return;
    }

    const updatesById = new Map(
      updates.map((update) => [update.id, update] as const),
    );
    const store = getStateStore();
    const changedUpdates = new Map<string, PositionUpdate>();
    for (const pet of store.state.pets) {
      if (pet.displayId !== displayId) {
        continue;
      }

      const update = updatesById.get(pet.id);
      if (!update) {
        continue;
      }

      const y =
        pokemonById.get(pet.pokemonId)?.movement === 'ground'
          ? GROUND_Y
          : update.y;
      if (
        pet.x !== update.x ||
        pet.y !== y ||
        pet.direction !== update.direction
      ) {
        changedUpdates.set(pet.id, { ...update, y });
      }
    }
    if (changedUpdates.size === 0) {
      return;
    }

    store.update((state) => {
      for (const pet of state.pets) {
        const update = changedUpdates.get(pet.id);
        if (update) {
          pet.x = update.x;
          pet.y = update.y;
          pet.direction = update.direction;
        }
      }
    });
  });
}

function createSettingsWindow(): void {
  const window = new BrowserWindow({
    width: 480,
    height: 760,
    minWidth: 420,
    minHeight: 640,
    show: false,
    title: 'PokeDesk',
    icon: appAssetPath('ui', 'pokedesk.png'),
    backgroundColor: '#171820',
    autoHideMenuBar: true,
    minimizable: true,
    maximizable: true,
    skipTaskbar: false,
    webPreferences: commonWebPreferences(),
  });

  settingsWindow = window;
  hardenWindow(window);

  window.once('ready-to-show', () => {
    window.show();
    window.focus();
  });
  window.on('close', () => {
    if (!isQuitting) {
      showTrayHintOnce();
    }
  });
  window.on('closed', () => {
    settingsWindow = null;
  });

  void window
    .loadFile(rendererPath('settings.html'))
    .catch((error: unknown) => {
      console.error('Unable to load settings window:', error);
    });
}

function showSettings(): void {
  if (!settingsWindow || settingsWindow.isDestroyed()) {
    createSettingsWindow();
    return;
  }

  if (settingsWindow.isMinimized()) {
    settingsWindow.restore();
  }
  settingsWindow.show();
  settingsWindow.focus();
}

function createOverlayWindow(display: Display): void {
  const displayId = String(display.id);
  const window = new BrowserWindow({
    ...display.workArea,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    show: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      ...commonWebPreferences(),
      backgroundThrottling: false,
    },
  });

  const webContentsId = window.webContents.id;
  overlayWindows.set(displayId, window);
  overlayDisplayByWebContents.set(webContentsId, displayId);
  hardenWindow(window);
  window.setIgnoreMouseEvents(true, { forward: true });
  window.setAlwaysOnTop(true);

  window.webContents.once('did-finish-load', () => {
    window.showInactive();
  });
  window.on('closed', () => {
    overlayWindows.delete(displayId);
    overlayDisplayByWebContents.delete(webContentsId);
  });

  void window
    .loadFile(rendererPath('desktop.html'), {
      query: { displayId },
    })
    .catch((error: unknown) => {
      console.error(`Unable to load overlay for display ${displayId}:`, error);
    });
}

function syncDisplayWindows(): void {
  const displays = screen.getAllDisplays();
  const activeDisplayIds = new Set(
    displays.map((display) => String(display.id)),
  );
  const primaryDisplayId = String(screen.getPrimaryDisplay().id);

  for (const [displayId, overlayWindow] of overlayWindows) {
    if (!activeDisplayIds.has(displayId)) {
      overlayWindow.destroy();
    }
  }

  let reassignedPet = false;
  getStateStore().update((state) => {
    for (const pet of state.pets) {
      if (!activeDisplayIds.has(pet.displayId)) {
        pet.displayId = primaryDisplayId;
        reassignedPet = true;
      }
    }
  });

  for (const display of displays) {
    const displayId = String(display.id);
    const existingWindow = overlayWindows.get(displayId);
    if (existingWindow && !existingWindow.isDestroyed()) {
      existingWindow.setBounds(display.workArea);
    } else {
      createOverlayWindow(display);
    }
  }

  if (reassignedPet) {
    getStateStore().save();
  }
  broadcastState();
}

function updateTrayMenu(): void {
  if (!tray) {
    return;
  }

  const state = getStateStore().state;
  const menuItems: MenuItemConstructorOptions[] = [
    {
      label: 'Open PokeDesk',
      click: showSettings,
    },
    {
      label: 'Spawn random Pokémon',
      click: () => {
        spawnRandomPokemon();
      },
    },
    {
      label: 'Pause companions',
      type: 'checkbox',
      checked: state.preferences.paused,
      click: (item) => {
        setPaused(item.checked);
      },
    },
    {
      label: 'Remove all companions',
      enabled: state.pets.length > 0,
      click: () => {
        despawnAll();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit PokeDesk',
      click: () => {
        app.quit();
      },
    },
  ];

  tray.setContextMenu(Menu.buildFromTemplate(menuItems));
}

function createTray(): void {
  const image = nativeImage
    .createFromPath(appAssetPath('ui', 'pokedesk.png'))
    .resize({ width: 16, height: 16 });
  tray = new Tray(image);
  tray.setToolTip('PokeDesk');
  tray.on('click', showSettings);
  updateTrayMenu();
}

function showTrayHintOnce(): void {
  const store = getStateStore();
  if (store.state.preferences.trayHintSeen) {
    return;
  }

  if (process.platform === 'win32' && tray) {
    tray.displayBalloon({
      iconType: 'info',
      title: 'PokeDesk is still roaming',
      content: 'Open settings anytime from the notification area.',
      noSound: true,
      respectQuietTime: true,
    });
  }

  store.update((state) => {
    state.preferences.trayHintSeen = true;
  });
}

function installFirstCompanion(): void {
  const store = getStateStore();
  if (!store.isFirstRun || store.state.pets.length > 0) {
    return;
  }

  const pokemon =
    pokemonById.get('pikachu') ?? pokemonById.get('charmander') ?? catalog[0];
  if (!pokemon) {
    return;
  }

  const pet = createPet(pokemon.id, String(screen.getPrimaryDisplay().id));
  store.update((state) => {
    state.pets.push(toPersistedPet(pet));
  });
}

function normalizeStoredPetPositions(): void {
  const store = getStateStore();
  const hasFloatingGroundPet = store.state.pets.some(
    (pet) =>
      pokemonById.get(pet.pokemonId)?.movement === 'ground' &&
      pet.y !== GROUND_Y,
  );
  if (!hasFloatingGroundPet) {
    return;
  }

  store.update((state) => {
    for (const pet of state.pets) {
      if (pokemonById.get(pet.pokemonId)?.movement === 'ground') {
        pet.y = GROUND_Y;
      }
    }
  });
}

function configureSecurity(): void {
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => {
      callback(false);
    },
  );
}

function initialize(): void {
  app.setAppUserModelId('app.pokedesk.desktop');

  catalog = loadPokemonCatalog(appAssetPath('pokemon'));
  pokemonById = new Map(
    catalog.map((pokemon) => [pokemon.id, pokemon] as const),
  );

  if (catalog.length === 0) {
    throw new Error('No bundled Pokémon sprites were found.');
  }

  const displayIds = screen
    .getAllDisplays()
    .map((display) => String(display.id));
  stateStore = new AppStateStore(
    join(app.getPath('userData'), 'state.json'),
    new Set(pokemonById.keys()),
    displayIds,
  );

  normalizeStoredPetPositions();
  installFirstCompanion();
  configureSecurity();
  registerIpc();
  createTray();
  syncDisplayWindows();

  screen.on('display-added', syncDisplayWindows);
  screen.on('display-removed', syncDisplayWindows);
  screen.on('display-metrics-changed', syncDisplayWindows);

  if (isSmokeTest) {
    setTimeout(() => {
      if (settingsWindow && !settingsWindow.isDestroyed()) {
        console.error('Smoke test failed: settings loaded during startup.');
        process.exitCode = 1;
      }
      app.quit();
    }, 5000);
  }
}

app.on('before-quit', () => {
  isQuitting = true;
});
app.on('window-all-closed', () => {
  // Tray owns app lifetime.
});
app.on('activate', showSettings);
app.on('second-instance', showSettings);

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  void app
    .whenReady()
    .then(initialize)
    .catch((error: unknown) => {
      const message =
        error instanceof Error ? error.message : 'Unknown startup error.';
      console.error('PokeDesk failed to start:', error);
      process.exitCode = 1;
      dialog.showErrorBox(
        'PokeDesk could not start',
        `${message}\n\nReinstall the app if bundled assets are missing.`,
      );
      app.quit();
    });
}
