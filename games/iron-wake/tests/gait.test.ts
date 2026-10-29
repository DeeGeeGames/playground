import { expect, test } from 'bun:test';
import { advanceGait, advanceGaits, createGait, createGaits, legJoints } from '../src/gait';
import { createState, step, type Controls } from '../src/simulation';

const idle: Controls = { drive: 0, stop: false, turn: 0, aim: { x: 900, y: 0 }, cannon: false, laser: false, missile: false, coolant: false };
const dt = 1 / 60;

test('stance feet hold their world position and heading while the hull advances; only one foot swings', function () {
	let body = { x: 0, y: 0, angle: 0 };
	let gait = createGait(body);
	const touchdowns: number[] = [];
	let plantedFrames = 0;
	for (let i = 0; i < 360; i++) {
		body = { ...body, x: body.x + 60 * dt };
		const previous = gait;
		gait = advanceGait(gait, body, dt);
		expect(gait.feet.filter(function (foot) { return foot.lift > 0; }).length).toBeLessThanOrEqual(1);
		for (const index of [0, 1] as const) {
			if (gait.swing?.index !== index && previous.swing?.index !== index) {
				expect(gait.feet[index]).toEqual(previous.feet[index]);
				plantedFrames++;
			}
			if (previous.swing?.index === index && !gait.swing) {
				expect(gait.feet[index].lift).toBe(0);
				touchdowns.push(index);
			}
		}
	}
	expect(plantedFrames).toBeGreaterThan(360);
	expect(touchdowns.length).toBeGreaterThan(10);
	for (let i = 1; i < touchdowns.length; i++) expect(touchdowns[i]).not.toBe(touchdowns[i - 1]);
});

test('footfall cadence follows distance traveled, with no stepping while stationary', function () {
	const countSteps = function (speed: number) {
		let gait = createGait({ x: 0, y: 0, angle: 0 });
		let steps = 0;
		for (let i = 1; i <= 600; i++) {
			const previous = gait;
			gait = advanceGait(gait, { x: speed * i * dt, y: 0, angle: 0 }, dt);
			if (previous.swing && !gait.swing) steps++;
		}
		return steps;
	};
	expect(countSteps(0)).toBe(0);
	expect(countSteps(90)).toBeGreaterThan(countSteps(30) * 2);
});

test('reverse, pivoting, and braking keep articulated legs within reach and settle both feet', function () {
	for (const size of [0.8, 1, 1.15]) {
		const state = createState();
		let gait = createGait(state.player, size);
		for (let i = 0; i < 1800; i++) {
			const drive = i < 300 ? 1 : i < 720 ? -1 : i < 1100 ? 1 : 0;
			step(state, { ...idle, drive, turn: i > 500 && i < 1300 ? 1 : 0, stop: i >= 1100 }, dt);
			gait = advanceGait(gait, state.player, dt, size);
			for (const index of [0, 1] as const) {
				const { hip, knee, ankle } = legJoints(state.player, gait.feet[index], index, size);
				const upper = Math.hypot(hip.x - knee.x, hip.y - knee.y, hip.z - knee.z);
				const lower = Math.hypot(ankle.x - knee.x, ankle.y - knee.y, ankle.z - knee.z);
				expect(upper).toBeCloseTo(30 * size, 6);
				expect(lower).toBeCloseTo(34 * size, 6);
			}
		}
		expect(gait.swing).toBeUndefined();
		expect(gait.feet.every(function (foot) { return foot.lift === 0; })).toBe(true);
	}
});

test('stationary hull pivots lift feet in turn instead of rotating planted feet', function () {
	let gait = createGait({ x: 0, y: 0, angle: 0 });
	let steps = 0;
	for (let i = 1; i <= 360; i++) {
		const previous = gait;
		gait = advanceGait(gait, { x: 0, y: 0, angle: i * dt }, dt);
		if (previous.swing && !gait.swing) steps++;
		for (const index of [0, 1] as const) {
			if (previous.swing?.index !== index && gait.swing?.index !== index) expect(gait.feet[index]).toEqual(previous.feet[index]);
		}
	}
	expect(steps).toBeGreaterThan(3);
});

test('enemy target switches turn the visible hull gradually without stretching the legs', function () {
	for (const size of [0.8, 1, 1.15]) {
		for (const flipAt of [20, 63, 100]) {
			let body = { x: 0, y: 0, angle: 0 };
			let gait = createGait(body, size);
			for (let i = 0; i < 240; i++) {
				const angle = i < flipAt ? 0 : Math.PI;
				body = { x: body.x + Math.cos(angle) * 66 * dt, y: body.y + Math.sin(angle) * 66 * dt, angle };
				gait = advanceGait(gait, body, dt, size);
				for (const index of [0, 1] as const) {
					const { hip, knee, ankle } = legJoints(gait.body, gait.feet[index], index, size);
					expect(Math.hypot(knee.x - hip.x, knee.y - hip.y, knee.z - hip.z)).toBeCloseTo(30 * size, 6);
					expect(Math.hypot(knee.x - ankle.x, knee.y - ankle.y, knee.z - ankle.z)).toBeCloseTo(34 * size, 6);
				}
			}
		}
	}
});

test('presentation freezes with simulation time and resets on restart; enemy poses are removed with units', function () {
	const state = createState();
	state.enemies.push({ id: 1, x: 600, y: 600, angle: 0, hp: 48, maxHp: 48, cooldown: 1, heavy: false, kind: 'scout' });
	let gaits = createGaits(state);
	expect(advanceGaits(gaits, state)).toBe(gaits);
	for (let i = 0; i < 120; i++) { step(state, { ...idle, drive: 1 }, dt); gaits = advanceGaits(gaits, state); }
	const paused = structuredClone(gaits);
	expect(advanceGaits(gaits, state)).toEqual(paused);
	state.enemies = []; state.time += dt;
	gaits = advanceGaits(gaits, state);
	expect(gaits.enemies.size).toBe(0);
	expect(advanceGaits(gaits, createState())).toEqual(createGaits(createState()));
});
