import { mountGame } from '../../../shared/lifecycle';
import { createState, MAX_HULL, RELOAD, step, targetFor, type Controls } from './simulation';
import { render } from './render';
import { createAudio } from './audio';

const element = function (id: string): HTMLElement {
	const value = document.getElementById(id);
	if (!(value instanceof HTMLElement)) throw new Error(`Missing bridge element: ${id}`);
	return value;
};
const bindings = new Map([
	['KeyW', 'forward'], ['ArrowUp', 'forward'], ['KeyS', 'back'], ['ArrowDown', 'back'],
	['KeyA', 'left'], ['ArrowLeft', 'left'], ['KeyD', 'right'], ['ArrowRight', 'right'],
	['KeyX', 'neutral'], ['KeyQ', 'port'], ['KeyE', 'starboard'], ['Space', 'brace'],
]);
const shutdown = await mountGame('game', async function (container) {
	const canvas = container.querySelector('canvas'); if (!canvas) throw new Error('Missing battlefield');
	const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas 2D unavailable');
	const ui = {
		brief: element('brief'), pausePanel: element('pause-panel'), result: element('result'), pause: element('pause'),
		phase: element('phase'), objective: element('objective'), hull: element('hull-value'), hullFill: element('hull-fill'),
		throttle: element('throttle-value'), throttleFill: element('throttle-fill'), speed: element('speed-value'), motion: element('motion'),
		message: element('message'), sound: element('sound'), brace: element('brace'),
	};
	const audio = createAudio(); const abort = new AbortController(); const options = { signal: abort.signal };
	const keys = new Set<string>(); const pending = new Set<string>(); const pointers = new Map<number, string>();
	const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
	const buttons = [...container.querySelectorAll<HTMLButtonElement>('[data-action]')];
	const batteryUi = {
		port: { label: element('port-state'), fill: element('port-fill'), target: element('port-target') },
		starboard: { label: element('starboard-state'), fill: element('starboard-fill'), target: element('starboard-target') },
	};
	let state = createState(); let running = false; let paused = false; let muted = false;
	let frame = 0; let previous = 0; let accumulator = 0;
	const clearInput = function () {
		keys.clear(); pending.clear();
		for (const button of buttons) for (const id of pointers.keys()) if (button.hasPointerCapture(id)) button.releasePointerCapture(id);
		pointers.clear();
	};
	const active = function (action: string) { return [...keys].some(function (code) { return bindings.get(code) === action; }) || pending.has(action) || [...pointers.values()].includes(action); };
	const playable = function () { return running && !paused && state.outcome === 'playing'; };
	const unlock = function () {
		void audio.unlock().then(function (available) { if (!available) ui.sound.textContent = 'Audio unavailable'; });
	};
	const syncPanels = function () {
		ui.brief.hidden = running; ui.pausePanel.hidden = !paused; ui.result.hidden = !running || state.outcome === 'playing';
		ui.pause.textContent = paused ? 'Resume · Esc' : 'Pause · Esc';
		if (ui.pause instanceof HTMLButtonElement) ui.pause.disabled = !running || state.outcome !== 'playing';
		for (const button of buttons) button.disabled = !playable();
	};
	const start = function () {
		state = createState(); running = true; paused = false; accumulator = 0; clearInput(); syncPanels(); canvas.focus({ preventScroll: true }); unlock();
	};
	const pause = function (value: boolean) {
		if (!running || state.outcome !== 'playing') return;
		paused = value; clearInput(); accumulator = 0; syncPanels();
		if (paused) { audio.update(0, false, []); element('resume').focus({ preventScroll: true }); }
		else { canvas.focus({ preventScroll: true }); unlock(); }
	};
	element('start').addEventListener('click', start, options);
	element('restart').addEventListener('click', start, options);
	element('reset').addEventListener('click', start, options);
	element('resume').addEventListener('click', function () { pause(false); }, options);
	ui.pause.addEventListener('click', function () { pause(!paused); }, options);
	ui.sound.addEventListener('click', function () {
		muted = !muted; audio.setMuted(muted); ui.sound.textContent = muted ? 'Sound off' : 'Sound on';
		ui.sound.setAttribute('aria-pressed', String(muted)); if (!muted) unlock();
		if (playable()) canvas.focus({ preventScroll: true });
	}, options);
	window.addEventListener('keydown', function (event) {
		if (event.code === 'Escape') { event.preventDefault(); if (!event.repeat) pause(!paused); return; }
		const action = bindings.get(event.code); if (!action || !playable()) return;
		if (event.code === 'Space' && event.target instanceof HTMLButtonElement) return;
		event.preventDefault(); keys.add(event.code); if (!event.repeat) pending.add(action);
	}, options);
	window.addEventListener('keyup', function (event) { keys.delete(event.code); }, options);
	window.addEventListener('blur', function () { clearInput(); pause(true); }, options);
	document.addEventListener('visibilitychange', function () { if (document.hidden) { clearInput(); pause(true); } }, options);
	const release = function (event: PointerEvent) { pointers.delete(event.pointerId); };
	window.addEventListener('pointerup', release, options); window.addEventListener('pointercancel', release, options);
	for (const button of buttons) {
		button.addEventListener('pointerdown', function (event) {
			const action = button.dataset['action']; if (!action || !playable() || event.button !== 0) return;
			event.preventDefault(); button.setPointerCapture(event.pointerId); pointers.set(event.pointerId, action); pending.add(action);
		}, options);
		button.addEventListener('lostpointercapture', release, options);
		button.addEventListener('click', function (event) {
			const action = button.dataset['action']; if (event.detail === 0 && action && playable()) pending.add(action);
		}, options);
	}
	canvas.addEventListener('pointerdown', function () { if (playable()) canvas.focus({ preventScroll: true }); }, options);
	const hud = function () {
		const p = state.player; const speed = Math.hypot(p.vx, p.vy);
		ui.phase.textContent = paused ? 'ENGAGEMENT PAUSED' : `CONTACT 0${state.wave} / 03`;
		ui.objective.textContent = state.intermission > 0 ? state.wave === 3 ? 'Final contact clear. Securing the passage.' : 'Contact clear. Repair crews working.' : `${state.enemies.length} hostile signatures · ${state.kills} / 8 ships broken`;
		ui.hull.textContent = String(Math.ceil(p.hp / MAX_HULL * 100)); ui.hullFill.style.width = `${p.hp / MAX_HULL * 100}%`;
		ui.hullFill.style.background = p.hp < MAX_HULL * 0.3 ? '#e8987e' : '#a6d0c5';
		ui.throttle.textContent = Math.abs(p.throttle) < 0.01 ? 'ALL STOP' : p.throttle < 0 ? `ASTERN ${Math.round(-p.throttle / 0.35 * 100)}%` : `AHEAD ${Math.round(p.throttle * 100)}%`;
		ui.throttleFill.style.width = `${Math.abs(p.throttle) * 100}%`; ui.throttleFill.style.background = p.throttle < 0 ? '#dfac86' : '#a6d0c5';
		ui.speed.textContent = `${Math.round(speed)} M/S`;
		ui.motion.textContent = `${speed < 1 ? 'ALL STOP' : 'MAKING WAY'} / ${Math.abs(p.yaw) < 0.015 ? 'RUDDER AMIDSHIPS' : `${p.yaw < 0 ? 'PORT' : 'STBD'} ${Math.abs(p.yaw * 180 / Math.PI).toFixed(0)}°/S`}`;
		for (const side of ['port', 'starboard'] as const) {
			const battery = state.batteries[side]; const items = batteryUi[side]; const target = targetFor(state, side);
			items.label.textContent = battery.remaining > 0 ? 'FIRING' : battery.reload > 0 ? `${battery.reload.toFixed(1)} S` : p.braced ? 'BRACED' : 'READY';
			items.fill.style.width = `${(1 - battery.reload / RELOAD) * 100}%`;
			items.target.textContent = target ? `SOLUTION / ${target.kind.toUpperCase()} ${String(target.id).padStart(2, '0')}` : 'NO FIRING SOLUTION';
			items.label.closest('button')?.classList.toggle('locked', !!target);
			items.label.closest('button')?.classList.toggle('reloading', battery.reload > 0);
		}
		for (const button of buttons) button.classList.toggle('pressed', playable() && active(button.dataset['action'] ?? ''));
		ui.brace.classList.toggle('pressed', playable() && p.braced);
		ui.message.textContent = !playable() ? '' : state.intermission > 0 ? state.wave === 3 ? 'FINAL CONTACT CLEAR / SECURING THE PASSAGE' : `CONTACT CLEAR / NEXT IN ${Math.ceil(6 - state.intermission)} S / +20% HULL` : p.braced ? 'BRACE HELD / NEW SALVOS LOCKED / RELOAD SLOWED' : state.time < 12 ? 'BRING THEM ALONGSIDE. HOLD Q / E TO FIRE.' : state.enemies.some(function (enemy) { return enemy.warning > 0; }) ? 'ENEMY FIRING SOLUTION / CHANGE COURSE OR BRACE' : '';
	};
	const showResult = function () {
		clearInput(); syncPanels(); audio.update(0, false, []);
		element('result-title').textContent = state.outcome === 'won' ? 'Blockade broken.' : 'A ship, silenced.';
		element('result-copy').textContent = state.outcome === 'won' ? 'Eight hostile ships reduced to drifting metal. The passage is yours.' : 'The hull has given way. Keep both batteries working, change course when red rings appear, and brace for volleys you cannot avoid.';
		element('result-stats').textContent = `${state.kills} / 8 ships broken · ${Math.floor(state.time / 60)}m ${Math.floor(state.time % 60)}s · ${state.stats.salvos} salvos · ${Math.round(state.stats.damageBlocked)} damage braced`;
		element('restart').focus({ preventScroll: true });
	};
	const tick = function (now: number) {
		const elapsed = previous ? Math.min((now - previous) / 1000, 0.1) : 0; previous = now;
		if (playable() && !document.hidden) {
			accumulator += elapsed;
			while (accumulator >= 1 / 60 && state.outcome === 'playing') {
				const input: Controls = { drive: Number(active('forward')) - Number(active('back')), turn: Number(active('right')) - Number(active('left')),
					neutral: active('neutral'), port: active('port'), starboard: active('starboard'), brace: active('brace') };
				step(state, input, 1 / 60); pending.clear(); accumulator -= 1 / 60;
				audio.update(Math.hypot(state.player.vx, state.player.vy), true, state.events);
				if (state.outcome !== 'playing') showResult();
			}
		}
		const { width, height } = canvas.getBoundingClientRect(); const dpr = Math.min(devicePixelRatio, 2);
		if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) { canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); }
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0); render(ctx, width, height, state, reducedMotion.matches); hud();
		frame = requestAnimationFrame(tick);
	};
	syncPanels(); frame = requestAnimationFrame(tick);
	return async function () { cancelAnimationFrame(frame); clearInput(); abort.abort(); await audio.dispose(); };
});
if (import.meta.hot) import.meta.hot.dispose(shutdown);
