import { expect, test } from 'bun:test';
import { Mesh, MeshStandardMaterial } from 'three';
import { FRAMES } from '../src/frames';
import { FRAME_RIGS } from '../src/frame-rig';
import { advanceGaits, createGaits, legJoints, posedLegRig } from '../src/gait';
import { createMech, weaponRecoil } from '../src/mech-3d';
import { createState, step, type Controls } from '../src/simulation';

const idle: Controls = { drive: 0, turn: 0, stop: false, aim: { x: 900, y: 0 }, fire: [false, false, false, false], coolant: false };
const dt = 1 / 60;

for (const frame of FRAMES) {
	if (FRAME_RIGS[frame.id].kneeDirection === 1) test(`${frame.name} lifts a foot on the first movement tick, including reverse and restarting after a stop`, function () {
		for (const drive of [-1, 1]) {
			const state = createState({ frame: frame.id }); state.spawnIn = 3600;
			let gaits = createGaits(state);
			for (let start = 0; start < 2; start++) {
				const before = gaits.player;
				step(state, { ...idle, drive }, dt);
				gaits = advanceGaits(gaits, state);
				expect(Math.hypot(gaits.player.body.x - before.body.x, gaits.player.body.y - before.body.y)).toBeGreaterThan(0);
				expect(gaits.player.feet.filter(function (foot) { return foot.lift > 0; })).toHaveLength(1);
				const support = gaits.player.swing?.index === 0 ? 1 : 0;
				expect(gaits.player.feet[support]).toEqual(before.feet[support]);
				for (let tick = 0; tick < 900; tick++) {
					step(state, { ...idle, drive: tick < 180 ? drive : 0, stop: tick >= 180 }, dt);
					gaits = advanceGaits(gaits, state);
					// Residual coast must leave the recovered standing stance alone.
					if (tick >= 870) expect(gaits.player.swing).toBeUndefined();
				}
			}
		}
	});

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
				const rig = posedLegRig(gaits.player, frame.size, FRAME_RIGS[frame.id]);
				const { hip, knee, ankle } = legJoints(gaits.player.body, gaits.player.feet[index], index, frame.size, rig);
				expect(Math.hypot(knee.x - hip.x, knee.y - hip.y, knee.z - hip.z)).toBeCloseTo(rig.upper * frame.size, 6);
				expect(Math.hypot(knee.x - ankle.x, knee.y - ankle.y, knee.z - ankle.z)).toBeCloseTo(rig.lower * frame.size, 6);
			}
		}
		expect(highestSpeed).toBeGreaterThan(frame.speed * 0.97);
		expect(-reverseSpeed).toBeGreaterThan(frame.reverseSpeed * 0.97);
		expect(touchdowns).toBeGreaterThan(15);
		expect(gaits.player.swing).toBeUndefined();
		expect(gaits.player.feet.every(function (foot) { return foot.lift === 0; })).toBe(true);
		if (FRAME_RIGS[frame.id].kneeDirection === 1) {
			// After braking and pivoting, humanoids take real settling steps and
			// recover the same fully extended stance they use on first deployment.
			for (const gait of [createGaits(createState({ frame: frame.id })).player, gaits.player]) {
				const rig = posedLegRig(gait, frame.size, FRAME_RIGS[frame.id]);
				expect(rig.hipHeight).toBeCloseTo(FRAME_RIGS[frame.id].hipHeight, 4);
				for (const index of [0, 1] as const) {
					const { hip, ankle } = legJoints(gait.body, gait.feet[index], index, frame.size, rig);
					expect(Math.hypot(hip.x - ankle.x, hip.y - ankle.y, hip.z - ankle.z)).toBeCloseTo((rig.upper + rig.lower) * frame.size, 4);
				}
			}
		}
	});

	test(`${frame.name} starter visibly actuates its hardware and reduced motion restores the assembly`, function () {
		const state = createState({ frame: frame.id }); state.spawnIn = 3600;
		const gait = createGaits(state).player;
		const model = createMech(undefined, false, frame.id);
		try {
			model.pose(gait, state.player.turret);
			const parts: Mesh[] = [];
			model.root.traverse(function (object) { if (object instanceof Mesh && !object.visible) parts.push(object); });
			// Hardware can recoil as one assembly; compare visible world poses,
			// including parent transforms rather than only each mesh's local pose.
			const rest = parts.map(function (part) { return part.matrixWorld.clone(); });
			step(state, { ...idle, fire: [true, false, false, false] }, dt);
			const recoil = weaponRecoil(state.loadout);
			expect(recoil).toBeGreaterThan(0);
			model.pose(gait, state.player.turret, { recoil, hit: 0, heat: state.player.heat, time: state.time, reducedMotion: false });
			expect(parts.some(function (part, index) { return !part.matrixWorld.equals(rest[index] ?? part.matrixWorld); })).toBe(true);
			model.pose(gait, state.player.turret, { recoil, hit: 0, heat: state.player.heat, time: state.time, reducedMotion: true });
			expect(parts.map(function (part) { return part.matrixWorld; })).toEqual(rest);
			for (const part of parts) {
				expect(part.matrix.elements.every(Number.isFinite)).toBe(true);
				if (part.material instanceof MeshStandardMaterial) expect(part.material.depthTest).toBe(true);
			}
		} finally { model.dispose(); }
	});
}
