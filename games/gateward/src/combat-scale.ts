// Scale tactical distances and linear speeds together, preserving travel times.
// Hulls, fittings, damage, angular speeds and mission clocks keep their own units.
export const COMBAT_SCALE = 4;
export const tactical = function (value: number): number { return value * COMBAT_SCALE; };
export const MIN_CAMERA_ZOOM = 0.65 / COMBAT_SCALE;
