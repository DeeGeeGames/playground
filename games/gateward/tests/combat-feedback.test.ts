import { expect, test } from 'bun:test';
import { Mesh } from 'three';
import { createTurret, disposeObject } from '../src/actors-3d';
import { createCombatVisual } from '../src/combat-feedback';
import { createState, step, type Effect } from '../src/simulation';
import { DECK_HEIGHT } from '../src/projection';

test('shield overflow records both absorbed energy and penetrating hull damage at the contact', function () {
	for (const charge of [0, 10, 100]) {
		const state = createState(); state.status = 'running'; state.nextWave = Infinity; state.systems.shield.charge = charge;
		state.shots.push({ id: 999, x: 0, y: 0, vx: 0, vy: 0, damage: 30, side: 'enemy', weapon: 'hostile', target: undefined, life: 4 });
		step(state, 1 / 60);
		const effect = state.effects.find(function (entry) { return entry.feedback?.kind === 'impact'; });
		expect(effect?.feedback).toEqual({ kind: 'impact', shield: Math.min(charge, 30), hull: Math.max(0, 30 - charge), armor: 0, deck: true });
		if (!effect) throw new Error('Missing impact');
		const visual = createCombatVisual(); visual.update(effect, state, true);
		expect(visual.root.position.y).toBe(DECK_HEIGHT);
		const before = effect.life; state.paused = true; step(state, 1); expect(effect.life).toBe(before);
		state.paused = false; state.focused = false; step(state, 1); expect(effect.life).toBe(before);
		disposeObject(visual.root);
	}
});

test('armor hit records reduction plus penetration; death rewards and removal do not wait for visuals', function () {
	const state = createState(); state.status = 'running'; state.nextWave = Infinity; state.wave = 1;
	state.enemies.push({ id: 99, kind: 'armored', x: 0, y: -200, hp: 1, maxHp: 260, cooldown: 999 });
	state.shots.push({ id: 100, x: 0, y: -200, vx: 0, vy: 0, damage: 13, side: 'player', weapon: 'flak', target: 99, life: 4 });
	step(state, 1 / 60);
	const impact = state.effects.find(function (entry) { return entry.feedback?.kind === 'impact'; });
	if (impact?.feedback?.kind !== 'impact') throw new Error('Missing impact');
	expect(impact.feedback.hull).toBeCloseTo(13 * 0.48); expect(impact.feedback.armor).toBeCloseTo(13 * 0.52);
	expect(state.enemies).toHaveLength(0); expect(state.kills).toBe(1); expect(state.cleared).toBe(true);
	expect(state.effects.some(function (entry) { return entry.feedback?.kind === 'destruction'; })).toBe(true);
	const salvage = state.salvage; step(state, 1 / 60); expect(state.kills).toBe(1); expect(state.salvage - salvage).toBeCloseTo(1.2 / 60);
});

test('recoil stays in barrel coordinates and reduced motion removes displacement', function () {
	const mount = createState().mounts[0]; if (!mount) throw new Error('Missing mount');
	mount.weapon = 'rail'; mount.aim = 1;
	const turret = createTurret(mount); turret.update(mount, false, { strength: 1, beam: false });
	expect(turret.root.getObjectByName('TurretAim')?.rotation.y).toBe(-1);
	expect(turret.root.getObjectByName('Railgun')?.position.x).toBe(-5);
	expect(turret.root.getObjectByName('MuzzleFlash')?.visible).toBe(true);
	turret.update(mount, false, { strength: 1, beam: false }, true);
	expect(turret.root.getObjectByName('Railgun')?.position.x).toBeCloseTo(0);
	turret.update(mount, false); expect(turret.root.getObjectByName('MuzzleFlash')?.visible).toBe(false);
	disposeObject(turret.root);
});

test('shield and armor penetration have distinct geometry, and effects remain in world space', function () {
	const state = createState();
	const effect: Effect = { x: 200, y: -300, radius: 18, life: 0.2, maxLife: 0.3, color: '#ffb87b', feedback: { kind: 'impact', shield: 10, armor: 0, hull: 20, deck: true } };
	const visual = createCombatVisual(); visual.update(effect, state, false);
	const visibleMeshes = visual.root.children.filter(function (child) { return child instanceof Mesh && child.visible; });
	expect(visibleMeshes).toHaveLength(2);
	state.ark.x = 900; state.ark.angle = 2; visual.update(effect, state, true);
	expect(visual.root.position.x).toBe(200); expect(visual.root.position.z).toBe(-300);
	effect.feedback = { kind: 'impact', shield: 0, armor: 5, hull: 5, deck: false }; visual.update(effect, state, false);
	expect(visual.root.children.filter(function (child) { return child.visible; })).toHaveLength(7);
	disposeObject(visual.root);
});

test('firing cues require actual shots, and upgraded sustained beams report authoritative reduction', function () {
	for (const weapon of ['flak', 'rail', 'missile', 'beam'] as const) {
		const state = createState(); state.status = 'running'; state.nextWave = Infinity;
		const mount = state.mounts[0]; if (!mount) throw new Error('Missing mount');
		mount.weapon = weapon; mount.level = 3;
		state.enemies.push({ id: 999, kind: 'armored', x: -96, y: -200, hp: 1000, maxHp: 1000, cooldown: 999 });
		step(state, 1 / 60);
		if (weapon === 'beam') {
			const impact = state.effects.find(function (entry) { return entry.feedback?.kind === 'impact'; });
			if (impact?.feedback?.kind !== 'impact') throw new Error('Missing beam impact');
			expect(impact.feedback.hull).toBeCloseTo(1000 - (state.enemies[0]?.hp ?? 0));
			expect(state.effects.some(function (entry) { return entry.feedback?.kind === 'muzzle'; })).toBe(false);
		} else {
			for (let frame = 0; frame < 120 && !state.effects.some(function (entry) { return entry.feedback?.kind === 'muzzle'; }); frame++) step(state, 1 / 60);
			expect(state.effects.some(function (entry) { return entry.feedback?.kind === 'muzzle' && entry.feedback.weapon === weapon && entry.feedback.mount === 0; })).toBe(true);
		}
	}
});
