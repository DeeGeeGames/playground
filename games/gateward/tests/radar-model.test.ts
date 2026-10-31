import { tactical } from '../src/combat-scale';
import { describe, expect, test } from 'bun:test';
import { createRadarTracker, LOST_TRACK_SECONDS, radarPoint } from '../src/radar-model';
import { createState, type Enemy, type State } from '../src/simulation';
import { worldPoint } from '../src/space';

const enemy = function (state: State, id: number, x: number, y = 0): Enemy {
	return { id, ...worldPoint(state, { x: tactical(x), y: tactical(y) }), kind: 'bomber', hp: 95, maxHp: 95, cooldown: 0, flight: { angle: state.ark.angle + Math.PI, speed: tactical(30), side: 1, course: 'intercept', run: 1 } };
};
const first = function <T>(items: readonly T[]): T { const item = items[0]; if (!item) throw new Error('Missing fixture'); return item; };

describe('radar observations', function () {
	test('heading-up projection follows a rotated and translated ark', function () {
		const state = createState(); state.ark = { x: 1800, y: -400, speed: 12, angle: Math.PI / 2 };
		const ahead = radarPoint(state, worldPoint(state, { x: 700, y: 0 }), 700);
		const starboard = radarPoint(state, worldPoint(state, { x: 0, y: 350 }), 700);
		expect(ahead.x).toBeCloseTo(220); expect(ahead.y).toBeCloseTo(40);
		expect(starboard.x).toBeCloseTo(310); expect(starboard.y).toBeCloseTo(220);
	});
	test('coarse returns group ships without class, health or exact count information', function () {
		const state = createState(); state.enemies = [enemy(state, 1, 1501, 10), enemy(state, 2, 1495, 12)];
		const tracker = createRadarTracker(); const contacts = tracker.observe(state);
		expect(contacts).toHaveLength(1); const contact = first(contacts);
		expect(contact.intel).toBe('detected'); expect(contact).not.toHaveProperty('kind'); expect(contact).not.toHaveProperty('hull'); expect(contact).not.toHaveProperty('count');
		expect(contact.range).toBeCloseTo(tactical(1500)); expect(contact.bearing).toBe(0);
		state.enemies = [enemy(state, 1, 600)];
		const classified = tracker.observe(state).find(function (item) { return item.intel === 'classified'; });
		expect(classified?.intel).toBe('classified');
		if (classified?.intel !== 'classified') throw new Error('Expected classified track');
		expect(classified.kind).toBe('bomber'); expect(classified.hull).toBe(95);
	});
	test('closing and short entry use target and ark velocity, including receding targets', function () {
		const state = createState(); state.ark.speed = tactical(12); state.enemies = [enemy(state, 1, 1500)];
		const contact = first(createRadarTracker().observe(state));
		// Exact 168 m/s closes ahead; coarse returns round to a 5 m/s increment.
		expect(contact.closing).toBe(170); expect(contact.entry).toBeCloseTo(tactical(800) / 170);
		const target = first(state.enemies); if (!target.flight) throw new Error('Missing flight'); target.flight.angle = 0;
		const receding = first(createRadarTracker().observe(state)); expect(receding.closing).toBe(-70); expect(receding.entry).toBeUndefined();
	});
	test('lost tracks freeze observations, reject new hidden intel and expire on simulation time', function () {
		const state = createState(); state.enemies = [enemy(state, 1, 600)]; const tracker = createRadarTracker(); const original = first(tracker.observe(state));
		state.systems.sensors.integrity = 0; const target = first(state.enemies); target.x = 1800; target.y = 900; target.hp = 1; target.kind = 'flagship';
		state.time = 2; const stale = first(tracker.observe(state));
		expect(stale.point).toEqual(original.point); expect(stale.age).toBe(2);
		if (stale.intel !== 'classified') throw new Error('Expected retained observation'); expect(stale.kind).toBe('bomber'); expect(stale.hull).toBe(95);
		state.time = LOST_TRACK_SECONDS + .01; expect(tracker.observe(state)).toEqual([]);
	});
	test('reacquisition downgrades classification and reset discards previous voyage tracks', function () {
		const state = createState(); state.enemies = [enemy(state, 1, 600)]; const tracker = createRadarTracker(); tracker.observe(state);
		state.systems.sensors.integrity = 49; state.time = 1;
		const downgraded = first(tracker.observe(state)); expect(downgraded.intel).toBe('detected'); expect(downgraded).not.toHaveProperty('kind');
		tracker.reset(); state.enemies = []; expect(tracker.observe(state)).toEqual([]);
	});
});
