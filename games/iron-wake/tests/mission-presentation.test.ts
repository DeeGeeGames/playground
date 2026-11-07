import { expect, test } from 'bun:test';
import { Mesh, Scene, type BufferGeometry, type Material } from 'three';
import { createMount } from '../src/arsenal';
import type { Contract } from '../src/campaign-types';
import { missionNavigation, targetSolution } from '../src/overlay';
import { FACILITY_TARGET_ID } from '../src/missions';
import { createMissionState, createState, step } from '../src/simulation';
import { createWorldObjects } from '../src/world-3d';

const contract: Contract = { id: 'presentation-fixture', seed: 42, planetId: 'cinder', kind: 'demolition', employer: 'freeholds', opponent: 'combine', title: 'Test facility', briefing: 'Destroy the facility and extract.', reward: 100, favor: 8, hostility: 5, tier: 1, requiredReputation: -100 };

test('mission rendering follows facility destruction and extraction, reuses a live map, and disposes replaced terrain once', function () {
	const scene = new Scene(); const world = createWorldObjects(scene); const state = createMissionState(contract);
	const mission = state.mission; if (!mission?.structure) throw new Error('Missing demolition mission');
	try {
		world.update(state, true);
		const terrain = scene.getObjectByName('mission-terrain'); if (!terrain) throw new Error('Missing terrain');
		expect(scene.getObjectByName('legacy-terrain')?.visible).toBe(false);
		expect(scene.getObjectByName('relay')?.visible).toBe(false);
		expect(scene.getObjectByName('facility-intact')?.visible).toBe(true);
		expect(scene.getObjectByName('facility-rubble')?.visible).toBe(false);
		expect(scene.getObjectByName('extraction-zone')?.visible).toBe(false);
		const assets = new Set<BufferGeometry | Material>(); const disposed = new Map<BufferGeometry | Material, number>();
		terrain.traverse(function (object) {
			if (!(object instanceof Mesh)) return;
			assets.add(object.geometry);
			for (const surface of Array.isArray(object.material) ? object.material : [object.material]) assets.add(surface);
		});
		for (const asset of assets) asset.addEventListener('dispose', function () { disposed.set(asset, (disposed.get(asset) ?? 0) + 1); });
		mission.structure.hp = 0; mission.stage = 'extract';
		world.update(state, false);
		expect(scene.getObjectByName('mission-terrain')).toBe(terrain);
		expect(scene.getObjectByName('facility-intact')?.visible).toBe(false);
		expect(scene.getObjectByName('facility-rubble')?.visible).toBe(true);
		expect(scene.getObjectByName('extraction-zone')?.visible).toBe(true);
		expect(disposed.size).toBe(0);
		const defense = createMissionState({ ...contract, seed: 57, kind: 'defend', planetId: 'borealis' });
		world.update(defense, true);
		expect(scene.getObjectByName('mission-terrain')).not.toBe(terrain);
		expect(terrain.parent).toBeNull();
		for (const asset of assets) expect(disposed.get(asset)).toBe(1);
		expect(scene.getObjectByName('relay')?.visible).toBe(true);
		expect(scene.getObjectByName('relay')?.position.x).toBe(defense.mission?.map.objective.x);
		expect(scene.getObjectByName('relay')?.position.z).toBe(defense.mission?.map.objective.y);
		world.update(createState(), true);
		expect(scene.getObjectByName('mission-terrain')).toBeUndefined();
		expect(scene.getObjectByName('legacy-terrain')?.visible).toBe(true);
		world.dispose();
		for (const asset of assets) expect(disposed.get(asset)).toBe(1);
		expect(scene.children).toHaveLength(0);
	} finally { world.dispose(); }
});

test('mission navigation follows the remaining objective and missile feedback accounts for a facility stealing the lock', function () {
	const state = createMissionState(contract); const mission = state.mission;
	if (!mission?.structure) throw new Error('Missing demolition mission');
	const facility = mission.structure;
	state.player.x = facility.x; state.player.y = facility.y + 300; state.loadout = [createMount('stream-missiles')];
	const enemy = { id: 999, x: facility.x + 80, y: facility.y, hp: 100, maxHp: 100, angle: 0, cooldown: 1, heavy: false, kind: 'scout' as const };
	state.enemies = [enemy];
	const waypoint = missionNavigation(state);
	if (!waypoint) throw new Error('Missing waypoint');
	// The facility and enemy both sit within range. The aimed facility wins;
	// claiming guidance on the nearby mech would contradict combat targeting.
	expect(targetSolution(state, enemy, facility).guided).toBe(false);
	expect(targetSolution(state, enemy, enemy).guided).toBe(true);
	step(state, { drive: 0, stop: true, turn: 0, aim: facility, fire: [true, false, false, false], coolant: false }, 1 / 60);
	expect(state.shots.find(function (shot) { return shot.kind === 'missile'; })?.target).toBe(FACILITY_TARGET_ID);
	expect(waypoint.point).toBe(facility);
	mission.stage = 'extract';
	expect(missionNavigation(state)?.point).toBe(mission.map.extraction);
	const clearance = createMissionState({ ...contract, kind: 'clearance' });
	const near = { ...enemy, x: clearance.player.x + 100, y: clearance.player.y };
	const far = { ...enemy, id: 1000, x: clearance.player.x + 700, y: clearance.player.y };
	clearance.enemies = [far, near];
	expect(missionNavigation(clearance)?.point).toBe(near);
	clearance.enemies = [far];
	expect(missionNavigation(clearance)?.point).toBe(far);
});
