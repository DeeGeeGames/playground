import { mountGame } from '../../../shared/lifecycle';
import { applyRefit, createState, distance, getOperationReport, step, type Controls, type Point } from './simulation';
import { DIFFICULTIES, getWaveDefinition, REFITS, TOTAL_HOSTILES, WAVES } from './operation';
import { createPresentation } from './presentation';
import { advanceGaits, createGaits } from './gait';
import { viewScale } from './projection-3d';
import type { ScreenRect } from './overlay';
import { createAudio } from './audio';
import { createGamepadInput, type PadInput } from './gamepad';
import { createControllerFeedback } from './controller-feedback';
import { createTraining, stepTraining, trainingCopy, type Training } from './training';
import { addOperationRecord, isDifficulty, readProfile, saveProfile } from './profile';

const element = function (id: string): HTMLElement {
	const value = document.getElementById(id);
	if (!(value instanceof HTMLElement)) throw new Error(`Missing interface element: ${id}`);
	return value;
};
const inputElement = function (id: string): HTMLInputElement {
	const value = element(id);
	if (!(value instanceof HTMLInputElement)) throw new Error(`Missing input: ${id}`);
	return value;
};
const bindings = new Map([
	['KeyW', 'forward'], ['ArrowUp', 'forward'], ['KeyS', 'back'], ['ArrowDown', 'back'],
	['KeyA', 'left'], ['ArrowLeft', 'left'], ['KeyD', 'right'], ['ArrowRight', 'right'],
	['KeyX', 'stop'], ['Space', 'cannon'], ['KeyE', 'laser'], ['KeyQ', 'missile'], ['KeyV', 'coolant'],
]);
const formatTime = function (time: number) { return `${Math.floor(time / 60)}:${Math.floor(time % 60).toString().padStart(2, '0')}`; };
type Screen = 'brief' | 'playing' | 'pause-panel' | 'refit' | 'result' | 'training-result';
type Auxiliary = 'settings' | 'handbook' | 'confirm';
type Weapon = 'cannon' | 'laser' | 'missile';
const weapons: readonly Weapon[] = ['cannon', 'laser', 'missile'];
const shutdown = await mountGame('game', async function (container) {
	const canvas = container.querySelector('canvas');
	if (!canvas) throw new Error('Missing battlefield');
	canvas.tabIndex = 0;
	const presentation = await createPresentation(canvas);
	const audio = createAudio();
	const padInput = createGamepadInput();
	const feedback = createControllerFeedback();
	let profile = readProfile();
	const abort = new AbortController(); const listenerOptions = { signal: abort.signal };
	const keys = new Set<string>(); const pending = new Set<string>(); const held = new Map<number, string>();
	const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
	const coarsePointer = window.matchMedia('(pointer: coarse)');
	const ui = {
		phase: element('phase'), status: element('status'), armor: element('armor-value'), armorFill: element('armor-fill'),
		relay: element('relay-value'), relayFill: element('relay-fill'), heat: element('heat-value'), heatFill: element('heat-fill'),
		drive: element('drive-value'), throttleFill: element('throttle-fill'), speed: element('speed-value'),
		cannon: element('cannon-status'), cannonFill: element('cannon-fill'), laser: element('laser-status'), laserFill: element('laser-fill'),
		missile: element('missile-status'), missileFill: element('missile-fill'), coolant: element('coolant-value'), message: element('message'),
		sound: element('sound'), hint: element('pilot-hint'), hintCopy: element('hint-copy'), inputMode: element('input-mode'),
	};
	const cockpitElements = [...container.querySelectorAll<HTMLElement>('.left-instruments, .weapon-console, #touch, #training-guide')];
	let hudObstructions: ScreenRect[] = [];
	const weaponButtons = [...container.querySelectorAll<HTMLButtonElement>('[data-weapon]')];
	let training: Training | undefined;
	let screen: Screen = 'brief'; let auxiliary: Auxiliary | undefined;
	let selectedWeapon: Weapon = 'cannon';
	const mousePointers = new Set<number>();
	let state = createState({ difficulty: profile.settings.difficulty }); let gaits = createGaits(state); let muted = false;
	let aim: Point = { x: 900, y: 450 }; let pointer: Point | undefined; let aimMode: 'pointer' | 'gamepad' = 'pointer';
	let frame = 0; let previous = 0; let accumulator = 0; let lastHud = 0;
	let message = ''; let messageUntil = 0; let terminalUntil = 0; let contextLost = false; let focused = true;
	let returnFocus: HTMLElement | undefined; let confirmedAction: (() => void) | undefined; let tipDismissed = false;
	let inputMode: 'keyboard' | 'gamepad' | 'touch' = 'keyboard'; let controllerLost = false; let screenRevision = 0;
	let currentPad: PadInput | undefined;
	let lastSoundState = '';
	const resetInput = function () { keys.clear(); pending.clear(); held.clear(); mousePointers.clear(); padInput.requireNeutral(); void feedback.stop(); };
	const playing = function () { return screen === 'playing' && !auxiliary && !contextLost && !document.hidden && focused; };
	const active = function (action: string) { return (mousePointers.size > 0 && action === selectedWeapon) || keys.has(action) || pending.has(action) || [...held.values()].includes(action); };
	const silenceAudio = function () { audio.update({ speed: 0, laser: false, heat: 0, active: false }); };
	const motionReduced = function () { return reducedMotion.matches || profile.settings.reducedMotion; };
	const unlockSound = function () { void audio.unlock(); };
	const setInputMode = function (value: typeof inputMode) {
		if (inputMode === value && container.dataset['input'] === value && container.classList.contains('couch-ui') === (value === 'gamepad' || profile.settings.couchUI)) return;
		inputMode = value; container.dataset['input'] = value;
		container.classList.toggle('using-gamepad', value === 'gamepad');
		container.classList.toggle('couch-ui', value === 'gamepad' || profile.settings.couchUI);
		ui.inputMode.textContent = value === 'gamepad' ? 'GAMEPAD' : value === 'touch' ? 'TOUCH' : 'KB / MOUSE';
		const prompts = [
			['#pause kbd', 'Esc', 'Menu'], ['[data-weapon="cannon"] kbd', 'Space', 'RT / R2'],
			['[data-weapon="laser"] kbd', 'E', 'LT / L2'], ['[data-weapon="missile"] kbd', 'Q', 'RB / R1'],
			['#coolant kbd', 'V', 'LB / L1'],
		] as const;
		for (const [selector, keyboard, gamepad] of prompts) {
			const prompt = container.querySelector(selector); if (prompt) prompt.textContent = value === 'gamepad' ? gamepad : keyboard;
		}
		element('weapon-hint').textContent = value === 'gamepad' ? 'TRIGGERS + BUMPERS' : value === 'touch' ? 'HOLD TO FIRE' : 'WHEEL / 1–3 TO SELECT';
		element('menu-input-hint').textContent = value === 'gamepad' ? 'A / × SELECT · B / ○ BACK · RIGHT STICK SCROLL' : value === 'touch' ? 'TAP TO SELECT · SWIPE TO SCROLL' : 'TAB SELECT · ENTER CONFIRM · ESC BACK';
	};
	const save = function () {
		element('storage-status').textContent = saveProfile(profile) ? 'Preferences and operation records are saved on this device.' : 'Device storage is unavailable. You can keep playing; records will last for this session.';
	};
	const updateSettings = function () {
		audio.setMix(profile.settings);
		container.classList.toggle('reduced-motion', motionReduced());
		container.classList.toggle('touch-enabled', coarsePointer.matches || profile.settings.touchControls);
		for (const name of ['master', 'music', 'effects'] as const) {
			inputElement(`${name}-volume`).value = String(Math.round(profile.settings[name] * 100));
			element(`${name}-output`).textContent = `${Math.round(profile.settings[name] * 100)}%`;
		}
		inputElement('reduce-motion').checked = profile.settings.reducedMotion;
		inputElement('show-touch').checked = profile.settings.touchControls;
		inputElement('large-interface').checked = profile.settings.couchUI;
		inputElement('controller-vibration').checked = profile.settings.vibration;
		setInputMode(inputMode);
	};
	const menu = function () { return auxiliary ? element(auxiliary) : screen === 'playing' ? undefined : element(screen); };
	const focusable = function (root: HTMLElement) {
		return [...root.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]')].filter(function (item) { return !item.closest('[hidden], [inert]'); });
	};
	const syncScreen = function (focus = true) {
		screenRevision++;
		element('reset').textContent = training ? 'RESTART TRAINING' : 'RESTART OPERATION';
		element('pause-copy').textContent = training ? 'Training is paused. Resume the drill or return to the briefing.' : 'Your throttle and operation are preserved.';
		for (const id of ['brief', 'pause-panel', 'refit', 'result', 'training-result', 'settings', 'handbook', 'confirm']) {
			const node = element(id); const visible = auxiliary ? id === auxiliary : id === screen;
			node.hidden = !visible; node.inert = !visible;
		}
		const modal = screen !== 'playing' || Boolean(auxiliary);
		container.classList.toggle('training-active', Boolean(training));
		container.classList.toggle('menu-open', modal); container.dataset['screen'] = auxiliary ?? screen;
		element('hud').inert = modal; canvas.inert = modal;
		resetInput(); accumulator = 0; lastHud = 0;
		if (!focus) return;
		const root = menu();
		const initial = auxiliary === 'settings' ? element('master-volume') : auxiliary === 'handbook' ? element('handbook') : auxiliary === 'confirm' ? element('confirm-cancel') : screen === 'brief' ? element('start') : screen === 'pause-panel' ? element('resume') : screen === 'result' ? element('restart') : root?.querySelector<HTMLElement>('button');
		if (root) root.scrollTop = 0;
		(initial ?? canvas).focus({ preventScroll: true });
		if (initial && auxiliary !== 'handbook') initial.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	};
	const updateRecordSummary = function () {
		const records = profile.bests.filter(function (record) { return record.difficulty === profile.settings.difficulty; });
		const best = [...records].sort(function (a, b) { return b.score - a.score; })[0];
		element('record-summary').textContent = best ? `${profile.settings.difficulty.toUpperCase()} BEST · ${best.score.toLocaleString()} · RANK ${best.rank} · ${best.won ? 'SIGNAL HELD' : `ASSAULT ${best.wave}/5`}` : 'NO OPERATIONS RECORDED';
		for (const input of container.querySelectorAll<HTMLInputElement>('input[name="difficulty"]')) input.checked = input.value === profile.settings.difficulty;
		element('difficulty-copy').textContent = DIFFICULTIES.find(function (difficulty) { return difficulty.id === profile.settings.difficulty; })?.description ?? '';
	};
	const start = function () {
		if (contextLost) return;
		training = undefined;
		state = createState({ difficulty: profile.settings.difficulty }); gaits = createGaits(state); selectedWeapon = 'cannon'; screen = 'playing'; auxiliary = undefined;
		aim = { x: 900, y: 450 }; pointer = undefined; message = 'WARDEN ONLINE. PROTECT RELAY 09.'; messageUntil = 5; tipDismissed = false;
		terminalUntil = 0; audio.reset(); syncScreen(); unlockSound();
	};
	const startTraining = function () {
		if (contextLost) return;
		training = createTraining(); state = training.state; gaits = createGaits(state); selectedWeapon = 'cannon';
		screen = 'playing'; auxiliary = undefined; pointer = undefined; aim = { x: 900, y: 450 };
		message = ''; messageUntil = 0; tipDismissed = true; terminalUntil = 0;
		audio.reset(); syncScreen(); unlockSound();
	};
	const toBriefing = function () {
		training = undefined;
		screen = 'brief'; auxiliary = undefined; state = createState({ difficulty: profile.settings.difficulty }); gaits = createGaits(state);
		aim = { x: 900, y: 450 }; pointer = undefined; audio.reset(); updateRecordSummary(); syncScreen();
	};
	const setPaused = function (paused: boolean) {
		if (paused) silenceAudio();
		if (paused && screen === 'playing') { screen = 'pause-panel'; auxiliary = undefined; syncScreen(); }
		else if (!paused && screen === 'pause-panel' && !contextLost) { screen = 'playing'; auxiliary = undefined; syncScreen(); unlockSound(); }
	};
	const showAuxiliary = function (value: Auxiliary) {
		if (document.activeElement instanceof HTMLElement) returnFocus = document.activeElement;
		auxiliary = value; syncScreen();
	};
	const closeAuxiliary = function () {
		auxiliary = undefined; confirmedAction = undefined; syncScreen(false);
		if (returnFocus?.isConnected && !returnFocus.closest('[hidden], [inert]')) returnFocus.focus({ preventScroll: true });
		else syncScreen();
	};
	const confirm = function (action: () => void, label: string) { confirmedAction = action; element('confirm-action').textContent = label; showAuxiliary('confirm'); };
	const listen = function (id: string, callback: () => void) { element(id).addEventListener('click', callback, listenerOptions); };
	listen('training', startTraining); listen('training-deploy', start); listen('training-briefing', toBriefing);
	listen('start', start); listen('restart', start); listen('resume', function () { setPaused(false); });
	listen('pause', function () { setPaused(true); });
	listen('reset', function () { confirm(training ? startTraining : start, training ? 'RESTART TRAINING' : 'RESTART OPERATION'); });
	listen('leave', function () { confirm(toBriefing, 'RETURN TO BRIEFING'); });
	listen('result-briefing', toBriefing);
	listen('confirm-action', function () { const action = confirmedAction; confirmedAction = undefined; action?.(); });
	listen('confirm-cancel', closeAuxiliary);
	for (const id of ['brief-settings', 'pause-settings']) listen(id, function () { showAuxiliary('settings'); });
	for (const id of ['brief-controls', 'pause-controls']) listen(id, function () { showAuxiliary('handbook'); });
	listen('close-settings', closeAuxiliary); listen('close-handbook', closeAuxiliary);
	listen('dismiss-hint', function () { tipDismissed = true; ui.hint.hidden = true; canvas.focus({ preventScroll: true }); });
	listen('sound', function () {
		if (audio.status() !== 'running') { muted = false; audio.setMuted(false); unlockSound(); }
		else { muted = !muted; audio.setMuted(muted); }
		canvas.focus({ preventScroll: true });
	});
	for (const input of container.querySelectorAll<HTMLInputElement>('input[name="difficulty"]')) input.addEventListener('change', function () {
		if (!isDifficulty(input.value)) return;
		profile.settings.difficulty = input.value; save(); updateRecordSummary();
	}, listenerOptions);
	for (const name of ['master', 'music', 'effects'] as const) inputElement(`${name}-volume`).addEventListener('input', function () {
		profile.settings[name] = Number(inputElement(`${name}-volume`).value) / 100; updateSettings(); save(); unlockSound();
	}, listenerOptions);
	inputElement('reduce-motion').addEventListener('change', function () { profile.settings.reducedMotion = inputElement('reduce-motion').checked; updateSettings(); save(); }, listenerOptions);
	inputElement('show-touch').addEventListener('change', function () { profile.settings.touchControls = inputElement('show-touch').checked; updateSettings(); save(); }, listenerOptions);
	inputElement('large-interface').addEventListener('change', function () { profile.settings.couchUI = inputElement('large-interface').checked; updateSettings(); save(); }, listenerOptions);
	inputElement('controller-vibration').addEventListener('change', function () { profile.settings.vibration = inputElement('controller-vibration').checked; updateSettings(); save(); if (!profile.settings.vibration) void feedback.stop(); }, listenerOptions);
	element('handbook').tabIndex = -1;
	reducedMotion.addEventListener('change', updateSettings, listenerOptions); coarsePointer.addEventListener('change', updateSettings, listenerOptions);
	const refitButtons = REFITS.map(function (refit, index) {
		const button = document.createElement('button'); button.className = 'refit-card'; button.dataset['refit'] = refit.id;
		const symbol = document.createElement('span'); symbol.className = 'refit-symbol'; symbol.setAttribute('aria-hidden', 'true'); symbol.textContent = ['╋', '❄', '◈'][index] ?? '+';
		const title = document.createElement('b'); title.textContent = refit.name.toUpperCase();
		const description = document.createElement('p'); description.textContent = `${refit.label}. ${refit.description}`;
		const count = document.createElement('small');
		button.append(symbol, title, description, count);
		button.addEventListener('click', function () {
			if (screen !== 'refit' || auxiliary || contextLost || !applyRefit(state, refit.id)) return;
			screen = 'playing'; gaits = createGaits(state); message = `${getWaveDefinition(state.wave).name.toUpperCase()} / ${refit.name.toUpperCase()} INSTALLED`; messageUntil = state.time + 5;
			syncScreen(); unlockSound(); audio.play(state.events);
		}, listenerOptions);
		return { button, count, choice: refit.id };
	});
	element('refit-cards').replaceChildren(...refitButtons.map(function (entry) { return entry.button; }));
	const showRefit = function () {
		screen = 'refit';
		element('refit-phase').textContent = `ASSAULT ${state.wave} / ${WAVES.length} COMPLETE`;
		element('refit-copy').textContent = `The yard is quiet. Field service restores 25 frame integrity, purges heat, and adds one coolant charge. Choose an upgrade for the rest of this operation.`;
		element('refit-next').textContent = `NEXT: ${getWaveDefinition(state.wave + 1).name.toUpperCase()} — ${getWaveDefinition(state.wave + 1).briefing}`;
		for (const entry of refitButtons) entry.count.textContent = `INSTALLED ${state.upgrades[entry.choice]} · SELECT TO REFIT →`;
		syncScreen();
	};
	const showResult = function (now: number) {
		if (training) return;
		const report = getOperationReport(state); const won = state.outcome === 'won';
		screen = 'result'; terminalUntil = now + 1600;
		element('result-title').textContent = won ? 'SIGNAL UNBROKEN.' : 'SIGNAL LOST.';
		element('result-copy').textContent = won ? 'The command frame is down. The last evacuation has cleared the line. Relay 09 is still transmitting.' : state.player.hp <= 0 ? 'Warden 08 has fallen. Keep moving through artillery markers, recover salvage, and give the reactor time to cool.' : 'Relay 09 is silent. Intercept siege frames early; their artillery can reach the uplink from outside the yard.';
		element('result-difficulty').textContent = state.difficulty.toUpperCase();
		element('result-rank').textContent = report.rank; element('result-score').textContent = report.score.toLocaleString();
		const stats = [[`${report.kills}/${TOTAL_HOSTILES}`, 'HOSTILES'], [formatTime(report.time), 'FIELD TIME'], [`${Math.ceil(report.relay)}%`, 'RELAY'], [`${report.accuracy}%`, 'BALLISTIC HITS']];
		element('result-stats').replaceChildren(...stats.map(function ([value, label]) { const node = document.createElement('div'); const strong = document.createElement('b'); const small = document.createElement('small'); strong.textContent = value ?? ''; small.textContent = label ?? ''; node.append(strong, small); return node; }));
		element('result-upgrades').textContent = `REFITS · ARSENAL ${state.upgrades.arsenal} / COOLING ${state.upgrades.cooling} / BASTION ${state.upgrades.bastion}`;
		const oldBest = Math.max(0, ...profile.bests.filter(function (record) { return record.difficulty === state.difficulty; }).map(function (record) { return record.score; }));
		profile = addOperationRecord(profile, { difficulty: state.difficulty, won, score: report.score, rank: report.rank, kills: report.kills, wave: state.wave, time: report.time, relay: report.relay });
		const saved = saveProfile(profile);
		element('record-feedback').textContent = !saved ? 'Device storage is unavailable. This report is kept for this session.' : report.score > oldBest ? `NEW ${state.difficulty.toUpperCase()} RECORD · SAVED ON THIS DEVICE` : 'OPERATION RECORDED ON THIS DEVICE';
		syncScreen();
	};
	window.addEventListener('keydown', function (event) {
		setInputMode('keyboard'); if (event.isTrusted) unlockSound();
		if (event.code === 'Escape') { event.preventDefault(); if (event.repeat) return; if (auxiliary) closeAuxiliary(); else setPaused(screen === 'playing'); return; }
		const root = menu();
		if (root && event.code === 'Tab') {
			const items = focusable(root); const first = items[0]; const last = items.at(-1);
			if (event.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
			else if (!event.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
			return;
		}
		if (!playing()) return;
		if (event.target instanceof HTMLButtonElement || event.target instanceof HTMLInputElement) return;
		if (event.code === 'Digit1' || event.code === 'Digit2' || event.code === 'Digit3') { selectedWeapon = weapons[Number(event.code.slice(-1)) - 1] ?? 'cannon'; event.preventDefault(); return; }
		const action = bindings.get(event.code); if (!action) return;
		event.preventDefault(); keys.add(action); if (!event.repeat) pending.add(action);
	}, listenerOptions);
	window.addEventListener('keyup', function (event) { const action = bindings.get(event.code); if (action) keys.delete(action); }, listenerOptions);
	container.addEventListener('pointerdown', function (event) { setInputMode(event.pointerType === 'touch' ? 'touch' : 'keyboard'); if (event.isTrusted) unlockSound(); }, listenerOptions);
	container.addEventListener('click', function (event) {
		if (!(event.target instanceof Element) || !event.target.closest('button') || !menu()) return;
		audio.cue(event.target.closest('#close-settings, #close-handbook, #confirm-cancel') ? 'back' : 'confirm');
	}, { ...listenerOptions, capture: true });
	window.addEventListener('blur', function () { focused = false; padInput.suspend(); resetInput(); setPaused(true); }, listenerOptions);
	window.addEventListener('focus', function () { focused = true; padInput.suspend(); }, listenerOptions);
	document.addEventListener('visibilitychange', function () { padInput.suspend(); if (document.hidden) { silenceAudio(); resetInput(); setPaused(true); } }, listenerOptions);
	canvas.addEventListener('webglcontextlost', function (event) {
		event.preventDefault(); contextLost = true; padInput.suspend(); resetInput(); setPaused(true);
		const error = element('error'); error.textContent = 'Graphics interrupted. Waiting for recovery…'; error.hidden = false;
	}, listenerOptions);
	canvas.addEventListener('webglcontextrestored', function () { contextLost = false; padInput.suspend(); element('error').hidden = true; accumulator = 0; previous = 0; }, listenerOptions);
	const updatePointer = function (event: PointerEvent) {
		if (!playing()) return;
		const rect = canvas.getBoundingClientRect(); pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top }; aimMode = 'pointer';
		setInputMode(event.pointerType === 'touch' ? 'touch' : 'keyboard');
	};
	canvas.addEventListener('pointermove', updatePointer, listenerOptions);
	canvas.addEventListener('contextmenu', function (event) { event.preventDefault(); }, listenerOptions);
	canvas.addEventListener('wheel', function (event) {
		if (!playing() || event.ctrlKey || event.deltaY === 0) return;
		event.preventDefault(); const index = weapons.indexOf(selectedWeapon); selectedWeapon = weapons[(index + (event.deltaY > 0 ? 1 : 2)) % weapons.length] ?? 'cannon';
	}, { ...listenerOptions, passive: false });
	canvas.addEventListener('pointerdown', function (event) {
		if ((!event.isPrimary && event.pointerType !== 'touch') || event.button !== 0 || !playing()) return;
		updatePointer(event); canvas.focus({ preventScroll: true }); canvas.setPointerCapture(event.pointerId);
		if (event.pointerType !== 'touch') { mousePointers.add(event.pointerId); pending.add(selectedWeapon); }
	}, listenerOptions);
	const release = function (event: PointerEvent) { held.delete(event.pointerId); mousePointers.delete(event.pointerId); };
	window.addEventListener('pointerup', release, listenerOptions); window.addEventListener('pointercancel', release, listenerOptions); canvas.addEventListener('lostpointercapture', release, listenerOptions);
	for (const button of container.querySelectorAll<HTMLButtonElement>('[data-control], [data-weapon]')) {
		const action = button.dataset['control'] ?? button.dataset['weapon']; if (!action) continue;
		button.addEventListener('pointerdown', function (event) {
			if (!playing() || event.button !== 0) return;
			event.preventDefault(); button.setPointerCapture(event.pointerId); held.set(event.pointerId, action); pending.add(action);
			if (action === 'cannon' || action === 'laser' || action === 'missile') selectedWeapon = action;
		}, listenerOptions);
		button.addEventListener('click', function (event) { if (event.detail === 0 && playing()) { pending.add(action); canvas.focus({ preventScroll: true }); } }, listenerOptions);
		button.addEventListener('lostpointercapture', release, listenerOptions);
	}
	const weaponState = function (label: HTMLElement, fill: HTMLElement, cooldown: number, duration: number, firing: boolean) {
		label.textContent = state.player.overheated ? 'HEAT LOCK' : cooldown > 0 ? `${cooldown.toFixed(1)}s` : firing ? 'FIRING' : 'READY';
		fill.style.width = `${Math.max(0, 1 - cooldown / duration) * 100}%`;
		label.closest('button')?.classList.toggle('firing', firing && !state.player.overheated); label.closest('button')?.classList.toggle('locked', state.player.overheated);
	};
	const updateHud = function () {
		hudObstructions = cockpitElements.filter(function (node) { return node.offsetWidth > 0; }).map(function (node) { const rect = node.getBoundingClientRect(); return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }; });
		const p = state.player;
		for (const button of weaponButtons) { const selected = button.dataset['weapon'] === selectedWeapon; button.classList.toggle('selected', selected); if (button.classList.contains('weapon')) button.setAttribute('aria-current', String(selected)); }
		ui.phase.textContent = `${String(state.wave).padStart(2, '0')} / ${getWaveDefinition(state.wave).name.toUpperCase()}`;
		ui.status.textContent = state.intermission > 0 ? 'ASSAULT CLEAR · SECURING THE YARD' : `${state.enemies.length} ACTIVE · ${state.warnings.length} INBOUND · ${state.kills}/${TOTAL_HOSTILES} ELIMINATED`;
		element('training-guide').hidden = !training || screen !== 'playing';
		if (training) {
			const copy = trainingCopy(training, inputMode === 'gamepad');
			container.dataset['trainingStage'] = training.stage;
			ui.phase.textContent = 'FRAME QUALIFICATION'; ui.status.textContent = 'SAFE RANGE · NO SCORED RECORD';
			element('training-progress').textContent = `DRILL ${copy.progress}`;
			element('training-title').textContent = copy.title;
			element('training-copy').textContent = inputMode === 'gamepad' && currentPad?.connected && !currentPad.ready ? 'Release sticks and triggers to arm the controls, then follow the drill.' : copy.instruction;
		} else delete container.dataset['trainingStage'];
		ui.armor.textContent = `${Math.max(0, Math.ceil(p.hp))}%`; ui.armorFill.style.width = `${Math.max(0, p.hp)}%`; ui.armorFill.style.background = p.hp < 30 ? 'var(--danger)' : 'var(--cyan)';
		ui.relay.textContent = `${Math.max(0, Math.ceil(state.relay))}%`; ui.relayFill.style.width = `${Math.max(0, state.relay)}%`; ui.relayFill.style.background = state.relay < 30 ? 'var(--danger)' : 'var(--cyan)';
		ui.heat.textContent = p.overheated ? 'LOCKOUT' : `${Math.ceil(p.heat)}%`; ui.heatFill.style.width = `${p.heat}%`; ui.heatFill.style.background = p.heat > 80 ? 'var(--danger)' : 'var(--amber)';
		ui.drive.textContent = `${p.throttle < -0.005 ? 'REV' : p.throttle > 0.005 ? 'FWD' : 'N'} ${Math.round(Math.abs(p.throttle) * 100)}%`;
		ui.throttleFill.style.left = `${p.throttle < 0 ? 50 + p.throttle * 50 : 50}%`; ui.throttleFill.style.width = `${Math.abs(p.throttle) * 50}%`; ui.speed.textContent = `SPD ${Math.round(p.speed / (p.speed < 0 ? 48 : 90) * 100)}%`;
		weaponState(ui.cannon, ui.cannonFill, state.cannonIn, 0.65, active('cannon') || currentPad?.cannon === true); weaponState(ui.missile, ui.missileFill, state.missileIn, 4.5, active('missile') || currentPad?.missile === true); weaponState(ui.laser, ui.laserFill, 0, 1, !!state.beam);
		if (training) {
			const available = training.stage === 'cannon' ? 'cannon' : training.stage === 'missiles' ? 'missile' : training.stage === 'heat' ? 'laser' : training.stage === 'coolant' ? 'coolant' : undefined;
			for (const button of weaponButtons) {
				button.disabled = button.dataset['weapon'] !== available;
				const status = button.querySelector('em');
				if (button.disabled && status) status.textContent = 'DRILL LOCK';
			}
		} else for (const button of weaponButtons) button.disabled = false;
		ui.coolant.textContent = `${state.coolantCharges} ${state.coolantCharges === 1 ? 'CHARGE' : 'CHARGES'}`;
		ui.message.textContent = !playing() ? '' : inputMode === 'gamepad' && currentPad?.connected && !currentPad.ready ? 'RELEASE STICKS AND TRIGGERS TO ARM CONTROLS' : p.overheated ? 'REACTOR LOCKOUT / VENT COOLANT OR CEASE FIRE' : state.time < messageUntil ? message : state.relay < 30 ? 'RELAY INTEGRITY CRITICAL' : '';
		ui.hint.hidden = tipDismissed || state.time > 35 || screen !== 'playing';
		ui.hintCopy.textContent = inputMode === 'gamepad' ? 'Left stick sets throttle. X / □ stops. Right stick aims; RT fires.' : inputMode === 'touch' || coarsePointer.matches || profile.settings.touchControls ? 'Tap the field to aim. Hold + to move; STOP sets neutral. Hold a weapon to fire.' : state.time < 14 ? 'W / S set throttle. Release to cruise. X sets neutral; A / D steer.' : 'Mouse aims. Click fires. E laser · Q missiles · V coolant. Watch your heat.';
		const audioState = audio.status(); const needsGesture = audioState === 'locked' || audioState === 'pending';
		const soundState = audioState === 'unavailable' ? 'UNAVAILABLE' : needsGesture ? 'ENABLE SOUND' : muted ? 'SOUND OFF' : 'SOUND ON';
		if (lastSoundState !== soundState) { lastSoundState = soundState; ui.sound.textContent = soundState; ui.sound.setAttribute('aria-label', needsGesture ? 'Click to enable audio' : audioState === 'unavailable' ? 'Retry audio' : muted ? 'Unmute sound' : 'Mute sound'); ui.sound.setAttribute('aria-pressed', String(muted)); }
		const audioStatus = needsGesture && inputMode === 'gamepad' ? 'Audio needs a click or key press in this browser.' : audioState === 'unavailable' ? 'Audio device unavailable. Click or press a key to retry.' : '';
		if (element('audio-status').textContent !== audioStatus) element('audio-status').textContent = audioStatus;
	};
	const audioFrame = function (now: number) {
		const combat = playing(); const audibleMenu = screen === 'brief' || screen === 'refit' || screen === 'training-result' || (screen === 'result' && now < terminalUntil + 30000);
		return { speed: combat ? state.player.speed : 0, laser: combat && !!state.beam, heat: state.player.heat,
			active: !contextLost && focused && !document.hidden && (combat || audibleMenu), uiActive: !contextLost && focused && !document.hidden,
			phase: screen === 'brief' ? 'briefing' as const : screen === 'refit' || screen === 'training-result' ? 'refit' as const : screen === 'result' ? 'result' as const : 'combat' as const,
			intensity: Math.min(1, state.enemies.length / 5 + (state.wave - 1) * 0.08), danger: Math.max(0, 1 - Math.min(state.player.hp, state.relay) / 50), victory: state.outcome === 'won' };
	};
	const tick = function (now: number) {
		const revisionAtFrame = screenRevision;
		const elapsed = previous ? Math.min((now - previous) / 1000, 0.1) : 0; previous = now;
		const rect = canvas.getBoundingClientRect(); const width = rect.width; const height = rect.height;
		presentation.resize(state, width, height, motionReduced());
		let pads: readonly (Gamepad | null)[] = [];
		try { pads = navigator.getGamepads?.() ?? []; } catch { /* Gamepad access can be restricted by an embedding policy. */ }
		if (!focused || document.hidden || contextLost) padInput.suspend();
		const pad = padInput.read(pads, now);
		currentPad = pad;
		if (pad.lost) { controllerLost = true; setPaused(true); }
		feedback.update(pads.find(function (candidate) { return candidate?.index === pad.index; }) ?? undefined, playing() && profile.settings.vibration && inputMode === 'gamepad');
		if (pad.claimed) { controllerLost = false; audio.cue('confirm'); }
		if (pad.activity && focused && !document.hidden) setInputMode('gamepad');
		container.dataset['controllerState'] = pad.connected ? 'connected' : controllerLost ? 'disconnected' : pad.available ? 'available' : 'none';
		const controllerStatus = pad.connected ? 'CONTROLLER CONNECTED' : controllerLost ? 'CONTROLLER LOST · PRESS A / MENU TO RECONNECT, THEN RESUME' : pad.available ? 'PRESS A / MENU TO CONNECT CONTROLLER' : 'CONTROLLER OPTIONAL · CONNECT AND PRESS A / MENU';
		if (element('controller-status').textContent !== controllerStatus) element('controller-status').textContent = controllerStatus;
		if (pad.pause && focused && !document.hidden && !contextLost) { audio.cue('back'); if (auxiliary) closeAuxiliary(); else setPaused(screen === 'playing'); }
		const root = menu();
		if (root && pad.connected && screenRevision === revisionAtFrame && focused && !document.hidden && !contextLost) {
			if (Math.abs(pad.scroll) > 0.15) root.scrollTop += pad.scroll * elapsed * 540;
			if (pad.navigate) {
				const focusedElement = document.activeElement;
				if (pad.adjust && focusedElement instanceof HTMLInputElement && focusedElement.type === 'range') {
					focusedElement.value = String(Math.max(Number(focusedElement.min), Math.min(Number(focusedElement.max), Number(focusedElement.value) + pad.adjust * 5)));
					focusedElement.dispatchEvent(new Event('input', { bubbles: true }));
				} else {
					const items = focusable(root); const index = items.findIndex(function (item) { return item === focusedElement; });
					const next = index < 0 ? (pad.navigate < 0 ? items.length - 1 : 0) : (index + pad.navigate + items.length) % items.length;
					items[next]?.focus({ preventScroll: true }); items[next]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
				}
				audio.cue('focus');
			}
			if (pad.confirm && document.activeElement instanceof HTMLElement && root.contains(document.activeElement)) document.activeElement.click();
			if (pad.back && screenRevision === revisionAtFrame) { audio.cue('back'); if (auxiliary) closeAuxiliary(); else if (screen === 'pause-panel') setPaused(false); }
		}
		if (playing() && screenRevision === revisionAtFrame) {
			if (Math.hypot(pad.aimX, pad.aimY) > 0.2) {
				aimMode = 'gamepad';
				const origin = presentation.toScreen(state.player); const length = Math.hypot(pad.aimX, pad.aimY);
				const projected = presentation.toGround({ x: origin.x + pad.aimX / length * 380, y: origin.y + pad.aimY / length * 380 });
				if (projected) aim = projected;
				const targets = state.enemies.map(function (enemy) { const at = presentation.toScreen(enemy); const dx = at.x - origin.x; const dy = at.y - origin.y; return { enemy, alignment: (dx * pad.aimX + dy * pad.aimY) / Math.max(1, Math.hypot(dx, dy) * length) }; }).filter(function (target) { return target.alignment > 0.975 && distance(target.enemy, state.player) < 850; }).sort(function (a, b) { return b.alignment - a.alignment; });
				const target = targets[0]; if (target) aim = { x: target.enemy.x, y: target.enemy.y };
			} else if (pointer && aimMode === 'pointer') {
				aim = presentation.toGround(pointer) ?? aim;
				const cursor = pointer;
				const picked = [...state.enemies].sort(function (a, b) { return distance(presentation.toScreen(a, 45), cursor) - distance(presentation.toScreen(b, 45), cursor); })[0];
				if (picked && distance(presentation.toScreen(picked, 45), cursor) < 42 * viewScale(width, height)) aim = { x: picked.x, y: picked.y };
			}
			const makeInput = function (): Controls { return { drive: Math.max(-1, Math.min(1, Number(active('forward')) - Number(active('back')) + pad.drive)), stop: active('stop') || pad.stop, turn: Math.max(-1, Math.min(1, Number(active('right')) - Number(active('left')) + pad.turn)), aim, cannon: active('cannon') || pad.cannon, laser: active('laser') || pad.laser, missile: active('missile') || pad.missile, coolant: active('coolant') || pad.coolant }; };
			accumulator += elapsed;
			while (accumulator >= 1 / 60 && playing()) {
				const previousGaits = gaits;
				const previousStage = training?.stage;
				if (training) stepTraining(training, makeInput(), 1 / 60); else step(state, makeInput(), 1 / 60);
				gaits = training?.stage === 'evade' && previousStage !== 'evade' ? createGaits(state) : advanceGaits(gaits, state);
				pending.clear(); accumulator -= 1 / 60;
				if (training && previousStage !== training.stage) audio.cue('confirm');
				audio.update(audioFrame(now)); audio.play(state.events);
				feedback.play(state.events, now);
				for (const index of [0, 1] as const) if (previousGaits.player.feet[index].lift > 0 && gaits.player.feet[index].lift === 0) audio.footstep(index === 0 ? -1 : 1);
				if (state.events.includes('pickup')) { message = 'SALVAGE RECOVERED'; messageUntil = state.time + 2.5; }
				if (state.events.includes('wave')) { message = getWaveDefinition(state.wave).briefing.toUpperCase(); messageUntil = state.time + 5; }
				if (state.events.includes('coolant')) { message = 'COOLANT PURGE / REACTOR STABILIZING'; messageUntil = state.time + 2; }
				if (training?.stage === 'complete') { screen = 'training-result'; syncScreen(); }
				else if (!training && state.outcome !== 'playing') showResult(now); else if (!training && state.phase === 'refit') showRefit();
			}
		}
		audio.update(audioFrame(now));
		if (!contextLost) presentation.render(state, aim, gaits, motionReduced(), screen === 'brief', hudObstructions, inputMode === 'gamepad' || profile.settings.couchUI);
		if (now - lastHud > 80 || lastHud === 0) { updateHud(); lastHud = now; }
		frame = requestAnimationFrame(tick);
	};
	updateSettings(); updateRecordSummary(); syncScreen(); frame = requestAnimationFrame(tick);
	return async function () { cancelAnimationFrame(frame); abort.abort(); resetInput(); padInput.reset(); await feedback.dispose(); try { await audio.dispose(); } finally { await presentation.dispose(); } };
});
if (import.meta.hot) import.meta.hot.dispose(shutdown);
