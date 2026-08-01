import type { PetDirection } from './types';

export interface MotionStep {
  x: number;
  y: number;
  arrived: boolean;
  direction: PetDirection;
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function stepTowardTarget(
  x: number,
  y: number,
  targetX: number,
  targetY: number,
  direction: PetDirection,
  speedPixelsPerSecond: number,
  deltaSeconds: number,
  travelWidth: number,
  travelHeight: number,
): MotionStep {
  if (
    travelWidth <= 0 ||
    travelHeight <= 0 ||
    speedPixelsPerSecond <= 0 ||
    deltaSeconds <= 0
  ) {
    return {
      x: clamp(x, 0, 1),
      y: clamp(y, 0, 1),
      arrived: false,
      direction,
    };
  }

  const safeDelta = Math.min(deltaSeconds, 0.1);
  const currentPixelX = clamp(x, 0, 1) * travelWidth;
  const currentPixelY = clamp(y, 0, 1) * travelHeight;
  const targetPixelX = clamp(targetX, 0, 1) * travelWidth;
  const targetPixelY = clamp(targetY, 0, 1) * travelHeight;
  const deltaX = targetPixelX - currentPixelX;
  const deltaY = targetPixelY - currentPixelY;
  const distance = Math.hypot(deltaX, deltaY);
  const maximumStep = speedPixelsPerSecond * safeDelta;

  if (distance <= maximumStep || distance < 0.5) {
    return {
      x: clamp(targetX, 0, 1),
      y: clamp(targetY, 0, 1),
      arrived: true,
      direction: Math.abs(deltaX) < 0.5 ? direction : deltaX < 0 ? -1 : 1,
    };
  }

  const scale = maximumStep / distance;
  return {
    x: clamp((currentPixelX + deltaX * scale) / travelWidth, 0, 1),
    y: clamp((currentPixelY + deltaY * scale) / travelHeight, 0, 1),
    arrived: false,
    direction: Math.abs(deltaX) < 0.5 ? direction : deltaX < 0 ? -1 : 1,
  };
}
