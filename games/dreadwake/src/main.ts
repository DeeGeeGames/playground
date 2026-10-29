import { mountGame } from '../../../shared/lifecycle';
import { createState, cycleTarget, designateTarget, distance, MAX_HULL, RELOAD, SHIELD_COOLDOWN, step, targetFor, type Controls } from './simulation';
import { createRenderer } from './render';
import { cameraFor, pickShip, zoomForWheel } from './projection';
import { createAudio } from './audio';

const element = function (id: string): HTMLElement {
	const value = document.getElementById(id);
	if (!(value instanceof HTMLElement)) throw new Error(`Missing bridge element: ${id}`);
	return value;
};
const bindings = new Map([
	['KeyW', 'forward'], ['ArrowUp', 'forward'], ['KeyS', 'back'], ['ArrowDown', 'back'],
	['KeyA', 'left'], ['ArrowLeft', 'left'], ['KeyD', 'right'], ['ArrowRight', 'right'],
	['KeyX', 'neutral'], ['KeyQ', 'port'], ['KeyE', 'starboard'], ['Space', 'brace'], ['KeyF', 'pulse'],
]);
const shutdown = await mountGame('game', async function (container) {
	const canvas = container.querySelector('canvas'); if (!canvas) throw new Error('Missing battlefield');
	const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas 2D unavailable');
	const ui = {
		brief: element('brief'), pausePanel: element('pause-panel'), result: element('result'), pause: element('pause'),
		phase: element('phase'), objective: element('objective'), hull: element('hull-value'), hullFill: element('hull-fill'),
		throttle: element('throttle-value'), throttleFill: element('throttle-fill'), speed: element('speed-value'), motion: element('motion'),
		message: element('message'), sound: element('sound'), brace: element('brace'),
		pulse: element('pulse'), pulseState: element('pulse-state'), pulseFill: element('pulse-fill'), shield: element('shield-readout'),
		targetName: element('target-name'), targetInfo: element('target-info'), cycle: element('cycle-target'), clear: element('clear-target'),
	};
	const render = createRenderer();
	const audio = createAudio(); const abort = new AbortController(); const options = { signal: abort.signal };
	const keys = new Set<string>(); const pending = new Set<string>(); const pointers = new Map<number, string>();
	const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
	const buttons = [...container.querySelectorAll<HTMLButtonElement>('[data-action]')];
	const batteryUi = {
		port: { label: element('port-state'), fill: element('port-fill'), target: element('port-target') },
		starboard: { label: element('starboard-state'), fill: element('starboard-fill'), target: element('starboard-target') },
	};
	let state = createState(); let running = false; let paused = false; let muted = false;
	let frame = 0; let previous = 0; let accumulator = 0; let zoom = 1;
	const clearInput = function () {
		keys.clear(); pending.clear(); state.shield.held = false;
		for (const button of buttons) for (const id of pointers.keys()) if (button.hasPointerCapture(id)) button.releasePointerCapture(id);
		pointers.clear();
	};
	const active = function (action: string) { return [...keys].some(function (code) { return bindings.get(code) === action; }) || pending.has(action) || [...pointers.values()].includes(action); };
	const playable = function () { return running && !paused && state.outcome === 'playing'; };
	const unlock = function () {
		void audio.unlock().then(function (available) { if (!available) ui.sound.textContent = 'Audio unavailable'; });
	};
	const syncPanels = function () {
		container.dataset['mode'] = running ? 'playing' : 'briefing';
		ui.brief.hidden = running; ui.pausePanel.hidden = !paused; ui.result.hidden = !running || state.outcome === 'playing';
		ui.pause.textContent = paused ? 'Resume · Esc' : 'Pause · Esc';
		if (ui.pause instanceof HTMLButtonElement) ui.pause.disabled = !running || state.outcome !== 'playing';
		for (const button of buttons) button.disabled = !playable();
		for (const control of [ui.cycle, ui.clear]) if (control instanceof HTMLButtonElement) control.disabled = !playable();
	};
	const start = function () {
		state = createState(); running = true; paused = false; accumulator = 0; zoom = 1; clearInput(); syncPanels(); canvas.focus({ preventScroll: true }); unlock();
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
		ui.sound.setAttribute('aria-pressed', String(muted)); ui.sound.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound'); if (!muted) unlock();
		if (playable()) canvas.focus({ preventScroll: true });
	}, options);
	window.addEventListener('keydown', function (event) {
		if (event.code === 'Escape') { event.preventDefault(); if (!event.repeat) pause(!paused); return; }
		if (event.code === 'KeyR' && playable()) { if (!event.repeat) cycleTarget(state); event.preventDefault(); return; }
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
	ui.cycle.addEventListener('click', function () { if (playable()) { cycleTarget(state); canvas.focus({ preventScroll: true }); } }, options);
	ui.clear.addEventListener('click', function () { if (playable()) { designateTarget(state, undefined); canvas.focus({ preventScroll: true }); } }, options);
	canvas.addEventListener('wheel', function (event) {
		if (!playable() || event.ctrlKey || event.metaKey) return;
		event.preventDefault();
		zoom = zoomForWheel(zoom, event, canvas.getBoundingClientRect().height);
	}, { ...options, passive: false });
	canvas.addEventListener('pointerdown', function (event) {
		if (!playable() || event.button !== 0) return;
		const rect = canvas.getBoundingClientRect();
		const target = pickShip({ x: event.clientX - rect.left, y: event.clientY - rect.top }, cameraFor(rect.width, rect.height, state.player, zoom), state.enemies);
		designateTarget(state, target?.id); canvas.focus({ preventScroll: true });
	}, options);
	const hud = function () {
		const p = state.player; const speed = Math.hypot(p.vx, p.vy);
		const priority = state.enemies.find(function (enemy) { return enemy.id === state.priorityTarget; });
		ui.targetName.textContent = priority ? `${priority.kind.toUpperCase()} ${String(priority.id).padStart(2, '0')}` : 'AUTO ACQUISITION';
		ui.targetInfo.textContent = priority ? `${Math.round(distance(p, priority))} M / ${Math.ceil(priority.hp / priority.maxHp * 100)}% HULL` : 'Click a hostile or cycle targets';
		ui.shield.textContent = state.shield.active > 0 ? `${state.shield.active.toFixed(1)} S ACTIVE` : state.shield.cooldown > 0 ? `${state.shield.cooldown.toFixed(0)} S` : 'CHARGED';
		ui.pulseState.textContent = state.shield.active > 0 ? `FIELD ACTIVE / ${state.shield.active.toFixed(1)} S` : state.shield.cooldown > 0 ? `CHARGING / ${state.shield.cooldown.toFixed(1)} S` : 'READY · 3 SEC / −85% DAMAGE';
		ui.pulseFill.style.width = `${(1 - state.shield.cooldown / SHIELD_COOLDOWN) * 100}%`;
		ui.pulse.classList.toggle('cooling', state.shield.cooldown > 0);
		for (const [i, marker] of [...container.querySelectorAll('.mission-steps i')].entries()) {
			marker.classList.toggle('active', i + 1 === state.wave); marker.classList.toggle('complete', i + 1 < state.wave);
		}
		ui.phase.textContent = paused ? 'ENGAGEMENT PAUSED' : `CONTACT 0${state.wave} / 03`;
		ui.objective.textContent = state.intermission > 0 ? state.wave === 3 ? 'Final contact clear. Securing the passage.' : 'Contact clear. Repair crews working.' : `${state.enemies.length} hostile signatures · ${state.kills} / 8 ships broken`;
		ui.hull.textContent = String(Math.ceil(p.hp / MAX_HULL * 100)); ui.hullFill.style.width = `${p.hp / MAX_HULL * 100}%`;
		ui.hullFill.style.background = p.hp < MAX_HULL * 0.3 ? '#e8987e' : '#90e8ec';
		ui.throttle.textContent = Math.abs(p.throttle) < 0.001 ? 'NEUTRAL' : p.throttle < 0 ? `ASTERN ${Math.round(-p.throttle / 0.35 * 100)}%` : `AHEAD ${Math.round(p.throttle * 100)}%`;
		ui.throttleFill.style.width = `${Math.abs(p.throttle) / (p.throttle < 0 ? 0.35 : 1) * 100}%`; ui.throttleFill.style.background = p.throttle < 0 ? '#dfac86' : '#90e8ec';
		ui.speed.textContent = `${Math.round(p.vx * Math.cos(p.angle) + p.vy * Math.sin(p.angle))} M/S`;
		ui.motion.textContent = `${speed < 1 ? 'DRIVE IDLE' : 'UNDER THRUST'} / ${Math.abs(p.yaw) < 0.015 ? 'THRUSTERS CENTERED' : `${p.yaw < 0 ? 'PORT' : 'STBD'} ${Math.abs(p.yaw * 180 / Math.PI).toFixed(0)}°/S`}`;
		for (const side of ['port', 'starboard'] as const) {
			const battery = state.batteries[side]; const items = batteryUi[side]; const target = targetFor(state, side);
			items.label.textContent = battery.remaining > 0 ? 'FIRING' : battery.reload > 0 ? `${battery.reload.toFixed(1)} S` : p.braced ? 'LOCKED' : 'READY';
			items.fill.style.width = `${(1 - battery.reload / RELOAD) * 100}%`;
			items.target.textContent = target ? `SOLUTION / ${target.kind.toUpperCase()} ${String(target.id).padStart(2, '0')}` : 'NO SOLUTION / ALIGN SIDE ARC';
			items.label.closest('button')?.classList.toggle('locked', !!target);
			items.label.closest('button')?.classList.toggle('reloading', battery.reload > 0);
		}
		for (const button of buttons) button.classList.toggle('pressed', playable() && active(button.dataset['action'] ?? ''));
		ui.brace.classList.toggle('pressed', playable() && p.braced);
		ui.pulse.classList.toggle('pressed', playable() && state.shield.active > 0);
		ui.message.textContent = !playable() ? '' : state.intermission > 0 ? state.wave === 3 ? 'FINAL CONTACT CLEAR / SECURING THE PASSAGE' : `CONTACT CLEAR / NEXT IN ${Math.ceil(6 - state.intermission)} S / REPAIRS +20%` : state.shield.active > 0 ? 'AEGIS FIELD ACTIVE / 85% DAMAGE REDUCTION' : p.braced ? 'ARMOR LOCK / NEW SALVOS LOCKED / RELOAD SLOWED' : state.enemies.some(function (enemy) { return enemy.warning > 0; }) ? 'INCOMING VOLLEY / EVADE, LOCK ARMOR OR PULSE SHIELDS' : state.time < 12 ? 'TARGETS IN SIDE ARCS / HOLD Q + E TO FIRE' : '';
	};
	const showResult = function () {
		clearInput(); syncPanels(); audio.update(0, false, []);
		element('result-title').textContent = state.outcome === 'won' ? 'BLOCKADE BROKEN.' : 'SIGNAL LOST.';
		element('result-copy').textContent = state.outcome === 'won' ? 'Eight hostile ships reduced to drifting metal. The passage is yours.' : 'The hull has given way. Keep both batteries working, change course when red rings appear, and use armor lock or a shield pulse for volleys you cannot avoid.';
		element('result-stats').textContent = `${state.kills} / 8 ships broken · ${Math.floor(state.time / 60)}m ${Math.floor(state.time % 60)}s · ${state.stats.salvos} salvos · ${Math.round(state.stats.damageBlocked)} damage prevented`;
		element('restart').focus({ preventScroll: true });
	};
	const tick = function (now: number) {
		const elapsed = previous ? Math.min((now - previous) / 1000, 0.1) : 0; previous = now;
		if (playable() && !document.hidden) {
			accumulator += elapsed;
			while (accumulator >= 1 / 60 && state.outcome === 'playing') {
				const input: Controls = { drive: Number(active('forward')) - Number(active('back')), turn: Number(active('right')) - Number(active('left')),
					neutral: active('neutral'), port: active('port'), starboard: active('starboard'), brace: active('brace'), pulse: active('pulse') };
				step(state, input, 1 / 60); pending.clear(); accumulator -= 1 / 60;
				audio.update(Math.hypot(state.player.vx, state.player.vy), true, state.events);
				if (state.outcome !== 'playing') showResult();
			}
		}
		const { width, height } = canvas.getBoundingClientRect(); const dpr = Math.min(devicePixelRatio, 2);
		if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) { canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); }
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0); render(ctx, width, height, state, reducedMotion.matches, !running, zoom); hud();
		frame = requestAnimationFrame(tick);
	};
	syncPanels(); frame = requestAnimationFrame(tick);
	return async function () { cancelAnimationFrame(frame); clearInput(); abort.abort(); await audio.dispose(); };
});
if (import.meta.hot) import.meta.hot.dispose(shutdown);
