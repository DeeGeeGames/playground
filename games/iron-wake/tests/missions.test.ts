import { describe, expect, test } from 'bun:test';
import { createMount, WEAPONS } from '../src/arsenal';
import type { Contract, MissionKind } from '../src/campaign-types';
import { EXTRACTION_RADIUS, EXTRACTION_SECONDS, FACILITY_TARGET_ID, generateMissionMap, missionHostileCount } from '../src/missions';
import { ARENA, createMissionState, distance, step, type Controls, type State } from '../src/simulation';

const contract = function (kind: MissionKind, seed = 123): Contract {
	return { id: `test-${kind}-${seed}`, seed, planetId: 'meridian', kind, employer: 'freeholds', opponent: 'combine', title: 'Field test', briefing: 'Complete the objective and extract.', reward: 1000, favor: 8, hostility: 5, tier: 1, requiredReputation: 0 };
};
const idle: Controls = { drive: 0, turn: 0, stop: false, fire: [false, false, false, false], coolant: false, aim: { x: 0, y: 0 } };
const run = function (state: State, seconds: number, controls = idle) { for (let tick = 0; tick < Math.ceil(seconds * 60); tick++) step(state, controls, 1 / 60); };
const missionOf = function (state: State) { if (!state.mission) throw new Error('Expected mission state'); return state.mission; };

describe('Iron Wake surface contracts', function () {
	test('seeded maps vary routes and deployment while keeping all mission sites within larger bounds', function () {
		const layouts = new Set<string>();
		for (let seed = 0; seed < 40; seed++) {
			const definition = contract('clearance', seed); const map = generateMissionMap(definition);
			expect(generateMissionMap(definition)).toEqual(map);
			expect(map.width * map.height).toBeGreaterThan(ARENA.width * ARENA.height * 4);
			expect(distance(map.drop, map.objective)).toBeGreaterThan(1200);
			expect(distance(map.extraction, map.objective)).toBeGreaterThan(600);
			for (const point of [map.drop, map.objective, map.extraction, ...map.sites, ...map.landmarks]) {
				expect(point.x).toBeGreaterThan(35); expect(point.x).toBeLessThan(map.width - 35);
				expect(point.y).toBeGreaterThan(35); expect(point.y).toBeLessThan(map.height - 35);
			}
			layouts.add(JSON.stringify([map.drop, map.objective, map.extraction, map.sites]));
		}
		expect(layouts.size).toBe(40);
		expect(generateMissionMap({ ...contract('demolition'), planetId: 'borealis' }).biome).toBe('tundra');
		expect(generateMissionMap({ ...contract('demolition'), planetId: 'cinder' }).biome).toBe('volcanic');
	});

	test('offensive patrols stay at their sites until contacted and player movement uses the mission boundary', function () {
		const state = createMissionState(contract('assassination')); const mission = missionOf(state);
		const original = state.enemies.map(function (enemy) { return { x: enemy.x, y: enemy.y }; });
		run(state, 10);
		expect(state.enemies.map(function (enemy) { return { x: enemy.x, y: enemy.y }; })).toEqual(original);
		expect(state.shots).toHaveLength(0); expect(state.strikes).toHaveLength(0);
		state.player.x = mission.map.width - 40; state.player.y = mission.map.height - 40; state.player.angle = 0;
		run(state, 3, { ...idle, drive: 1 });
		expect(state.player.x).toBe(mission.map.width - 35); expect(state.player.y).toBeGreaterThan(ARENA.height);
		const first = state.enemies[0]; if (!first) throw new Error('Missing guard');
		state.player.x = first.x - 700; state.player.y = first.y; state.player.throttle = 0; state.player.speed = 0;
		step(state, idle, 1 / 60); expect(first.engaged).toBe(true);
	});

	test('assassination and demolition allow surviving escorts but require uninterrupted extraction', function () {
		for (const kind of ['assassination', 'demolition'] as const) {
			const state = createMissionState(contract(kind)); const mission = missionOf(state); state.draftsEnabled = false;
			state.relay = 0; // Offensive sorties have no friendly relay failure condition.
			if (mission.structure) mission.structure.hp = 0;
			const target = state.enemies.find(function (enemy) { return enemy.id === mission.targetId; }); if (target) target.hp = 0;
			step(state, idle, 1 / 60);
			expect(mission.stage).toBe('extract'); expect(state.outcome).toBe('playing'); expect(state.enemies.length).toBeGreaterThan(0);
			state.player.x = mission.map.extraction.x; state.player.y = mission.map.extraction.y;
			run(state, 1.5); expect(mission.extractTime).toBeGreaterThan(1); expect(state.outcome).toBe('playing');
			state.player.x += EXTRACTION_RADIUS + 1; step(state, idle, 1 / 60); expect(mission.extractTime).toBe(0);
			state.player.x = mission.map.extraction.x; run(state, EXTRACTION_SECONDS + 0.1);
			expect(state.outcome).toBe('won'); expect(state.phase).toBe('combat'); expect(state.wave).toBe(1);
		}
	});

	test('clearance requires every deployed hostile and fatal damage wins over extraction on the same tick', function () {
		const state = createMissionState(contract('clearance')); const mission = missionOf(state); state.draftsEnabled = false;
		for (const [index, enemy] of state.enemies.entries()) if (index > 0) enemy.hp = 0;
		step(state, idle, 1 / 60); expect(mission.stage).toBe('active');
		for (const enemy of state.enemies) enemy.hp = 0;
		step(state, idle, 1 / 60); expect(mission.stage).toBe('extract'); expect(mission.progress).toBe(mission.required);
		state.player.x = mission.map.extraction.x; state.player.y = mission.map.extraction.y;
		mission.extractTime = EXTRACTION_SECONDS - 0.001; state.player.hp = 1;
		state.shots.push({ x: state.player.x, y: state.player.y, vx: 0, vy: 0, life: 1, kind: 'enemy', target: undefined, damage: 10 });
		step(state, idle, 1 / 60); expect(state.outcome).toBe('lost'); expect(state.events).not.toContain('victory');
	});

	test('defense is a finite local assault and incoming ordnance can still destroy its relocated relay', function () {
		const state = createMissionState(contract('defend')); const mission = missionOf(state); state.draftsEnabled = false;
		const quota = missionHostileCount(mission.contract);
		for (let tick = 0; tick < 60 * 180 && mission.stage === 'active'; tick++) {
			for (const enemy of state.enemies) enemy.hp = 0;
			step(state, idle, 1 / 60);
		}
		expect(state.spawned).toBe(quota); expect(state.kills).toBe(quota); expect(mission.stage).toBe('extract');
		expect(state.warnings).toHaveLength(0); expect(state.phase).toBe('combat'); expect(state.wave).toBe(1);
		state.relay = 1;
		state.strikes.push({ id: state.nextId++, ...mission.map.objective, life: 0.001, duration: 1, radius: 62, damage: 10 });
		step(state, idle, 1 / 60); expect(state.outcome).toBe('lost');
		const abandoned = createMissionState(contract('defend')); abandoned.draftsEnabled = false;
		run(abandoned, 180); expect(abandoned.outcome).toBe('lost');
	});

	test('every weapon family can damage a facility and guidance locks to its target identity', function () {
		for (const weapon of WEAPONS) {
			const state = createMissionState(contract('demolition')); const mission = missionOf(state); const structure = mission.structure;
			if (!structure) throw new Error('Missing facility');
			state.enemies = []; state.loadout = [createMount(weapon.id)]; state.draftsEnabled = false;
			state.player.x = structure.x - 300; state.player.y = structure.y; state.player.angle = 0; state.player.turret = 0;
			const input = { ...idle, aim: structure, fire: [true, false, false, false] as const };
			step(state, input, 1 / 60);
			if (weapon.kind === 'missile') expect(state.shots.every(function (shot) { return shot.target === FACILITY_TARGET_ID; })).toBe(true);
			run(state, 2, input); expect(structure.hp).toBeLessThan(structure.maxHp);
		}
	});

	test('structures block ordinary shots, piercing records one hit, and cluster splash reaches nearby facilities', function () {
		const state = createMissionState(contract('demolition')); const structure = missionOf(state).structure;
		if (!structure) throw new Error('Missing facility');
		state.enemies = [{ id: state.nextId++, x: structure.x + 100, y: structure.y, hp: 100, maxHp: 100, kind: 'scout', heavy: false, angle: 0, cooldown: 100 }];
		state.shots.push({ x: structure.x - 100, y: structure.y, vx: 10000, vy: 0, life: 1, kind: 'cannon', target: undefined, damage: 38 });
		step(state, idle, 0.04); expect(structure.hp).toBe(structure.maxHp - 38); expect(state.enemies[0]?.hp).toBe(100);
		state.shots.push({ x: structure.x - 80, y: structure.y, vx: 100, vy: 0, life: 2, kind: 'ppc', target: undefined, damage: 82, hitIds: [] });
		run(state, 1); expect(structure.hp).toBe(structure.maxHp - 120);
		const enemy = state.enemies[0]; if (!enemy) throw new Error('Missing guard');
		enemy.x = structure.x - 100; enemy.y = structure.y;
		state.shots = [{ x: enemy.x, y: enemy.y, vx: 0, vy: 0, life: 1, kind: 'rocket', target: undefined, damage: 30, splash: 80 }];
		step(state, idle, 1 / 60); expect(structure.hp).toBeCloseTo(structure.maxHp - 138);
	});
});
