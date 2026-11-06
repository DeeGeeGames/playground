import { describe, expect, test } from 'bun:test';
import { chooseWeapon, applyRefit, getEnemyDefense, getOperationReport, angleDelta, createState, distance, ENEMY_STATS, step, type Controls, type EnemyKind, type State } from '../src/simulation';
import { getWaveDefinition, TOTAL_HOSTILES, WAVES, type Difficulty } from '../src/operation';
import { createMount } from '../src/arsenal';
// Combat fixtures equip the training bank so individual weapon mechanics can
// be tested without driving the separate requisition progression.
const createCombatState = function (options: { difficulty?: Difficulty } = {}) {
	const state = createState(options); state.draftsEnabled = false;
	state.loadout = [createMount('autocannon'), createMount('laser'), createMount('cluster-missiles')];
	return state;
};
const idle: Controls = { drive: 0, stop: false, turn: 0, aim: { x: 900, y: 200 }, fire: [false, false, false, false], coolant: false };
const run = function (state: State, seconds: number, input = idle) { for (let i = 0; i < seconds * 60; i++) step(state, input, 1 / 60); };
const target = function (state: State, x = 900, y = 580) { state.enemies.push({ id: state.nextId++, x, y, angle: 0, cooldown: 100, hp: 100, maxHp: 100, heavy: false, kind: 'striker' }); };
const flyOperation = function (difficulty: Difficulty, moving: boolean) {
	const state = createState({ difficulty });
	for (let tick = 0; tick < 60 * 600 && state.outcome === 'playing'; tick++) {
		if (state.phase === 'refit') applyRefit(state, 'arsenal');
		if (state.phase === 'requisition') {
			const preferred = ['stream-missiles', 'laser', 'autocannon', 'machine-gun', 'ppc', 'cluster-missiles', 'stream-rockets', 'cluster-rockets'];
			const offer = [...state.offers].sort(function (a, b) { return preferred.indexOf(a) - preferred.indexOf(b); })[0];
			if (offer) chooseWeapon(state, offer, 3);
		}
		const p = state.player;
		const target = [...state.enemies].sort(function (a, b) { return distance(a, p) - distance(b, p); })[0];
		// A simple orbit exercises ordinary throttle and turning. It has no
		// perfect artillery dodge, invulnerability, or special boss knowledge.
		const radial = Math.atan2(p.y - 600, p.x - 900);
		const heading = radial + Math.PI / 2 + Math.atan((Math.hypot(p.x - 900, p.y - 600) - 300) / 160);
		step(state, { ...idle, drive: moving ? 1 : 0, turn: moving ? Math.max(-1, Math.min(1, angleDelta(p.angle, heading) * 2)) : 0,
			aim: target ?? idle.aim, fire: [Boolean(target) && p.heat < 85, Boolean(target) && p.heat < 75, Boolean(target) && p.heat < 75, Boolean(target) && p.heat < 75], coolant: p.heat > 85 }, 1 / 60);
	}
	return state;
};
describe('Iron Wake combat', function () {
	test('heavy drive accelerates gradually and turning uses the shortest angle', function () {
		const state = createCombatState(); run(state, 0.1, { ...idle, drive: 1 });
		expect(state.player.speed).toBeGreaterThan(0); expect(state.player.speed).toBeLessThan(20);
		expect(Math.abs(angleDelta(Math.PI - 0.1, -Math.PI + 0.1) - 0.2)).toBeLessThan(0.001);
	});
	test('throttle persists after release and clamps in both directions', function () {
		const state = createCombatState(); run(state, 1, { ...idle, drive: 1 });
		expect(state.player.throttle).toBeCloseTo(0.75);
		const speed = state.player.speed; run(state, 0.5);
		expect(state.player.throttle).toBeCloseTo(0.75); expect(state.player.speed).toBeGreaterThan(speed);
		run(state, 2, { ...idle, drive: 1 }); expect(state.player.throttle).toBe(1);
		run(state, 4, { ...idle, drive: -1 }); expect(state.player.throttle).toBe(-1);
		run(state, 2); expect(state.player.speed).toBeLessThan(-40); expect(state.player.speed).toBeGreaterThanOrEqual(-48);
	});
	test('neutral stops engine demand immediately while momentum decays', function () {
		const state = createCombatState(); run(state, 1.5, { ...idle, drive: 1 });
		const speed = state.player.speed;
		step(state, { ...idle, stop: true, drive: 1 }, 1 / 60);
		expect(state.player.throttle).toBe(0); expect(state.player.speed).toBeGreaterThan(0); expect(state.player.speed).toBeLessThan(speed);
		run(state, 4); expect(state.player.throttle).toBe(0); expect(Math.abs(state.player.speed)).toBeLessThan(0.2);
		expect(createState().player.throttle).toBe(0);
	});
	test('cannon shell damages a target and has a reload interval', function () {
		const state = createCombatState(); target(state); run(state, 0.4, { ...idle, fire: [true, false, false, false] });
		expect(state.enemies[0]?.hp).toBe(62); expect(state.cannonIn).toBeGreaterThan(0);
	});
	test('laser hits the nearest target and overheats under sustained fire', function () {
		const state = createCombatState(); target(state); target(state, 900, 500);
		run(state, 0.2, { ...idle, fire: [false, true, false, false] });
		expect(state.enemies[0]?.hp).toBeLessThan(100); expect(state.enemies[1]?.hp).toBe(100);
		run(state, 8.5, { ...idle, fire: [false, true, false, false] }); expect(state.player.overheated).toBe(true);
		const heat = state.player.heat; run(state, 0.2, { ...idle, fire: [true, false, false, false] });
		expect(state.cannonIn).toBe(0); expect(state.player.heat).toBeLessThan(heat);
		run(state, 6); expect(state.player.overheated).toBe(false);
	});
	test('missiles lock closest to aim and salvo cannot spam', function () {
		const state = createCombatState(); target(state); target(state, 1000, 550);
		step(state, { ...idle, fire: [false, false, true, false], aim: { x: 1000, y: 550 } }, 1 / 60);
		expect(state.shots).toHaveLength(3); expect(state.shots.every(function (shot) { return shot.target === 2; })).toBe(true);
		step(state, { ...idle, fire: [false, false, true, false] }, 1 / 60); expect(state.shots).toHaveLength(3);
	});
	test('relay destruction loses and terminal states freeze', function () {
		const state = createCombatState(); state.relay = 0; step(state, idle, 1 / 60);
		expect(state.outcome).toBe('lost'); const time = state.time; run(state, 1); expect(state.time).toBe(time);
	});
	test('clear waves stop for refit and the final clear wins', function () {
		const state = createCombatState(); state.player.hp = 50; state.spawned = 5; run(state, 4.1);
		expect(state.phase).toBe('refit'); expect(state.wave).toBe(1); expect(state.player.hp).toBe(50);
		expect(applyRefit(state, 'arsenal')).toBe(true);
		expect(state.wave).toBe(2); expect(state.player.hp).toBe(75);
		state.wave = WAVES.length; state.spawned = getWaveDefinition(state.wave).enemies.length; state.enemies = []; state.shots = []; state.intermission = 0; run(state, 4.1);
		expect(state.outcome).toBe('won');
	});
	test('ignoring the assault eventually loses the relay', function () {
		const state = createCombatState(); run(state, 160); expect(state.outcome).toBe('lost');
	});
	test('spawn warnings precede units and block wave completion', function () {
		const state = createCombatState(); state.spawned = 4; state.spawnIn = 0;
		step(state, idle, 1 / 60);
		expect(state.warnings).toHaveLength(1); expect(state.enemies).toHaveLength(0); expect(state.intermission).toBe(0);
		run(state, 1.8); expect(state.enemies).toHaveLength(0);
		run(state, 0.3); expect(state.warnings).toHaveLength(0); expect(state.enemies).toHaveLength(1);
	});
	test('enemy roles have different movement speeds, engagement ranges and durability', function () {
		const positions = new Map<EnemyKind, number>();
		for (const kind of ['scout', 'striker', 'siege'] satisfies EnemyKind[]) {
			const state = createCombatState(); state.spawnIn = 100;
			state.enemies.push({ id: 1, x: 100, y: 600, hp: ENEMY_STATS[kind].hp, maxHp: ENEMY_STATS[kind].hp, angle: 0, cooldown: 0, heavy: kind === 'siege', kind });
			run(state, 1); positions.set(kind, state.enemies[0]?.x ?? 0);
		}
		expect(positions.get('scout') ?? 0).toBeGreaterThan(positions.get('striker') ?? 0);
		expect(positions.get('striker') ?? 0).toBeGreaterThan(positions.get('siege') ?? 0);
		expect(ENEMY_STATS.siege.hp).toBeGreaterThan(ENEMY_STATS.striker.hp);
		expect(ENEMY_STATS.siege.range).toBeGreaterThan(ENEMY_STATS.striker.range);
		expect(ENEMY_STATS.striker.range).toBeGreaterThan(ENEMY_STATS.scout.range);
	});
	test('coolant is edge-triggered, bounded and clears a cooled lockout', function () {
		const state = createCombatState(); state.player.heat = 90; state.player.overheated = true;
		step(state, { ...idle, coolant: true }, 1 / 60);
		expect(state.player.heat).toBeLessThan(35); expect(state.player.overheated).toBe(false);
		expect(state.coolantCharges).toBe(1); expect(state.events).toContain('coolant');
		state.player.heat = 90; run(state, 0.2, { ...idle, coolant: true }); expect(state.coolantCharges).toBe(1);
		step(state, idle, 1 / 60); step(state, { ...idle, coolant: true }, 1 / 60); expect(state.coolantCharges).toBe(0);
		step(state, idle, 1 / 60); step(state, { ...idle, coolant: true }, 1 / 60); expect(state.coolantCharges).toBe(0);
	});
	test('salvage repairs and resupplies by proximity, without wasting full supplies', function () {
		const state = createCombatState(); state.player.hp = 90; state.coolantCharges = 2;
		state.salvage.push({ id: 1, x: state.player.x, y: state.player.y, kind: 'repair', life: 45 }, { id: 2, x: state.player.x, y: state.player.y, kind: 'coolant', life: 45 });
		step(state, idle, 1 / 60); expect(state.player.hp).toBe(100); expect(state.coolantCharges).toBe(3); expect(state.salvage).toHaveLength(0);
		state.salvage.push({ id: 3, x: state.player.x, y: state.player.y, kind: 'repair', life: 45 });
		step(state, idle, 1 / 60); expect(state.salvage).toHaveLength(1);
		state.player.hp = 0;
		step(state, idle, 1 / 60); expect(state.outcome).toBe('lost'); expect(state.player.hp).toBe(0);
	});
	test('kills leave wrecks and deterministic salvage, and events do not replay after terminal state', function () {
		const state = createCombatState(); target(state); target(state, 1200, 300);
		for (const enemy of state.enemies) enemy.hp = 0;
		step(state, idle, 1 / 60); expect(state.kills).toBe(2); expect(state.wrecks).toHaveLength(2); expect(state.salvage[0]?.kind).toBe('repair');
		expect(state.events).toContain('explosion');
		state.relay = 0; step(state, idle, 1 / 60); expect(state.events).toContain('defeat');
		step(state, idle, 1 / 60); expect(state.events).toHaveLength(0);
	});
	test('cannon uses the nearest swept hit and does not propel a neutral mech backward', function () {
		const state = createCombatState(); state.spawnIn = 100;
		target(state, 900, 580); target(state, 900, 590);
		state.shots.push({ x: 900, y: 650, vx: 0, vy: -4000, life: 1, kind: 'cannon', target: undefined, damage: 38 });
		step(state, { ...idle, fire: [true, false, false, false] }, 0.04);
		expect(state.enemies[0]?.hp).toBe(100); expect(state.enemies[1]?.hp).toBe(62); expect(state.player.speed).toBe(0);
	});
	test('progressing a four-weapon build completes Standard and Veteran, with movement preserving materially more integrity', function () {
		for (const difficulty of ['standard', 'veteran'] as const) {
			const state = flyOperation(difficulty, true);
			expect(state.outcome).toBe('won'); expect(state.kills).toBe(TOTAL_HOSTILES); expect(state.relay).toBeGreaterThan(0);
			const report = getOperationReport(state);
			expect(report.commanderDestroyed).toBe(true); expect(report.score).toBeGreaterThan(10000);
			expect(report.damageDealt).toBeGreaterThan(3000); expect(report.accuracy).toBeGreaterThan(0); expect(report.accuracy).toBeLessThanOrEqual(100);
			const stationary = flyOperation(difficulty, false);
			expect(state.relay - stationary.relay).toBeGreaterThan(25);
			expect(state.player.hp - stationary.player.hp).toBeGreaterThan(25);
			expect(report.score).toBeGreaterThan(getOperationReport(stationary).score);
			expect(state.loadout).toHaveLength(4); expect(state.draftCount).toBe(7);
		}
		expect(flyOperation('story', false).outcome).toBe('won');
	});

	test('refit freezes the entire fight until a single explicit upgrade is applied', function () {
		const state = createCombatState(); state.spawned = 5; state.player.throttle = 0.8; run(state, 4.1);
		expect(state.phase).toBe('refit'); expect(state.player.throttle).toBe(0);
		state.events = [];
		const snapshot = structuredClone(state);
		run(state, 30, { ...idle, drive: 1, fire: [true, true, true, true], coolant: true });
		expect(state).toEqual(snapshot);
		expect(applyRefit(state, 'cooling')).toBe(true);
		expect(state.upgrades.cooling).toBe(1); expect(state.phase).toBe('combat'); expect(state.wave).toBe(2);
		expect(applyRefit(state, 'bastion')).toBe(false); expect(state.upgrades.bastion).toBe(0); expect(state.wave).toBe(2);
		state.outcome = 'lost'; state.phase = 'refit';
		expect(applyRefit(state, 'arsenal')).toBe(false);
	});

	test('refit choices affect sustained fire, damage and survival rather than just labels', function () {
		const arsenal = createCombatState(); arsenal.phase = 'refit'; applyRefit(arsenal, 'arsenal'); arsenal.spawnIn = 100;
		target(arsenal); run(arsenal, 0.4, { ...idle, fire: [true, false, false, false] });
		expect(arsenal.enemies[0]?.hp).toBeCloseTo(100 - 38 * 1.15);
		const cooling = createCombatState(); cooling.phase = 'refit'; applyRefit(cooling, 'cooling'); cooling.spawnIn = 100;
		cooling.player.heat = 50; run(cooling, 1);
		expect(cooling.player.heat).toBeCloseTo(50 - 12 * 1.18); expect(cooling.coolantCharges).toBe(3);
		const bastion = createCombatState(); bastion.phase = 'refit'; bastion.relay = 50; applyRefit(bastion, 'bastion'); bastion.spawnIn = 100;
		bastion.shots.push({ x: 900, y: 780, vx: 0, vy: 0, life: 1, kind: 'enemy', target: undefined, damage: 20 });
		step(bastion, idle, 1 / 60);
		expect(bastion.player.hp).toBe(82); expect(bastion.relay).toBe(62);
	});

	test('artillery announces a fixed impact point and gives a neutral mech time to escape', function () {
		const state = createCombatState(); state.spawnIn = 100;
		state.enemies.push({ id: 1, x: 850, y: 800, hp: 125, maxHp: 125, angle: Math.atan2(-20, 50), cooldown: 0, heavy: true, kind: 'siege' });
		step(state, idle, 1 / 60);
		const strike = state.strikes[0]; if (!strike) throw new Error('Missing artillery warning');
		expect(strike.x).toBe(900); expect(strike.y).toBe(780); expect(state.player.hp).toBe(100);
		run(state, 0.3); // Reaction time before raising throttle.
		run(state, 3.3, { ...idle, drive: 1 });
		expect(state.strikes).toHaveLength(0); expect(state.player.hp).toBe(100);
		const stationary = createState(); stationary.spawnIn = 100;
		stationary.enemies.push({ id: 1, x: 850, y: 800, hp: 125, maxHp: 125, angle: Math.atan2(-20, 50), cooldown: 0, heavy: true, kind: 'siege' });
		run(stationary, 2.9);
		expect(stationary.player.hp).toBe(90); expect(stationary.stats.damageTaken).toBe(10);
	});

	test('siege armor rewards side hits and its cooling window exposes the front', function () {
		const hit = function (rear: boolean, recovering: boolean) {
			const state = createCombatState(); state.spawnIn = 100;
			const enemy = { id: 1, x: 900, y: 580, hp: 125, maxHp: 125, angle: Math.PI / 2, cooldown: 100, heavy: true, kind: 'siege' as const,
				...(recovering ? { attack: { phase: 'recovery' as const, remaining: 3, cycle: 1 } } : {}) };
			state.enemies.push(enemy);
			state.shots.push({ x: 900, y: rear ? 530 : 630, vx: 0, vy: rear ? 4000 : -4000, life: 1, kind: 'cannon', target: undefined, damage: 38 });
			step(state, idle, 0.04);
			return 125 - enemy.hp;
		};
		expect(hit(false, false)).toBeCloseTo(38 * 0.35);
		expect(hit(true, false)).toBeCloseTo(38);
		expect(hit(false, true)).toBeCloseTo(38 * 1.35);
	});

	test('barrage commitment fixes facing and impact positions, and ordnance survives its shooter', function () {
		const state = createCombatState(); state.spawnIn = 100; state.player.y = 600;
		state.enemies.push({ id: 1, x: 400, y: 600, hp: 420, maxHp: 420, angle: 0, cooldown: 0, heavy: true, kind: 'siege', commander: true });
		step(state, idle, 1 / 60);
		const enemy = state.enemies[0]; if (!enemy) throw new Error('Missing commander');
		const positions = state.strikes.map(function (strike) { return { x: strike.x, y: strike.y }; });
		expect(positions.length).toBeGreaterThan(1);
		state.player.x = 500; state.player.y = 200;
		run(state, 1);
		expect(enemy.angle).toBe(0); expect(enemy.x).toBe(400); expect(enemy.y).toBe(600);
		expect(state.strikes.map(function (strike) { return { x: strike.x, y: strike.y }; })).toEqual(positions);
		enemy.hp = 0; step(state, idle, 1 / 60);
		expect(state.enemies).toHaveLength(0); expect(state.strikes).toHaveLength(positions.length);
	});

	test('both commander patterns allow a neutral frame to escape after reaction time and then expose armor', function () {
		for (const enraged of [false, true]) for (let direction = 0; direction < 8; direction++) {
			const state = createCombatState(); state.spawnIn = 100; state.player.y = 600; state.player.angle = direction * Math.PI / 4;
			state.enemies.push({ id: 1, x: 400, y: 600, hp: enraged ? 200 : 420, maxHp: 420, angle: 0, cooldown: 0, heavy: true, kind: 'siege', commander: true });
			step(state, idle, 1 / 60);
			const enemy = state.enemies[0]; if (!enemy) throw new Error('Missing commander');
			expect(getEnemyDefense(state, enemy).enraged).toBe(enraged); expect(getEnemyDefense(state, enemy).exposed).toBe(false);
			run(state, 0.3); // Leave time to notice the committed pattern.
			run(state, 4.7, { ...idle, drive: 1 });
			expect(state.player.hp).toBe(100); expect(state.strikes).toHaveLength(0);
			expect(enemy.attack?.phase).toBe('recovery'); expect(getEnemyDefense(state, enemy).exposed).toBe(true);
			expect(enemy.attack?.remaining).toBeGreaterThan(3);
		}
	});

	test('incoming artillery resolves before the refit can open and can still lose the relay', function () {
		const state = createCombatState(); state.spawned = 5; state.intermission = 3.9; state.relay = 5;
		state.strikes.push({ id: 1, x: 900, y: 600, life: 0.5, duration: 2.8, radius: 62, damage: 10 });
		run(state, 0.3); expect(state.phase).toBe('combat'); expect(state.outcome).toBe('playing');
		run(state, 0.3); expect(state.outcome).toBe('lost'); expect(state.phase).toBe('combat');
	});

	test('difficulty changes actual hostile armor and damage while keeping the same operation', function () {
		const story = createState({ difficulty: 'story' }); const veteran = createState({ difficulty: 'veteran' });
		for (const state of [story, veteran]) {
			state.spawnIn = 100;
			state.warnings.push({ kind: 'siege', x: 850, y: 800, life: 0.01 });
			step(state, idle, 1 / 60);
			const enemy = state.enemies[0]; if (!enemy) throw new Error('Missing hostile'); enemy.cooldown = 0; enemy.angle = Math.atan2(state.player.y - enemy.y, state.player.x - enemy.x);
			run(state, 2.9);
		}
		expect(story.enemies[0]?.hp).toBeLessThan(veteran.enemies[0]?.hp ?? 0);
		expect(story.player.hp).toBeGreaterThan(veteran.player.hp);
		expect(story.stats.damageTaken).toBeCloseTo(5.5); expect(veteran.stats.damageTaken).toBeCloseTo(13);
	});

});
