export const POWER_CHANNELS = ['engines', 'weapons', 'shields'] as const;
export type PowerChannel = typeof POWER_CHANNELS[number];
export type Allocation = Record<PowerChannel, number>;
export const REACTOR_UNITS = 10;
export const POWER_PRESETS = {
	balanced: { engines: 4, weapons: 4, shields: 2 },
	engines: { engines: 6, weapons: 2, shields: 2 },
	weapons: { engines: 2, weapons: 6, shields: 2 },
	shields: { engines: 2, weapons: 2, shields: 6 },
} as const;
export const POWER_OUTPUTS = {
	speedPerUnit: 3,
	weaponRatePerUnit: 0.25,
	maxWeaponRate: 2.5,
	shieldRechargePerUnit: 4,
} as const;
export const powerOutputs = function (allocation: Readonly<Allocation>) {
	return {
		speed: allocation.engines * POWER_OUTPUTS.speedPerUnit,
		weaponRate: Math.min(POWER_OUTPUTS.maxWeaponRate, allocation.weapons * POWER_OUTPUTS.weaponRatePerUnit),
		shieldRecharge: allocation.shields * POWER_OUTPUTS.shieldRechargePerUnit,
	};
};

export const SHIELD_CONFIG = {
	capacity: 360,
	initialCharge: 240,
	rechargeRate: 8,
	rechargeDelay: 3,
} as const;

export interface SystemsState {
	allocation: Allocation;
	distanceTraveled: number;
	routeLength: number;
	powerChanges: number;
	// Delay and hit flash are remaining simulation seconds; absorbed hits flash for 0.25s.
	shield: { charge: number; capacity: number; rechargeDelay: number; hitFlash: number };
	shieldAbsorbed: number;
}

export const createSystems = function (routeLength: number): SystemsState {
	return {
		allocation: { ...POWER_PRESETS.balanced }, distanceTraveled: 0, routeLength, powerChanges: 0,
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
	shield.charge = Math.min(shield.capacity, shield.charge + powerOutputs(systems.allocation).shieldRecharge * rechargeTime);
};
