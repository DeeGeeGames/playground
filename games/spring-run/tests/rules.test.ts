import { expect, test } from 'bun:test';
import { aimFromDevices, clampLength, integrateSpring, MAX_REACH, stickOffset, STICK_TRAVEL } from '../src/rules';

const length = (x: number, y: number) => Math.hypot(x, y);

test('reach clamp keeps direction and drops non-finite input', () => {
	expect(clampLength(3, 4, 10)).toEqual({ x: 3, y: 4 });
	const diagonal = clampLength(30, 40, 10);
	expect(length(diagonal.x, diagonal.y)).toBeCloseTo(10);
	expect(diagonal.x / diagonal.y).toBeCloseTo(30 / 40);
	expect(clampLength(Number.NaN, 1, 10)).toEqual({ x: 0, y: 0 });
});

test('stick travel maps full deflection onto the reach and partial deflection stays proportional', () => {
	expect(stickOffset(0, 0, STICK_TRAVEL, MAX_REACH)).toEqual({ x: 0, y: 0, knobX: 0, knobY: 0 });
	const full = stickOffset(400, 0, STICK_TRAVEL, MAX_REACH);
	expect(full.x).toBeCloseTo(MAX_REACH);
	expect(full.knobX).toBe(STICK_TRAVEL);
	const half = stickOffset(0, -STICK_TRAVEL / 2, STICK_TRAVEL, MAX_REACH);
	expect(half.y).toBeCloseTo(-MAX_REACH / 2);
	const diagonal = stickOffset(80, 80, STICK_TRAVEL, MAX_REACH);
	expect(length(diagonal.x, diagonal.y)).toBeCloseTo(MAX_REACH);
	expect(length(diagonal.knobX, diagonal.knobY)).toBeCloseTo(STICK_TRAVEL);
});

test('device aim uses full reach on a diagonal and lets keys override the pad', () => {
	const diagonal = aimFromDevices(1, 1, 0, 0);
	expect(length(diagonal.x, diagonal.y)).toBeCloseTo(MAX_REACH);
	expect(aimFromDevices(0, -1, 1, 0)).toEqual({ x: 0, y: -MAX_REACH });
	expect(aimFromDevices(1, 0, 0, 1)).toEqual({ x: MAX_REACH, y: 0 });
	expect(aimFromDevices(0, 0, 0, 0)).toEqual({ x: 0, y: 0 });
});

test('spring settles on the held offset, stays inside the ring, and returns home', () => {
	let x = 0;
	let y = 0;
	let vx = 0;
	let vy = 0;
	for (let frame = 0; frame < 60; frame += 1) {
		const next = integrateSpring(x, y, vx, vy, MAX_REACH, MAX_REACH, 1 / 60);
		expect(length(next.x, next.y)).toBeLessThanOrEqual(MAX_REACH + 1e-6);
		x = next.x;
		y = next.y;
		vx = next.vx;
		vy = next.vy;
	}
	expect(length(x, y)).toBeCloseTo(MAX_REACH, 1);
	for (let frame = 0; frame < 60; frame += 1) {
		const next = integrateSpring(x, y, vx, vy, 0, 0, 1 / 60);
		expect(length(next.x, next.y)).toBeLessThanOrEqual(MAX_REACH + 1e-6);
		x = next.x;
		y = next.y;
		vx = next.vx;
		vy = next.vy;
	}
	expect(x).toBeCloseTo(0, 0);
	expect(y).toBeCloseTo(0, 0);
});
