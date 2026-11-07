import { clamp, stepTowardTarget } from '../common/motion';
import { constrainPositionForMovement, GROUND_Y } from '../common/movement';
import type {
  DesktopSnapshot,
  PetDirection,
  PetSize,
  PositionUpdate,
  RenderedPet,
} from '../common/types';

interface DragState {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  lastClientX: number;
  startX: number;
  startY: number;
  moved: boolean;
}

interface RuntimePet {
  state: RenderedPet;
  element: HTMLDivElement;
  image: HTMLImageElement;
  lifecycle: 'spawning' | 'active' | 'despawning';
  lifecycleTimer?: number;
  x: number;
  y: number;
  direction: PetDirection;
  targetX: number;
  targetY: number;
  mode: 'idle' | 'walking';
  modeUntil: number;
  drag?: DragState;
  pettedUntil: number;
  feedbackTimer?: number;
}

const sizePixels: Readonly<Record<PetSize, number>> = {
  small: 72,
  medium: 96,
  large: 128,
};

const SPAWN_ANIMATION_MS = 500;
const DESPAWN_ANIMATION_MS = 620;
const REDUCED_MOTION_ANIMATION_MS = 140;
const POSITION_SAVE_DELAY_MS = 2500;
const reducedMotionQuery = window.matchMedia(
  '(prefers-reduced-motion: reduce)',
);

const petLayerElement = document.getElementById('pet-layer');
if (!petLayerElement) {
  throw new Error('Missing desktop pet layer.');
}
const petLayer: HTMLElement = petLayerElement;

const runtimePets = new Map<string, RuntimePet>();
let currentSnapshot: DesktopSnapshot | null = null;
let lastAnimationTime = performance.now();
let lastRenderedTime = 0;
let animationFrameId: number | undefined;
let positionSaveTimer: number | undefined;
let positionsDirty = false;
let mousePassthrough = true;
let lastPointerX = -1;
let lastPointerY = -1;

function currentPetSize(): number {
  return sizePixels[currentSnapshot?.preferences.size ?? 'medium'];
}

function travelBounds(): { width: number; height: number } {
  const size = currentPetSize();
  return {
    width: Math.max(1, window.innerWidth - size),
    height: Math.max(1, window.innerHeight - size),
  };
}

function isGrounded(runtime: RuntimePet): boolean {
  return runtime.state.definition.movement === 'ground';
}

function chooseTarget(runtime: RuntimePet): void {
  const grounded = isGrounded(runtime);
  let targetX = Math.random();
  let targetY = grounded ? GROUND_Y : Math.random();

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const distance = grounded
      ? Math.abs(targetX - runtime.x)
      : Math.hypot(targetX - runtime.x, targetY - runtime.y);
    if (distance >= 0.22) {
      break;
    }
    targetX = Math.random();
    if (!grounded) {
      targetY = Math.random();
    }
  }

  runtime.targetX = targetX;
  runtime.targetY = targetY;
}

function setMousePassthrough(ignore: boolean): void {
  if (ignore === mousePassthrough) {
    return;
  }

  mousePassthrough = ignore;
  window.pokedesk.setMousePassthrough(ignore);
}

function refreshMousePassthrough(): void {
  const hasActiveDrag = Array.from(runtimePets.values()).some(
    (runtime) => runtime.drag !== undefined,
  );
  if (hasActiveDrag) {
    setMousePassthrough(false);
    return;
  }

  if (lastPointerX < 0 || lastPointerY < 0) {
    setMousePassthrough(true);
    return;
  }

  const target = document.elementFromPoint(lastPointerX, lastPointerY);
  const overPet = target !== null && target.closest('.pet') !== null;
  setMousePassthrough(!overPet);
}

function setSprite(runtime: RuntimePet, moving: boolean): void {
  const sprites = runtime.state.definition.sprites;
  const source = moving
    ? runtime.direction === -1 && sprites.walkLeft
      ? sprites.walkLeft
      : sprites.walk
    : sprites.idle;
  if (runtime.image.src !== source) {
    runtime.image.src = source;
  }

  const usesDedicatedLeftSprite =
    moving && runtime.direction === -1 && Boolean(sprites.walkLeft);
  runtime.image.style.transform =
    runtime.direction === -1 && !usesDedicatedLeftSprite
      ? 'scaleX(-1)'
      : 'scaleX(1)';
}

function renderPosition(runtime: RuntimePet): void {
  const position = constrainPositionForMovement(
    runtime.state.definition.movement,
    runtime.x,
    runtime.y,
  );
  runtime.x = position.x;
  runtime.y = position.y;

  const bounds = travelBounds();
  const pixelX = runtime.x * bounds.width;
  const pixelY = runtime.y * bounds.height;
  runtime.element.style.transform = `translate3d(${Math.round(pixelX)}px, ${Math.round(pixelY)}px, 0)`;
  runtime.element.style.zIndex = String(1 + Math.round(runtime.y * 1000));
  runtime.element.classList.toggle('is-lower', runtime.y > 0.72);
  runtime.element.classList.toggle('is-upper', runtime.y < 0.18);
}

function petCompanion(runtime: RuntimePet): void {
  if (runtime.lifecycle !== 'active') {
    return;
  }

  const now = performance.now();
  runtime.pettedUntil = now + 1300;
  runtime.mode = 'idle';
  runtime.modeUntil = now + 1500;
  runtime.element.classList.remove('is-petted');
  void runtime.element.offsetWidth;
  runtime.element.classList.add('is-petted');
  setSprite(runtime, false);

  if (runtime.feedbackTimer !== undefined) {
    window.clearTimeout(runtime.feedbackTimer);
  }
  runtime.feedbackTimer = window.setTimeout(() => {
    runtime.element.classList.remove('is-petted');
  }, 1100);
}

function schedulePositionSave(): void {
  if (positionSaveTimer !== undefined) {
    return;
  }

  positionSaveTimer = window.setTimeout(() => {
    positionSaveTimer = undefined;
    sendPositions();
  }, POSITION_SAVE_DELAY_MS);
}

function markPositionsDirty(): void {
  positionsDirty = true;
  schedulePositionSave();
}

function sendPositions(): void {
  if (positionSaveTimer !== undefined) {
    window.clearTimeout(positionSaveTimer);
    positionSaveTimer = undefined;
  }
  if (!positionsDirty) {
    return;
  }
  positionsDirty = false;

  const updates: PositionUpdate[] = Array.from(
    runtimePets.values(),
    (runtime) => {
      const position = constrainPositionForMovement(
        runtime.state.definition.movement,
        runtime.x,
        runtime.y,
      );
      runtime.x = position.x;
      runtime.y = position.y;

      return {
        id: runtime.state.id,
        x: runtime.x,
        y: runtime.y,
        direction: runtime.direction,
      };
    },
  );

  if (updates.length > 0) {
    window.pokedesk.updatePositions(updates);
  }
}

function beginDrag(runtime: RuntimePet, event: PointerEvent): void {
  if (event.button !== 0) {
    return;
  }

  event.preventDefault();
  setMousePassthrough(false);
  runtime.drag = {
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    lastClientX: event.clientX,
    startX: runtime.x,
    startY: runtime.y,
    moved: false,
  };
  runtime.mode = 'idle';
  runtime.element.classList.add('is-dragging');
  runtime.element.setPointerCapture(event.pointerId);
  setSprite(runtime, false);
}

function moveDrag(runtime: RuntimePet, event: PointerEvent): void {
  const drag = runtime.drag;
  if (!drag || drag.pointerId !== event.pointerId) {
    return;
  }

  const bounds = travelBounds();
  const deltaX = event.clientX - drag.startClientX;
  const deltaY = event.clientY - drag.startClientY;
  const stepDeltaX = event.clientX - drag.lastClientX;
  drag.lastClientX = event.clientX;
  const effectiveDeltaY = isGrounded(runtime) ? 0 : deltaY;
  const previousX = runtime.x;
  const previousY = runtime.y;
  const previousDirection = runtime.direction;
  drag.moved ||= Math.hypot(deltaX, effectiveDeltaY) > 5;
  const position = constrainPositionForMovement(
    runtime.state.definition.movement,
    clamp(drag.startX + deltaX / bounds.width, 0, 1),
    drag.startY + effectiveDeltaY / bounds.height,
  );
  runtime.x = position.x;
  runtime.y = position.y;

  if (Math.abs(stepDeltaX) > 1) {
    runtime.direction = stepDeltaX < 0 ? -1 : 1;
  }
  if (
    runtime.x !== previousX ||
    runtime.y !== previousY ||
    runtime.direction !== previousDirection
  ) {
    markPositionsDirty();
  }
  renderPosition(runtime);
}

function endDrag(runtime: RuntimePet, event: PointerEvent): void {
  const drag = runtime.drag;
  if (!drag || drag.pointerId !== event.pointerId) {
    return;
  }

  if (runtime.element.hasPointerCapture(event.pointerId)) {
    runtime.element.releasePointerCapture(event.pointerId);
  }
  runtime.drag = undefined;
  runtime.element.classList.remove('is-dragging');
  chooseTarget(runtime);
  runtime.modeUntil = performance.now() + 1000;

  if (!drag.moved) {
    petCompanion(runtime);
  }

  sendPositions();
  refreshMousePassthrough();
}

function lifecycleAnimationDuration(duration: number): number {
  return reducedMotionQuery.matches ? REDUCED_MOTION_ANIMATION_MS : duration;
}

function finishSpawning(runtime: RuntimePet): void {
  if (runtime.lifecycle !== 'spawning') {
    return;
  }

  runtime.lifecycle = 'active';
  runtime.lifecycleTimer = undefined;
  runtime.element.classList.remove('is-spawning');
  runtime.modeUntil = performance.now() + 500 + Math.random() * 900;
}

function removeRuntimePet(id: string, runtime: RuntimePet): void {
  if (runtimePets.get(id) !== runtime) {
    return;
  }

  if (runtime.feedbackTimer !== undefined) {
    window.clearTimeout(runtime.feedbackTimer);
  }
  if (runtime.lifecycleTimer !== undefined) {
    window.clearTimeout(runtime.lifecycleTimer);
  }

  runtime.element.remove();
  runtimePets.delete(id);
  refreshMousePassthrough();
}

function beginDespawn(id: string, runtime: RuntimePet): void {
  if (runtime.lifecycle === 'despawning') {
    return;
  }

  if (runtime.feedbackTimer !== undefined) {
    window.clearTimeout(runtime.feedbackTimer);
    runtime.feedbackTimer = undefined;
  }
  if (runtime.lifecycleTimer !== undefined) {
    window.clearTimeout(runtime.lifecycleTimer);
  }
  if (
    runtime.drag &&
    runtime.element.hasPointerCapture(runtime.drag.pointerId)
  ) {
    runtime.element.releasePointerCapture(runtime.drag.pointerId);
  }

  runtime.drag = undefined;
  runtime.lifecycle = 'despawning';
  runtime.mode = 'idle';
  runtime.element.classList.remove('is-dragging', 'is-petted', 'is-spawning');
  void runtime.element.offsetWidth;
  runtime.element.classList.add('is-despawning');
  setSprite(runtime, false);
  refreshMousePassthrough();

  runtime.lifecycleTimer = window.setTimeout(() => {
    removeRuntimePet(id, runtime);
  }, lifecycleAnimationDuration(DESPAWN_ANIMATION_MS));
}

function createRuntimePet(pet: RenderedPet): RuntimePet {
  const element = document.createElement('div');
  element.className = 'pet is-spawning';
  element.dataset.petId = pet.id;
  element.title =
    pet.definition.movement === 'ground'
      ? `${pet.definition.name}: click to pet, drag left or right`
      : `${pet.definition.name}: click to pet, drag to move`;

  const spriteStage = document.createElement('span');
  spriteStage.className = 'sprite-stage';
  const image = document.createElement('img');
  image.className = 'pet-sprite';
  image.src = pet.definition.sprites.idle;
  image.alt = '';
  image.draggable = false;
  spriteStage.append(image);

  const label = document.createElement('span');
  label.className = 'pet-label';
  label.textContent = pet.definition.name;

  const feedback = document.createElement('img');
  feedback.className = 'pet-feedback';
  feedback.src = '../../assets/ui/heart.png';
  feedback.alt = '';
  feedback.draggable = false;

  const pokeballEffect = document.createElement('span');
  pokeballEffect.className = 'pokeball-effect';
  pokeballEffect.setAttribute('aria-hidden', 'true');

  const pokeball = document.createElement('span');
  pokeball.className = 'pokeball-sprite';
  pokeballEffect.append(pokeball);

  element.append(spriteStage, label, feedback, pokeballEffect);
  petLayer.append(element);

  const position = constrainPositionForMovement(
    pet.definition.movement,
    pet.x,
    pet.y,
  );
  const runtime: RuntimePet = {
    state: pet,
    element,
    image,
    lifecycle: 'spawning',
    x: position.x,
    y: position.y,
    direction: pet.direction,
    targetX: position.x,
    targetY: position.y,
    mode: 'idle',
    modeUntil: performance.now() + 600 + Math.random() * 1400,
    pettedUntil: 0,
  };
  chooseTarget(runtime);
  renderPosition(runtime);
  setSprite(runtime, false);

  element.addEventListener('pointerenter', () => {
    setMousePassthrough(false);
  });
  element.addEventListener('pointerleave', () => {
    if (!runtime.drag) {
      setMousePassthrough(true);
    }
  });
  element.addEventListener('pointerdown', (event) => {
    beginDrag(runtime, event);
  });
  element.addEventListener('pointermove', (event) => {
    moveDrag(runtime, event);
  });
  element.addEventListener('pointerup', (event) => {
    endDrag(runtime, event);
  });
  element.addEventListener('pointercancel', (event) => {
    endDrag(runtime, event);
  });

  runtime.lifecycleTimer = window.setTimeout(() => {
    finishSpawning(runtime);
  }, lifecycleAnimationDuration(SPAWN_ANIMATION_MS));

  return runtime;
}

function syncSnapshot(snapshot: DesktopSnapshot): void {
  const wasPaused = currentSnapshot?.preferences.paused ?? true;
  currentSnapshot = snapshot;
  document.documentElement.style.setProperty(
    '--pet-size',
    `${sizePixels[snapshot.preferences.size]}px`,
  );

  const incomingIds = new Set(snapshot.pets.map((pet) => pet.id));
  for (const [id, runtime] of runtimePets) {
    if (!incomingIds.has(id)) {
      beginDespawn(id, runtime);
    }
  }

  for (const pet of snapshot.pets) {
    const existing = runtimePets.get(pet.id);
    if (existing) {
      const position = constrainPositionForMovement(
        pet.definition.movement,
        existing.x,
        existing.y,
      );
      existing.x = position.x;
      existing.y = position.y;
      if (pet.definition.movement === 'ground') {
        existing.targetY = GROUND_Y;
      }
      existing.state = {
        ...pet,
        x: existing.x,
        y: existing.y,
        direction: existing.direction,
      };
      renderPosition(existing);
    } else {
      runtimePets.set(pet.id, createRuntimePet(pet));
    }
  }

  if (snapshot.preferences.paused) {
    for (const runtime of runtimePets.values()) {
      setSprite(runtime, false);
    }
    if (!wasPaused) {
      sendPositions();
    }
  }
  ensureAnimationLoop();
}

function shouldRunAnimation(): boolean {
  return currentSnapshot?.preferences.paused === false && runtimePets.size > 0;
}

function ensureAnimationLoop(): void {
  if (animationFrameId !== undefined || !shouldRunAnimation()) {
    return;
  }

  const now = performance.now();
  lastAnimationTime = now;
  lastRenderedTime = now - 1000 / 30;
  animationFrameId = window.requestAnimationFrame(animate);
}

function animate(now: number): void {
  animationFrameId = undefined;
  if (!shouldRunAnimation()) {
    return;
  }
  animationFrameId = window.requestAnimationFrame(animate);

  if (now - lastRenderedTime < 1000 / 30) {
    return;
  }

  const deltaSeconds = Math.min((now - lastAnimationTime) / 1000, 0.1);
  lastAnimationTime = now;
  lastRenderedTime = now;

  const bounds = travelBounds();

  for (const runtime of runtimePets.values()) {
    if (isGrounded(runtime)) {
      if (runtime.y !== GROUND_Y) {
        markPositionsDirty();
      }
      runtime.y = GROUND_Y;
      runtime.targetY = GROUND_Y;
    }

    if (runtime.lifecycle !== 'active' || runtime.drag) {
      continue;
    }

    if (now < runtime.pettedUntil) {
      setSprite(runtime, false);
      continue;
    }

    if (runtime.mode === 'idle') {
      setSprite(runtime, false);
      if (now >= runtime.modeUntil) {
        runtime.mode = 'walking';
        chooseTarget(runtime);
      }
      continue;
    }

    const step = stepTowardTarget(
      runtime.x,
      runtime.y,
      runtime.targetX,
      runtime.targetY,
      runtime.direction,
      runtime.state.speed,
      deltaSeconds,
      bounds.width,
      bounds.height,
    );
    if (
      runtime.x !== step.x ||
      runtime.y !== step.y ||
      runtime.direction !== step.direction
    ) {
      runtime.x = step.x;
      runtime.y = step.y;
      runtime.direction = step.direction;
      markPositionsDirty();
    }
    setSprite(runtime, true);
    renderPosition(runtime);

    if (step.arrived) {
      runtime.mode = 'idle';
      runtime.modeUntil = now + 700 + Math.random() * 1700;
      setSprite(runtime, false);
    }
  }

  refreshMousePassthrough();
}

document.addEventListener('mousemove', (event) => {
  lastPointerX = event.clientX;
  lastPointerY = event.clientY;
  refreshMousePassthrough();
});

window.addEventListener('mouseleave', () => {
  lastPointerX = -1;
  lastPointerY = -1;
  refreshMousePassthrough();
});

window.addEventListener('resize', () => {
  for (const runtime of runtimePets.values()) {
    renderPosition(runtime);
  }
});

window.addEventListener('beforeunload', () => {
  sendPositions();
});

window.pokedesk.onDesktopChanged((snapshot) => {
  syncSnapshot(snapshot);
});

void window.pokedesk
  .getDesktopState()
  .then((snapshot) => {
    syncSnapshot(snapshot);
  })
  .catch((error: unknown) => {
    console.error('Unable to initialize PokeDesk overlay:', error);
  });
