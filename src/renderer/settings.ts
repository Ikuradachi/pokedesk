import { searchCatalog } from '../common/catalog';
import type {
  ActionResult,
  PetSize,
  PokemonDefinition,
  RenderedPet,
  SettingsSnapshot,
} from '../common/types';

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing settings element: #${id}`);
  }
  return element as T;
}

const pauseButton = requiredElement<HTMLButtonElement>('pause-button');
const pauseLabel = requiredElement<HTMLSpanElement>('pause-label');
const pauseGlyph = pauseButton.querySelector<HTMLElement>('.pause-glyph');
const statusCopy = requiredElement<HTMLSpanElement>('status-copy');
const roamingStatus = document.querySelector<HTMLElement>('.roaming-status');
const onboardingCard = requiredElement<HTMLElement>('onboarding-card');
const onboardingClose = requiredElement<HTMLButtonElement>('onboarding-close');
const randomButton = requiredElement<HTMLButtonElement>('random-button');
const removeAllButton = requiredElement<HTMLButtonElement>('remove-all-button');
const searchInput = requiredElement<HTMLInputElement>('pokemon-search');
const clearSearchButton = requiredElement<HTMLButtonElement>('clear-search');
const resultsTitle = requiredElement<HTMLElement>('results-title');
const resultsCount = requiredElement<HTMLElement>('results-count');
const searchResults = requiredElement<HTMLUListElement>('search-results');
const rosterList = requiredElement<HTMLUListElement>('roster-list');
const teamCount = requiredElement<HTMLElement>('team-count');
const toast = requiredElement<HTMLElement>('toast');
const sizeInputs = Array.from(
  document.querySelectorAll<HTMLInputElement>('input[name="pet-size"]'),
);

const popularPokemonIds = [
  'pikachu',
  'eevee',
  'charmander',
  'gengar',
  'snorlax',
  'bulbasaur',
];

let currentState: SettingsSnapshot | null = null;
let toastTimer: number | undefined;

function spriteFrame(pokemon: PokemonDefinition): HTMLElement {
  const frame = document.createElement('span');
  frame.className = 'sprite-frame';
  frame.setAttribute('aria-hidden', 'true');

  const image = document.createElement('img');
  image.src = pokemon.sprites.idle;
  image.alt = '';
  image.loading = 'lazy';
  frame.append(image);
  return frame;
}

function detailsForPokemon(pokemon: PokemonDefinition): HTMLElement {
  const details = document.createElement('span');
  details.className = 'pokemon-details';

  const name = document.createElement('span');
  name.className = 'pokemon-name';
  name.textContent = pokemon.name;

  const meta = document.createElement('span');
  meta.className = 'pokemon-meta';

  const generation = document.createElement('span');
  generation.className = 'generation-tag';
  generation.textContent = `GEN ${pokemon.generation}`;
  meta.append(generation);

  details.append(name, meta);
  return details;
}

function showToast(message: string, isError = false): void {
  if (toastTimer !== undefined) {
    window.clearTimeout(toastTimer);
  }

  toast.textContent = message;
  toast.classList.toggle('is-error', isError);
  toast.hidden = false;
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 3200);
}

async function refreshState(): Promise<void> {
  currentState = await window.pokedesk.getSettingsState();
  render();
}

async function performAction(
  action: () => Promise<ActionResult>,
  button?: HTMLButtonElement,
): Promise<void> {
  if (button) {
    button.disabled = true;
  }

  try {
    const result = await action();
    showToast(result.message, !result.ok);
    await refreshState();
  } catch (error: unknown) {
    console.error(error);
    showToast('Action failed. Try again.', true);
  } finally {
    if (button?.isConnected) {
      button.disabled = false;
    }
  }
}

function suggestedPokemon(
  catalog: readonly PokemonDefinition[],
): PokemonDefinition[] {
  const suggestions = popularPokemonIds.flatMap((id) => {
    const pokemon = catalog.find((candidate) => candidate.id === id);
    return pokemon ? [pokemon] : [];
  });

  return suggestions.length > 0 ? suggestions : catalog.slice(0, 6);
}

function emptyState(
  heading: string,
  copy: string,
  actionLabel: string,
  action: () => void,
): HTMLLIElement {
  const item = document.createElement('li');
  item.className = 'empty-state';

  const content = document.createElement('div');
  const strong = document.createElement('strong');
  strong.textContent = heading;
  const paragraph = document.createElement('p');
  paragraph.textContent = copy;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = actionLabel;
  button.addEventListener('click', action);

  content.append(strong, paragraph, button);
  item.append(content);
  return item;
}

function renderSearchResults(): void {
  if (!currentState) {
    return;
  }

  const query = searchInput.value.trim();
  const rawMatches = query
    ? searchCatalog(currentState.catalog, query, 41)
    : suggestedPokemon(currentState.catalog);
  const hasMore = query.length > 0 && rawMatches.length > 40;
  const matches = hasMore ? rawMatches.slice(0, 40) : rawMatches;
  const isAtCapacity = currentState.pets.length >= currentState.maxPets;

  clearSearchButton.hidden = query.length === 0;
  resultsTitle.textContent = query ? 'Search results' : 'Quick picks';
  resultsCount.textContent = query
    ? `${matches.length}${hasMore ? '+' : ''}`
    : '';
  searchResults.replaceChildren();

  if (matches.length === 0) {
    searchResults.append(
      emptyState(
        `No match for “${query}”`,
        'Try a shorter name, another spelling, or a generation like gen2.',
        'Clear search',
        () => {
          searchInput.value = '';
          searchInput.focus();
          renderSearchResults();
        },
      ),
    );
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const pokemon of matches) {
    const item = document.createElement('li');
    item.className = 'pokemon-row';

    const button = document.createElement('button');
    button.className = 'row-button';
    button.type = 'button';
    button.textContent = 'Spawn';
    button.disabled = isAtCapacity;
    button.title = isAtCapacity
      ? `Maximum ${currentState.maxPets} companions reached`
      : `Spawn ${pokemon.name}`;
    button.setAttribute('aria-label', `Spawn ${pokemon.name}`);
    button.addEventListener('click', () => {
      void performAction(
        () => window.pokedesk.spawnPokemon(pokemon.id),
        button,
      );
    });

    item.append(spriteFrame(pokemon), detailsForPokemon(pokemon), button);
    fragment.append(item);
  }
  searchResults.append(fragment);
}

function renderRosterPet(pet: RenderedPet): HTMLLIElement {
  const item = document.createElement('li');
  item.className = 'roster-row';

  const details = detailsForPokemon(pet.definition);
  const meta = details.querySelector<HTMLElement>('.pokemon-meta');
  if (meta) {
    const screenLabel = document.createElement('span');
    screenLabel.textContent = 'Roaming';
    meta.append(screenLabel);
  }

  const removeButton = document.createElement('button');
  removeButton.className = 'row-button remove';
  removeButton.type = 'button';
  removeButton.textContent = '×';
  removeButton.setAttribute(
    'aria-label',
    `Remove ${pet.definition.name} from desktop`,
  );
  removeButton.title = `Recall ${pet.definition.name}`;
  removeButton.addEventListener('click', () => {
    void performAction(() => window.pokedesk.despawnPet(pet.id), removeButton);
  });

  item.append(spriteFrame(pet.definition), details, removeButton);
  return item;
}

function renderRoster(): void {
  if (!currentState) {
    return;
  }

  rosterList.replaceChildren();
  if (currentState.pets.length === 0) {
    rosterList.append(
      emptyState(
        'Quiet desktop',
        'Invite a favorite above or let PokeDesk choose one.',
        'Spawn random',
        () => {
          void performAction(() => window.pokedesk.spawnRandom(), randomButton);
        },
      ),
    );
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const pet of currentState.pets) {
    fragment.append(renderRosterPet(pet));
  }
  rosterList.append(fragment);
}

function render(): void {
  if (!currentState) {
    return;
  }

  const { pets, preferences, maxPets } = currentState;
  const count = pets.length;
  const companionWord = count === 1 ? 'companion' : 'companions';

  statusCopy.textContent = preferences.paused
    ? `${count} ${companionWord} resting`
    : `${count} ${companionWord} roaming`;
  roamingStatus?.classList.toggle('is-paused', preferences.paused);

  pauseButton.setAttribute(
    'aria-pressed',
    preferences.paused ? 'true' : 'false',
  );
  pauseLabel.textContent = preferences.paused ? 'Resume' : 'Pause';
  if (pauseGlyph) {
    pauseGlyph.textContent = preferences.paused ? '▶' : 'Ⅱ';
  }

  onboardingCard.hidden = preferences.onboardingDismissed;
  removeAllButton.disabled = count === 0;
  teamCount.textContent = `${count} / ${maxPets}`;

  for (const input of sizeInputs) {
    input.checked = input.value === preferences.size;
  }

  renderSearchResults();
  renderRoster();
}

pauseButton.addEventListener('click', () => {
  if (!currentState) {
    return;
  }

  const nextPaused = !currentState.preferences.paused;
  pauseButton.disabled = true;
  void window.pokedesk
    .setPaused(nextPaused)
    .then(refreshState)
    .catch((error: unknown) => {
      console.error(error);
      showToast('Could not change roaming state.', true);
    })
    .finally(() => {
      pauseButton.disabled = false;
    });
});

onboardingClose.addEventListener('click', () => {
  void window.pokedesk.dismissOnboarding().catch((error: unknown) => {
    console.error(error);
    showToast('Could not save that preference.', true);
  });
});

randomButton.addEventListener('click', () => {
  void performAction(() => window.pokedesk.spawnRandom(), randomButton);
});

removeAllButton.addEventListener('click', () => {
  void performAction(() => window.pokedesk.despawnAll(), removeAllButton);
});

searchInput.addEventListener('input', () => {
  renderSearchResults();
});

clearSearchButton.addEventListener('click', () => {
  searchInput.value = '';
  searchInput.focus();
  renderSearchResults();
});

for (const input of sizeInputs) {
  input.addEventListener('change', () => {
    if (!input.checked) {
      return;
    }

    void window.pokedesk
      .setSize(input.value as PetSize)
      .then(refreshState)
      .catch((error: unknown) => {
        console.error(error);
        showToast('Could not change sprite size.', true);
      });
  });
}

document.addEventListener('keydown', (event) => {
  const target = event.target;
  const isTyping =
    target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;

  if (event.key === '/' && !isTyping) {
    event.preventDefault();
    searchInput.focus();
  }

  if (event.key === 'Escape' && document.activeElement === searchInput) {
    searchInput.value = '';
    renderSearchResults();
  }
});

window.pokedesk.onSettingsChanged((state) => {
  currentState = state;
  render();
});

void refreshState().catch((error: unknown) => {
  console.error(error);
  statusCopy.textContent = 'Settings unavailable';
  showToast('PokeDesk could not load its settings.', true);
});
