import { expect, test } from 'bun:test';
import { createState, type Enemy } from '../src/simulation';
import { DECK_HEIGHT, edgeIndicator, FLIGHT_HEIGHT, mountHeight, pickEnemy, pickMount, project, toScreen, toWorld, TURRET_HEIGHT, viewFor } from '../src/projection';

const viewports = [{ width: 1152, height: 844 }, { width: 390, height: 440 }, { width: 320, height: 440 }, { width: 589, height: 620 }];

test('world axes project into the expected isometric diagonal and height stays vertical', function () {
	expect(project({ x: 100, y: 0 }).x).toBeCloseTo(50 * Math.sqrt(3));
	expect(project({ x: 100, y: 0 }).y).toBe(50);
	expect(project({ x: 0, y: 100 }).x).toBeCloseTo(-50 * Math.sqrt(3));
	expect(project({ x: 0, y: 100 }).y).toBe(50);
	expect(project({ x: 100, y: 0 }, 40).y).toBe(10);
});

test('rally plane and elevated visual positions round-trip across viewport sizes', function () {
	for (const { width, height } of viewports) {
		const view = viewFor(width, height);
		for (const point of [{ x: -96, y: -43 }, { x: 96, y: 43 }, { x: -300, y: 250 }]) {
			for (const elevation of [0, DECK_HEIGHT, TURRET_HEIGHT, FLIGHT_HEIGHT]) {
				const screen = toScreen(point, view, elevation); const result = toWorld(screen, view, elevation);
				expect(result.x).toBeCloseTo(point.x); expect(result.y).toBeCloseTo(point.y);
			}
		}
	}
});

test('every empty or equipped mount can be selected at its visible center', function () {
	const state = createState();
	for (const { width, height } of viewports) {
		const view = viewFor(width, height);
		for (const weapon of [undefined, 'flak', 'rail', 'missile'] as const) {
			for (const mount of state.mounts) mount.weapon = weapon;
			for (const [index, mount] of state.mounts.entries()) {
				const screen = toScreen(mount, view, mountHeight(mount)); expect(pickMount(screen, view, state.mounts)).toBe(index);
			}
		}
		expect(pickMount({ x: 20, y: 20 }, view, state.mounts)).toBe(-1);
	}
});

test('pointer selection follows elevated enemy hulls, including the flagship', function () {
	const enemies: Enemy[] = [
		{ id: 1, x: -220, y: 150, kind: 'raider', hp: 45, maxHp: 45, cooldown: 0 },
		{ id: 2, x: 160, y: -200, kind: 'flagship', hp: 2400, maxHp: 2400, cooldown: 0 },
	];
	for (const { width, height } of viewports) {
		const view = viewFor(width, height);
		for (const enemy of enemies) expect(pickEnemy(toScreen(enemy, view, FLIGHT_HEIGHT), view, enemies)?.id).toBe(enemy.id);
		expect(pickEnemy({ x: 20, y: 20 }, view, enemies)).toBeUndefined();
	}
});

test('offscreen contacts remain inside the tactical area after projection', function () {
	for (const { width, height } of viewports) {
		const view = viewFor(width, height); expect(edgeIndicator({ x: 0, y: 0 }, view)).toBeUndefined();
		for (const point of [{ x: 2000, y: 2000 }, { x: -2000, y: -2000 }, { x: 2000, y: -2000 }, { x: -2000, y: 2000 }]) {
			const marker = edgeIndicator(point, view); if (!marker) throw new Error('Missing offscreen marker');
			expect(marker.point.x).toBeGreaterThanOrEqual(17.99); expect(marker.point.x).toBeLessThanOrEqual(width - 17.99);
			expect(marker.point.y).toBeGreaterThanOrEqual(94.99); expect(marker.point.y).toBeLessThanOrEqual(height - 64.99);
			expect(Number.isFinite(marker.angle)).toBe(true);
		}
	}
});
