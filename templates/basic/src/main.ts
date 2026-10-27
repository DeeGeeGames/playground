import { Graphics } from 'pixi.js';
import ECSpresso from 'ecspresso';
import { createInputPlugin } from 'ecspresso/plugins/input/input';
import { createRenderer2DPlugin } from 'ecspresso/plugins/rendering/renderer2D';
import { createTransform, createTransformPlugin } from 'ecspresso/plugins/spatial/transform';
import { createTimerPlugin } from 'ecspresso/plugins/scripting/timers';
import { createTweenPlugin } from 'ecspresso/plugins/scripting/tween';
import { createCoroutinePlugin } from 'ecspresso/plugins/scripting/coroutine';
import { mountGame } from '../../../shared/lifecycle';
import { releaseKeysOnBlur } from '../../../shared/input';

const start = async function (container: HTMLElement) {
	const world = ECSpresso.create()
		.withPlugin(createTransformPlugin())
		.withPlugin(createInputPlugin({
			actions: { left: { keys: ['a', 'ArrowLeft'] }, right: { keys: ['d', 'ArrowRight'] } },
			preventDefaultKeys: ['ArrowLeft', 'ArrowRight'],
		}))
		.withPlugin(createTimerPlugin())
		.withPlugin(createTweenPlugin())
		.withPlugin(createCoroutinePlugin())
		.withPlugin(createRenderer2DPlugin({
			container, background: '#101c2c', screenScale: { width: 960, height: 540, mode: 'fit' },
			pixiInit: { antialias: true, resolution: Math.min(window.devicePixelRatio, 2), autoDensity: true, preference: 'webgl' },
		}))
		.withComponentTypes<{ player: true }>()
		.withResource('drag', { x: 480, active: false })
		.build();
	world.addSystem('move')
		.withResources(['inputState', 'drag'])
		.setProcessEach({ with: ['player', 'localTransform'], mutates: ['localTransform'] }, function ({ entity, dt, resources }) {
			const keys = Number(resources.inputState.actions.isActive('right')) - Number(resources.inputState.actions.isActive('left'));
			const axis = resources.inputState.gamepads.find(function (pad) { return pad.connected; })?.axis(0) ?? 0;
			const direction = keys || (Math.abs(axis) > 0.15 ? axis : 0);
			const position = entity.components.localTransform;
			position.x = resources.drag.active ? resources.drag.x : position.x + direction * 260 * dt;
			position.x = Math.max(20, Math.min(940, position.x));
		});
	const shape = new Graphics().rect(-20, -20, 40, 40).fill(0x65deeb);
	const movePointer = function (event: PointerEvent) {
		const bounds = container.getBoundingClientRect();
		const scale = Math.min(bounds.width / 960, bounds.height / 540);
		const offset = (bounds.width - 960 * scale) / 2;
		world.getResource('drag').x = (event.clientX - bounds.left - offset) / scale;
	};
	const down = function (event: PointerEvent) {
		if (!event.isPrimary) return;
		container.setPointerCapture(event.pointerId);
		world.getResource('drag').active = true;
		movePointer(event);
	};
	const release = function () { world.getResource('drag').active = false; };
	try {
		await world.initialize();
		world.spawn({ player: true, ...createTransform(480, 270), graphics: shape });
		container.addEventListener('pointerdown', down);
		container.addEventListener('pointermove', movePointer);
		container.addEventListener('pointerup', release);
		container.addEventListener('pointercancel', release);
		container.addEventListener('lostpointercapture', release);
		window.addEventListener('blur', release);
		const detachKeyboardReset = releaseKeysOnBlur(['a', 'd', 'ArrowLeft', 'ArrowRight']);
		return async function () {
			detachKeyboardReset();
			container.removeEventListener('pointerdown', down);
			container.removeEventListener('pointermove', movePointer);
			container.removeEventListener('pointerup', release);
			container.removeEventListener('pointercancel', release);
			container.removeEventListener('lostpointercapture', release);
			window.removeEventListener('blur', release);
			await world.dispose();
			shape.destroy();
		};
	} catch (error) {
		await world.dispose();
		shape.destroy();
		throw error;
	}
};

const shutdown = await mountGame('game', start);
if (import.meta.hot) import.meta.hot.dispose(shutdown);
