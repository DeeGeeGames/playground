import { tactical } from '../src/combat-scale';
import { describe, expect, test } from 'bun:test';
import { assignGuardian, build, contactWarning, createState, deploy, placeInterdiction, pulse, repair, repairSensors, replaceFighters, scramble, sell, setAllocation, setPriority, step, transferPower, upgrade, WAVE_COUNT, type State } from '../src/simulation';
import { POWER_PRESETS } from '../src/systems';
import { systemsResultMessage, systemsSummary } from '../src/trial-summary';

const trial = function () { const state = createState(); state.status = 'running'; return state; };
const systemsFor = function (state: State) { return state.systems; };
const clearRoute = function () {
	const state = trial(); state.wave = WAVE_COUNT; state.nextWave = Infinity;
	state.systems.distanceTraveled = state.systems.routeLength; state.ark.x = state.routeOrigin.x + state.systems.routeLength; return state;
};

describe('single core game route and results', function () {
	test('starts and resets with independent fitting state, the trial economy, and narrow turret arcs', function () {
		const state = createState(); const fresh = structuredClone(state);
		expect(state.coverageDegrees).toBe(120); expect(state.salvage).toBe(500);
		expect(state.systems.routeLength).toBe(tactical(1440)); expect(state.systems.shield.charge).toBe(240);
		expect(state.systems.allocation).toEqual(POWER_PRESETS.balanced);
		expect(contactWarning(state)).toBe('Scanning for contacts');
		build(state, 0, 'rail'); state.status = 'running'; setAllocation(state, POWER_PRESETS.engines); step(state, 0.05);
		expect(createState()).toEqual(fresh);
	});
	test('surviving contacts do not prevent arrival after the former deadline', function () {
		const state = clearRoute(); state.time = 300;
		state.enemies.push({ id: state.nextId++, kind: 'armored', hp: 260, maxHp: 260, x: state.ark.x - 500, y: 500, cooldown: 100 });
		state.arrivals.push({ at: 999, kind: 'bomber', x: 600, y: 0 });
		step(state, 0.05); expect<State['status']>(state.status).toBe('won'); expect(state.resultReason).toBe('arrival');
		expect(state.enemies.length).toBeGreaterThan(0); expect(state.arrivals).toHaveLength(1);
		expect(systemsResultMessage(state)).not.toContain('deadline');
	});
	test('stalled engines remain alive past the old deadline and time cannot complete the route', function () {
		const state = trial(); state.nextWave = Infinity; setAllocation(state, { engines: 0, weapons: 4, shields: 6 });
		for (let i = 0; i < 6000; i++) step(state, 0.05);
		expect(state.time).toBeGreaterThan(155); expect(state.status).toBe('running'); expect(state.systems.distanceTraveled).toBe(0);
	});
	for (const restriction of ['paused', 'unfocused', 'won', 'lost'] as const) test(`${restriction} freezes all systems and rejects commands`, function () {
		const state = trial(); build(state, 0, 'rail'); deploy(state, 'guardian'); deploy(state, 'interceptor'); placeInterdiction(state, { x: tactical(300), y: 0 });
		state.hull = 500; state.salvage = 1000; systemsFor(state).sensors.integrity = 0;
		const wing = state.wings[0]; const guardian = state.escorts[0]; if (!wing || !guardian) throw new Error('Missing escorts');
		if (restriction === 'paused') state.paused = true; else if (restriction === 'unfocused') state.focused = false; else state.status = restriction;
		const before = structuredClone(state);
		expect(build(state, 1, 'rail')).toBe(false); expect(upgrade(state, 0)).toBe(false); expect(sell(state, 0)).toBe(false);
		expect(deploy(state, 'guardian')).toBe(false); expect(scramble(state, wing.id, 'port')).toBe(false); expect(replaceFighters(state, wing.id)).toBe(false);
		expect(assignGuardian(state, guardian.id, 'ahead')).toBe(false); expect(repair(state)).toBe(false); expect(repairSensors(state)).toBe(false);
		expect(setAllocation(state, POWER_PRESETS.engines)).toBe(false); expect(transferPower(state, 'engines', 'weapons')).toBe(false);
		expect(setPriority(state, undefined)).toBe(false); expect(pulse(state)).toBe(false); expect(placeInterdiction(state, { x: tactical(300), y: 0 })).toBe(false);
		step(state, 0.05); expect(state).toEqual(before);
	});
	test('summary is a pure serializable snapshot, including stalled ETA, results and reset', function () {
		expect(systemsSummary(createState()).result).toBe('fitting'); const state = trial();
		setAllocation(state, { engines: 0, weapons: 8, shields: 2 }); const before = structuredClone(state);
		const summary = systemsSummary(state); expect(summary?.eta).toBeNull(); expect(state).toEqual(before);
		expect(JSON.stringify(summary)).toContain('"eta":null');
		const won = clearRoute(); step(won, 0.05); const result = systemsSummary(won); step(won, 0.05); expect(systemsSummary(won)).toEqual(result);
		expect(result?.reason).toBe('arrival'); expect(systemsSummary(createState())?.result).toBe('fitting');
	});
});
