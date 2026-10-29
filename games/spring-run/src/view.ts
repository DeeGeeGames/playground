import { Graphics } from 'pixi.js';
import { createGraphicsComponents, createRenderer2DPlugin } from 'ecspresso/plugins/rendering/renderer2D';
import { createSpringRunBuilder } from './game';
import { FIRE, HOME, MAX_REACH, MUZZLE, MUZZLE_FLASH, SHOT, STAGE, type Volley } from './rules';

const ownedGraphics = (world: { registerDispose: (name: 'graphics', callback: (ctx: { value: Graphics }) => void) => void }) => {
	const live = new Set<Graphics>();
	world.registerDispose('graphics', ({ value }) => {
		live.delete(value);
		if (value.destroyed) return;
		value.removeFromParent();
		value.destroy();
	});
	return {
		track(graphic: Graphics) {
			live.add(graphic);
			return graphic;
		},
		dispose() {
			for (const graphic of live) {
				if (!graphic.destroyed) graphic.destroy();
			}
			live.clear();
		},
	};
};

const drawBackdrop = () => {
	const graphic = new Graphics();
	graphic.rect(0, 0, STAGE.width, STAGE.height).fill(0x10171d);
	graphic.rect(0, 424, STAGE.width, STAGE.height - 424).fill(0x18242c);
	graphic.rect(0, 424, STAGE.width, 3).fill(0x31434e);
	for (const mark of [180, 340, 520, 700, 860]) {
		graphic.moveTo(mark, 450).lineTo(mark + 16, 466).lineTo(mark, 482).lineTo(mark - 16, 466).closePath().fill(0x24323c);
	}
	return graphic;
};

const drawRing = () => {
	const graphic = new Graphics();
	graphic.circle(0, 0, MAX_REACH).fill({ color: 0x17303a, alpha: 0.35 });
	graphic.circle(0, 0, MAX_REACH).stroke({ width: 2, color: 0x9fb4c0, alpha: 0.7 });
	graphic.circle(0, 0, 4).fill({ color: 0xe7fbff, alpha: 0.95 });
	return graphic;
};

// Drawn around ENEMY. The barrel ends at local (104, -2), which is MUZZLE.
const drawEnemy = () => {
	const graphic = new Graphics();
	graphic.ellipse(10, 86, 58, 14).fill({ color: 0x05080c, alpha: 0.38 });
	graphic.roundRect(-78, -96, 124, 188, 42).fill(0x9a342c);
	graphic.roundRect(-62, -18, 84, 94, 28).fill(0x7c2b26);
	graphic.circle(-16, -58, 30).fill(0xb84338);
	graphic.circle(-2, -62, 9).fill(0x1a1214);
	graphic.circle(1, -62, 3.5).fill(0xffe08a);
	graphic.roundRect(28, -16, 76, 28, 8).fill(0x5c2420);
	graphic.roundRect(92, -10, 12, 16, 3).fill(0x241210);
	return graphic;
};

const drawPlayer = () => {
	const graphic = new Graphics();
	graphic.circle(0, 2, 14).fill(0x65deeb);
	graphic.circle(-5, -1, 3.2).fill(0x12383d);
	graphic.circle(-6.2, -1, 1.3).fill(0xe7fbff);
	graphic.roundRect(-7, 8, 5, 6, 2).fill(0x1c6d76);
	graphic.roundRect(2, 8, 5, 6, 2).fill(0x1c6d76);
	return graphic;
};

const drawShot = () => {
	const graphic = new Graphics();
	graphic.circle(0, 0, SHOT.radius).fill(0xffe08a);
	graphic.circle(-2, 0, 4).fill(0xfff6d4);
	return graphic;
};

const redrawTether = (graphic: Graphics, x: number, y: number) => {
	graphic.clear();
	if (Math.hypot(x - HOME.x, y - HOME.y) < 1) return;
	graphic.moveTo(HOME.x, HOME.y).lineTo(x, y).stroke({ width: 3, color: 0x65deeb, alpha: 0.45 });
};

const redrawWarning = (graphic: Graphics, volley: Volley) => {
	graphic.clear();
	if (volley.mode === 'telegraph') {
		const dx = volley.aimX - MUZZLE.x;
		const dy = volley.aimY - MUZZLE.y;
		const span = Math.hypot(dx, dy) || 1;
		const endX = MUZZLE.x + dx / span * 760;
		const endY = MUZZLE.y + dy / span * 760;
		const urgency = Math.min(1, Math.max(0, 1 - volley.remaining / FIRE.telegraph));
		graphic.moveTo(MUZZLE.x, MUZZLE.y).lineTo(endX, endY).stroke({ width: 4, color: 0xffb199, alpha: 0.25 + urgency * 0.6 });
	}
	if (volley.flash > 0) {
		graphic.circle(MUZZLE.x, MUZZLE.y, 16).fill({ color: 0xffe08a, alpha: Math.min(1, volley.flash / MUZZLE_FLASH) });
	}
};

export const createAppWorld = (container: HTMLElement) => createSpringRunBuilder().withPlugin(createRenderer2DPlugin({
	container,
	background: '#10171d',
	startLoop: false,
	screenScale: { width: STAGE.width, height: STAGE.height, mode: 'fit' },
	renderLayers: ['backdrop', 'range', 'warning', 'actors', 'shots'],
	pixiInit: {
		antialias: true,
		resolution: Math.min(window.devicePixelRatio, 2),
		autoDensity: true,
		preference: 'webgl',
	},
})).build();

export const attachPresentation = (world: ReturnType<typeof createAppWorld>, status: HTMLElement) => {
	const owned = ownedGraphics(world);
	const backdrop = owned.track(drawBackdrop());
	const ring = owned.track(drawRing());
	const tether = owned.track(new Graphics());
	const warning = owned.track(new Graphics());
	const enemyGraphic = owned.track(drawEnemy());
	const playerGraphic = owned.track(drawPlayer());
	try {
		world.spawn({ renderLayer: 'backdrop', ...createGraphicsComponents(backdrop, { x: 0, y: 0 }) });
		world.spawn({ renderLayer: 'range', ...createGraphicsComponents(ring, { x: HOME.x, y: HOME.y }) });
		world.spawn({ renderLayer: 'range', ...createGraphicsComponents(tether, { x: 0, y: 0 }) });
		world.spawn({ renderLayer: 'warning', ...createGraphicsComponents(warning, { x: 0, y: 0 }) });
		const actors = world.getResource('actors');
		const enemy = world.getEntity(actors.enemyId);
		const player = world.getEntity(actors.playerId);
		if (!enemy || !player) throw new Error('Spring Run did not spawn the stage.');
		world.addComponent(enemy.id, 'graphics', enemyGraphic);
		world.addComponent(enemy.id, 'renderLayer', 'actors');
		world.addComponent(player.id, 'graphics', playerGraphic);
		world.addComponent(player.id, 'renderLayer', 'actors');
		let previous = '';
		const write = (text: string) => {
			if (text === previous) return;
			previous = text;
			status.textContent = text;
		};
		world.addSystem('shot-view')
			.inPhase('update')
			.setPriority(80)
			.setProcessEach({ with: ['shot'], without: ['graphics'], mutates: [] }, ({ entity, ecs }) => {
				const graphic = owned.track(drawShot());
				ecs.commands.addComponent(entity.id, 'graphics', graphic);
				ecs.commands.addComponent(entity.id, 'renderLayer', 'shots');
			});
		world.addSystem('stage-view')
			.inPhase('render')
			.setPriority(800)
			.runWhenEmpty()
			.withResources(['round', 'actors', 'volley'])
			.setProcess(({ ecs, resources }) => {
				const runner = ecs.getEntity(resources.actors.playerId);
				const health = runner?.components.health;
				const hurt = runner?.components.hurt;
				const graphic = runner?.components.graphics;
				const place = runner?.components.localTransform;
				if (health && hurt) {
					const noun = health.current === 1 ? 'life' : 'lives';
					if (resources.round.phase === 'down') write('Down. Press a key or the stick to try again.');
					else if (hurt.remaining > 0) write(`Hit. ${health.current} ${noun} left.`);
					else write(`${health.current} ${noun}. Drag the stick to spring off the mark. Release to return.`);
				}
				if (graphic && hurt) {
					graphic.tint = hurt.remaining > 0 ? 0xffb1a4 : 0xffffff;
					graphic.alpha = resources.round.phase === 'down' ? 0.55 : 1;
				}
				const gunner = ecs.getEntity(resources.actors.enemyId)?.components.graphics;
				if (gunner) gunner.tint = resources.volley.mode === 'telegraph' ? 0xffc2b8 : 0xffffff;
				redrawTether(tether, place?.x ?? HOME.x, place?.y ?? HOME.y);
				redrawWarning(warning, resources.volley);
			});
		return { dispose: owned.dispose };
	} catch (error) {
		owned.dispose();
		throw error;
	}
};
