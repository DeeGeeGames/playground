import { expect, test } from 'bun:test';
import { Mesh, MeshStandardMaterial } from 'three';
import { FRAMES } from '../src/frames';
import { advanceGaits, createGaits, legJoints } from '../src/gait';
import { createMech, weaponRecoil } from '../src/mech-3d';
import { createState, step, type Controls } from '../src/simulation';

const idle: Controls = { drive: 0, turn: 0, stop: false, aim: { x: 900, y: 0 }, fire: [false, false, false, false], coolant: false };
const dt = 1 / 60;

for (const frame of FRAMES) {
	test(`${frame.name} keeps planted feet and fixed-length joints at full speed, reverse, pivot and braking`, function () {
		const state = createState({ frame: frame.id }); state.spawnIn = 3600;
		let gaits = createGaits(state); let highestSpeed = 0; let reverseSpeed = 0; let touchdowns = 0;
		for (let tick = 0; tick < 1300; tick++) {
			const drive = tick < 240 ? 1 : tick < 600 ? -1 : tick < 800 ? 1 : 0;
			const turn = tick >= 650 && tick < 1000 ? 1 : 0;
			step(state, { ...idle, drive, turn, stop: tick >= 800 }, dt);
			const previous = gaits.player;
			gaits = advanceGaits(gaits, state);
			highestSpeed = Math.max(highestSpeed, state.player.speed);
			reverseSpeed = Math.min(reverseSpeed, state.player.speed);
			expect(gaits.player.feet.filter(function (foot) { return foot.lift > 0; }).length).toBeLessThanOrEqual(1);
			if (previous.swing && !gaits.player.swing) touchdowns++;
			for (const index of [0, 1] as const) {
				if (previous.swing?.index !== index && gaits.player.swing?.index !== index) expect(gaits.player.feet[index]).toEqual(previous.feet[index]);
				const { hip, knee, ankle } = legJoints(gaits.player.body, gaits.player.feet[index], index, frame.size);
				expect(Math.hypot(knee.x - hip.x, knee.y - hip.y, knee.z - hip.z)).toBeCloseTo(30 * frame.size, 6);
				expect(Math.hypot(knee.x - ankle.x, knee.y - ankle.y, knee.z - ankle.z)).toBeCloseTo(34 * frame.size, 6);
			}
		}
		expect(highestSpeed).toBeGreaterThan(frame.speed * 0.97);
		expect(-reverseSpeed).toBeGreaterThan(frame.reverseSpeed * 0.97);
		expect(touchdowns).toBeGreaterThan(15);
		expect(gaits.player.swing).toBeUndefined();
		expect(gaits.player.feet.every(function (foot) { return foot.lift === 0; })).toBe(true);
	});

	test(`${frame.name} starter visibly actuates its hardware and reduced motion restores the assembly`, function () {
		const state = createState({ frame: frame.id }); state.spawnIn = 3600;
		const gait = createGaits(state).player;
		const model = createMech(undefined, false, frame.id);
		try {
			model.pose(gait, state.player.turret);
			const parts: Mesh[] = [];
			model.root.traverse(function (object) { if (object instanceof Mesh && !object.visible) parts.push(object); });
			const rest = parts.map(function (part) { return part.matrix.clone(); });
			step(state, { ...idle, fire: [true, false, false, false] }, dt);
			const recoil = weaponRecoil(state.loadout);
			expect(recoil).toBeGreaterThan(0);
			model.pose(gait, state.player.turret, { recoil, hit: 0, heat: state.player.heat, time: state.time, reducedMotion: false });
			expect(parts.some(function (part, index) { return !part.matrix.equals(rest[index] ?? part.matrix); })).toBe(true);
			model.pose(gait, state.player.turret, { recoil, hit: 0, heat: state.player.heat, time: state.time, reducedMotion: true });
			expect(parts.map(function (part) { return part.matrix; })).toEqual(rest);
			for (const part of parts) {
				expect(part.matrix.elements.every(Number.isFinite)).toBe(true);
				if (part.material instanceof MeshStandardMaterial) expect(part.material.depthTest).toBe(true);
			}
		} finally { model.dispose(); }
	});
}
