export const WEAPON_IDS = ['seeker', 'rail', 'flak', 'rattler', 'spark', 'helios', 'torpedo', 'ion'] as const;
export type WeaponId = typeof WEAPON_IDS[number];
export type WeaponRank = 1 | 2 | 3;
export interface WeaponStats {
	damage: number; reload: number; range: number; minRange: number; turnRate: number;
	projectiles: number; projectileSpeed: number; chargeTime: number; lockTime: number;
	pierce: number; blastRadius: number; interceptions: number; rampTime: number;
	links: number; linkRange: number;
}
export interface WeaponDefinition {
	id: WeaponId; name: string; family: string; role: string; tradeoff: string; color: string;
	ranks: Readonly<Record<WeaponRank, WeaponStats>>;
}
const stats = function (damage: number, reload: number, range: number, overrides: Partial<WeaponStats> = {}): WeaponStats {
	return { damage, reload, range, minRange: 0, turnRate: 2, projectiles: 1, projectileSpeed: 800,
		chargeTime: 0, lockTime: 0, pierce: 1, blastRadius: 0, interceptions: 0, rampTime: 0, links: 0, linkRange: 0, ...overrides };
};
export const WEAPONS: Readonly<Record<WeaponId, WeaponDefinition>> = {
	seeker: { id: 'seeker', name: 'Seeker', family: 'Guided missiles', color: '#8de0ba',
		role: 'Keep pressure through a turn. Tracks weakened contacts at any bearing.',
		tradeoff: 'Lower damage than positioned guns. Finite flight; cannot switch targets after launch.',
		ranks: {
			1: stats(36, 3.6, 1150, { projectiles: 3, projectileSpeed: 340, turnRate: 1.6 }),
			2: stats(54, 3.2, 1150, { projectiles: 4, projectileSpeed: 340, turnRate: 1.6 }),
			3: stats(68, 3, 1150, { projectiles: 5, projectileSpeed: 340, turnRate: 1.6 }),
		} },
	rail: { id: 'rail', name: 'Longspike', family: 'Rail gun', color: '#f4d68a',
		role: 'Line up enemy hulls for a fast piercing shot. Each penetration retains 65% damage.',
		tradeoff: 'Cannot fire inside 180 m. Slow traverse rewards a steady broadside.',
		ranks: {
			1: stats(150, 3, 1100, { minRange: 180, turnRate: 0.7, projectileSpeed: 1400, pierce: 2 }),
			2: stats(240, 2.7, 1100, { minRange: 180, turnRate: 0.7, projectileSpeed: 1400, pierce: 2 }),
			3: stats(330, 2.4, 1100, { minRange: 180, turnRate: 0.7, projectileSpeed: 1400, pierce: 3 }),
		} },
	flak: { id: 'flak', name: 'Bulwark', family: 'Flak cannon', color: '#f0b96b',
		role: 'Burst through clustered hulls or intercept approaching volleys.',
		tradeoff: 'Defense spends the same reload as offense. Short range; cannot stop beams.',
		ranks: {
			1: stats(45, 1, 500, { blastRadius: 95, interceptions: 2, projectileSpeed: 650, turnRate: 3 }),
			2: stats(75, 0.9, 500, { blastRadius: 125, interceptions: 3, projectileSpeed: 650, turnRate: 3 }),
			3: stats(100, 0.8, 500, { blastRadius: 155, interceptions: 5, projectileSpeed: 650, turnRate: 3 }),
		} },
	rattler: { id: 'rattler', name: 'Rattler', family: 'Machine gun', color: '#fff0be',
		role: 'Pursue one nearby hull. Sustained contact ramps damage up to 1.8×.',
		tradeoff: '380 m reach. Losing target, arc or range resets the ramp.',
		ranks: {
			1: stats(6, 0.12, 380, { turnRate: 4, rampTime: 2, projectileSpeed: 950 }),
			2: stats(10, 0.11, 380, { turnRate: 4, rampTime: 1.6, projectileSpeed: 950 }),
			3: stats(13, 0.1, 380, { turnRate: 4, rampTime: 1.2, projectileSpeed: 950 }),
		} },
	spark: { id: 'spark', name: 'Spark', family: 'Pulse beam', color: '#8eddeb',
		role: 'Snap onto fast flankers with precise, frequent first-hull pulses.',
		tradeoff: 'No splash or penetration. Less sustained close-range damage than a spun-up Rattler.',
		ranks: { 1: stats(40, 0.65, 650, { turnRate: 5 }), 2: stats(66, 0.6, 650, { turnRate: 5 }), 3: stats(84, 0.48, 650, { turnRate: 5 }) } },
	helios: { id: 'helios', name: 'Helios', family: 'Charge beam', color: '#ffd16e',
		role: 'Commit to a heavy first-hull beam. A growing charge shows the coming shot.',
		tradeoff: 'Slow tracking. Aim locks for the final 0.6 s; agile targets can dodge. Hold Fire cancels charge.',
		ranks: {
			1: stats(400, 4, 950, { turnRate: 0.65, chargeTime: 2, lockTime: 0.6 }),
			2: stats(660, 3.6, 950, { turnRate: 0.65, chargeTime: 1.8, lockTime: 0.6 }),
			3: stats(920, 3.2, 950, { turnRate: 0.65, chargeTime: 1.6, lockTime: 0.6 }),
		} },
	torpedo: { id: 'torpedo', name: 'Breach', family: 'Heavy torpedo', color: '#edb690',
		role: 'Hunt slow heavy hulls. Nearby hulls take 55% blast damage.',
		tradeoff: '200 m dead zone. Slow flight and wide turns make close flankers difficult.',
		ranks: {
			1: stats(240, 4, 850, { minRange: 200, projectileSpeed: 210, turnRate: 0.55, blastRadius: 120 }),
			2: stats(400, 3.6, 850, { minRange: 200, projectileSpeed: 210, turnRate: 0.55, blastRadius: 155 }),
			3: stats(570, 3.2, 850, { minRange: 200, projectileSpeed: 210, turnRate: 0.55, blastRadius: 190 }),
		} },
	ion: { id: 'ion', name: 'Ion arc', family: 'Chain disruptor', color: '#b4caff',
		role: 'Chain nearby hulls and slow them for rail and Helios shots. Each link retains 60% damage.',
		tradeoff: '420 m initial reach. Slow is capped at 20%, or 10% on command ships; does not delay enemy firing.',
		ranks: {
			1: stats(30, 0.7, 420, { links: 1, linkRange: 250, turnRate: 3 }),
			2: stats(48, 0.6, 420, { links: 2, linkRange: 280, turnRate: 3 }),
			3: stats(65, 0.55, 420, { links: 3, linkRange: 310, turnRate: 3 }),
		} },
};
export const weaponStats = function (weapon: WeaponId, rank: WeaponRank): WeaponStats { return WEAPONS[weapon].ranks[rank]; };
export const isWeaponId = function (value: unknown): value is WeaponId {
	return typeof value === 'string' && WEAPON_IDS.some(function (id) { return id === value; });
};
export const isWeaponRank = function (value: unknown): value is WeaponRank { return value === 1 || value === 2 || value === 3; };
export const nextRank = function (rank: WeaponRank): WeaponRank | undefined { return rank === 1 ? 2 : rank === 2 ? 3 : undefined; };
export const MOUNT_SOCKETS = (['port', 'starboard'] as const).flatMap(function (side, bank) {
	return Array.from({ length: 6 }, function (_, position) {
		return { index: bank * 6 + position, label: `${side === 'port' ? 'P' : 'S'}${position + 1}`, side,
			forward: 64 - position * 25, across: (side === 'port' ? -1 : 1) * 36.45 };
	});
});
export type MountStatus = 'EMPTY' | 'HOLD FIRE' | 'ARMOR LOCK' | 'OUT OF ARC' | 'TOO CLOSE' | 'OUT OF RANGE' | 'NO CONTACT' | 'TRACKING' | 'RELOADING' | 'CHARGING' | 'LOCKED' | 'FIRING';
export interface MountState {
	slot: number; weapon: WeaponId; rank: WeaponRank; reload: number; heading: number;
	target: number | undefined; charge: number; locked: boolean; lockHeading: number;
	ramp: number; defensiveBursts: number; status: MountStatus; burstRemaining: number;
	burstNext: number; fired: number; flash: number;
}
export const createMount = function (slot: number, weapon: WeaponId, rank: WeaponRank = 1, shipAngle = -Math.PI / 2): MountState {
	const heading = shipAngle + (slot < 6 ? -1 : 1) * Math.PI / 2;
	return { slot, weapon, rank, reload: 0, heading, target: undefined, charge: 0, locked: false,
		lockHeading: heading, ramp: 0, defensiveBursts: 0, status: 'NO CONTACT', burstRemaining: 0,
		burstNext: 0, fired: 0, flash: 0 };
};
export const weaponSummary = function (id: WeaponId, rank: WeaponRank): string {
	const s = weaponStats(id, rank);
	const damage = `${s.projectiles > 1 ? `${s.projectiles} × ` : ''}${s.damage} damage`;
	const range = `${s.minRange > 0 ? `${s.minRange}–` : ''}${s.range} m`;
	const specialty = id === 'rail' ? `${s.pierce} hulls pierced` : id === 'flak' ? `${s.blastRadius} m burst · stops ${s.interceptions} rounds`
		: id === 'rattler' ? `1.8× damage after ${s.rampTime} s contact` : id === 'helios' ? `${s.chargeTime} s charge · final ${s.lockTime} s aim lock`
		: id === 'torpedo' ? `${s.blastRadius} m blast` : id === 'ion' ? `${s.links} extra links within ${s.linkRange} m · 20% slow`
		: id === 'seeker' ? `360° tracking${rank === 3 ? ' · spread volley' : ''}` : 'Fast tracking · first hull';
	return `${damage} / ${s.reload} s${id === 'helios' ? ' recharge' : ''} · ${range} · ${specialty}`;
};
