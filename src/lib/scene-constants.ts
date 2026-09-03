export const FLOOR_H = 3.15;
export const BASE_H = 3.0;
export const ABOVE = 10;
export const BELOW = 3;
export const TW = 22;
export const TD = 20;
export const COLS = 5;

export function slabY(floor: number): number {
  if (floor < 0) return floor * BASE_H;
  if (floor === 11) return ABOVE * FLOOR_H;
  return (floor - 1) * FLOOR_H;
}

export function volumeCenterY(floor: number): number {
  if (floor < 0) return (floor + 0.5) * BASE_H;
  if (floor === 11) return ABOVE * FLOOR_H + 0.35;
  return (floor - 0.5) * FLOOR_H;
}

export function volumeHeight(floor: number): number {
  if (floor === 11) return 0.7;
  if (floor < 0) return BASE_H;
  return FLOOR_H;
}

export const FLOOR_LIST: number[] = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, -1, -2, -3];
