import type { State } from './simulation';
import { canAcquire } from './sensors';

export type Sound = 'beam' | 'flak' | 'rail' | 'missile' | 'escort' | 'impact' | 'explosion' | 'damage' | 'contact' | 'clear' | 'pulse' | 'repair' | 'depart' | 'won' | 'lost' | 'order';

// Observe presentation state after every fixed step; never mutate gameplay or queue audio.
export const createSoundObserver = function () {
	let effects = new WeakSet<State['effects'][number]>();
	let previous: { state: State; hull: number; kills: number; losses: number; wave: number; cleared: boolean; pulse: number; repair: number; status: State['status']; lastShot: number; cooldowns: number[]; escorts: Map<number, number> } | undefined;
	return function (state: State): Sound[] {
		const before = previous;
		previous = { state, hull: state.hull, kills: state.kills, losses: state.escortLosses, wave: state.wave, cleared: state.cleared, pulse: state.pulseCooldown, repair: state.repairCooldown, status: state.status, lastShot: state.nextId - 1, cooldowns: state.mounts.map(function (mount) { return mount.cooldown; }), escorts: new Map(state.escorts.map(function (craft) { return [craft.id, craft.cooldown]; })) };
		if (!before || before.state !== state) { effects = new WeakSet(state.effects); return []; }
		const sounds = new Set<Sound>();
		// A close-range projectile may hit and disappear within the same fixed step.
		for (const [index, mount] of state.mounts.entries()) {
			const cooldown = before.cooldowns[index];
			if (mount.weapon && cooldown !== undefined && mount.cooldown > Math.max(0, cooldown)) sounds.add(mount.weapon);
		}
		for (const craft of state.escorts) {
			const cooldown = before.escorts.get(craft.id);
			if (cooldown !== undefined && craft.cooldown > cooldown) sounds.add('escort');
		}
		for (const effect of state.effects) {
			if (!effects.has(effect) && (effect.feedback?.kind === 'impact' || effect.radius === 10 || effect.radius === 15 || effect.radius === 85)) sounds.add('impact');
			effects.add(effect);
		}
		for (const shot of state.shots) {
			if (shot.id <= before.lastShot || shot.side !== 'player') continue;
			if (shot.weapon !== 'hostile' && shot.weapon !== 'beam') sounds.add(shot.weapon);
		}
		if (state.hull < before.hull) sounds.add('damage');
		if (state.kills > before.kills || state.escortLosses > before.losses) sounds.add('explosion');
		if (state.wave > before.wave && state.enemies.some(function (enemy) { return enemy.id > before.lastShot && enemy.hp > 0 && canAcquire(state, enemy); })) sounds.add('contact');
		if (state.cleared && !before.cleared) sounds.add('clear');
		if (state.pulseCooldown > before.pulse) sounds.add('pulse');
		if (state.repairCooldown > before.repair) sounds.add('repair');
		if (state.status !== before.status) {
			if (state.status === 'running') sounds.add('depart');
			if (state.status === 'won' || state.status === 'lost') sounds.add(state.status);
		}
		return [...sounds];
	};
};
