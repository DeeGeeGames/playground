import { expect, test } from 'bun:test';
import { createSpringRunBuilder, type SpringWorld } from '../src/game';
import { ENEMY, HOME, MAX_REACH } from '../src/rules';

const PLAYER_PASS = 40;

const boot = async (): Promise<{ world: SpringWorld; target: EventTarget }> => {
	const target = new EventTarget();
	const world = createSpringRunBuilder({ target, pollGamepads: () => [] }).build();
	try {
		await world.initialize();
	} catch (error) {
		await world.dispose();
		throw error;
	}
	return { world, target };
};

const playerOf = (world: SpringWorld) => {
	const player = world.getEntity(world.getResource('actors').playerId);
	const place = player?.components.localTransform;
	const health = player?.components.health;
	if (!player || !place || !health) throw new Error('Player is not on stage.');
	return { player, place, health };
};

class KeyEvent extends Event {
	readonly key: string;
	readonly repeat = false;
	constructor(type: 'keydown' | 'keyup', key: string) {
		super(type, { cancelable: true });
		this.key = key;
	}
}

const hold = (target: EventTarget, key: string) => {
	target.dispatchEvent(new KeyEvent('keydown', key));
};

const release = (target: EventTarget, key: string) => {
	target.dispatchEvent(new KeyEvent('keyup', key));
};

test('the gunner and the player start on a fixed stage', async () => {
	const { world } = await boot();
	try {
		const { place, health } = playerOf(world);
		const enemy = world.getEntity(world.getResource('actors').enemyId);
		expect(place.x).toBe(HOME.x);
		expect(place.y).toBe(HOME.y);
		expect(health.current).toBe(3);
		expect(enemy?.components.localTransform?.x).toBe(ENEMY.x);
		expect(enemy?.components.localTransform?.y).toBe(ENEMY.y);
		expect(world.getResource('round').phase).toBe('dodging');
	} finally {
		await world.dispose();
	}
});

test('holding a direction springs out to the limit and releasing returns to the mark', async () => {
	const { world, target } = await boot();
	try {
		hold(target, 'ArrowUp');
		for (let frame = 0; frame < 45; frame += 1) {
			world.update(1 / 60);
			const { place } = playerOf(world);
			expect(Math.hypot(place.x - HOME.x, place.y - HOME.y)).toBeLessThanOrEqual(MAX_REACH + 1e-6);
		}
		const sprung = playerOf(world).place;
		expect(sprung.y).toBeLessThan(HOME.y - MAX_REACH + 2);
		expect(sprung.x).toBeCloseTo(HOME.x, 0);
		release(target, 'ArrowUp');
		for (let frame = 0; frame < 45; frame += 1) world.update(1 / 60);
		const home = playerOf(world).place;
		expect(home.x).toBeCloseTo(HOME.x, 0);
		expect(home.y).toBeCloseTo(HOME.y, 0);
		const enemy = world.getEntity(world.getResource('actors').enemyId);
		expect(enemy?.components.localTransform?.x).toBe(ENEMY.x);
		expect(enemy?.components.localTransform?.y).toBe(ENEMY.y);
	} finally {
		await world.dispose();
	}
});

test('a shot locked on the mark misses a player who springs off the line', async () => {
	const { world } = await boot();
	try {
		let guard = 0;
		while (world.getResource('volley').mode !== 'telegraph') {
			world.update(1 / 60);
			guard += 1;
			if (guard > 120) throw new Error('The gunner never telegraphed.');
		}
		expect(world.getResource('volley').aimY).toBeCloseTo(HOME.y, 0);
		const stick = world.getResource('stick');
		stick.active = true;
		stick.x = 0;
		stick.y = -MAX_REACH;
		let shotId: number | undefined;
		while (shotId === undefined) {
			world.update(1 / 60);
			guard += 1;
			const shot = world.getEntitiesWithQuery(['shot'])[0];
			if (shot) shotId = shot.id;
			if (guard > 240) throw new Error('The locked shot never spawned.');
		}
		const locked = world.getEntity(shotId);
		expect(locked?.components.projectileDirection?.y).toBeCloseTo(0, 1);
		let passed = false;
		while (!passed) {
			world.update(1 / 60);
			guard += 1;
			expect(playerOf(world).health.current).toBe(3);
			const shot = world.getEntity(shotId);
			const shotX = shot?.components.localTransform?.x;
			if (shotX === undefined || shotX > HOME.x + PLAYER_PASS) passed = true;
			if (guard > 400) throw new Error('The locked shot never passed the mark.');
		}
	} finally {
		await world.dispose();
	}
});

test('staying on the mark is a hit, and the last life stops the gunner until restart', async () => {
	const { world } = await boot();
	try {
		const { health } = playerOf(world);
		let guard = 0;
		while (health.current === 3) {
			world.update(1 / 60);
			guard += 1;
			if (guard > 400) throw new Error(`Expected a hit. Shots: ${world.getEntitiesWithQuery(['shot']).length}`);
		}
		expect(health.current).toBe(2);
		world.update(1 / 60);
		expect(health.current).toBe(2);

		health.current = 1;
		guard = 0;
		while (world.getResource('round').phase !== 'down') {
			world.update(1 / 60);
			guard += 1;
			if (guard > 400) throw new Error('A lethal shot did not down the player.');
		}
		expect(health.current).toBe(0);
		for (let frame = 0; frame < 180; frame += 1) {
			world.update(1 / 60);
			expect(world.getResource('round').phase).toBe('down');
			expect(world.getEntitiesWithQuery(['shot'])).toHaveLength(0);
		}
		world.getResource('round').restartRequested = true;
		world.update(1 / 60);
		const restored = playerOf(world);
		expect(world.getResource('round').phase).toBe('dodging');
		expect(restored.health.current).toBe(3);
		expect(restored.place.x).toBeCloseTo(HOME.x, 0);
		expect(restored.place.y).toBeCloseTo(HOME.y, 0);
	} finally {
		await world.dispose();
	}
});
