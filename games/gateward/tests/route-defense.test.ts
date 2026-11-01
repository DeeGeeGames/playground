import { expect, test } from 'bun:test';
import { VOYAGE_DEFENSE } from '../src/route-defense';
import { build, createState, distance, setAllocation, step, type State } from '../src/simulation';
import { systemsResultMessage } from '../src/trial-summary';

const advance = function (state: State, seconds: number): void {
	for (let tick = 0; tick < seconds * 20; tick++) step(state, 0.05);
};

test('route defenses stay ahead at fixed world stations and progress, not time, deploys the next line', function () {
	const state = createState(); setAllocation(state, { engines: 0, weapons: 4, shields: 6 });
	state.status = 'running'; step(state, 0.05);
	expect(state.wave).toBe(1); expect(state.enemies).toHaveLength(2);
	const anchors = state.enemies.map(function (enemy) { return enemy.defense?.anchor; });
	expect(state.enemies.every(function (enemy) { return enemy.x > state.ark.x && enemy.approaching !== true; })).toBe(true);
	advance(state, 100);
	expect(state.wave).toBe(1);
	for (const [index, enemy] of state.enemies.entries()) {
		expect(enemy.defense?.anchor).toEqual(anchors[index]);
		if (!enemy.defense) throw new Error('Missing route station');
		expect(distance(enemy, enemy.defense.anchor)).toBeLessThan(150);
	}
	state.systems.distanceTraveled = state.nextWave; state.ark.x = state.nextWave;
	step(state, 0.05); expect(state.wave).toBe(2);
	expect(state.enemies.filter(function (enemy) { return enemy.defense && enemy.defense.distance > state.ark.x; }).length).toBeGreaterThan(0);
	state.paused = true; const paused = structuredClone(state); advance(state, 3); expect(state).toEqual(paused);
});

test('translated routes preserve both flanks and launched fighters inherit their line', function () {
	const state = createState(); state.routeOrigin = { x: 5000, y: 7000 }; state.ark.x = 5000; state.ark.y = 7000;
	state.status = 'running'; step(state, 0.05); state.nextWave = Infinity;
	expect(state.enemies).toHaveLength(2);
	const carrier = state.enemies[0]; if (!carrier?.defense) throw new Error('Missing defensive carrier');
	state.ark.x = carrier.defense.anchor.x; state.systems.distanceTraveled = carrier.defense.distance;
	advance(state, 2);
	const fighter = state.enemies.find(function (enemy) { return enemy.launchedBy === carrier.id; });
	expect(fighter?.defense).toEqual(carrier.defense);
	expect(fighter?.defense).not.toBe(carrier.defense);
});

test('passed survivors disengage, stop launches and windups, and grant no clearance reward', function () {
	const state = createState(); state.status = 'running'; step(state, 0.05); state.nextWave = Infinity;
	const carrier = state.enemies[0]; if (!carrier?.defense || !carrier.hangar) throw new Error('Missing defensive carrier');
	const station = carrier.defense.distance;
	// Let it launch while the ark is alongside the station.
	state.ark.x = station; state.systems.distanceTraveled = station; advance(state, 2);
	const fighter = state.enemies.find(function (enemy) { return enemy.kind === 'raider'; });
	if (!fighter?.defense) throw new Error('No fighter launched');
	fighter.kind = 'bomber'; fighter.bomberAttack = { phase: 'windup', remaining: 1, target: undefined };
	state.ark.x = station + VOYAGE_DEFENSE.passDistance + 1; state.systems.distanceTraveled = state.ark.x;
	setAllocation(state, { engines: 0, weapons: 4, shields: 6 });
	state.shots = []; state.hull = 1000;
	const salvage = state.salvage; const kills = state.kills; const launched = carrier.hangar.launched;
	advance(state, 10);
	expect(state.enemies.every(function (enemy) { return enemy.defense?.disengaged; })).toBe(true);
	expect(fighter.bomberAttack).toBeUndefined(); expect(state.shots).toHaveLength(0);
	expect(carrier.hangar.launched).toBe(launched); expect(state.kills).toBe(kills);
	expect(state.salvage - salvage).toBeCloseTo(12); expect(state.hull).toBe(1000); expect(state.cleared).toBe(false);
	// Returning toward a line cannot turn it into a new pursuit wave.
	state.ark.x = station; state.systems.distanceTraveled = station; advance(state, 2);
	expect(carrier.hangar.launched).toBe(launched); expect(state.shots).toHaveLength(0);
});

test('arrival wins with pending and surviving contacts, freezes results, and same-tick hull loss still wins precedence', function () {
	for (const destroyed of [false, true]) {
		const state = createState(); build(state, 0, 'flak'); state.status = 'running';
		state.systems.distanceTraveled = state.systems.routeLength; state.ark.x = state.systems.routeLength;
		state.enemies.push({ id: state.nextId++, kind: 'flagship', x: state.ark.x - 500, y: 500, hp: 2400, maxHp: 2400, cooldown: 999 });
		state.arrivals.push({ at: 500, kind: 'bomber', x: 500, y: 0 });
		if (destroyed) {
			state.hull = 1; state.systems.shield.charge = 0;
			state.shots.push({ id: state.nextId++, x: state.ark.x, y: state.ark.y, vx: 0, vy: 0, damage: 10, side: 'enemy', weapon: 'hostile', target: undefined, life: 1 });
		}
		step(state, 0.05); expect<State['status']>(state.status).toBe(destroyed ? 'lost' : 'won');
		expect(state.resultReason).toBe(destroyed ? 'hull' : 'arrival');
		if (!destroyed) expect(systemsResultMessage(state)).toContain('surviving hostiles');
		const ended = structuredClone(state); advance(state, 1); expect(state).toEqual(ended);
	}
});
