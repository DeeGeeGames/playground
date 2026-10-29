import ECSpresso, { definePlugin, type ConfigOf } from 'ecspresso';
import { createHealth, createHealthPlugin } from 'ecspresso/plugins/combat/health';
import { createProjectile, createProjectileDirection, createProjectilePlugin } from 'ecspresso/plugins/combat/projectile';
import { createInputPlugin, inputSystems, type GamepadLike } from 'ecspresso/plugins/input/input';
import { createCircleCollider, createCollisionPlugin, defineCollisionLayers, type LayersOf } from 'ecspresso/plugins/physics/collision';
import { createTransform, createTransformPlugin, transformSystems } from 'ecspresso/plugins/spatial/transform';
import {
	advanceVolley, aimFromDevices, clampLength, ENEMY, FIRE, HOME, HURT_TIME, integrateSpring, MAX_REACH, MUZZLE, PLAYER, SHOT,
	shotDirection, STAGE, type Volley,
} from './rules';

type Action = 'up' | 'down' | 'left' | 'right';

export const layers = defineCollisionLayers({
	player: ['shot'],
	shot: ['player'],
});
type Layer = LayersOf<typeof layers>;

export interface Stick {
	active: boolean;
	x: number;
	y: number;
}

export interface Aim {
	x: number;
	y: number;
	held: boolean;
}

export interface Round {
	phase: 'dodging' | 'down';
	restartRequested: boolean;
}

export interface Actors {
	playerId: number;
	enemyId: number;
}

export interface SpringRunOptions {
	readonly target?: EventTarget;
	readonly pollGamepads?: () => ReadonlyArray<GamepadLike | null>;
}

const dependencies = (options?: SpringRunOptions) => ECSpresso.create()
	.withPlugin(createTransformPlugin())
	.withPlugin(createInputPlugin<Action>({
		preventDefaultKeys: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '],
		actions: {
			up: { keys: ['w', 'W', 'ArrowUp'] },
			down: { keys: ['s', 'S', 'ArrowDown'] },
			left: { keys: ['a', 'A', 'ArrowLeft'] },
			right: { keys: ['d', 'D', 'ArrowRight'] },
		},
		...(options?.target ? { target: options.target } : {}),
		...(options?.pollGamepads ? { gamepad: { poll: options.pollGamepads } } : {}),
	}))
	.withPlugin(createCollisionPlugin({ layers, after: [transformSystems.propagate] }))
	.withPlugin(createHealthPlugin())
	.withPlugin(createProjectilePlugin<'combat', Layer>());

type Deps = ConfigOf<ReturnType<ReturnType<typeof dependencies>['build']>>;

const springRun = definePlugin('spring-run')
	.requires<Deps>()
	.withComponentTypes<{
		player: true;
		enemy: true;
		shot: true;
		spring: { vx: number; vy: number };
		hurt: { remaining: number };
	}>()
	.withResourceTypes<{
		stick: Stick;
		aim: Aim;
		round: Round;
		volley: Volley;
		actors: Actors;
	}>()
	.install((world) => {
		world.addResource('stick', { active: false, x: 0, y: 0 });
		world.addResource('aim', { x: 0, y: 0, held: false });
		world.addResource('round', { phase: 'dodging', restartRequested: false });
		world.addResource('volley', { mode: 'wait', remaining: FIRE.opening, aimX: HOME.x, aimY: HOME.y, flash: 0 });
		world.addResource('actors', { playerId: -1, enemyId: -1 });

		const padAim = (pads: ReadonlyArray<{ connected: boolean; axis: (index: number) => number; isDown: (button: number) => boolean }>) => {
			for (const pad of pads) {
				if (!pad.connected) continue;
				let x = pad.axis(0);
				let y = pad.axis(1);
				if (pad.isDown(14)) x -= 1;
				if (pad.isDown(15)) x += 1;
				if (pad.isDown(12)) y -= 1;
				if (pad.isDown(13)) y += 1;
				if (x !== 0 || y !== 0) return { x, y };
			}
			return { x: 0, y: 0 };
		};

		const restore = (ecs: typeof world) => {
			const actors = ecs.getResource('actors');
			const player = ecs.getEntity(actors.playerId);
			const health = player?.components.health;
			const spring = player?.components.spring;
			const place = player?.components.localTransform;
			const hurt = player?.components.hurt;
			if (!player || !health || !spring || !place || !hurt) return;
			health.current = health.max;
			spring.vx = 0;
			spring.vy = 0;
			place.x = HOME.x;
			place.y = HOME.y;
			hurt.remaining = 0;
			ecs.markChanged(player.id, 'health');
			ecs.markChanged(player.id, 'spring');
			ecs.markChanged(player.id, 'localTransform');
			ecs.markChanged(player.id, 'hurt');
			const round = ecs.getResource('round');
			round.phase = 'dodging';
			const volley = ecs.getResource('volley');
			volley.mode = 'wait';
			volley.remaining = FIRE.opening;
			volley.aimX = HOME.x;
			volley.aimY = HOME.y;
			volley.flash = 0;
			for (const shot of ecs.getEntitiesWithQuery(['shot'])) ecs.commands.removeEntity(shot.id);
		};

		world.addSystem('spawn-stage').setOnInitialize((ecs) => {
			const enemy = ecs.spawn({ enemy: true, ...createTransform(ENEMY.x, ENEMY.y) });
			const player = ecs.spawn({
				player: true,
				spring: { vx: 0, vy: 0 },
				hurt: { remaining: 0 },
				...createTransform(HOME.x, HOME.y),
				...createCircleCollider(PLAYER.radius),
				...layers.player(),
				...createHealth(PLAYER.lives),
			});
			const actors = ecs.getResource('actors');
			actors.enemyId = enemy.id;
			actors.playerId = player.id;
		});

		world.addSystem('aim')
			.inPhase('preUpdate')
			.after(inputSystems.update)
			.runWhenEmpty()
			.withResources(['stick', 'aim', 'inputState'])
			.setProcess(({ resources }) => {
				if (resources.stick.active) {
					const limited = clampLength(resources.stick.x, resources.stick.y, MAX_REACH);
					resources.aim.x = limited.x;
					resources.aim.y = limited.y;
					resources.aim.held = true;
					return;
				}
				const { actions, gamepads } = resources.inputState;
				const keyboardX = Number(actions.isActive('right')) - Number(actions.isActive('left'));
				const keyboardY = Number(actions.isActive('down')) - Number(actions.isActive('up'));
				const pad = padAim(gamepads);
				const device = aimFromDevices(keyboardX, keyboardY, pad.x, pad.y);
				resources.aim.x = device.x;
				resources.aim.y = device.y;
				resources.aim.held = device.x !== 0 || device.y !== 0;
			});

		world.addSystem('restart')
			.inPhase('preUpdate')
			.runWhenEmpty()
			.withResources(['round'])
			.setProcess(({ resources, ecs }) => {
				if (resources.round.phase !== 'down') {
					resources.round.restartRequested = false;
					return;
				}
				if (!resources.round.restartRequested) return;
				resources.round.restartRequested = false;
				restore(ecs);
			});

		world.addSystem('spring')
			.inPhase('update')
			.setPriority(200)
			.withResources(['aim', 'round'])
			.setProcessEach({ with: ['player', 'localTransform', 'spring'], mutates: ['localTransform', 'spring'] }, ({ entity, dt, resources }) => {
				if (resources.round.phase === 'down') return false;
				const { localTransform, spring } = entity.components;
				const next = integrateSpring(
					localTransform.x - HOME.x,
					localTransform.y - HOME.y,
					spring.vx,
					spring.vy,
					resources.aim.x,
					resources.aim.y,
					dt,
				);
				localTransform.x = HOME.x + next.x;
				localTransform.y = HOME.y + next.y;
				spring.vx = next.vx;
				spring.vy = next.vy;
				return true;
			});

		world.addSystem('volley')
			.inPhase('update')
			.setPriority(120)
			.withResources(['volley', 'round', 'actors'])
			.setProcessEach({ with: ['player', 'localTransform'], mutates: [] }, ({ entity, dt, resources, ecs }) => {
				const volley = resources.volley;
				if (resources.round.phase === 'down') {
					volley.mode = 'wait';
					volley.remaining = FIRE.opening;
					volley.flash = 0;
					return;
				}
				const { x, y } = entity.components.localTransform;
				for (const aim of advanceVolley(volley, dt, x, y)) {
					const direction = shotDirection(aim.x, aim.y);
					ecs.commands.spawn({
						shot: true,
						...createTransform(MUZZLE.x, MUZZLE.y),
						...createCircleCollider(SHOT.radius),
						...layers.shot(),
						...createProjectile(1, SHOT.speed, resources.actors.enemyId),
						...createProjectileDirection(direction.x, direction.y),
					});
				}
			});

		world.addSystem('cull-shots')
			.inPhase('update')
			.setPriority(40)
			.setProcessEach({ with: ['shot', 'localTransform'], mutates: [] }, ({ entity, ecs }) => {
				const { x, y } = entity.components.localTransform;
				if (x < -80 || y < -80 || x > STAGE.width + 80 || y > STAGE.height + 80) ecs.commands.removeEntity(entity.id);
			});

		world.addSystem('clear-downed')
			.inPhase('update')
			.setPriority(10)
			.runWhenEmpty()
			.withResources(['round'])
			.addQuery('shots', { with: ['shot'], mutates: [] })
			.setProcess(({ resources, queries, ecs }) => {
				if (resources.round.phase !== 'down') return;
				for (const shot of queries.shots) ecs.commands.removeEntity(shot.id);
			});

		world.addSystem('player-state')
			.inPhase('update')
			.setEventHandlers({
				damage({ data, ecs }) {
					if (data.entityId !== ecs.getResource('actors').playerId) return;
					const hurt = ecs.getComponent(data.entityId, 'hurt');
					if (hurt) hurt.remaining = HURT_TIME;
				},
				entityDied({ data, ecs }) {
					if (data.entityId !== ecs.getResource('actors').playerId) return;
					ecs.getResource('round').phase = 'down';
				},
			})
			.setProcessEach({ with: ['player', 'hurt'], mutates: ['hurt'] }, ({ entity, dt }) => {
				const hurt = entity.components.hurt;
				if (hurt.remaining <= 0) return false;
				hurt.remaining = Math.max(0, hurt.remaining - dt);
				return true;
			});
	});

export const createSpringRunBuilder = (options?: SpringRunOptions) => dependencies(options).withPlugin(springRun);

export type SpringWorld = ReturnType<ReturnType<typeof createSpringRunBuilder>['build']>;
