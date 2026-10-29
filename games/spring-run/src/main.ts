import { Ticker } from 'pixi.js';
import { releaseKeysOnBlur } from '../../../shared/input';
import { mountGame } from '../../../shared/lifecycle';
import { MAX_FRAME } from './rules';
import { attachStick } from './stick';
import { attachPresentation, createAppWorld } from './view';

const start = async function (container: HTMLElement) {
	const status = document.getElementById('status');
	const play = document.getElementById('play');
	if (!(status instanceof HTMLElement) || !(play instanceof HTMLElement)) throw new Error('Spring Run page is missing.');
	const world = createAppWorld(container);
	try {
		await world.initialize();
		const presentation = attachPresentation(world, status);
		const stick = attachStick(play, world.getResource('stick'));
		const releaseKeys = releaseKeysOnBlur(['w', 'W', 'a', 'A', 's', 'S', 'd', 'D', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ']);
		const app = world.getResource('pixiApp');
		const onTick = function (ticker: Ticker) {
			world.update(Math.min(ticker.deltaMS / 1000, MAX_FRAME));
		};
		app.ticker.add(onTick);
		const requestRestart = function (event: Event) {
			if (event instanceof KeyboardEvent && event.repeat) return;
			world.getResource('round').restartRequested = true;
		};
		window.addEventListener('keydown', requestRestart);
		play.addEventListener('pointerdown', requestRestart);
		return async function () {
			window.removeEventListener('keydown', requestRestart);
			play.removeEventListener('pointerdown', requestRestart);
			releaseKeys();
			stick.dispose();
			app.ticker.remove(onTick);
			await world.dispose();
			presentation.dispose();
		};
	} catch (error) {
		await world.dispose();
		throw error;
	}
};

const shutdown = await mountGame('game', start);
if (import.meta.hot) import.meta.hot.dispose(shutdown);
