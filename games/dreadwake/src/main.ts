import { mountGame } from '../../../shared/lifecycle';
import { createCampaignState, CAMPAIGN_MISSIONS, REFIT_CHOICES, chooseRefit, cycleTarget, designateTarget, distance, MAX_HULL, RELOAD, SHIELD_COOLDOWN, TORPEDO_RELOAD, step, targetFor, torpedoTargetFor, BEAM_DURATION, BEAM_COOLDOWN, MISSILE_RELOAD, beamTargetFor, missileTargetFor, type Controls } from './simulation';
import { createRenderer } from './render';
import { cameraFor, pickShip, screenToWorld, zoomForWheel } from './projection';
import { createAudio } from './audio';
import { readCampaign, writeCampaign, clearCampaign, captureCampaign, restoreCampaign } from './campaign-save';
import { createWorldRenderer } from './world';
import { createController, connectedController } from './controller';
import { readPreferences, writePreferences } from './preferences';
import { createTraining, trainingInstructions, advanceTraining, type Training } from './training';

const element = function (id: string): HTMLElement {
	const value = document.getElementById(id);
	if (!(value instanceof HTMLElement)) throw new Error(`Missing bridge element: ${id}`);
	return value;
};
const bindings = new Map([
	['KeyW', 'forward'], ['ArrowUp', 'forward'], ['KeyS', 'back'], ['ArrowDown', 'back'],
	['KeyA', 'left'], ['ArrowLeft', 'left'], ['KeyD', 'right'], ['ArrowRight', 'right'],
	['KeyX', 'neutral'], ['KeyQ', 'port'], ['KeyE', 'starboard'], ['Space', 'brace'], ['KeyF', 'pulse'],
	['KeyT', 'torpedo'], ['KeyG', 'autoFire'], ['KeyC', 'beam'], ['KeyV', 'missile'],
]);
const shutdown = await mountGame('game', async function (container) {
	let canvas = container.querySelector('canvas'); if (!canvas) throw new Error('Missing battlefield');
	let draw: ReturnType<typeof createWorldRenderer>;
	try { draw = createWorldRenderer(canvas); }
	catch {
		// WebGL failure can lock the original canvas to its context; replace it.
		const fallback = document.createElement('canvas'); fallback.tabIndex = 0;
		fallback.setAttribute('aria-label', canvas.getAttribute('aria-label') ?? 'Starship battlefield');
		canvas.replaceWith(fallback); canvas = fallback;
		const ctx = fallback.getContext('2d'); if (!ctx) throw new Error('Graphics unavailable');
		const render = createRenderer();
		draw = { render: function (width, height, state, reduced, briefing, zoom, heading) {
			const dpr = Math.min(devicePixelRatio, 2);
			if (fallback.width !== Math.round(width * dpr) || fallback.height !== Math.round(height * dpr)) { fallback.width = Math.round(width * dpr); fallback.height = Math.round(height * dpr); }
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0); render(ctx, width, height, state, reduced, briefing, zoom, heading);
		}, dispose: function () {} };
		container.dataset['graphics'] = 'compatibility';
	}
	const ui = {
		brief: element('brief'), pausePanel: element('pause-panel'), result: element('result'), pause: element('pause'),
		phase: element('phase'), objective: element('objective'), hull: element('hull-value'), hullFill: element('hull-fill'),
		throttle: element('throttle-value'), throttleFill: element('throttle-fill'), speed: element('speed-value'), motion: element('motion'),
		message: element('message'), sound: element('sound'), brace: element('brace'),
		pulse: element('pulse'), pulseState: element('pulse-state'), pulseFill: element('pulse-fill'), shield: element('shield-readout'),
		targetName: element('target-name'), targetInfo: element('target-info'), cycle: element('cycle-target'), clear: element('clear-target'),
		torpedo: element('torpedo'), torpedoState: element('torpedo-state'), torpedoFill: element('torpedo-fill'), torpedoTarget: element('torpedo-target'),
		autoFire: element('auto-fire'), autoState: element('auto-state'), defenseState: element('defense-state'), defenseCount: element('defense-count'),
	};
	const controller = createController();
	const preferences = readPreferences();
	let padFrame = controller.read(undefined, 0);
	let pad: Gamepad | undefined;
	let lastPadIndex: number | undefined;
	let settingsOpen = false;
	let graphicsLost = false;
	let settingsSource: HTMLElement = element('settings-open');
	let training: Training | undefined;
	let trainingCompleted = false;
	let lastHaptic = 0;
	const audio = createAudio(); const abort = new AbortController(); const options = { signal: abort.signal };
	const keys = new Set<string>(); const pending = new Set<string>(); const pointers = new Map<number, string>();
	const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
	const buttons = [...container.querySelectorAll<HTMLButtonElement>('[data-action]')];
	const batteryUi = {
		port: { label: element('port-state'), fill: element('port-fill'), target: element('port-target') },
		starboard: { label: element('starboard-state'), fill: element('starboard-fill'), target: element('starboard-target') },
	};
	let heading: number | undefined;
	let state = createCampaignState(); let running = false; let paused = false; let muted = false;
	let confirmingRestart = false; let restartSource: HTMLElement = element('start');
	const loadedCampaign = readCampaign();
	let savedCampaign = loadedCampaign.status === 'saved' ? loadedCampaign.state : undefined;
	const setSaveStatus = function (message: string, failed = false) {
		for (const status of container.querySelectorAll<HTMLElement>('[data-save-status]')) { status.textContent = message; status.dataset['failed'] = String(failed); }
		const notice = element('save-notice'); notice.hidden = !failed; notice.textContent = failed ? message : '';
	};
	const saveCheckpoint = function () {
		if (training) return;
		const snapshot = captureCampaign(state);
		if (snapshot) savedCampaign = restoreCampaign(snapshot);
		if (writeCampaign(state)) {
			setSaveStatus(state.campaign?.phase === 'refit' ? 'Refit checkpoint saved in this browser. You can return to this choice later.' : 'Mission-start checkpoint saved in this browser. Continue restarts this mission.');
		} else setSaveStatus('Could not save in this browser. Keep this page open to preserve your run.', true);
	};
	if (savedCampaign) {
		element('continue-campaign').hidden = false;
		element('start').textContent = 'START A NEW CAMPAIGN ↗';
		element('continue-summary').textContent = `${CAMPAIGN_MISSIONS[savedCampaign.wave - 1]?.name ?? 'Lyra Passage'} · ${savedCampaign.campaign?.phase === 'refit' ? 'refit checkpoint' : 'mission-start checkpoint'} · ${Math.ceil(savedCampaign.player.hp / savedCampaign.player.maxHp * 100)}% hull`;
		setSaveStatus('Saved locally in this browser. Mission-start checkpoints replay the mission.');
	} else if (loadedCampaign.status === 'unavailable') setSaveStatus('Browser storage is unavailable. Your campaign can only last while this page stays open.', true);
	else if (loadedCampaign.status === 'invalid') setSaveStatus('The previous checkpoint could not be read. Start a new campaign to replace it.', true);
	else setSaveStatus('Progress saves in this browser at mission starts and field refits.');
	let frame = 0; let previous = 0; let accumulator = 0; let zoom = 1;
	const clearInput = function () {
		heading = undefined; keys.clear(); pending.clear(); controller.clear(); padFrame = controller.read(undefined, 0); state.shield.held = false; state.torpedoes.held = false; state.missiles.held = false; state.fireControl.held = false;
		for (const button of buttons) for (const id of pointers.keys()) if (button.hasPointerCapture(id)) button.releasePointerCapture(id);
		pointers.clear();
	};
	const active = function (action: string) { return [...keys].some(function (code) { return bindings.get(code) === action; }) || pending.has(action) || [...pointers.values()].includes(action) || (action === 'port' && padFrame.port) || (action === 'starboard' && padFrame.starboard) || (action === 'brace' && padFrame.brace) || (action === 'beam' && padFrame.beam); };
	const playable = function () { return running && !graphicsLost && !paused && !settingsOpen && !confirmingRestart && state.outcome === 'playing' && state.campaign?.phase !== 'refit'; };
	let refitChoice: typeof REFIT_CHOICES[number]['id'] | undefined;
	const totalShips = CAMPAIGN_MISSIONS.reduce(function (total, mission) { return total + mission.enemies.length; }, 0);
	const route = element('campaign-route');
	for (const [index, mission] of CAMPAIGN_MISSIONS.entries()) {
		const item = document.createElement('li');
		const number = document.createElement('span'); number.textContent = String(index + 1).padStart(2, '0');
		const details = document.createElement('div');
		const name = document.createElement('strong'); name.textContent = mission.name;
		const location = document.createElement('small'); location.textContent = mission.location;
		details.append(name, location); item.append(number, details); route.append(item);
		element('mission-steps').append(document.createElement('i'));
	}
	element('mission-count').textContent = String(CAMPAIGN_MISSIONS.length).padStart(2, '0');
	const unlock = function () {
		void audio.unlock().then(function () { updateSoundLabels(); });
	};
	const syncPanels = function () {
		container.dataset['mode'] = running ? 'playing' : 'briefing';
		ui.brief.hidden = running || confirmingRestart || settingsOpen; ui.pausePanel.hidden = !paused || confirmingRestart || settingsOpen; ui.result.hidden = !running || state.outcome === 'playing' || confirmingRestart || settingsOpen;
		element('settings-panel').hidden = !settingsOpen;
		element('training-guide').hidden = !training || !playable();
		element('confirm-reset').hidden = !confirmingRestart || settingsOpen;
		element('refit').hidden = !running || state.campaign?.phase !== 'refit' || state.outcome !== 'playing' || confirmingRestart || settingsOpen;
		const modal = [...container.querySelectorAll<HTMLElement>('.overlay')].find(function (panel) { return !panel.hidden; });
		for (const child of container.children) if (child instanceof HTMLElement) child.inert = !!modal && child !== modal;
		ui.pause.textContent = paused ? 'Resume · Esc' : 'Pause · Esc';
		if (ui.pause instanceof HTMLButtonElement) ui.pause.disabled = !running || state.outcome !== 'playing' || state.campaign?.phase === 'refit';
		for (const button of buttons) button.disabled = !playable();
		for (const id of ['start', 'continue', 'training', 'restart', 'retry', 'confirm-start', 'resume']) { const button = element(id); if (button instanceof HTMLButtonElement) button.disabled = graphicsLost; }
		const deploy = element('deploy'); if (deploy instanceof HTMLButtonElement) deploy.disabled = graphicsLost || !refitChoice;
		for (const control of [ui.cycle, ui.clear]) if (control instanceof HTMLButtonElement) control.disabled = !playable();
	};
	const start = function () {
		training = undefined; trainingCompleted = false; state = createCampaignState(); running = true; paused = false; confirmingRestart = false; accumulator = 0; zoom = 1; clearInput(); saveCheckpoint(); syncPanels(); canvas.focus({ preventScroll: true }); unlock();
	};
	const pause = function (value: boolean) {
		if (!running || confirmingRestart || state.outcome !== 'playing' || state.campaign?.phase === 'refit') return;
		if (!value && graphicsLost) return;
		paused = value; if (!value) element('pause-reason').textContent = ''; clearInput(); accumulator = 0; syncPanels();
		if (paused) { audio.update(0, false, []); element('resume').focus({ preventScroll: true }); }
		else { canvas.focus({ preventScroll: true }); unlock(); }
	};
	const showRefit = function () {
		clearInput(); accumulator = 0; refitChoice = undefined; audio.update(0, false, []);
		const nextMission = CAMPAIGN_MISSIONS[state.wave];
		element('refit-summary').textContent = `${CAMPAIGN_MISSIONS[state.wave - 1]?.name ?? 'Mission'} secured. Hull ${Math.ceil(state.player.hp / state.player.maxHp * 100)}%. Rail upgrades ${state.campaign?.upgrades.rails ?? 0} · capacitor upgrades ${state.campaign?.upgrades.capacitor ?? 0}.`;
		element('next-mission-number').textContent = `NEXT / MISSION ${String(state.wave + 1).padStart(2, '0')}`;
		element('next-mission-title').textContent = nextMission?.name ?? 'Passage secured';
		element('next-mission-intel').textContent = nextMission?.briefing ?? '';
		const choices = element('refit-choices'); choices.replaceChildren();
		for (const choice of REFIT_CHOICES) {
			const label = document.createElement('label'); label.className = 'refit-choice';
			const radio = document.createElement('input'); radio.type = 'radio'; radio.name = 'refit-choice'; radio.value = choice.id;
			const details = document.createElement('span'); const name = document.createElement('strong'); const description = document.createElement('small');
			name.textContent = choice.name; description.textContent = choice.description;
			if (choice.id === 'repair') description.textContent += ` Hull after repairs: ${Math.ceil(Math.min(state.player.maxHp, state.player.hp + state.player.maxHp * 0.35) / state.player.maxHp * 100)}%.`;
			details.append(name, description); label.append(radio, details); choices.append(label);
			radio.addEventListener('change', function () {
				refitChoice = choice.id;
				const deploy = element('deploy'); if (deploy instanceof HTMLButtonElement) deploy.disabled = false;
				deploy.textContent = `COMMIT ${choice.name.toUpperCase()} & DEPLOY ↗`;
			}, options);
		}
		const deploy = element('deploy'); if (deploy instanceof HTMLButtonElement) deploy.disabled = true;
		deploy.textContent = 'SELECT A REFIT TO CONTINUE ↗';
		syncPanels(); choices.querySelector('input')?.focus({ preventScroll: true });
	};
	element('deploy').addEventListener('click', function () {
		if (graphicsLost || !refitChoice || !chooseRefit(state, refitChoice)) return;
		clearInput(); accumulator = 0; saveCheckpoint(); syncPanels(); canvas.focus({ preventScroll: true }); unlock();
	}, options);
	const cancelRestart = function () { confirmingRestart = false; syncPanels(); restartSource.focus({ preventScroll: true }); };
	for (const id of ['start', 'restart', 'reset']) element(id).addEventListener('click', function () {
		if (!savedCampaign && !(running && state.outcome === 'playing')) { start(); return; }
		restartSource = element(id); confirmingRestart = true; clearInput(); syncPanels(); element('cancel-reset').focus({ preventScroll: true });
	}, options);
	element('cancel-reset').addEventListener('click', cancelRestart, options);
	element('confirm-start').addEventListener('click', start, options);
	element('continue').addEventListener('click', function () {
		if (!savedCampaign) return;
		const snapshot = captureCampaign(savedCampaign); const restored = snapshot ? restoreCampaign(snapshot) : undefined;
		if (!restored) return;
		state = restored; training = undefined; running = true; paused = false; accumulator = 0; zoom = 1; clearInput();
		if (state.campaign?.phase === 'refit') showRefit();
		else { syncPanels(); canvas.focus({ preventScroll: true }); unlock(); }
		setSaveStatus(state.campaign?.phase === 'refit' ? 'Resumed the saved refit. Choose your next upgrade or repair.' : 'Resumed the mission-start checkpoint. Your next checkpoint is after this engagement.');
	}, options);
	element('resume').addEventListener('click', function () { pause(false); }, options);
	ui.pause.addEventListener('click', function () { pause(!paused); }, options);
	const soundButtons = [ui.sound];
	for (const panel of container.querySelectorAll('.overlay .panel')) {
		const utilities = document.createElement('div'); utilities.className = 'modal-utilities';
		const sound = document.createElement('button'); sound.type = 'button'; sound.textContent = 'Sound on'; sound.setAttribute('aria-pressed', 'false'); sound.setAttribute('aria-label', 'Mute sound');
		soundButtons.push(sound); utilities.append(sound);
		if (!panel.querySelector('a[href]')) { const back = document.createElement('a'); back.href = '../../'; back.textContent = 'Return to experiments'; utilities.append(back); }
		panel.append(utilities);
	}
	const updateSoundLabels = function () {
		const status = audio.status();
		for (const sound of soundButtons) { sound.textContent = status === 'unavailable' ? 'Audio unavailable' : status === 'locked' ? 'Enable audio · click or key' : muted ? 'Sound off' : 'Sound on'; sound.setAttribute('aria-pressed', String(muted)); sound.setAttribute('aria-label', status === 'locked' ? 'Enable browser audio with a click or key press' : muted ? 'Unmute sound' : 'Mute sound'); }
	};
	updateSoundLabels();
	const toggleSound = function () {
		if (audio.status() === 'locked') { unlock(); return; }
		muted = !muted; audio.setMuted(muted);
		updateSoundLabels();
		if (!muted) unlock();
		if (playable()) canvas.focus({ preventScroll: true });
	};
	for (const sound of soundButtons) sound.addEventListener('click', toggleSound, options);
	const setInputMode = function (mode: 'keyboard' | 'gamepad' | 'touch') {
		if (container.dataset['input'] === mode) return;
		container.dataset['input'] = mode;
		for (const label of container.querySelectorAll<HTMLElement>('[data-keyboard]')) label.textContent = label.dataset[mode === 'gamepad' ? 'gamepad' : 'keyboard'] ?? '';
		element('input-hint').textContent = mode === 'gamepad' ? 'A Select · B Back · D-pad Navigate' : 'Enter Select · Esc Back · Tab Navigate';
	};
	setInputMode('keyboard');
	const applyPreferences = function () {
		audio.setMix(preferences);
		container.dataset['largeHud'] = String(preferences.largeHud);
		for (const [id, value] of [['master-volume', preferences.master], ['music-volume', preferences.music], ['effects-volume', preferences.effects]] as const) {
			const input = element(id); if (input instanceof HTMLInputElement) { input.value = String(value * 100); input.setAttribute('aria-valuetext', `${Math.round(value * 100)} percent`); }
			const output = container.querySelector(`output[for="${id}"]`); if (output) output.textContent = `${Math.round(value * 100)}%`;
		}
		for (const [id, value] of [['screen-shake', preferences.shake], ['vibration', preferences.vibration], ['large-hud', preferences.largeHud]] as const) {
			const input = element(id); if (input instanceof HTMLInputElement) input.checked = value;
		}
	};
	applyPreferences();
	for (const [id, key] of [['master-volume', 'master'], ['music-volume', 'music'], ['effects-volume', 'effects']] as const) {
		element(id).addEventListener('input', function (event) {
			if (!(event.target instanceof HTMLInputElement)) return;
			preferences[key] = Math.min(1, Math.max(0, event.target.valueAsNumber / 100));
			applyPreferences(); writePreferences(preferences); unlock();
		}, options);
	}
	for (const [id, key] of [['screen-shake', 'shake'], ['vibration', 'vibration'], ['large-hud', 'largeHud']] as const) {
		element(id).addEventListener('change', function (event) {
			if (!(event.target instanceof HTMLInputElement)) return;
			preferences[key] = event.target.checked; applyPreferences(); writePreferences(preferences);
		}, options);
	}
	const closeSettings = function () { settingsOpen = false; clearInput(); syncPanels(); settingsSource.focus(); audio.cue('back'); };
	for (const id of ['settings-open', 'pause-settings']) element(id).addEventListener('click', function () {
		settingsSource = element(id); settingsOpen = true; clearInput(); syncPanels(); element('master-volume').focus(); unlock();
	}, options);
	element('settings-back').addEventListener('click', closeSettings, options);
	const modalNow = function () { return [...container.querySelectorAll<HTMLElement>('.overlay')].find(function (panel) { return !panel.hidden; }); };
	const moveMenu = function (direction: 'up' | 'down' | 'left' | 'right') {
		const modal = modalNow(); if (!modal) return;
		const focused = document.activeElement;
		if (focused instanceof HTMLInputElement && focused.type === 'range' && (direction === 'left' || direction === 'right')) {
			if (direction === 'left') focused.stepDown(); else focused.stepUp();
			focused.dispatchEvent(new Event('input', { bubbles: true })); return;
		}
		const items = [...modal.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled)')].filter(function (item) { return !item.closest('[hidden]') && item.getClientRects().length > 0; });
		const index = items.findIndex(function (item) { return item === focused; });
		const offset = direction === 'up' || direction === 'left' ? -1 : 1;
		const next = items[(index + offset + items.length) % items.length];
		next?.focus({ preventScroll: true }); next?.scrollIntoView({ block: 'nearest', behavior: 'instant' }); audio.cue('focus');
	};
	const returnToTitle = function () {
		training = undefined; trainingCompleted = false; running = false; paused = false; settingsOpen = false; clearInput();
		state = createCampaignState();
		element('continue-campaign').hidden = !savedCampaign;
		if (savedCampaign) element('continue-summary').textContent = `${CAMPAIGN_MISSIONS[savedCampaign.wave - 1]?.name ?? 'Lyra Passage'} · ${savedCampaign.campaign?.phase === 'refit' ? 'field refit' : 'mission checkpoint'} · ${Math.ceil(savedCampaign.player.hp / savedCampaign.player.maxHp * 100)}% hull`;
		syncPanels(); element(savedCampaign ? 'continue' : 'start').focus();
	};
	const titleButton = document.createElement('button'); titleButton.className = 'secondary'; titleButton.textContent = 'Return to title'; titleButton.id = 'return-title';
	element('reset').after(titleButton); titleButton.addEventListener('click', returnToTitle, options);
	element('training').addEventListener('click', function () {
		const flight = createTraining(); state = flight.state; training = flight.training; trainingCompleted = false;
		running = true; paused = false; zoom = 1; accumulator = 0; clearInput(); syncPanels(); canvas.focus(); unlock();
	}, options);
	element('training-skip').addEventListener('click', returnToTitle, options);
	const retry = function () {
		if (!savedCampaign) return;
		const snapshot = captureCampaign(savedCampaign); const restored = snapshot ? restoreCampaign(snapshot) : undefined; if (!restored) return;
		state = restored; training = undefined; trainingCompleted = false; running = true; paused = false; clearInput(); accumulator = 0;
		if (state.campaign?.phase === 'refit') showRefit(); else { syncPanels(); canvas.focus(); }
		unlock();
	};
	element('retry').addEventListener('click', retry, options);
	container.addEventListener('pointerdown', function (event) { setInputMode(event.pointerType === 'touch' ? 'touch' : 'keyboard'); unlock(); }, options);
	const updateController = function (now: number, elapsed: number) {
		pad = connectedController();
		if (lastPadIndex !== undefined && pad?.index !== lastPadIndex) {
			clearInput(); pause(true); element('pause-reason').textContent = 'Controller disconnected. Reconnect, then press A to resume.';
		}
		lastPadIndex = pad?.index;
		element('controller-status').textContent = pad ? 'Controller connected' : 'Keyboard + mouse · Standard controllers supported';
		const previousPad = padFrame; padFrame = controller.read(pad, now);
		if (document.hidden || !document.hasFocus()) { controller.clear(); padFrame = controller.read(undefined, now); return; }
		if (padFrame.used) setInputMode('gamepad');
		const modal = modalNow();
		if (modal) {
			if (padFrame.direction) moveMenu(padFrame.direction);
			if (padFrame.cancel || padFrame.pause) {
				if (settingsOpen) closeSettings(); else if (confirmingRestart) cancelRestart(); else if (paused) pause(false); else if (state.outcome !== 'playing') returnToTitle();
				return;
			}
			if (padFrame.confirm && document.activeElement instanceof HTMLElement && modal.contains(document.activeElement)) { unlock(); audio.cue('confirm'); document.activeElement.click(); }
			return;
		}
		if (padFrame.pause) { pause(true); return; }
		if (!playable()) return;
		if (padFrame.target) cycleTarget(state);
		for (const action of ['port', 'starboard', 'beam'] as const) if (padFrame[action] && !previousPad[action]) pending.add(action);
		for (const action of ['pulse', 'missile', 'torpedo', 'neutral', 'autoFire'] as const) if (padFrame[action]) pending.add(action);
		zoom = Math.min(2.5, Math.max(0.5, zoom + padFrame.zoom * elapsed * 0.65));
	};
	window.addEventListener('keydown', function (event) {
		if (audio.status() === 'locked') unlock();
		if (event.code === 'Tab') {
			const modal = [...container.querySelectorAll<HTMLElement>('.overlay')].find(function (panel) { return !panel.hidden; });
			if (modal) {
				const candidates = [...modal.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled)')].filter(function (candidate) { return !candidate.closest('[hidden]') && candidate.getClientRects().length > 0; });
				const focusable = candidates.filter(function (candidate) {
					if (!(candidate instanceof HTMLInputElement) || candidate.type !== 'radio') return true;
					const group = candidates.filter(function (item): item is HTMLInputElement { return item instanceof HTMLInputElement && item.type === 'radio' && item.name === candidate.name; });
					return candidate === (group.find(function (item) { return item.checked; }) ?? group[0]);
				});
				const first = focusable[0]; const last = focusable.at(-1);
				if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
				else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
			}
		}
		setInputMode('keyboard');
		if (modalNow() && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) { event.preventDefault(); moveMenu(event.code === 'ArrowUp' ? 'up' : event.code === 'ArrowDown' ? 'down' : event.code === 'ArrowLeft' ? 'left' : 'right'); return; }
		if (event.code === 'Escape') { if (settingsOpen) { event.preventDefault(); closeSettings(); return; } event.preventDefault(); if (!event.repeat) { if (confirmingRestart) cancelRestart(); else if (running && state.outcome !== 'playing') returnToTitle(); else pause(!paused); } return; }
		if (event.code === 'KeyR' && playable()) { if (!event.repeat) cycleTarget(state); event.preventDefault(); return; }
		const action = bindings.get(event.code); if (!action || !playable()) return;
		if (event.code === 'Space' && event.target instanceof HTMLButtonElement) return;
		if (event.repeat && !keys.has(event.code)) return;
		event.preventDefault(); keys.add(event.code); if (!event.repeat) pending.add(action);
	}, options);
	window.addEventListener('keyup', function (event) { keys.delete(event.code); }, options);
	window.addEventListener('blur', function () { clearInput(); pause(true); audio.update(0, false, []); }, options);
	canvas.addEventListener('webglcontextlost', function (event) {
		event.preventDefault(); graphicsLost = true; clearInput(); pause(true); syncPanels();
		element('pause-reason').textContent = 'Graphics device interrupted. Waiting for recovery; reload to restore your checkpoint if it does not return.';
		element('error').hidden = false; element('error').textContent = 'Graphics device interrupted. Waiting for recovery.';
	}, options);
	canvas.addEventListener('webglcontextrestored', function () {
		graphicsLost = false; element('error').hidden = true; clearInput(); syncPanels();
		element('pause-reason').textContent = 'Graphics restored. Resume when ready.';
		const modal = modalNow(); if (modal && !modal.contains(document.activeElement)) moveMenu('down');
	}, options);
	document.addEventListener('visibilitychange', function () { if (document.hidden) { clearInput(); pause(true); audio.update(0, false, []); } }, options);
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
	canvas.addEventListener('contextmenu', function (event) {
		if (playable()) event.preventDefault();
	}, options);
	canvas.addEventListener('pointerdown', function (event) {
		if (!playable() || (event.button !== 0 && event.button !== 2)) return;
		const rect = canvas.getBoundingClientRect();
		const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
		const camera = cameraFor(rect.width, rect.height, state.player, zoom);
		if (event.button === 2 && event.pointerType === 'mouse') {
			event.preventDefault();
			const world = screenToWorld(point, camera, 20);
			if (distance(world, state.player) > 1) heading = Math.atan2(world.y - state.player.y, world.x - state.player.x);
		} else if (event.button === 0) {
			const target = pickShip(point, camera, state.enemies);
			designateTarget(state, target?.id);
		}
		canvas.focus({ preventScroll: true });
	}, options);
	const hud = function () {
		ui.pause.textContent = `${paused ? 'Resume' : 'Pause'} · ${container.dataset['input'] === 'gamepad' ? 'Start' : 'Esc'}`;
		element('input-hint').textContent = playable() ? container.dataset['input'] === 'gamepad' ? 'D-pad ↑↓ Thrust · LS Steer · Start Pause' : 'W/S Thrust · A/D Steer · Right-click Heading · Esc Pause' : container.dataset['input'] === 'gamepad' ? 'A Select · B Back · D-pad Navigate' : 'Enter Select · Esc Back · Tab Navigate';
		if (training) {
			const instruction = trainingInstructions[training.lesson];
			element('training-title').textContent = instruction?.title ?? 'Flight school complete';
			element('training-copy').textContent = (container.dataset['input'] === 'gamepad' ? instruction?.gamepad : instruction?.keyboard) ?? '';
			element('training-progress').textContent = `${training.lesson + 1} / ${trainingInstructions.length}`;
		}
		const beamTarget = beamTargetFor(state); const missileTarget = missileTargetFor(state);
		element('beam-state').textContent = state.beam.firing ? 'FIRING' : state.beam.cooldown > 0 ? `${state.beam.cooldown.toFixed(1)} S` : `${Math.round(state.beam.charge / BEAM_DURATION * 100)}%`;
		element('beam-target').textContent = beamTarget ? 'BOW SOLUTION' : 'ALIGN BOW / 920 M';
		element('beam-fill').style.width = `${(state.beam.cooldown > 0 ? 1 - state.beam.cooldown / BEAM_COOLDOWN : state.beam.charge / BEAM_DURATION) * 100}%`;
		element('beam').classList.toggle('locked', !!beamTarget);
		element('missile-state').textContent = state.missiles.remaining > 0 ? 'LAUNCHING' : state.missiles.reload > 0 ? `${state.missiles.reload.toFixed(1)} S` : missileTarget ? 'READY' : 'NO LOCK';
		element('missile-target').textContent = missileTarget ? 'ALL-ASPECT LOCK' : 'NO CONTACT / 1,200 M';
		element('missile-fill').style.width = `${(1 - state.missiles.reload / MISSILE_RELOAD) * 100}%`;
		element('missile').classList.toggle('locked', !!missileTarget);
		const p = state.player; const speed = Math.hypot(p.vx, p.vy);
		const priority = state.enemies.find(function (enemy) { return enemy.id === state.priorityTarget; });
		ui.targetName.textContent = priority ? `${priority.kind.toUpperCase()} ${String(priority.id).padStart(2, '0')}` : 'AUTO ACQUISITION';
		ui.targetInfo.textContent = priority ? `${Math.round(distance(p, priority))} M / ${Math.ceil(priority.hp / priority.maxHp * 100)}% HULL` : 'Click a hostile or cycle targets';
		ui.shield.textContent = state.shield.active > 0 ? `${state.shield.active.toFixed(1)} S ACTIVE` : state.shield.cooldown > 0 ? `${state.shield.cooldown.toFixed(0)} S` : 'CHARGED';
		ui.pulseState.textContent = state.shield.active > 0 ? `${state.shield.active.toFixed(1)} S ACTIVE` : state.shield.cooldown > 0 ? `${state.shield.cooldown.toFixed(1)} S CHARGE` : 'READY';
		ui.pulseFill.style.width = `${(1 - state.shield.cooldown / Math.max(6, SHIELD_COOLDOWN - (state.campaign?.upgrades.capacitor ?? 0) * 3)) * 100}%`;
		ui.pulse.classList.toggle('cooling', state.shield.cooldown > 0);
		const torpedoTarget = torpedoTargetFor(state); const rack = state.torpedoes;
		ui.torpedoState.textContent = rack.remaining > 0 ? 'LAUNCHING' : rack.reload > 0 ? `${rack.reload.toFixed(1)} S` : p.braced ? 'LOCKED' : torpedoTarget ? 'READY' : 'NO LOCK';
		ui.torpedoTarget.textContent = torpedoTarget ? `BOW LOCK / ${torpedoTarget.kind.toUpperCase()} ${String(torpedoTarget.id).padStart(2, '0')}` : 'ALIGN BOW / 1,000 M';
		ui.torpedoFill.style.width = `${(1 - rack.reload / TORPEDO_RELOAD) * 100}%`;
		ui.torpedo.classList.toggle('locked', !!torpedoTarget);
		ui.autoState.textContent = state.fireControl.automatic ? p.braced ? 'ARMOR LOCK' : 'AUTO' : 'MANUAL';
		ui.autoFire.setAttribute('aria-pressed', String(state.fireControl.automatic));
		ui.defenseState.textContent = state.pointDefense.reload > 0 ? 'INTERCEPTING' : 'SCANNING';
		ui.defenseCount.textContent = `${state.stats.interceptions} ROUNDS STOPPED`;
		for (const [i, marker] of [...container.querySelectorAll('.mission-steps i')].entries()) {
			marker.classList.toggle('active', i + 1 === state.wave); marker.classList.toggle('complete', i + 1 < state.wave);
		}
		ui.phase.textContent = training ? 'FLIGHT SCHOOL / LIVE PRACTICE' : paused ? 'CAMPAIGN PAUSED' : `MISSION ${String(state.wave).padStart(2, '0')} / ${String(CAMPAIGN_MISSIONS.length).padStart(2, '0')} · ${CAMPAIGN_MISSIONS[state.wave - 1]?.name.toUpperCase() ?? ''}`;
		ui.objective.textContent = training ? 'Safe training · No campaign progress is changed' : state.intermission > 0 ? state.wave === CAMPAIGN_MISSIONS.length ? 'Final contact clear. Securing the passage.' : 'Contact clear. Preparing field refit.' : `${state.enemies.length} hostile signatures · ${state.kills} / ${totalShips} ships broken`;
		ui.hull.textContent = String(Math.ceil(p.hp / MAX_HULL * 100)); ui.hullFill.style.width = `${p.hp / MAX_HULL * 100}%`;
		ui.hullFill.style.background = p.hp < MAX_HULL * 0.3 ? 'var(--danger)' : 'var(--cyan)';
		ui.throttle.textContent = Math.abs(p.throttle) < 0.001 ? 'NEUTRAL' : p.throttle < 0 ? `ASTERN ${Math.round(-p.throttle / 0.35 * 100)}%` : `AHEAD ${Math.round(p.throttle * 100)}%`;
		ui.throttleFill.style.width = `${Math.abs(p.throttle) / (p.throttle < 0 ? 0.35 : 1) * 100}%`; ui.throttleFill.style.background = p.throttle < 0 ? 'var(--gold)' : 'var(--cyan)';
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
		ui.autoFire.classList.toggle('pressed', state.fireControl.automatic);
		ui.message.textContent = !playable() ? '' : state.intermission > 0 ? state.wave === CAMPAIGN_MISSIONS.length ? 'FINAL CONTACT CLEAR / SECURING THE PASSAGE' : `CONTACT CLEAR / FIELD REFIT IN ${Math.max(0, Math.ceil(6 - state.intermission))} S` : state.shield.active > 0 ? 'AEGIS FIELD ACTIVE / 85% DAMAGE REDUCTION' : p.braced ? 'ARMOR LOCK / NEW SALVOS LOCKED / RELOAD SLOWED' : state.enemies.some(function (enemy) { return enemy.warning > 0; }) ? 'INCOMING VOLLEY / EVADE, LOCK ARMOR OR PULSE SHIELDS' : state.time < 12 ? container.dataset['input'] === 'gamepad' ? 'LT/RT ARRAYS · RB BEAM · X MISSILES · Y TORPEDOES' : 'Q/E ARRAYS · C BEAM · V MISSILES · T TORPEDOES' : '';
	};
	const showResult = function () {
		if (state.outcome === 'won') { savedCampaign = undefined; if (clearCampaign()) setSaveStatus('Campaign complete. Start a new run when ready.'); else setSaveStatus('Campaign complete. Browser could not clear the old checkpoint.', true); }
		else setSaveStatus('Your mission checkpoint is preserved. Retry with a different approach.');
		element('retry').hidden = state.outcome !== 'lost' || !savedCampaign;
		clearInput(); syncPanels(); audio.update(0, false, []);
		element('result-title').textContent = state.outcome === 'won' ? 'BLOCKADE BROKEN.' : 'SIGNAL LOST.';
		element('result-copy').textContent = state.outcome === 'won' ? `All ${CAMPAIGN_MISSIONS.length} missions complete. The blockade commander is gone. Your cruiser leaves the Lyra Passage with ${Math.ceil(state.player.hp / state.player.maxHp * 100)}% hull.` : `Lost during ${CAMPAIGN_MISSIONS[state.wave - 1]?.name ?? 'the engagement'}. ${state.campaign?.completedMissions ?? 0} of ${CAMPAIGN_MISSIONS.length} missions secured. Change heading when hostile volleys are marked, and consider repairs before the next engagement.`;
		element('result-stats').textContent = `${state.kills} / ${totalShips} ships broken · ${Math.floor(state.time / 60)}m ${Math.floor(state.time % 60)}s · ${state.stats.salvos} broadsides · ${state.stats.torpedoSalvos} torpedo salvos · ${state.stats.interceptions} rounds intercepted · ${Math.round(state.stats.damageBlocked)} damage prevented by armor / shields`;
		element(state.outcome === 'lost' && savedCampaign ? 'retry' : 'restart').focus({ preventScroll: true });
	};
	const tick = function (now: number) {
		const elapsed = previous ? Math.min((now - previous) / 1000, 0.1) : 0; previous = now;
		audio.setScene(document.hidden || !document.hasFocus() || confirmingRestart || (paused && !settingsOpen) ? 'paused' : !running || settingsOpen ? 'menu' : state.outcome === 'won' ? 'victory' : state.outcome === 'lost' ? 'defeat' : state.campaign?.phase === 'refit' ? 'refit' : 'combat', state.enemies.some(function (enemy) { return enemy.warning > 0; }) ? 1 : 1 - state.player.hp / state.player.maxHp);
		if (playable() && !document.hidden) {
			accumulator += elapsed;
			while (accumulator >= 1 / 60 && playable()) {
				if (active('right') || active('left') || padFrame.turn !== 0) heading = undefined;
				const input: Controls = { drive: Math.max(-1, Math.min(1, Number(active('forward')) - Number(active('back')) + padFrame.drive)), turn: Math.max(-1, Math.min(1, Number(active('right')) - Number(active('left')) + padFrame.turn)),
					...(heading === undefined ? {} : { heading }), neutral: active('neutral'), port: active('port'), starboard: active('starboard'), brace: active('brace'),
					pulse: pending.has('pulse'), torpedo: pending.has('torpedo'), autoFire: pending.has('autoFire'), beam: active('beam'), missile: pending.has('missile') };
				step(state, input, 1 / 60); pending.clear(); accumulator -= 1 / 60;
				audio.update(Math.hypot(state.player.vx, state.player.vy), true, state.events); audio.setBeam(state.beam.firing);
				if (preferences.vibration && pad && now - lastHaptic > 180 && state.events.some(function (event) { return event === 'damage' || event === 'cannon' || event === 'explosion'; })) {
					lastHaptic = now; const strong = state.events.includes('damage') ? 0.55 : 0.2;
					void pad.vibrationActuator?.playEffect('dual-rumble', { duration: 100, strongMagnitude: strong, weakMagnitude: 0.25 }).catch(function () {});
				}
				if (training && advanceTraining(training, state, input, 1 / 60)) {
					trainingCompleted = true; training = undefined; state.outcome = 'won'; clearInput(); syncPanels();
					element('result-title').textContent = 'READY FOR COMMAND.';
					element('result-copy').textContent = 'Flight school complete. You have flown, fired every weapon, and used both defenses. The Lyra Passage awaits.';
					element('result-stats').textContent = 'Campaign saves are untouched. Start a new campaign or press Back to return to the title.';
					element('retry').hidden = true; element('restart').focus();
				}

				if (state.outcome !== 'playing' && !trainingCompleted) showResult();
				else if (state.campaign?.phase === 'refit') { saveCheckpoint(); showRefit(); }
			}
		}
		const { width, height } = canvas.getBoundingClientRect();
		draw.render(width, height, state, reducedMotion.matches || !preferences.shake, !running, zoom, heading); hud();
		frame = requestAnimationFrame(tick);
	};
	syncPanels(); element(savedCampaign ? 'continue' : 'start').focus({ preventScroll: true }); frame = requestAnimationFrame(tick);
	const controllerTimer = window.setInterval(function () { updateController(performance.now(), 1 / 60); }, 1000 / 60);
	return async function () { clearInterval(controllerTimer); cancelAnimationFrame(frame); clearInput(); abort.abort(); draw.dispose(); await audio.dispose(); };
});
if (import.meta.hot) import.meta.hot.dispose(shutdown);
