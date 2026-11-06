import { muzzlePoint } from './effect-motion';
import { awardSalvage } from './arsenal';
import { angleDelta, clamp, distance, hitFraction, localPoint, sideAngle, type Enemy, type Point, type Shell, type State } from './simulation';
import { MOUNT_SOCKETS, weaponStats, type MountState, type WeaponId } from './weapons';

const muzzleFor = function (state: State, mount: MountState): Point {
	const socket = MOUNT_SOCKETS[mount.slot];
	return socket ? localPoint(state.player, socket.forward, socket.across) : state.player;
};
const inHemisphere = function (state: State, mount: MountState, point: Point) {
	if (mount.weapon === 'seeker') return true;
	const socket = MOUNT_SOCKETS[mount.slot];
	if (!socket) return false;
	const from = muzzleFor(state, mount);
	return Math.abs(angleDelta(sideAngle(state.player, socket.side), Math.atan2(point.y - from.y, point.x - from.x))) <= Math.PI / 2 + 0.000001;
};
const accessible = function (state: State, mount: MountState, point: Point) {
	const stats = weaponStats(mount.weapon, mount.rank); const range = distance(muzzleFor(state, mount), point);
	return range <= stats.range && range >= stats.minRange && inHemisphere(state, mount, point);
};
const livingTargets = function (state: State, mount: MountState) {
	return state.enemies.filter(function (enemy) { return enemy.hp > 0 && accessible(state, mount, enemy); });
};
const clusterCount = function (state: State, target: Enemy, radius: number) {
	return state.enemies.filter(function (enemy) { return enemy.hp > 0 && enemy.id !== target.id && distance(enemy, target) <= radius; }).length;
};
const lineCount = function (state: State, mount: MountState, target: Enemy) {
	const from = muzzleFor(state, mount); const angle = Math.atan2(target.y - from.y, target.x - from.x);
	const range = weaponStats(mount.weapon, mount.rank).range;
	const end = { x: from.x + Math.cos(angle) * range, y: from.y + Math.sin(angle) * range };
	return state.enemies.filter(function (enemy) { return enemy.hp > 0 && hitFraction(from, end, enemy) !== undefined; }).length;
};
const speedOf = function (enemy: Enemy) { return Math.hypot(enemy.vx, enemy.vy); };
const selectTarget = function (state: State, mount: MountState): Enemy | undefined {
	const candidates = livingTargets(state, mount); const from = muzzleFor(state, mount);
	const retained = candidates.find(function (enemy) { return enemy.id === mount.target; });
	if (mount.weapon === 'rattler' && retained) return retained;
	if (mount.weapon === 'helios' && mount.charge > 0) return retained;
	const stats = weaponStats(mount.weapon, mount.rank);
	const alliedTargets = state.arsenal?.mounts.flatMap(function (other) {
		return other && (other.weapon === 'helios' || other.weapon === 'rail') && other.target !== undefined ? [other.target] : [];
	}) ?? [];
	return candidates.sort(function (a, b) {
		const tie = distance(from, a) - distance(from, b) || a.id - b.id;
		if (mount.weapon === 'seeker') return a.hp - b.hp || tie;
		if (mount.weapon === 'spark') return speedOf(b) - speedOf(a) || tie;
		if (mount.weapon === 'torpedo') return b.maxHp - a.maxHp || speedOf(a) - speedOf(b) || tie;
		if (mount.weapon === 'rail') return lineCount(state, mount, b) - lineCount(state, mount, a) || speedOf(a) - speedOf(b) || b.maxHp - a.maxHp || tie;
		if (mount.weapon === 'ion') return Number(alliedTargets.includes(b.id)) - Number(alliedTargets.includes(a.id))
			|| clusterCount(state, b, stats.linkRange) - clusterCount(state, a, stats.linkRange) || tie;
		if (mount.weapon === 'flak') return clusterCount(state, b, stats.blastRadius) - clusterCount(state, a, stats.blastRadius) || tie;
		return speedOf(a) - speedOf(b) || b.maxHp - a.maxHp || tie;
	})[0];
};
const damageEnemy = function (state: State, enemy: Enemy, damage: number, weaponId: WeaponId, at: Point = enemy, elevation = 31) {
	const actual = Math.min(Math.max(0, enemy.hp), Math.max(0, damage));
	if (actual <= 0) return;
	enemy.hp -= actual; state.stats.hits++;
	if (!enemy.training) awardSalvage(state, actual);
	state.effects.push({ x: at.x, y: at.y, kind: 'impact', duration: 0.25, life: 0.25, weaponId, elevation });
	state.events.push('hit');
};
const calibratedDamage = function (state: State, mount: MountState) {
	return weaponStats(mount.weapon, mount.rank).damage * (1 + (state.campaign?.upgrades.rails ?? 0) * 0.15);
};
const fired = function (state: State, mount: MountState, from: Point) {
	mount.fired++; mount.flash = mount.weapon === 'helios' ? 0.3 : 0.12; mount.status = 'FIRING';
	state.effects.push({ ...from, kind: 'muzzle', duration: 0.16, life: 0.16, weaponId: mount.weapon, source: { slot: mount.slot, heading: mount.locked ? mount.lockHeading : mount.heading } });
	state.events.push(mount.weapon === 'seeker' ? 'missile' : mount.weapon);
	if (mount.weapon === 'helios' || mount.weapon === 'rail') state.shake = Math.max(state.shake, 2);
};
const beam = function (state: State, mount: MountState, angle: number) {
	const from = muzzleFor(state, mount); const stats = weaponStats(mount.weapon, mount.rank);
	const end = { x: from.x + Math.cos(angle) * stats.range, y: from.y + Math.sin(angle) * stats.range };
	const hit = state.enemies.filter(function (enemy) { return enemy.hp > 0; })
		.map(function (enemy) { return { enemy, fraction: hitFraction(from, end, enemy) }; })
		.filter(function (candidate): candidate is { enemy: Enemy; fraction: number } { return candidate.fraction !== undefined; })
		.sort(function (a, b) { return a.fraction - b.fraction || a.enemy.id - b.enemy.id; })[0];
	const to = hit ? { x: from.x + (end.x - from.x) * hit.fraction, y: from.y + (end.y - from.y) * hit.fraction } : end;
	state.beams.push({ from, to, hostile: false, life: mount.weapon === 'helios' ? 0.24 : 0.1, weaponId: mount.weapon, visualFrom: muzzlePoint(state.player, mount.slot, mount.weapon, angle), elevation: 31 });
	if (hit) damageEnemy(state, hit.enemy, calibratedDamage(state, mount), mount.weapon, to);
	fired(state, mount, from);
};
const ion = function (state: State, mount: MountState, target: Enemy) {
	const stats = weaponStats(mount.weapon, mount.rank); const visited = new Set<number>();
	let from = muzzleFor(state, mount); let current: Enemy | undefined = target; let damage = calibratedDamage(state, mount);
	for (let link = 0; link <= stats.links && current; link++) {
		visited.add(current.id);
		state.beams.push({ from, to: { x: current.x, y: current.y }, hostile: false, life: 0.16, weaponId: 'ion', ...(link === 0 ? { visualFrom: muzzlePoint(state.player, mount.slot, mount.weapon, mount.heading) } : {}), elevation: 31 });
		damageEnemy(state, current, damage, 'ion');
		current.slowRemaining = 1.6; current.slowFactor = current.command ? 0.1 : 0.2;
		from = { x: current.x, y: current.y }; damage *= 0.6;
		current = state.enemies.filter(function (enemy) { return enemy.hp > 0 && !visited.has(enemy.id) && distance(from, enemy) <= stats.linkRange; })
			.sort(function (a, b) { return distance(from, a) - distance(from, b) || a.id - b.id; })[0];
	}
	fired(state, mount, muzzleFor(state, mount));
};
const shellAt = function (state: State, mount: MountState, angle: number): Shell {
	const stats = weaponStats(mount.weapon, mount.rank); const speed = stats.projectileSpeed;
	return { ...muzzleFor(state, mount), vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
		life: stats.range / speed, hostile: false, damage: calibratedDamage(state, mount), weaponId: mount.weapon, launch: { point: muzzlePoint(state.player, mount.slot, mount.weapon, angle), time: state.time, elevation: muzzlePoint(state.player, mount.slot, mount.weapon, angle).elevation } };
};
const launchMissile = function (state: State, mount: MountState) {
	const stats = weaponStats(mount.weapon, mount.rank);
	let target = state.enemies.find(function (enemy) { return enemy.id === mount.target && enemy.hp > 0; });
	if (mount.rank === 3) {
		const candidates = livingTargets(state, mount);
		const uncommitted = candidates.filter(function (enemy) {
			const incoming = state.shells.filter(function (shell) { return !shell.hostile && shell.life > 0 && shell.guidance?.target === enemy.id; })
				.reduce(function (total, shell) { return total + shell.damage; }, 0);
			return enemy.hp > incoming;
		});
		target = (uncommitted.length > 0 ? uncommitted : candidates).sort(function (a, b) { return a.hp - b.hp || a.id - b.id; })[0];
	}
	if (!target) { mount.burstRemaining = 0; return; }
	const from = muzzleFor(state, mount); const angle = Math.atan2(target.y - from.y, target.x - from.x);
	const shell = shellAt(state, mount, angle);
	shell.projectile = 'missile'; shell.life = 4;
	shell.guidance = { target: target.id, turnRate: 1.6, speed: stats.projectileSpeed };
	state.shells.push(shell); mount.burstRemaining--; mount.burstNext = 0.12;
	fired(state, mount, from);
};
const predictedAim = function (from: Point, target: Enemy, speed: number): Point {
	const flight = speed > 0 ? distance(from, target) / speed : 0;
	return { x: target.x + target.vx * flight, y: target.y + target.vy * flight };
};
const imminentThreat = function (state: State, mount: MountState): Shell | undefined {
	const p = state.player;
	return state.shells.filter(function (shell) { return shell.hostile && shell.life > 0 && accessible(state, mount, shell); })
		.map(function (shell) {
			const horizon = Math.min(1.6, shell.life);
			return { shell, horizon, fraction: hitFraction(shell, { x: shell.x + (shell.vx - p.vx) * horizon, y: shell.y + (shell.vy - p.vy) * horizon }, p) };
		})
		.filter(function (candidate): candidate is { shell: Shell; horizon: number; fraction: number } { return candidate.fraction !== undefined; })
		.sort(function (a, b) { return a.fraction * a.horizon - b.fraction * b.horizon; })[0]?.shell;
};
const cancelCommitment = function (mount: MountState) {
	mount.charge = 0; mount.locked = false; mount.ramp = 0; mount.burstRemaining = 0; mount.burstNext = 0;
};
export const resetTurrets = function (state: State) {
	for (const mount of state.arsenal?.mounts ?? []) if (mount) {
		cancelCommitment(mount); mount.reload = 0; mount.target = undefined; mount.defensiveBursts = 0; mount.flash = 0;
		const socket = MOUNT_SOCKETS[mount.slot];
		if (socket) mount.heading = sideAngle(state.player, socket.side);
		mount.status = state.fireControl.automatic ? 'NO CONTACT' : 'HOLD FIRE';
	}
};
export const updateTurrets = function (state: State, dt: number) {
	for (const mount of state.arsenal?.mounts ?? []) {
		if (!mount) continue;
		const stats = weaponStats(mount.weapon, mount.rank); const from = muzzleFor(state, mount);
		mount.flash = Math.max(0, mount.flash - dt);
		mount.reload = Math.max(0, mount.reload - dt * (state.player.braced ? 0.45 : 1));
		if (!state.fireControl.automatic || state.player.braced) {
			cancelCommitment(mount); mount.status = state.player.braced ? 'ARMOR LOCK' : 'HOLD FIRE'; continue;
		}
		if (mount.weapon === 'helios' && mount.locked) {
			mount.charge += dt; mount.heading = mount.lockHeading; mount.status = 'LOCKED';
			if (mount.charge + 0.000001 >= stats.chargeTime) {
				beam(state, mount, mount.lockHeading); state.stats.salvos++;
				mount.reload = stats.reload; mount.charge = 0; mount.locked = false;
			}
			continue;
		}
		if (mount.burstRemaining > 0) {
			mount.burstNext -= dt;
			if (mount.burstNext <= 0) launchMissile(state, mount);
			continue;
		}
		const target = selectTarget(state, mount);
		const threat = mount.weapon === 'flak' && (mount.defensiveBursts < 2 || !target) ? imminentThreat(state, mount) : undefined;
		if (mount.target !== target?.id) mount.ramp = 0;
		mount.target = target?.id;
		if (!target && !threat) {
			cancelCommitment(mount);
			const contacts = state.enemies.filter(function (enemy) { return enemy.hp > 0; });
			mount.status = contacts.length === 0 ? 'NO CONTACT'
				: contacts.some(function (enemy) { return inHemisphere(state, mount, enemy) && distance(from, enemy) < stats.minRange; }) ? 'TOO CLOSE'
				: contacts.some(function (enemy) { return inHemisphere(state, mount, enemy); }) ? 'OUT OF RANGE' : 'OUT OF ARC';
			continue;
		}
		const aim = threat ? { x: threat.x + threat.vx * distance(from, threat) / stats.projectileSpeed, y: threat.y + threat.vy * distance(from, threat) / stats.projectileSpeed }
			: target ? predictedAim(from, target, mount.weapon === 'rail' || mount.weapon === 'rattler' || mount.weapon === 'flak' ? stats.projectileSpeed : 0) : from;
		const desired = Math.atan2(aim.y - from.y, aim.x - from.x);
		mount.heading += clamp(angleDelta(mount.heading, desired), -stats.turnRate * dt, stats.turnRate * dt);
		const socket = MOUNT_SOCKETS[mount.slot];
		if (socket && mount.weapon !== 'seeker') {
			const center = sideAngle(state.player, socket.side);
			mount.heading = center + clamp(angleDelta(center, mount.heading), -Math.PI / 2, Math.PI / 2);
		}
		const aligned = Math.abs(angleDelta(mount.heading, desired)) <= (mount.weapon === 'flak' ? 0.13 : 0.045);
		if (mount.weapon === 'rattler') mount.ramp = aligned && target ? Math.min(stats.rampTime, mount.ramp + dt) : 0;
		if (mount.reload > 0) { mount.status = 'RELOADING'; continue; }
		if (!aligned) {
			if (mount.weapon === 'helios') mount.charge = 0;
			mount.status = 'TRACKING'; continue;
		}
		if (mount.weapon === 'helios') {
			mount.charge += dt; mount.status = 'CHARGING';
			if (mount.charge + 0.000001 >= stats.chargeTime - stats.lockTime) {
				mount.locked = true; mount.lockHeading = mount.heading; mount.status = 'LOCKED';
			}
			continue;
		}
		mount.reload = stats.reload; state.stats.salvos++;
		if (mount.weapon === 'seeker') { mount.burstRemaining = stats.projectiles; mount.burstNext = 0; launchMissile(state, mount); continue; }
		if (mount.weapon === 'spark') { beam(state, mount, mount.heading); continue; }
		if (mount.weapon === 'ion' && target) { ion(state, mount, target); continue; }
		const shell = shellAt(state, mount, mount.heading);
		if (mount.weapon === 'rail') { shell.projectile = 'rail'; shell.hitIds = []; shell.pierceRemaining = stats.pierce; }
		if (mount.weapon === 'rattler') shell.damage *= 1 + 0.8 * mount.ramp / stats.rampTime;
		if (mount.weapon === 'torpedo') {
			shell.projectile = 'torpedo'; shell.life = 6; shell.guidance = { target: mount.target, turnRate: 0.55, speed: stats.projectileSpeed };
			shell.blastRadius = stats.blastRadius; state.stats.torpedoSalvos++;
		}
		if (mount.weapon === 'flak') {
			shell.fuse = Math.max(1 / 120, distance(from, aim) / stats.projectileSpeed); shell.life = shell.fuse + 0.05;
			shell.blastRadius = stats.blastRadius; shell.interceptionLimit = stats.interceptions;
			mount.defensiveBursts = threat ? mount.defensiveBursts + 1 : 0;
		}
		state.shells.push(shell); fired(state, mount, from);
	}
};

const detonate = function (state: State, shell: Shell, at: Point, directId?: number) {
	const weapon = shell.weaponId;
	if (!weapon) return;
	const radius = shell.blastRadius ?? 0;
	for (const enemy of state.enemies) if (enemy.hp > 0 && enemy.id !== directId && distance(at, enemy) <= radius + enemy.width / 2) {
		damageEnemy(state, enemy, shell.damage * (weapon === 'torpedo' ? 0.55 : 1), weapon);
	}
	const intercepted = state.shells.filter(function (other) { return other.hostile && other.life > 0 && distance(at, other) <= radius; })
		.sort(function (a, b) { return distance(at, a) - distance(at, b); }).slice(0, shell.interceptionLimit ?? 0);
	for (const other of intercepted) {
		other.life = 0; state.stats.interceptions++; state.events.push('intercept');
		state.pointDefense.traces.push({ from: at, to: { x: other.x, y: other.y }, life: 0.16 });
	}
	state.effects.push({ ...at, kind: 'explosion', duration: 0.35, life: 0.35, weaponId: weapon, radius, elevation: shell.launch?.elevation ?? 22 });
	shell.life = 0;
};

export const updateTurretProjectiles = function (state: State, dt: number) {
	for (const shell of state.shells) {
		const weapon = shell.weaponId;
		if (!weapon || shell.life <= 0) continue;
		if (shell.guidance) {
			const target = state.enemies.find(function (enemy) { return enemy.hp > 0 && enemy.id === shell.guidance?.target; });
			if (target) {
				const angle = Math.atan2(shell.vy, shell.vx); const desired = Math.atan2(target.y - shell.y, target.x - shell.x);
				const turnRate = shell.guidance.turnRate ?? 0; const speed = shell.guidance.speed ?? Math.hypot(shell.vx, shell.vy);
				const next = angle + clamp(angleDelta(angle, desired), -turnRate * dt, turnRate * dt);
				shell.vx = Math.cos(next) * speed; shell.vy = Math.sin(next) * speed;
			}
		}
		const from = { x: shell.x, y: shell.y }; const travel = Math.min(dt, shell.life, shell.fuse ?? dt);
		shell.x += shell.vx * travel; shell.y += shell.vy * travel; shell.life -= dt;
		if (shell.fuse !== undefined) {
			shell.fuse -= dt;
			if (shell.fuse <= 0) detonate(state, shell, shell);
			continue;
		}
		const hits = state.enemies.filter(function (enemy) { return enemy.hp > 0 && !shell.hitIds?.includes(enemy.id); })
			.map(function (enemy) { return { enemy, fraction: hitFraction(from, shell, enemy) }; })
			.filter(function (candidate): candidate is { enemy: Enemy; fraction: number } { return candidate.fraction !== undefined; })
			.sort(function (a, b) { return a.fraction - b.fraction || a.enemy.id - b.enemy.id; });
		for (const hit of hits) {
			const at = { x: from.x + (shell.x - from.x) * hit.fraction, y: from.y + (shell.y - from.y) * hit.fraction };
			damageEnemy(state, hit.enemy, shell.damage, weapon, at, shell.launch?.elevation ?? 22);
			if (weapon === 'rail') {
				shell.hitIds?.push(hit.enemy.id); shell.pierceRemaining = (shell.pierceRemaining ?? 1) - 1; shell.damage *= 0.65;
				if (shell.pierceRemaining > 0) continue;
			} else if (weapon === 'torpedo') detonate(state, shell, at, hit.enemy.id);
			shell.life = 0; break;
		}
	}
};
