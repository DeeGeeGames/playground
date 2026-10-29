import { mountGame } from '../../../shared/lifecycle';
import { createState, step, type Controls } from './simulation';
import { cameraFor, render } from './render';

const element = function (id: string) {
	const value = document.getElementById(id);
	if (!(value instanceof HTMLElement)) throw new Error(`Missing element ${id}`);
	return value;
};
const shutdown = await mountGame('game', async function (container) {
	const canvas = container.querySelector('canvas');
	if (!canvas) throw new Error('Missing battlefield');
	canvas.tabIndex = 0;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas unavailable');
	const status = element('status'); const telemetry = element('telemetry');
	const brief = element('brief'); const result = element('result'); const pauseButton = element('pause');
	const keys = new Set<string>(); const pending = new Set<string>(); const held = new Map<number, string>();
	let state = createState(); let running = false; let paused = false; let pointerDown = false;
	let aim = { x: 900, y: 450 }; let pointer: { x: number; y: number } | undefined;
	let frame = 0; let previous = 0; let accumulator = 0; let width = 0; let height = 0;
	const abort = new AbortController(); const options = { signal: abort.signal };
	const resetInput = function () { keys.clear(); pending.clear(); held.clear(); pointerDown = false; };
	const start = function () {
		state = createState(); running = true; paused = false; brief.hidden = true; result.hidden = true;
		pauseButton.textContent = 'Pause · Esc'; resetInput(); accumulator = 0; canvas.focus({ preventScroll: true });
	};
	const pause = function () {
		if (!running || state.outcome !== 'playing') return;
		paused = !paused; resetInput(); accumulator = 0; pauseButton.textContent = paused ? 'Resume · Esc' : 'Pause · Esc';
		if (!paused) canvas.focus({ preventScroll: true });
	};
	element('start').addEventListener('click', start, options);
	element('restart').addEventListener('click', start, options);
	pauseButton.addEventListener('click', pause, options);
	const codes = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyE', 'KeyQ', 'KeyX', 'Escape'];
	window.addEventListener('keydown', function (event) {
		if (!codes.includes(event.code) || event.target instanceof HTMLButtonElement && event.code === 'Space') return;
		event.preventDefault(); if (event.code === 'Escape') { if (!event.repeat) pause(); return; }
		keys.add(event.code);
		if (event.code === 'KeyX') pending.add('stop');
		if (event.code === 'KeyW' || event.code === 'ArrowUp') pending.add('forward');
		if (event.code === 'KeyS' || event.code === 'ArrowDown') pending.add('back');
		if (event.code === 'KeyQ') pending.add('missile');
		if (event.code === 'KeyE') pending.add('laser');
		if (event.code === 'Space') pending.add('cannon');
	}, options);
	window.addEventListener('keyup', function (event) { keys.delete(event.code); }, options);
	window.addEventListener('blur', function () { resetInput(); if (running && !paused) pause(); }, options);
	document.addEventListener('visibilitychange', function () { if (document.hidden) { resetInput(); if (!paused) pause(); } }, options);
	const updatePointer = function (event: PointerEvent) {
		const rect = canvas.getBoundingClientRect(); pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
	};
	canvas.addEventListener('pointermove', updatePointer, options);
	canvas.addEventListener('pointerdown', function (event) {
		if (!event.isPrimary || event.button !== 0) return;
		updatePointer(event); canvas.setPointerCapture(event.pointerId); pointerDown = event.pointerType !== 'touch';
		if (pointerDown) pending.add('cannon');
	}, options);
	const release = function (event: PointerEvent) { held.delete(event.pointerId); pointerDown = false; };
	window.addEventListener('pointerup', release, options);
	window.addEventListener('pointercancel', release, options);
	canvas.addEventListener('lostpointercapture', release, options);
	for (const button of document.querySelectorAll<HTMLButtonElement>('[data-control]')) {
		button.addEventListener('pointerdown', function (event) {
			const control = button.dataset['control']; if (!control) return;
			event.preventDefault(); button.setPointerCapture(event.pointerId); held.set(event.pointerId, control);
			if (['forward', 'back', 'stop', 'cannon', 'laser', 'missile'].includes(control)) pending.add(control);
		}, options);
		button.addEventListener('lostpointercapture', release, options);
	}
	const active = function (control: string, ...bindings: string[]) { return pending.has(control) || [...held.values()].includes(control) || bindings.some(function (binding) { return keys.has(binding); }); };
	const tick = function (now: number) {
		const elapsed = previous ? Math.min((now - previous) / 1000, 0.1) : 0; previous = now;
		const rect = canvas.getBoundingClientRect(); width = rect.width; height = rect.height;
		const dpr = Math.min(devicePixelRatio, 2);
		if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) { canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); }
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		const camera = cameraFor(width, height, state);
		if (pointer) aim = { x: pointer.x / camera.scale + camera.x, y: pointer.y / camera.scale + camera.y };
		const input: Controls = { drive: Number(active('forward', 'KeyW', 'ArrowUp')) - Number(active('back', 'KeyS', 'ArrowDown')), stop: active('stop', 'KeyX'), turn: Number(active('right', 'KeyD', 'ArrowRight')) - Number(active('left', 'KeyA', 'ArrowLeft')), aim, cannon: pointerDown || active('cannon', 'Space'), laser: active('laser', 'KeyE'), missile: active('missile', 'KeyQ') };
		if (running && !paused) {
			accumulator += elapsed;
			while (accumulator >= 1 / 60) { step(state, input, 1 / 60); pending.clear(); accumulator -= 1 / 60; }
		}
		render(ctx, width, height, state, aim);
		status.textContent = `${paused ? 'PAUSED / RESUME TO CONTINUE' : !running ? 'AWAITING DEPLOYMENT' : state.intermission > 0 ? 'SECTOR CLEAR / REPAIRING +20 ARMOR' : `WAVE 0${state.wave} / 03 · ${state.enemies.length} HOSTILES`}\nARMOR ${Math.max(0, Math.ceil(state.player.hp))}%  /  RELAY ${Math.max(0, state.relay)}%\nTHROTTLE ${state.player.throttle < -0.005 ? 'REV' : state.player.throttle > 0.005 ? 'FWD' : 'NEUTRAL'} ${Math.round(Math.abs(state.player.throttle) * 100)}% / SPEED ${Math.round(state.player.speed / (state.player.speed < 0 ? 48 : 90) * 100)}%`;
		telemetry.textContent = `HEAT ${Math.ceil(state.player.heat)}% ${state.player.overheated ? '— COOLING LOCKOUT' : ''}\nCANNON ${state.cannonIn > 0 ? 'CYCLING' : 'READY'} / MISSILES ${state.missileIn > 0 ? state.missileIn.toFixed(1) + 's' : 'READY'}`;
		if (running && state.outcome !== 'playing') {
			result.hidden = false;
			element('result-title').textContent = state.outcome === 'won' ? 'Sector secured.' : 'Signal lost.';
			element('result-copy').textContent = `${state.kills} hostiles destroyed. ${state.outcome === 'won' ? 'All three waves defeated. The relay is still transmitting.' : state.player.hp <= 0 ? 'Your mech was destroyed. Use every weapon and keep moving.' : 'The relay was destroyed. Intercept attackers before they surround it.'}`;
		}
		frame = requestAnimationFrame(tick);
	};
	frame = requestAnimationFrame(tick);
	return function () { cancelAnimationFrame(frame); abort.abort(); resetInput(); };
});
if (import.meta.hot) import.meta.hot.dispose(shutdown);
