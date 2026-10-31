import { tactical } from '../src/combat-scale';
import { expect, test } from 'bun:test';
import { createState, type Enemy, type Point } from '../src/simulation';
import { ringContacts, ringLayout, TACTICAL_RING_RADIUS } from '../src/tactical-ring';
import { offsetView, resizeView, toScreen, translateView, viewFor } from '../src/projection';
import { worldPoint } from '../src/space';

const enemy = function (id: number, x: number, y: number): Enemy {
	return { id, x: tactical(x), y: tactical(y), kind: 'bomber', hp: 100, maxHp: 100, cooldown: 0 };
};

test('ring respects classification, detection boundaries, damage and dead contacts', function () {
	const state = createState();
	state.enemies = [enemy(1, 640, 0), enemy(2, 0, 2000), enemy(3, -2001, 0), { ...enemy(4, 100, 0), hp: 0 }];
	expect(ringContacts(state).map(function (contact) { return contact.intel; })).toEqual(['classified', 'detected']);
	state.systems.sensors.integrity = 49;
	expect(ringContacts(state).map(function (contact) { return contact.intel; })).toEqual(['detected']);
	state.enemies = [enemy(1, 230, 0), enemy(2, 0, 1000), enemy(3, -1001, 0)];
	expect(ringContacts(state).map(function (contact) { return contact.intel; })).toEqual(['classified', 'detected']);
	state.systems.sensors.integrity = 0;
	state.enemies = [enemy(1, 200, 0), enemy(2, 0, 201)];
	expect(ringContacts(state).map(function (contact) { return contact.intel; })).toEqual(['detected']);
	state.systems.sensors.integrity = 100;
	expect(ringContacts(state).map(function (contact) { return contact.intel; })).toEqual(['classified', 'classified']);
});

test('bearing markers ignore contact distance and preserve translated, rotated ship bearings', function () {
	const state = createState(); state.ark.x = 1700; state.ark.y = -400; state.ark.angle = 1.2;
	const local: Point = { x: 80, y: -130 };
	state.enemies = [{ ...enemy(1, 0, 0), ...worldPoint(state, local) }];
	const contact = ringContacts(state)[0];
	if (!contact) throw new Error('Expected contact');
	const expected = worldPoint(state, { x: local.x / Math.hypot(local.x, local.y) * TACTICAL_RING_RADIUS, y: local.y / Math.hypot(local.x, local.y) * TACTICAL_RING_RADIUS });
	expect(contact.point.x).toBeCloseTo(expected.x); expect(contact.point.y).toBeCloseTo(expected.y);
	state.enemies = [{ ...enemy(1, 0, 0), ...worldPoint(state, { x: local.x * 2, y: local.y * 2 }) }];
	expect(ringContacts(state)[0]?.point.x).toBeCloseTo(expected.x);
	let view = viewFor(1440, 900); translateView(view, { x: 0, y: 0 }, state.ark);
	for (const camera of [[1000, 1000, 1000], [-1000, 700, 1000], [0, 1800, -600]] as const) {
		view.camera.position.set(state.ark.x + camera[0], camera[1], state.ark.y + camera[2]);
		view.camera.lookAt(state.ark.x, 0, state.ark.y); view.camera.zoom = 1.5;
		view = resizeView(view, 390, 844); offsetView(view, 80);
		const center = toScreen(state.ark, view); const at = toScreen(contact.point, view); const target = toScreen(state.enemies[0] ?? state.ark, view);
		expect(Math.atan2(at.y - center.y, at.x - center.x)).toBeCloseTo(Math.atan2(target.y - center.y, target.x - center.x));
	}
});

test('nearby bearings group without leaking classification or mutating simulation', function () {
	const state = createState();
	state.enemies = [enemy(1, -500, 1), enemy(2, -500, -1), enemy(3, -700, 0), enemy(4, 0, 0)];
	const snapshot = structuredClone(state);
	const contacts = ringContacts(state);
	expect(contacts).toHaveLength(2);
	expect(contacts.map(function (contact) { return [contact.intel, contact.count]; })).toEqual([['classified', 2], ['detected', 1]]);
	expect(contacts[0]?.point.x).toBeCloseTo(-TACTICAL_RING_RADIUS);
	expect(state).toEqual(snapshot);
});

test('rendered halo fits phones and zoomed cameras and separates coincident intel categories', function () {
	const state = createState();
	state.enemies = [enemy(1, -500, 0), enemy(2, -700, 0), enemy(3, 400, -400)];
	for (const [width, height] of [[1440, 900], [390, 844], [568, 320]] as const) {
		for (const zoom of [0.65, 1, 2]) {
			for (const azimuth of [0, 1, 2, 3, 4, 5]) {
				const view = viewFor(width, height);
				view.camera.position.set(Math.cos(azimuth) * 1700, 650, Math.sin(azimuth) * 1700);
				view.camera.lookAt(0, 0, 0); view.camera.zoom = zoom; view.camera.updateProjectionMatrix();
				offsetView(view, width < 600 && height > 500 ? 100 : 0);
				const layout = ringLayout(state, view);
				for (const at of [...layout.outline, ...layout.contacts.map(function (contact) { return contact.point; })]) {
					expect(at.x).toBeGreaterThanOrEqual(20); expect(at.x).toBeLessThanOrEqual(width - 20);
					expect(at.y).toBeGreaterThanOrEqual(20); expect(at.y).toBeLessThanOrEqual(height - 20);
				}
				const classified = layout.contacts[0]; const unknown = layout.contacts[1];
				if (!classified || !unknown) throw new Error('Expected separate intel lanes');
				expect(Math.hypot(classified.point.x - unknown.point.x, classified.point.y - unknown.point.y)).toBeCloseTo(16);
			}
		}
	}
});
