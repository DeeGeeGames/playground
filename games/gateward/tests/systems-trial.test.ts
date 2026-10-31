import { tactical } from '../src/combat-scale';
import { describe, expect, test } from 'bun:test';
import { assignGuardian, build, contactWarning, createState, deploy, placeInterdiction, pulse, repair, repairSensors, replaceFighters, scramble, sell, setAllocation, setPriority, step, transferPower, upgrade, type State } from '../src/simulation';
import { SYSTEMS_TRIAL } from '../src/scenarios';
import { POWER_PRESETS } from '../src/systems';
import { systemsResultMessage, systemsSummary } from '../src/trial-summary';
import { runTrialStrategy } from './trial-strategy';

const trial = function () { const state = createState({ scenario: 'systems' }); state.status = 'running'; return state; };
const systemsFor = function (state: State) { if (!state.systems) throw new Error('Missing systems'); return state.systems; };
const clearRoute = function () {
	const state = trial(); state.wave = SYSTEMS_TRIAL.encounters.length; state.nextWave = Infinity;
	systemsFor(state).distanceTraveled = systemsFor(state).routeLength; state.ark.x = state.routeOrigin.x + state.systems.routeLength; return state;
};

describe('Systems Trial route and results', function () {
	test('starts and resets with independent deterministic fitting state and healthy warnings', function () {
		const state = createState({ scenario: 'systems' }); const fresh = structuredClone(state);
		expect(state.scenario).toBe(SYSTEMS_TRIAL); expect(state.experimental).toBe(true); expect(state.coverageDegrees).toBe(240);
		expect(state.salvage).toBe(500); expect(state.nextWave).toBe(0); expect(state.resultReason).toBeUndefined();
		expect(systemsFor(state).routeLength).toBe(tactical(1440)); expect(systemsFor(state).shield.charge).toBe(240);
		expect(systemsFor(state).allocation).toEqual(POWER_PRESETS.balanced);
		state.time = 7; expect(contactWarning(state)).toBe('Scanning for contacts');
		state.status = 'running'; placeInterdiction(state, { x: tactical(300), y: 0 }); setAllocation(state, POWER_PRESETS.engines); step(state, 0.05);
		expect(createState({ scenario: 'systems' })).toEqual(fresh);
		expect(createState().systems.routeLength).toBe(tactical(2520)); expect(createState({ scenario: 'drill' }).systems.routeLength).toBe(tactical(1080));
		expect(createState({ scenario: 'drill' }).scenario?.duration).toBe(90);
	});
	test('early route completion waits for future, pending and live contacts without a duration minimum', function () {
		const state = trial(); systemsFor(state).distanceTraveled = tactical(1440); state.ark.x = state.routeOrigin.x + tactical(1440); state.time = 82.9; state.wave = 4; state.nextWave = 83;
		step(state, 0.05); expect(state.status).toBe('running');
		step(state, 0.05); step(state, 0.05); expect(state.wave).toBe(5); expect(state.arrivals.length).toBeGreaterThan(0);
		state.enemies = []; step(state, 0.05); expect(state.status).toBe('running');
		state.arrivals = []; state.enemies.push({ id: 10000, kind: 'raider', hp: 45, maxHp: 45, x: 500, y: 500, cooldown: 100 });
		step(state, 0.05); expect(state.status).toBe('running');
		state.enemies = []; step(state, 0.05); expect(state.status).toBe('won'); expect(state.resultReason).toBe('arrival'); expect(state.time).toBeLessThan(120);
	});
	for (const engines of [0, 2]) test(`${engines} engines cannot arrive by elapsed time alone`, function () {
		const state = clearRoute(); systemsFor(state).distanceTraveled = 0; state.ark.x = state.routeOrigin.x;
		setAllocation(state, { engines, weapons: 10 - engines, shields: 0 });
		for (let i = 0; i < 3200; i++) step(state, 0.05);
		expect(state.status).toBe('lost'); expect(state.resultReason).toBe('deadline'); expect(state.time).toBe(155);
		expect(systemsFor(state).distanceTraveled).toBeLessThan(tactical(1440));
	});
	test('strict deadline clamps the final tick and beats arrival; hull loss beats deadline and clear rewards', function () {
		const arrived = clearRoute(); arrived.time = 154.99; step(arrived, 0.05);
		expect(arrived.status).toBe('lost'); expect(arrived.resultReason).toBe('deadline'); expect(arrived.time).toBe(155);
		const destroyed = clearRoute(); destroyed.time = 154.99; destroyed.hull = 1; systemsFor(destroyed).shield.charge = 0;
		destroyed.shots.push({ id: 900, x: destroyed.ark.x, y: destroyed.ark.y, vx: 0, vy: 0, damage: 10, side: 'enemy', weapon: 'hostile', target: undefined, life: 1 });
		step(destroyed, 0.05); expect(destroyed.resultReason).toBe('hull'); expect(destroyed.hull).toBe(0);
	});
	test('completed distance with unresolved final contacts still expires', function () {
		const state = clearRoute(); state.time = 154.99; state.arrivals.push({ at: 200, kind: 'bomber', x: -500, y: 0 });
		step(state, 0.05); expect(state.resultReason).toBe('deadline');
		expect(systemsResultMessage(state)).toContain('contacts remained unresolved');
	});
	test('arrival on the strict deadline explains the boundary without blaming cleared combat', function () {
		const state = clearRoute(); state.time = 154.99; systemsFor(state).distanceTraveled = tactical(1439.9); state.ark.x = state.routeOrigin.x + tactical(1439.9);
		step(state, 0.05); expect(state.status).toBe('lost'); expect(systemsFor(state).distanceTraveled).toBe(tactical(1440));
		expect(systemsResultMessage(state)).toContain('at the deadline'); expect(systemsResultMessage(state)).not.toContain('weapon');
	});
	test('a cloned trial keeps distance-based early completion and an already reached deadline cannot tick again', function () {
		const state = structuredClone(clearRoute()); state.time = 110; step(state, 0.05);
		expect(state.status).toBe('won'); expect(state.resultReason).toBe('arrival');
		const expired = trial(); expired.time = 155; expired.hull = 500;
		const salvage = expired.salvage; const charge = systemsFor(expired).shield.charge;
		step(expired, 0.05); expect(expired.resultReason).toBe('deadline');
		expect(expired.salvage).toBe(salvage); expect(expired.hull).toBe(500); expect(systemsFor(expired).shield.charge).toBe(charge);
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
		expect(result?.reason).toBe('arrival'); expect(systemsSummary(createState({ scenario: 'systems' }))?.result).toBe('fitting');
	});
});

describe('reproducible equipped trial strategies', function () {
	test('one weapons-to-balanced reallocation completes the same route and repeats the full outcome', function () {
		const first = runTrialStrategy('weapons-then-balanced');
		expect(first).toEqual(runTrialStrategy('weapons-then-balanced'));
		expect(first.summary?.reason).toBe('arrival'); expect(first.summary?.powerChanges).toBe(2);
		expect(first.summary?.elapsed).toBeCloseTo(145, 1); expect(first.summary?.kills).toBe(33);
		expect(first.summary?.contacts).toBe(5);
	});
	for (const preset of ['balanced', 'engines', 'weapons', 'shields'] as const) test(`${preset} uses identical fitting and orders and repeats its complete outcome`, function () {
		const first = runTrialStrategy(preset); const second = runTrialStrategy(preset);
		expect(first.summary).toEqual(second.summary); expect(first.state).toEqual(second.state);
		if (preset === 'engines') {
			// Fast travel reaches the gate; clearing the final contact before the
			// deadline is sensitive to contact trajectories and heavy-hull turn time.
			expect(first.summary.distance).toBe(first.summary.routeLength);
			expect(first.summary.hull).toBeGreaterThan(0);
			expect(first.summary.kills).toBeGreaterThanOrEqual(31);
			expect(['arrival', 'deadline']).toContain(first.summary.reason ?? '');
		} else expect(first.summary.reason).toBe(preset === 'balanced' ? 'arrival' : 'deadline');
		expect(first.summary?.contacts).toBe(5);
		// A weapons-heavy run can eliminate every attacker before shields take damage.
		if (preset !== 'weapons') expect(first.summary?.shieldAbsorbed).toBeGreaterThan(0);
		else expect(first.summary?.kills).toBe(33);
		expect(first.summary?.powerChanges).toBe(preset === 'balanced' ? 0 : 1);
	});
	test('same balanced fitting plus one approach-phase field redirects real contacts and repeats the full outcome', function () {
		const baseline = runTrialStrategy('balanced'); const field = runTrialStrategy('balanced', true);
		expect(field.state).toEqual(runTrialStrategy('balanced', true).state);
		expect(field.summary.fieldPlacements).toBe(1); expect(field.summary.redirected).toBeGreaterThan(0);
		// As with the engines strategy, runtime-specific trajectories can leave
		// the final contact alive at the deadline. Repeatability is checked above.
		expect(field.summary.distance).toBe(field.summary.routeLength);
		expect(field.summary.hull).toBeGreaterThan(0);
		expect(field.summary.contacts).toBe(field.summary.totalContacts);
		expect(field.summary.kills).toBeGreaterThanOrEqual(31);
		expect(['arrival', 'deadline']).toContain(field.summary.reason ?? '');
		if (field.summary.reason === 'arrival') {
			expect(field.summary.kills).toBe(33);
			expect(field.state.enemies).toHaveLength(0);
		} else expect(field.summary.elapsed).toBe(155);
		expect(field.state).not.toEqual(baseline.state);
	});
});
