export const SHIELD_CONFIG = {
	capacity: 360,
	initialCharge: 240,
	rechargeRate: 8,
	rechargeDelay: 3,
} as const;

export interface SystemsState {
	// Delay and hit flash are remaining simulation seconds; absorbed hits flash for 0.25s.
	shield: { charge: number; capacity: number; rechargeDelay: number; hitFlash: number };
	shieldAbsorbed: number;
}

export const createSystems = function (): SystemsState {
	return {
		shield: { charge: SHIELD_CONFIG.initialCharge, capacity: SHIELD_CONFIG.capacity, rechargeDelay: 0, hitFlash: 0 },
		shieldAbsorbed: 0,
	};
};

export const absorbShieldDamage = function (systems: SystemsState, damage: number): number {
	if (!Number.isFinite(damage) || damage <= 0) return 0;
	const shield = systems.shield;
	const absorbed = Math.min(shield.charge, damage);
	shield.charge = Math.max(0, shield.charge - absorbed);
	shield.rechargeDelay = SHIELD_CONFIG.rechargeDelay;
	if (absorbed > 0) shield.hitFlash = 0.25;
	systems.shieldAbsorbed += absorbed;
	return damage - absorbed;
};

export const advanceSystems = function (systems: SystemsState, dt: number, arkHit: boolean) {
	const shield = systems.shield;
	if (arkHit) return;
	const rechargeTime = Math.max(0, dt - shield.rechargeDelay);
	shield.rechargeDelay = Math.max(0, shield.rechargeDelay - dt);
	shield.charge = Math.min(shield.capacity, shield.charge + SHIELD_CONFIG.rechargeRate * rechargeTime);
};
